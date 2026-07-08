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

doc_events = {
    # Rebuild books watching a space when a Change Request merges. The
    # enqueue is deduplicated by job_id, so a burst of merges costs one build.
    "Wiki Change Request": {"on_update": "wiki_press.builder.handle_cr_merge"},
}

# --- planned wiring (kept explicit so the roadmap is visible in code) -------
# P3 git publish: same merge event -> export space tree to the content repo.
# P3 tenant pull: scheduler_events cron pulling git_synced spaces.
# P3 canonical SEO: template override injecting <link rel="canonical"> on
#   synced-space pages when site_config wiki_canonical_base is set.
