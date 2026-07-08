"""doc_events dispatchers. Keep hooks.py wiring stable; fan out here."""


def on_change_request_update(doc, method=None):
	if doc.status != "Merged":
		return
	from wiki_press.builder import handle_cr_merge
	from wiki_press.git_publish import handle_cr_merge_publish

	handle_cr_merge(doc, method)
	handle_cr_merge_publish(doc.wiki_space)
