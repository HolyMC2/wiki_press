"""Doctype-class overrides (wired via hooks.override_doctype_class).

WikiDocumentRenderer.render() builds its context straight from
``WikiDocument.get_web_context()`` and renders the template itself — the
standard website pipeline (and its ``update_website_context`` hook) never
runs for wiki pages. Overriding the doctype class is the supported way to
intercept that path without forking wiki.
"""

import frappe
from wiki.frappe_wiki.doctype.wiki_document.wiki_document import WikiDocument


class WikiDocumentCanonical(WikiDocument):
	def get_web_context(self):
		context = super().get_web_context()
		# Tenant sites set wiki_canonical_base in site_config so their synced
		# copies of the manual point search engines at the master docs domain.
		# The master site leaves it unset and keeps self-canonicals.
		base = frappe.conf.get("wiki_canonical_base")
		if base and self.route:
			context["canonical_url"] = f"{base.rstrip('/')}/{self.route}"

		# Tag chips above the content. Injected here instead of a template
		# override so upstream template updates never conflict.
		from wiki_press.tags import get_document_tags, render_tag_chips

		tags = get_document_tags(self.name)
		if tags:
			context["wiki_press_tags"] = tags
			context["rendered_content"] = render_tag_chips(tags) + (
				context.get("rendered_content") or ""
			)
		return context
