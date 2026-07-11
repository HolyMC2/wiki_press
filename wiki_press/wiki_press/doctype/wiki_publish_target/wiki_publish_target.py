from frappe.model.document import Document

from wiki_press.git_repo import validate_ref, validate_remote_url, validate_subdir


class WikiPublishTarget(Document):
	def validate(self):
		validate_remote_url(self.remote_url)
		validate_ref(self.branch)
		validate_subdir(self.docs_subdir)
