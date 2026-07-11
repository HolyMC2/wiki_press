"""Tests for the book-build error surface, download_book permission matrix,
help-URL wildcard/base, and tag search after a full index build — the
highest-value gaps the 2026-07-11 audit flagged."""

import frappe
from frappe.tests.utils import FrappeTestCase


def _space(route_prefix, roles):
	suffix = frappe.generate_hash(length=6)
	root = frappe.get_doc(
		{"doctype": "Wiki Document", "title": f"R {suffix}", "is_group": 1, "is_published": 1}
	).insert()
	sp = frappe.get_doc(
		{
			"doctype": "Wiki Space",
			"space_name": f"S {suffix}",
			"route": f"{route_prefix}-{suffix}",
			"is_published": 1,
			"root_group": root.name,
			"roles": [{"role": r, "permission_level": "Read"} for r in roles],
		}
	).insert()
	page = frappe.get_doc(
		{"doctype": "Wiki Document", "title": f"P {suffix}", "is_published": 1,
		 "parent_wiki_document": root.name, "content": "# P\n\ncuerpo\n"}
	).insert()
	return sp, page


class TestBuildErrorSurface(FrappeTestCase):
	def test_build_job_records_error_and_leaves_state(self):
		import wiki_press.builder as builder

		sp, _ = _space("berr", [])
		book = frappe.get_doc(
			{"doctype": "Wiki Book", "title": f"B {frappe.generate_hash(length=6)}", "space": sp.name}
		).insert()

		orig = builder.render_book_pdf
		builder.render_book_pdf = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom"))
		try:
			with self.assertRaises(RuntimeError):
				builder.build_job(book.name)
		finally:
			builder.render_book_pdf = orig
		book.reload()
		self.assertIn("boom", book.last_build_error or "")
		self.assertFalse(book.last_built_file)


class TestDownloadBookMatrix(FrappeTestCase):
	def test_permission_matrix(self):
		from wiki_press.api import download_book
		from wiki_press.builder import build

		# public space (Guest role), public_download
		pub, _ = _space("dlpub", ["Guest"])
		pub_book = frappe.get_doc(
			{"doctype": "Wiki Book", "title": f"Pub {frappe.generate_hash(length=6)}",
			 "space": pub.name, "public_download": 1}
		).insert()
		build(pub_book.name, force=True)
		self.assertEqual(
			frappe.db.get_value("File", {"attached_to_name": pub_book.name}, "is_private"), 0
		)

		# restricted space, public_download flag set but space NOT guest-readable
		priv, _ = _space("dlpriv", ["System Manager"])
		priv_book = frappe.get_doc(
			{"doctype": "Wiki Book", "title": f"Priv {frappe.generate_hash(length=6)}",
			 "space": priv.name, "public_download": 1}
		).insert()
		build(priv_book.name, force=True)
		# file must be private despite public_download, because space isn't guest-readable
		self.assertEqual(
			frappe.db.get_value("File", {"attached_to_name": priv_book.name}, "is_private"), 1
		)

		frappe.set_user("Guest")
		try:
			download_book(pub_book.name)  # ok
			self.assertTrue(frappe.local.response.get("filecontent"))
			with self.assertRaises(frappe.DoesNotExistError):
				download_book(priv_book.name)
			with self.assertRaises(frappe.DoesNotExistError):
				download_book("WB-99999")
		finally:
			frappe.set_user("Administrator")


class TestHelpUrl(FrappeTestCase):
	def test_wildcard_and_base(self):
		from wiki_press.api import get_help_url

		suffix = frappe.generate_hash(length=6)
		# Storefront Page has no fixture wildcard — own the * mapping here.
		frappe.get_doc(
			{"doctype": "Wiki Help Mapping", "context_type": "Storefront Page",
			 "context_key": "*", "wiki_route": "manual/tienda-en-línea/pedidos-en-línea"}
		).insert()
		# unmapped exact key falls back to the wildcard
		self.assertEqual(
			get_help_url("Storefront Page", f"Nope{suffix}"),
			"/manual/tienda-en-línea/pedidos-en-línea",
		)

		frappe.conf.wiki_help_base_url = "https://wiki.example.com"
		try:
			self.assertEqual(
				get_help_url("Storefront Page", f"Nope{suffix}"),
				"https://wiki.example.com/manual/tienda-en-línea/pedidos-en-línea",
			)
		finally:
			frappe.conf.wiki_help_base_url = None


class TestTagSearchAfterBuild(FrappeTestCase):
	def test_tag_term_found_after_full_index_build(self):
		from wiki.frappe_wiki.doctype.wiki_document.wiki_sqlite_search import WikiSQLiteSearch

		import wiki_press.search  # noqa: F401 — installs the prepare_document patch

		sp, page = _space("tsrch", ["Guest"])
		tag = f"faceta{frappe.generate_hash(length=6)}"
		frappe.get_doc({"doctype": "Wiki Tag", "tag_name": tag}).insert()
		doc = frappe.get_doc("Wiki Document", page.name)
		doc.append("wiki_tags", {"tag": tag})
		doc.flags.ignore_permissions = True
		doc.save()

		# Full rebuild through the UPSTREAM class (what the SPA queries) must
		# include the tag text thanks to the patch.
		search = WikiSQLiteSearch()
		search.build_index()
		res = search.search(tag)
		titles = [r.get("title") for r in res.get("results", [])]
		self.assertIn(page.title, titles)
