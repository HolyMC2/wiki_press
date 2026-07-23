"""Public-manual serving contract.

Two things the public docs site (wiki.muelle.mx) relies on and that were
otherwise uncovered:

1. The canonical override (``overrides.WikiDocumentCanonical``) — wiki_press's
   answer to the wiki SPA's blanket ``noindex``. Reader pages stay indexable;
   the MASTER site is self-canonical, and TENANT mirror copies (site_config
   ``wiki_canonical_base`` set) point search engines back at the master. That
   canonical-dedup is the SEO-correct mechanism — a mirror is a duplicate that
   defers to the master, not a page you hide with noindex.

2. The guest-readable / no-guest-write / unpublished-pruned shape a published
   manual space must have to serve the public.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from wiki.permissions import can_read_space, can_write_space
from wiki_press.queries import walk_space_tree


def _published_space(suffix, route_prefix, pages, guest_read=False, unpublished=None):
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
            "roles": [{"role": "Guest", "permission_level": "Read"}] if guest_read else [],
        }
    ).insert()
    for title, content in pages.items():
        frappe.get_doc(
            {
                "doctype": "Wiki Document",
                "title": title,
                "is_published": 1,
                "parent_wiki_document": root.name,
                "content": content,
            }
        ).insert()
    for title, content in (unpublished or {}).items():
        frappe.get_doc(
            {
                "doctype": "Wiki Document",
                "title": title,
                "is_published": 0,
                "parent_wiki_document": root.name,
                "content": content,
            }
        ).insert()
    return space


def _first_leaf(space):
    name = frappe.get_all(
        "Wiki Document",
        filters={"is_group": 0, "route": ["like", f"{space.route}/%"]},
        pluck="name",
    )[0]
    return frappe.get_doc("Wiki Document", name)


class TestPublicManualCanonical(FrappeTestCase):
    def setUp(self):
        frappe.set_user("Administrator")
        self.suffix = frappe.generate_hash(length=8)

    def test_master_page_is_self_canonical(self):
        """No wiki_canonical_base → the master keeps its own URL as canonical."""
        space = _published_space(self.suffix, "pm-master", {"Página": "# hola\n"})
        doc = _first_leaf(space)
        with patch.dict(frappe.conf, {"wiki_canonical_base": ""}):
            context = doc.get_web_context()
        self.assertEqual(context["canonical_url"], frappe.utils.get_url("/" + doc.route))

    def test_tenant_copy_canonical_points_at_master(self):
        """A mirror site sets wiki_canonical_base → its copies defer to the
        master docs domain at the SAME route (so the canonical resolves)."""
        space = _published_space(self.suffix, "pm-tenant", {"Página": "# hola\n"})
        doc = _first_leaf(space)
        base = "https://wiki.example.test"
        with patch.dict(frappe.conf, {"wiki_canonical_base": base}):
            context = doc.get_web_context()
        self.assertEqual(context["canonical_url"], f"{base}/{doc.route}")

    def test_trailing_slash_in_base_is_normalised(self):
        space = _published_space(self.suffix, "pm-slash", {"Página": "# hola\n"})
        doc = _first_leaf(space)
        with patch.dict(frappe.conf, {"wiki_canonical_base": "https://wiki.example.test/"}):
            context = doc.get_web_context()
        self.assertEqual(context["canonical_url"], f"https://wiki.example.test/{doc.route}")


class TestPublicManualAccess(FrappeTestCase):
    def setUp(self):
        frappe.set_user("Administrator")
        self.suffix = frappe.generate_hash(length=8)

    def test_guest_reads_public_space_but_cannot_write(self):
        space = _published_space(self.suffix, "pm-acc", {"Página": "# x\n"}, guest_read=True)
        self.assertTrue(can_read_space(space.name, "Guest"))
        self.assertFalse(can_write_space(space.name, "Guest"))

    def test_guest_denied_on_space_without_guest_role(self):
        space = _published_space(self.suffix, "pm-priv", {"Página": "# x\n"}, guest_read=False)
        self.assertFalse(can_read_space(space.name, "Guest"))

    def test_unpublished_pages_pruned_from_publish_tree(self):
        space = _published_space(
            self.suffix, "pm-unpub", {"Pública": "# pub\n"}, unpublished={"Secreta": "# secret\n"}
        )
        titles = {d["title"] for d in walk_space_tree(space.name)}
        self.assertIn("Pública", titles)
        self.assertNotIn("Secreta", titles)
