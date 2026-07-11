"""doc_events dispatchers. Keep hooks.py wiring stable; fan out here."""


def on_change_request_update(doc, method=None):
	if doc.status != "Merged":
		return
	# A wiki merge must NEVER fail because a downstream enqueue hiccupped —
	# log and let the merge finish; the cron pull / next merge catches up.
	import frappe

	try:
		from wiki_press.builder import handle_cr_merge
		from wiki_press.git_publish import handle_cr_merge_publish

		handle_cr_merge(doc, method)
		handle_cr_merge_publish(doc.wiki_space)
	except Exception:
		frappe.log_error(title=f"wiki_press: post-merge dispatch failed for {doc.name}")
