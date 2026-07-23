"""Staff-space serving contract (B3 ops manuals).

The staff ops manuals live in a SEPARATE, non-guest Wiki Space (route
`manual-staff`) so panel screenshots + money procedures are never public. This
proves the two properties that stance depends on:

1. A space with NO role rows is login-only: anonymous Guests are denied (404 via
   check_space_access), a logged-in non-manager staff user reads it. (Contrast the
   public manual, which carries a Guest role — covered by test_public_manual.)

2. The wiki_press pipeline moves DOCUMENTS, not Wiki Space Role rows: a non-guest
   master, published to a hub and pulled into a fresh non-guest mirror, keeps the
   content AND stays login-only on the mirror. The staff-only posture is therefore
   per-site and cannot be accidentally made public in transit.
"""

import os
import subprocess
import tempfile

import frappe
from frappe.tests.utils import FrappeTestCase

from wiki.permissions import _accessible_space_names, can_read_space, can_write_space
from wiki_press.git_publish import publish_target
from wiki_press.git_pull import pull_source

STAFF_ROLE = "Wiki User"  # a plain, non-manager web role


def _staff_user() -> str:
	email = "b3_staff_test@example.com"
	if not frappe.db.exists("User", email):
		u = frappe.new_doc("User")
		u.email = email
		u.first_name = "B3 Staff"
		u.send_welcome_email = 0
		u.insert(ignore_permissions=True)
	frappe.get_doc("User", email).add_roles(STAFF_ROLE)
	return email


def _no_guest_space(suffix: str, route_prefix: str, pages: dict[str, str]):
	"""A published space with an EMPTY roles table (login-only, no Guest)."""
	root = frappe.get_doc(
		{"doctype": "Wiki Document", "title": f"Root {suffix}", "is_group": 1, "is_published": 1}
	).insert()
	space = frappe.get_doc(
		{
			"doctype": "Wiki Space",
			"space_name": f"Staff {suffix}",
			"route": f"{route_prefix}-{suffix}",
			"is_published": 1,
			"root_group": root.name,
			"roles": [],  # <- no Guest row = login-only
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
	return space


class TestStaffSpaceAccess(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.suffix = frappe.generate_hash(length=8)
		self.staff = _staff_user()

	def test_no_guest_space_denies_guest(self):
		space = _no_guest_space(self.suffix, "staff-priv", {"Página": "# secreto\n"})
		self.assertFalse(can_read_space(space.name, "Guest"))

	def test_no_guest_space_allows_logged_in_non_manager(self):
		space = _no_guest_space(self.suffix, "staff-open", {"Página": "# hola\n"})
		# Not a manager, yet reads it — proves it is login-only, not admin-only.
		self.assertTrue(can_read_space(space.name, self.staff))
		# Read tier only: an ordinary staff reader cannot write.
		self.assertFalse(can_write_space(space.name, self.staff))

	def test_guest_excluded_from_accessible_spaces(self):
		space = _no_guest_space(self.suffix, "staff-acc", {"Página": "# x\n"})
		self.assertNotIn(space.name, _accessible_space_names("Guest"))
		self.assertIn(space.name, _accessible_space_names(self.staff))


class TestStaffSpaceRoundTrip(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.suffix = frappe.generate_hash(length=8)
		self.staff = _staff_user()
		self.tmp = tempfile.mkdtemp(prefix="wiki_press_staff_hub_")
		self.hub = os.path.join(self.tmp, "hub.git")
		subprocess.run(["git", "init", "-q", "--bare", "-b", "main", self.hub], check=True)

	def test_non_guest_posture_survives_publish_pull(self):
		pages = {"Registrar pago": "# Registrar un pago manual\n\nSPEI / efectivo.\n"}
		master = _no_guest_space(self.suffix, "staff-src", pages)
		target = frappe.get_doc(
			{
				"doctype": "Wiki Publish Target",
				"space": master.name,
				"remote_url": f"file://{self.hub}",
				"branch": "main",
				"docs_subdir": "manual-staff",
			}
		).insert()
		self.assertTrue(publish_target(target.name)["pushed"])

		# The mirror is created login-only on THIS site; the pipeline never carries
		# a Guest role, so the mirror's posture is whatever we set here.
		mirror = _no_guest_space(f"m{self.suffix}", "staff-dst", {})
		source = frappe.get_doc(
			{
				"doctype": "Wiki Pull Source",
				"space": mirror.name,
				"remote_url": f"file://{self.hub}",
				"branch": "main",
				"docs_subdir": "manual-staff",
			}
		).insert()
		self.assertTrue(pull_source(source.name)["synced"])

		# content arrived
		mirrored = {
			d.title
			for d in frappe.get_all(
				"Wiki Document",
				filters={"route": ["like", f"{mirror.route}/%"], "is_group": 0},
				fields=["title"],
			)
		}
		self.assertIn("Registrar pago", mirrored)

		# ...and the mirror is STILL login-only (guest denied, staff reads)
		self.assertFalse(can_read_space(mirror.name, "Guest"))
		self.assertTrue(can_read_space(mirror.name, self.staff))
		self.assertNotIn(mirror.name, _accessible_space_names("Guest"))
