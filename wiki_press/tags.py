"""Content tags for wiki pages (cross-cutting facets the tree can't express).

Storage: Custom Field ``wiki_tags`` (Table MultiSelect -> Wiki Tag) on
Wiki Document, shipped as a fixture. Rendering: chips injected into the web
context by the doctype-class override. Search: tag names are appended to the
indexed text by a search subclass sharing upstream's index file, so the wiki's
own Ctrl+K finds tagged pages by tag name. Browse: /etiquetas.
"""

import frappe


def get_document_tags(docname: str) -> list[str]:
	return frappe.get_all(
		"Wiki Document Tag",
		filters={"parent": docname, "parenttype": "Wiki Document"},
		pluck="tag",
		order_by="idx",
	)


def render_tag_chips(tags: list[str]) -> str:
	if not tags:
		return ""
	chips = "".join(
		f'<a class="wiki-tag-chip" href="/etiquetas?tag={frappe.utils.quote(t)}"'
		' style="display:inline-block;padding:2px 10px;margin:0 6px 6px 0;'
		"border:1px solid #d0d7de;border-radius:12px;font-size:12px;"
		'text-decoration:none;color:#57606a;background:#f6f8fa">'
		f"{frappe.utils.escape_html(t)}</a>"
		for t in tags
	)
	return f'<div class="wiki-tag-chips" style="margin-bottom:12px">{chips}</div>'


def reindex_on_tag_change(doc, method=None):
	"""doc_events: keep the search index in step when tags change via Desk."""
	try:
		from wiki.frappe_wiki.doctype.wiki_document.wiki_sqlite_search import enqueue_reindex

		if doc.has_value_changed("wiki_tags") or doc.get("wiki_tags"):
			enqueue_reindex([doc.name])
	except Exception:
		pass  # search freshness is best-effort; never block a save


def accessible_tagged_documents(tag: str | None = None) -> dict[str, list[dict]]:
	"""Tag -> published+readable documents map for the /etiquetas page."""
	from wiki.permissions import can_read_space

	rows = frappe.get_all(
		"Wiki Document Tag",
		filters={"parenttype": "Wiki Document", **({"tag": tag} if tag else {})},
		fields=["tag", "parent"],
		limit_page_length=0,
	)
	if not rows:
		return {}

	docs = {
		d.name: d
		for d in frappe.get_all(
			"Wiki Document",
			filters={"name": ["in", list({r.parent for r in rows})], "is_published": 1},
			fields=["name", "title", "route"],
		)
	}

	space_of_route: dict[str, str | None] = {}
	spaces = frappe.get_all("Wiki Space", fields=["name", "route"])

	def space_for(doc_route: str) -> str | None:
		for s in spaces:
			if doc_route == s.route or doc_route.startswith(s.route + "/"):
				return s.name
		return None

	readable_space: dict[str, bool] = {}
	result: dict[str, list[dict]] = {}
	for row in rows:
		doc = docs.get(row.parent)
		if not doc or not doc.route:
			continue
		sp = space_of_route.setdefault(doc.route, space_for(doc.route))
		if not sp:
			continue
		if sp not in readable_space:
			try:
				readable_space[sp] = bool(can_read_space(sp))
			except Exception:
				readable_space[sp] = False
		if readable_space[sp]:
			result.setdefault(row.tag, []).append({"title": doc.title, "route": doc.route})
	return result
