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

# --- planned wiring (kept explicit so the roadmap is visible in code) -------
# P2 book exporter: doc_events on Wiki Change Request merge -> debounced
#   rebuild of Wiki Books watching that space.
# P3 git publish: same merge event -> export space tree to the content repo.
# P3 tenant pull: scheduler_events cron pulling git_synced spaces.
# P3 canonical SEO: template override injecting <link rel="canonical"> on
#   synced-space pages when site_config wiki_canonical_base is set.
