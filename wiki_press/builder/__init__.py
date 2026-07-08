"""Book build orchestration: hash-gate -> assemble -> render -> deliver."""

import hashlib

import frappe

from wiki_press.builder.html_builder import assemble_book_html
from wiki_press.pdf.render import render_book_pdf
from wiki_press.queries import walk_space_tree

MAX_DOCS = 500
MAX_PDF_BYTES = 60 * 1024 * 1024
BUILD_TIMEOUT = 20 * 60


def compute_content_hash(book, docs: list[dict]) -> str:
	h = hashlib.sha256()
	for field in (
		"title",
		"subtitle",
		"space",
		"root_document",
		"language",
		"paper_size",
		"version_label",
		"cover_image",
		"include_toc",
		"toc_depth",
		"custom_css",
		"public_download",
	):
		h.update(f"{field}={book.get(field)}\n".encode())
	for doc in docs:
		h.update(f"{doc['name']}@{doc['modified']}\n".encode())
	return h.hexdigest()


def enqueue_build(book_name: str, task_id: str | None = None) -> None:
	frappe.enqueue(
		"wiki_press.builder.build",
		book_name=book_name,
		task_id=task_id,
		queue="long",
		timeout=BUILD_TIMEOUT,
		job_id=f"wiki_press:build:{book_name}",
		deduplicate=True,
	)


def build(book_name: str, task_id: str | None = None, force: bool = False) -> dict:
	book = frappe.get_doc("Wiki Book", book_name)

	def progress(percent: int, description: str):
		if task_id:
			frappe.publish_progress(
				percent, title=book.title, description=description, task_id=task_id
			)

	docs = walk_space_tree(book.space, book.root_document or None)
	if not docs:
		frappe.throw(f"No published documents found for Wiki Book {book_name}")
	if len(docs) > MAX_DOCS:
		frappe.throw(f"Wiki Book {book_name} spans {len(docs)} documents (max {MAX_DOCS})")

	content_hash = compute_content_hash(book, docs)
	if not force and content_hash == book.content_hash and book.last_built_file:
		progress(100, "Sin cambios")
		return {"file_url": book.last_built_file, "unchanged": True}

	progress(10, "Generando HTML")
	html = assemble_book_html(book, docs)

	progress(40, "Generando PDF")
	pdf_bytes = render_book_pdf(html, book)
	if len(pdf_bytes) > MAX_PDF_BYTES:
		frappe.throw(f"Book PDF exceeds size cap ({len(pdf_bytes)} bytes)")

	progress(85, "Guardando archivo")
	file_url = _save_book_file(book, pdf_bytes)

	book.db_set(
		{
			"last_built_on": frappe.utils.now(),
			"last_built_file": file_url,
			"content_hash": content_hash,
		},
		commit=True,
	)
	progress(100, "Listo")
	if task_id:
		frappe.publish_realtime(
			f"task_complete:{task_id}",
			message={"file_url": file_url},
			user=frappe.session.user,
		)
	return {"file_url": file_url, "unchanged": False}


def _space_is_guest_readable(space: str) -> bool:
	from wiki.permissions import can_read_space

	return bool(can_read_space(space, "Guest"))


def _save_book_file(book, pdf_bytes: bytes) -> str:
	# A public /files/ URL bypasses every permission check, so the stored
	# file may only be public when the space itself is guest-readable.
	# Restricted-space books stay private and are served exclusively through
	# api.download_book, which enforces space read access.
	is_public = bool(book.public_download) and _space_is_guest_readable(book.space)
	filename = f"{frappe.scrub(book.title)}.pdf"
	for old in frappe.get_all(
		"File",
		filters={"attached_to_doctype": "Wiki Book", "attached_to_name": book.name},
		pluck="name",
	):
		frappe.delete_doc("File", old, ignore_permissions=True, force=True)
	file_doc = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": filename,
			"content": pdf_bytes,
			"is_private": 0 if is_public else 1,
			"attached_to_doctype": "Wiki Book",
			"attached_to_name": book.name,
		}
	)
	file_doc.save(ignore_permissions=True)
	return file_doc.file_url


def handle_cr_merge(doc, method=None):
	"""doc_events hook on Wiki Change Request: rebuild watching books on merge."""
	if doc.status != "Merged":
		return
	for book_name in frappe.get_all(
		"Wiki Book",
		filters={"space": doc.wiki_space, "auto_rebuild_on_merge": 1},
		pluck="name",
	):
		enqueue_build(book_name)
