import frappe
from frappe.model.document import Document

from wiki_press.git_repo import validate_ref, validate_remote_url, validate_subdir


class WikiPullSource(Document):
	def validate(self):
		validate_remote_url(self.remote_url)
		validate_ref(self.branch)
		validate_subdir(self.docs_subdir)
		if frappe.db.exists("Wiki Publish Target", {"space": self.space, "enabled": 1}) and self.enabled:
			frappe.throw(
				"This space already publishes to a repo; a space cannot be "
				"both a publish source and a pull target."
			)
