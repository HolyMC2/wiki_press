import frappe
from frappe.tests.utils import FrappeTestCase

from wiki_press.builder import build, compute_content_hash
from wiki_press.queries import walk_space_tree


def make_space_with_pages():
	suffix = frappe.generate_hash(length=8)
	root = frappe.get_doc(
		{"doctype": "Wiki Document", "title": f"Test Book Root {suffix}", "is_group": 1, "is_published": 1}
	).insert()
	space = frappe.get_doc(
		{
			"doctype": "Wiki Space",
			"space_name": f"Test Book Space {suffix}",
			"route": f"test-book-space-{suffix}",
			"is_published": 1,
			"root_group": root.name,
		}
	).insert()
	group = frappe.get_doc(
		{
			"doctype": "Wiki Document",
			"title": "Capítulo uno",
			"is_group": 1,
			"is_published": 1,
			"parent_wiki_document": root.name,
		}
	).insert()
	frappe.get_doc(
		{
			"doctype": "Wiki Document",
			"title": "Página uno",
			"is_published": 1,
			"parent_wiki_document": group.name,
			"content": "# Página uno\n\nTexto con **negritas** y `código`.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n",
		}
	).insert()
	frappe.get_doc(
		{
			"doctype": "Wiki Document",
			"title": "Página oculta",
			"is_published": 0,
			"parent_wiki_document": group.name,
			"content": "# Página oculta\n\nNo debe aparecer.\n",
		}
	).insert()
	return space


class TestWikiBook(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.space = make_space_with_pages()
		self.book = frappe.get_doc(
			{
				"doctype": "Wiki Book",
				"title": "Libro de prueba",
				"space": self.space.name,
				"language": "es",
				"paper_size": "Letter",
			}
		).insert()

	def test_walk_excludes_unpublished(self):
		docs = walk_space_tree(self.space.name)
		titles = [d["title"] for d in docs]
		self.assertIn("Capítulo uno", titles)
		self.assertIn("Página uno", titles)
		self.assertNotIn("Página oculta", titles)
		self.assertEqual(docs[0]["depth"], 1)

	def test_build_produces_pdf_and_hash_skip(self):
		result = build(self.book.name)
		self.assertFalse(result["unchanged"])
		file_doc = frappe.get_doc("File", {"file_url": result["file_url"]})
		content = file_doc.get_content()
		if isinstance(content, str):
			content = content.encode()
		self.assertTrue(content.startswith(b"%PDF-"))

		# Second build with identical content must be a hash-skip
		self.book.reload()
		result2 = build(self.book.name)
		self.assertTrue(result2["unchanged"])

	def test_get_help_url_resolution(self):
		suffix = frappe.generate_hash(length=8)
		frappe.get_doc(
			{
				"doctype": "Wiki Help Mapping",
				"context_type": "POS Screen",
				"context_key": f"test-screen-{suffix}",
				"wiki_route": "manual/punto-de-venta/cobrar-una-venta",
			}
		).insert()
		from wiki_press.api import get_help_url

		self.assertEqual(
			get_help_url("POS Screen", f"test-screen-{suffix}"),
			"/manual/punto-de-venta/cobrar-una-venta",
		)
		# unknown key on a type without wildcard -> None (no site_config base in tests)
		self.assertIsNone(get_help_url("Storefront Page", f"missing-{suffix}"))

	def test_content_hash_changes_with_settings(self):
		docs = walk_space_tree(self.space.name)
		h1 = compute_content_hash(self.book, docs)
		self.book.paper_size = "A4"
		h2 = compute_content_hash(self.book, docs)
		self.assertNotEqual(h1, h2)
