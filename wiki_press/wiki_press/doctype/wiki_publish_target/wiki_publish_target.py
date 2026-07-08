import frappe
from frappe.model.document import Document


class WikiPublishTarget(Document):
	def validate(self):
		if "@" in (self.remote_url or "").split("//", 1)[-1].split("/", 1)[0]:
			frappe.throw(
				"Do not embed credentials in the remote URL. "
				"Set wiki_press_git_token in site_config instead."
			)
