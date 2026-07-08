"""Read-only tree queries against Wiki Document.

Kept separate from the builder so the traversal contract (what is included,
in which order) has exactly one home.
"""

import frappe

DOC_FIELDS = [
	"name",
	"title",
	"content",
	"is_group",
	"route",
	"modified",
	"sort_order",
	"parent_wiki_document",
]


def walk_space_tree(space_name: str, root_document: str | None = None) -> list[dict]:
	"""Return the published tree of a Wiki Space as a flat, ordered list.

	Each entry is the Wiki Document dict plus a ``depth`` key (1 = direct
	child of the root). Groups appear before their children; siblings follow
	``sort_order``. Unpublished documents are pruned together with their
	subtree. External-link nodes carry no content and are skipped.
	"""
	root = root_document or frappe.db.get_value("Wiki Space", space_name, "root_group")
	if not root:
		frappe.throw(f"Wiki Space {space_name} has no root group")

	meta = frappe.get_meta("Wiki Document")
	# name/modified are standard columns and never appear in meta fields
	fields = [f for f in DOC_FIELDS if f in ("name", "modified") or meta.has_field(f)]
	has_external = meta.has_field("is_external_link")
	if has_external:
		fields.append("is_external_link")

	children_by_parent: dict[str, list[dict]] = {}
	for row in frappe.get_all(
		"Wiki Document",
		filters={"is_published": 1},
		fields=fields,
		order_by="sort_order asc, creation asc",
		limit_page_length=0,
	):
		children_by_parent.setdefault(row.get("parent_wiki_document"), []).append(row)

	ordered: list[dict] = []

	def visit(parent: str, depth: int):
		for row in children_by_parent.get(parent, []):
			if has_external and row.get("is_external_link"):
				continue
			row["depth"] = depth
			ordered.append(row)
			if row.get("is_group"):
				visit(row["name"], depth + 1)

	visit(root, 1)
	return ordered
