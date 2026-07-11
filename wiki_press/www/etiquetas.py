import frappe

from wiki_press.tags import accessible_tagged_documents


def get_context(context):
	tag = frappe.form_dict.get("tag")
	context.tag_filter = tag
	context.tag_map = accessible_tagged_documents(tag or None)
	context.no_cache = 1  # visibility depends on the session's space access
	context.title = "Etiquetas"
	return context
