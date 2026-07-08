"""Round-trip guarantee: what git_publish exports, upstream's sync engine
imports back identically. This is the test that catches format drift between
our exporter and the wiki version we're pinned to.
"""

import os
import subprocess
import tempfile

import frappe
from frappe.tests.utils import FrappeTestCase

from wiki_press.git_publish import publish_target
from wiki_press.git_pull import pull_source


def _make_space(suffix: str, route_prefix: str, pages: dict[str, str]):
	root = frappe.get_doc(
		{"doctype": "Wiki Document", "title": f"Root {suffix}", "is_group": 1, "is_published": 1}
	).insert()
	space = frappe.get_doc(
		{
			"doctype": "Wiki Space",
			"space_name": f"Space {suffix}",
			"route": f"{route_prefix}-{suffix}",
			"is_published": 1,
			"root_group": root.name,
		}
	).insert()
	group = frappe.get_doc(
		{
			"doctype": "Wiki Document",
			"title": "Grupo uno",
			"is_group": 1,
			"is_published": 1,
			"parent_wiki_document": root.name,
		}
	).insert()
	for title, content in pages.items():
		frappe.get_doc(
			{
				"doctype": "Wiki Document",
				"title": title,
				"is_published": 1,
				"parent_wiki_document": group.name,
				"content": content,
			}
		).insert()
	return space


class TestDistributionRoundTrip(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.tmp = tempfile.mkdtemp(prefix="wiki_press_hub_")
		self.hub = os.path.join(self.tmp, "hub.git")
		subprocess.run(["git", "init", "-q", "--bare", "-b", "main", self.hub], check=True)
		self.suffix = frappe.generate_hash(length=8)

	def test_publish_then_pull_reproduces_content(self):
		pages = {
			"Página alfa": "# Página alfa\n\nContenido con **negritas** y acentos: configuración.\n",
			"Página beta": "# Página beta\n\n- lista\n- de\n- puntos\n",
		}
		source_space = _make_space(self.suffix, "rt-src", pages)
		target = frappe.get_doc(
			{
				"doctype": "Wiki Publish Target",
				"space": source_space.name,
				"remote_url": f"file://{self.hub}",
				"branch": "main",
				"docs_subdir": "manual",
			}
		).insert()

		result = publish_target(target.name)
		self.assertTrue(result["pushed"], "first publish must push a commit")

		mirror_space = _make_space(f"m{self.suffix}", "rt-dst", {})
		source = frappe.get_doc(
			{
				"doctype": "Wiki Pull Source",
				"space": mirror_space.name,
				"remote_url": f"file://{self.hub}",
				"branch": "main",
				"docs_subdir": "manual",
			}
		).insert()

		pull = pull_source(source.name)
		self.assertTrue(pull["synced"])
		self.assertEqual(
			frappe.db.get_value("Wiki Space", mirror_space.name, "last_sync_status"), "Success"
		)

		mirrored = frappe.get_all(
			"Wiki Document",
			filters={"route": ["like", f"rt-dst-m{self.suffix}/%"], "is_group": 0},
			fields=["title", "content"],
		)
		by_title = {d.title: d.content for d in mirrored}
		self.assertIn("Página alfa", by_title)
		self.assertIn("Página beta", by_title)
		self.assertIn("Contenido con **negritas** y acentos: configuración.", by_title["Página alfa"])

		# read-only enforcement on the mirror
		from wiki.permissions import assert_space_writable

		with self.assertRaises(Exception):
			assert_space_writable(mirror_space.name)

	def test_unchanged_second_publish_pushes_nothing(self):
		source_space = _make_space(f"n{self.suffix}", "rt-noop", {"Única": "# Única\n\nHola.\n"})
		target = frappe.get_doc(
			{
				"doctype": "Wiki Publish Target",
				"space": source_space.name,
				"remote_url": f"file://{self.hub}",
				"branch": "main",
			}
		).insert()
		first = publish_target(target.name)
		self.assertTrue(first["pushed"])
		second = publish_target(target.name)
		self.assertFalse(second["pushed"], "identical content must not create a commit")
