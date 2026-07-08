import frappe
from frappe.model.document import Document


class WikiBook(Document):
	def validate(self):
		if self.toc_depth and not (1 <= self.toc_depth <= 6):
			frappe.throw("TOC Depth must be between 1 and 6")
		if self.root_document:
			space_of_doc = frappe.db.get_value("Wiki Space", self.space, "root_group")
			ancestors = _ancestors(self.root_document)
			if space_of_doc not in ancestors and self.root_document != space_of_doc:
				frappe.throw("Root Document does not belong to the selected Wiki Space")


def _ancestors(doc_name: str) -> set[str]:
	seen = set()
	current = doc_name
	while current:
		current = frappe.db.get_value("Wiki Document", current, "parent_wiki_document")
		if current in seen:
			break
		if current:
			seen.add(current)
	return seen
