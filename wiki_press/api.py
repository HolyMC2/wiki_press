"""Public API surface of wiki_press.

Thin layer only: permission checks + dispatch. Implementation lives in
builder/ and pdf/.
"""

from uuid import uuid4

import frappe
from wiki.permissions import can_read_space, can_write_space

from wiki_press.builder import build, enqueue_build


def _assert_can_build(doc):
	if not (can_write_space(doc.space) or frappe.has_permission("Wiki Book", "write", doc)):
		frappe.throw("Not permitted to build this book", frappe.PermissionError)


@frappe.whitelist()
def build_book(book: str) -> dict:
	"""Enqueue a book build. Returns {"task_id"}; the client listens on
	realtime event ``task_complete:{task_id}`` for the file URL."""
	doc = frappe.get_doc("Wiki Book", book)
	_assert_can_build(doc)
	task_id = str(uuid4())
	enqueue_build(doc.name, task_id=task_id)
	return {"task_id": task_id}


@frappe.whitelist()
def build_book_now(book: str) -> dict:
	"""Synchronous build (small books / scripting). Same permissions."""
	doc = frappe.get_doc("Wiki Book", book)
	_assert_can_build(doc)
	return build(doc.name)


@frappe.whitelist()
def get_help_url(context_type: str, context_key: str) -> str | None:
	"""Resolve a manual URL for an ERP context. Fallbacks: exact mapping ->
	per-type wildcard (*) -> site_config wiki_help_base_url -> None.

	Returns a site-relative route when the manual is synced locally, or an
	absolute URL when wiki_help_base_url points at the master docs domain.
	"""

	def lookup(key):
		return frappe.db.get_value(
			"Wiki Help Mapping",
			{"context_type": context_type, "context_key": key, "enabled": 1},
			"wiki_route",
		)

	route = lookup(context_key) or lookup("*")
	base = (frappe.conf.get("wiki_help_base_url") or "").rstrip("/")
	if route:
		return f"{base}/{route}" if base else f"/{route}"
	return base or None


@frappe.whitelist(allow_guest=True)
def download_book(book: str):
	"""Serve the LAST BUILT PDF. Never builds on demand (guest DoS guard).

	Access mirrors the space's read access: a guest can download only when
	the space grants the Guest role AND the book allows public download.
	"""
	doc = frappe.get_doc("Wiki Book", book)
	is_guest = frappe.session.user in (None, "", "Guest")
	if is_guest and not doc.public_download:
		frappe.throw("Not permitted", frappe.PermissionError)
	if not can_read_space(doc.space):
		# 404, not 403 — same no-existence-leak behavior as the wiki itself
		frappe.throw("Not found", frappe.DoesNotExistError)
	if not doc.last_built_file:
		frappe.throw("Not found", frappe.DoesNotExistError)

	file_doc = frappe.get_doc("File", {"file_url": doc.last_built_file})
	frappe.local.response.filename = file_doc.file_name
	frappe.local.response.filecontent = file_doc.get_content()
	frappe.local.response.type = "download"
