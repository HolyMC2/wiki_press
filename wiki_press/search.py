"""Search subclass that folds tag names into the indexed text.

Registered as an ADDITIONAL ``sqlite_search`` hook. frappe builds every
hooked class; this one inherits upstream's INDEX_NAME, so it writes the same
index file — and because apps build in install order (wiki before
wiki_press), the tag-enriched pass lands last. The wiki SPA's query path
reads the same file through the upstream class, untouched.
"""

from wiki.frappe_wiki.doctype.wiki_document.wiki_sqlite_search import WikiSQLiteSearch

from wiki_press.tags import get_document_tags


class WikiPressSearch(WikiSQLiteSearch):
	def prepare_document(self, doc):
		prepared = super().prepare_document(doc)
		if prepared:
			tags = get_document_tags(doc.name)
			if tags:
				prepared["content"] = (prepared.get("content") or "") + "\n" + " ".join(tags)
		return prepared
