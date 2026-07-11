"""Fold tag names into the wiki's own search index.

Why patch instead of a second search class: the wiki SPA queries the
upstream ``WikiSQLiteSearch`` directly, and frappe builds only ONE class per
index file (the second registrant is skipped because the file already
exists). Registering a parallel class therefore left tags OUT of the index
the SPA actually reads — the feature only worked after an unrelated re-save.

So we patch ``WikiSQLiteSearch.prepare_document`` at import: the single
upstream index owner now indexes tag names too, on both full rebuilds and
incremental updates, and the SPA query path is unchanged. This module is
imported by frappe's ``get_search_classes`` (via the sqlite_search hook
below) before any index build runs, so the patch is always in place.

Rebase tripwire: if upstream renames prepare_document or changes its return
shape, assert_upstream_search_contract() raises loudly at import.
"""

import frappe
from wiki.frappe_wiki.doctype.wiki_document.wiki_sqlite_search import WikiSQLiteSearch

from wiki_press.tags import get_document_tags


def assert_upstream_search_contract() -> None:
	if not hasattr(WikiSQLiteSearch, "prepare_document"):
		frappe.throw("wiki_press: upstream WikiSQLiteSearch.prepare_document is gone (rebase break)")
	if not hasattr(WikiSQLiteSearch, "index_doc"):
		frappe.throw("wiki_press: upstream SQLiteSearch.index_doc is gone (rebase break)")


def _install_tag_enrichment() -> None:
	if getattr(WikiSQLiteSearch, "_wiki_press_tag_patch", False):
		return
	assert_upstream_search_contract()
	_orig = WikiSQLiteSearch.prepare_document

	def prepare_document(self, doc):
		prepared = _orig(self, doc)
		if prepared:
			tags = get_document_tags(doc.name)
			if tags:
				prepared["content"] = (prepared.get("content") or "") + "\n" + " ".join(tags)
		return prepared

	WikiSQLiteSearch.prepare_document = prepare_document
	WikiSQLiteSearch._wiki_press_tag_patch = True


_install_tag_enrichment()


class WikiPressSearch(WikiSQLiteSearch):
	"""Registered in the sqlite_search hook only so this module is imported
	(installing the patch above). It reuses the now-patched base — it does
	NOT build a second index."""

	pass
