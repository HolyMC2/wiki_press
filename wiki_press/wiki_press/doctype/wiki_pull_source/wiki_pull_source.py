import frappe
from frappe.model.document import Document


class WikiPullSource(Document):
	def validate(self):
		if "@" in (self.remote_url or "").split("//", 1)[-1].split("/", 1)[0]:
			frappe.throw(
				"Do not embed credentials in the remote URL. "
				"Set wiki_press_git_token in site_config instead."
			)
		if frappe.db.exists("Wiki Publish Target", {"space": self.space, "enabled": 1}) and self.enabled:
			frappe.throw(
				"This space already publishes to a repo; a space cannot be "
				"both a publish source and a pull target."
			)
