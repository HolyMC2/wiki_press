"""Adversarial tests for the hardening applied after the 2026-07-11 audit.

Each test asserts the EXPLOIT is refused, not merely that the happy path
works — a green run here means the attack surface is actually closed.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from wiki_press.git_repo import validate_ref, validate_remote_url, validate_subdir


class TestGitInputValidation(FrappeTestCase):
	def test_ext_transport_rejected(self):
		with self.assertRaises(Exception):
			validate_remote_url('ext::sh -c "id"')

	def test_scp_style_and_dashdash_rejected(self):
		for bad in ("--upload-pack=sh", "-oProxyCommand=x", "fd::0", "https://u:p@h/r"):
			with self.assertRaises(Exception):
				validate_remote_url(bad)

	def test_allowed_schemes_pass(self):
		for ok in (
			"https://github.com/o/r",
			"ssh://git@github.com/o/r",
			"git@github.com:o/r.git",
			"file:///home/frappe/frappe-bench/sites/hub.git",
		):
			validate_remote_url(ok)  # must not raise

	def test_branch_option_injection_rejected(self):
		for bad in ("--upload-pack=sh", "-x", "a b", "re:f", "a..b"):
			with self.assertRaises(Exception):
				validate_ref(bad)

	def test_subdir_traversal_rejected(self):
		for bad in ("../../apps", "/etc", "a/../../b"):
			with self.assertRaises(Exception):
				validate_subdir(bad)
		validate_subdir("manual")  # legit relative path must not raise

	def test_doctype_validate_blocks_ext_transport(self):
		space = frappe.get_doc(
			{
				"doctype": "Wiki Document",
				"title": f"Sec Root {frappe.generate_hash(length=6)}",
				"is_group": 1,
				"is_published": 1,
			}
		).insert()
		sp = frappe.get_doc(
			{
				"doctype": "Wiki Space",
				"space_name": f"Sec {frappe.generate_hash(length=6)}",
				"route": f"sec-{frappe.generate_hash(length=6)}",
				"is_published": 1,
				"root_group": space.name,
			}
		).insert()
		with self.assertRaises(Exception):
			frappe.get_doc(
				{
					"doctype": "Wiki Publish Target",
					"space": sp.name,
					"remote_url": 'ext::sh -c "touch /tmp/pwn"',
					"branch": "main",
				}
			).insert()


class TestDownloadBookNoLeak(FrappeTestCase):
	def test_guest_gets_404_for_private_book(self):
		from wiki_press.api import download_book

		root = frappe.get_doc(
			{"doctype": "Wiki Document", "title": f"PB {frappe.generate_hash(length=6)}",
			 "is_group": 1, "is_published": 1}
		).insert()
		# restricted space (has a role row, no Guest) -> not guest-readable
		sp = frappe.get_doc(
			{
				"doctype": "Wiki Space",
				"space_name": f"Priv {frappe.generate_hash(length=6)}",
				"route": f"priv-{frappe.generate_hash(length=6)}",
				"is_published": 1,
				"root_group": root.name,
				"roles": [{"role": "System Manager", "permission_level": "Read"}],
			}
		).insert()
		book = frappe.get_doc(
			{"doctype": "Wiki Book", "title": f"Secret {frappe.generate_hash(length=6)}",
			 "space": sp.name, "public_download": 1}
		).insert()

		frappe.set_user("Guest")
		try:
			with self.assertRaises(frappe.DoesNotExistError):
				download_book(book.name)
			# a nonexistent name must raise the SAME class (indistinguishable)
			with self.assertRaises(frappe.DoesNotExistError):
				download_book("WB-99999")
		finally:
			frappe.set_user("Administrator")
