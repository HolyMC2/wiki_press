app_name = "wiki_press"
app_title = "Wiki Press"
app_publisher = "docomexico"
app_description = (
    "Companion app for Frappe Wiki: whole-book PDF export, git publish, "
    "canonical SEO, contextual help"
)
app_email = "marcoantonioponcevaldez@gmail.com"
app_license = "MIT"

required_apps = ["wiki"]

app_include_js = ["/assets/wiki_press/js/wiki_press_help.js"]

fixtures = [{"dt": "Wiki Help Mapping"}]

doc_events = {
    # On CR merge: rebuild watching books + publish to configured git repos.
    # Both enqueues are deduplicated by job_id, so a burst of merges costs
    # one build / one push.
    "Wiki Change Request": {"on_update": "wiki_press.events.on_change_request_update"},
}

scheduler_events = {
    "cron": {
        # Tenant freshness: pull every enabled Wiki Pull Source. Upstream's
        # GitHub sync only has webhook/manual triggers; this adds the cron.
        "*/30 * * * *": ["wiki_press.git_pull.pull_all_enabled"],
    },
}

# Rewrites canonical_url on wiki pages when site_config wiki_canonical_base
# is set (tenant sites only — the master leaves it unset). Doctype-class
# override because WikiDocumentRenderer bypasses the website context
# pipeline (update_website_context never fires for wiki pages).
override_doctype_class = {"Wiki Document": "wiki_press.overrides.WikiDocumentCanonical"}
