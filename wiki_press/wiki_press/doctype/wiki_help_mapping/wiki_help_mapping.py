import frappe
from frappe.model.document import Document


class WikiHelpMapping(Document):
	def validate(self):
		self.wiki_route = (self.wiki_route or "").strip("/ ")
		if frappe.db.exists(
			"Wiki Help Mapping",
			{
				"context_type": self.context_type,
				"context_key": self.context_key,
				"enabled": 1,
				"name": ("!=", self.name),
			},
		) and self.enabled:
			frappe.throw(
				f"An enabled mapping for {self.context_type} / {self.context_key} already exists"
			)
