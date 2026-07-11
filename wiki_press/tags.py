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
	"""doc_events: reindex a Wiki Document when its tags change via Desk.

	A tags-only edit changes no upstream-indexed field, so frappe's own
	update_doc_index skips it. We reindex directly through the (patched)
	upstream class, whose prepare_document now carries tag text. Best-effort:
	never block a save. NB: enqueue_reindex/add_to_queue was removed upstream
	— call index_doc directly.
	"""
	if not doc.has_value_changed("wiki_tags"):
		return
	try:
		from wiki.frappe_wiki.doctype.wiki_document.wiki_sqlite_search import WikiSQLiteSearch

		WikiSQLiteSearch().index_doc("Wiki Document", doc.name)
	except Exception:
		frappe.log_error(title="wiki_press: tag reindex failed")


MAX_TAGGED_ROWS = 2000


def accessible_tagged_documents(tag: str | None = None) -> dict[str, list[dict]]:
	"""Tag -> published+readable documents map for the /etiquetas page.

	Capped and space-access-filtered. Longest-route-first space matching so
	``manual-usuario`` wins over ``manual`` for a page under it.
	"""
	from wiki.permissions import can_read_space

	rows = frappe.get_all(
		"Wiki Document Tag",
		filters={"parenttype": "Wiki Document", **({"tag": tag} if tag else {})},
		fields=["tag", "parent"],
		limit_page_length=MAX_TAGGED_ROWS,
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

	# Longest route first so a nested space (manual-usuario) matches before a
	# prefix-colliding parent (manual). Prevents leaking a private page into a
	# public space's readable set via a bad prefix match.
	spaces = sorted(
		frappe.get_all("Wiki Space", fields=["name", "route"]),
		key=lambda s: len(s.route or ""),
		reverse=True,
	)

	def space_for(doc_route: str) -> str | None:
		for s in spaces:
			if doc_route == s.route or doc_route.startswith((s.route or "") + "/"):
				return s.name
		return None

	space_of_route: dict[str, str | None] = {}
	readable_space: dict[str, bool] = {}
	result: dict[str, list[dict]] = {}
	for row in rows:
		doc = docs.get(row.parent)
		if not doc or not doc.route:
			continue
		if doc.route not in space_of_route:
			space_of_route[doc.route] = space_for(doc.route)
		sp = space_of_route[doc.route]
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
