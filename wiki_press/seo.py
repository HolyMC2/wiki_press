"""Canonical-URL override for distributed wiki content.

Tenant sites render synced copies of the manual; without intervention every
tenant domain competes in search. When site_config sets
``wiki_canonical_base`` (only on tenant sites — the master leaves it unset),
wiki pages point their canonical at the master docs domain. Upstream already
renders ``canonical_url`` in its layout; we only replace the value.
"""

import frappe


def update_canonical(context):
	base = frappe.conf.get("wiki_canonical_base")
	if not base:
		return
	doc = context.get("doc")
	if getattr(doc, "doctype", None) != "Wiki Document" or not getattr(doc, "route", None):
		return
	context["canonical_url"] = f"{base.rstrip('/')}/{doc.route}"
