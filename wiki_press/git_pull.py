"""Pull a git repo into a git-synced Wiki Space using upstream's own sync
engine over a LOCAL git transport.

Upstream's ``wiki.wiki.git_sync`` documents its ``_fetch_*`` helpers as the
transport seam ("module-level so tests can monkeypatch them — the engine
itself is transport-agnostic"). We use exactly that seam: clone/fetch the
repo with plain git, then serve head/tree/blob lookups from the local clone.

Why: works with ANY remote (no per-site GitHub App), no secrets sprawl, and
every reconciliation/read-only/logging behavior stays upstream's.
"""

from contextlib import contextmanager

import frappe

from wiki_press.git_repo import cat_blob, ensure_work_clone, head_sha, ls_blobs

PLACEHOLDER_REPO = "wiki-press/local-git"


@contextmanager
def _local_transport(clone_path: str):
	import wiki.wiki.git_sync as git_sync

	originals = (
		git_sync._fetch_head_sha,
		git_sync._fetch_tree,
		git_sync._fetch_blob,
		git_sync._fetch_blob_bytes,
	)
	git_sync._fetch_head_sha = lambda repo, branch, token=None: head_sha(clone_path)
	git_sync._fetch_tree = lambda repo, ref, token=None: ls_blobs(clone_path, ref)
	git_sync._fetch_blob = lambda repo, sha, token=None: cat_blob(clone_path, sha).decode(
		"utf-8", errors="replace"
	)
	git_sync._fetch_blob_bytes = lambda repo, sha, token=None: cat_blob(clone_path, sha)
	try:
		yield git_sync
	finally:
		(
			git_sync._fetch_head_sha,
			git_sync._fetch_tree,
			git_sync._fetch_blob,
			git_sync._fetch_blob_bytes,
		) = originals


def _ensure_space_sync_fields(source) -> None:
	"""upstream sync_space validates repo_full_name/branch and only runs on
	git_synced spaces — satisfy it without a GitHub App."""
	updates = {}
	space = frappe.db.get_value(
		"Wiki Space",
		source.space,
		["git_synced", "repo_full_name", "branch", "docs_subdir"],
		as_dict=True,
	)
	if not space.git_synced:
		updates["git_synced"] = 1
	if not space.repo_full_name:
		updates["repo_full_name"] = PLACEHOLDER_REPO
	if (space.branch or "") != (source.branch or "main"):
		updates["branch"] = source.branch or "main"
	if (space.docs_subdir or "") != (source.docs_subdir or ""):
		updates["docs_subdir"] = source.docs_subdir or ""
	if updates:
		frappe.db.set_value("Wiki Space", source.space, updates, update_modified=False)


def pull_source(source_name: str) -> dict:
	source = frappe.get_doc("Wiki Pull Source", source_name)
	if not source.enabled:
		return {"synced": False, "reason": "disabled"}

	clone = ensure_work_clone(source.remote_url, source.branch or "main", f"pull-{source.name}")
	sha = head_sha(clone)
	if not sha:
		return {"synced": False, "reason": "empty remote"}

	_ensure_space_sync_fields(source)
	with _local_transport(clone) as git_sync:
		git_sync.sync_space(source.space, trigger="Manual")

	source.db_set({"last_synced_sha": sha, "last_synced_on": frappe.utils.now()})
	status = frappe.db.get_value("Wiki Space", source.space, "last_sync_status")
	return {"synced": True, "sha": sha, "space_status": status}


def pull_all_enabled() -> None:
	"""Scheduler entry: pull every enabled source, isolated per source."""
	for name in frappe.get_all("Wiki Pull Source", filters={"enabled": 1}, pluck="name"):
		frappe.enqueue(
			"wiki_press.git_pull.pull_source",
			source_name=name,
			queue="long",
			timeout=600,
			job_id=f"wiki_press:pull:{name}",
			deduplicate=True,
		)
