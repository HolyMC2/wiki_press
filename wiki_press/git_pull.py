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


def assert_transport_contract() -> None:
	"""Fail loudly at rebase if upstream's fetch seam changed shape. The pull
	mechanism monkeypatches these four module-level functions; a rename or
	arity change would otherwise fail silently or hit real GitHub."""
	import inspect

	import wiki.wiki.git_sync as git_sync

	expected = {
		"_fetch_head_sha": ("repo", "branch", "token"),
		"_fetch_tree": ("repo", "ref", "token"),
		"_fetch_blob": ("repo", "sha", "token"),
		"_fetch_blob_bytes": ("repo", "sha", "token"),
	}
	for name, params in expected.items():
		fn = getattr(git_sync, name, None)
		if fn is None:
			frappe.throw(f"wiki_press: upstream git_sync.{name} is gone (rebase break)")
		got = tuple(inspect.signature(fn).parameters)
		if got != params:
			frappe.throw(f"wiki_press: git_sync.{name}{got} != expected {params} (rebase break)")
	if not hasattr(git_sync, "sync_space"):
		frappe.throw("wiki_press: upstream git_sync.sync_space is gone (rebase break)")


@contextmanager
def _local_transport(clone_path: str):
	import wiki.wiki.git_sync as git_sync

	assert_transport_contract()
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
	branch_changed = (space.branch or "") != (source.branch or "main")
	subdir_changed = (space.docs_subdir or "") != (source.docs_subdir or "")
	if branch_changed:
		updates["branch"] = source.branch or "main"
	if subdir_changed:
		updates["docs_subdir"] = source.docs_subdir or ""
	if branch_changed or subdir_changed:
		# The sha short-circuit in sync_space compares HEAD to
		# last_synced_commit_sha BEFORE reading the tree/subdir. A config
		# change at the same sha would otherwise be ignored until an unrelated
		# commit lands — clear it so the next sync re-reads the tree.
		updates["last_synced_commit_sha"] = ""
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

	# Wipe guard: if the repo has NO markdown under docs_subdir but the space
	# already holds published pages, syncing would delete the entire mirror
	# (a subdir typo, or the master relocating its docs folder). Refuse.
	if _repo_has_no_markdown(clone, source.docs_subdir) and _space_has_published_pages(source.space):
		msg = (
			f"Refusing pull: no markdown under docs_subdir "
			f"'{source.docs_subdir or '(root)'}' but the space has published pages "
			f"— this would wipe the mirror. Check the Pull Source subdir/branch."
		)
		frappe.db.set_value("Wiki Space", source.space, "last_sync_status", "Error", update_modified=False)
		source.db_set({"last_status": "Error", "last_error": msg})
		frappe.log_error(message=msg, title="wiki_press: pull wipe guard")
		return {"synced": False, "reason": "wipe-guard", "detail": msg}

	try:
		_ensure_space_sync_fields(source)
		with _local_transport(clone) as git_sync:
			git_sync.sync_space(source.space, trigger="Manual")
	except Exception:
		err = frappe.get_traceback(with_context=False)[-1000:]
		source.db_set({"last_status": "Error", "last_error": err})
		raise

	status = frappe.db.get_value("Wiki Space", source.space, "last_sync_status")
	source.db_set(
		{
			"last_synced_sha": sha,
			"last_synced_on": frappe.utils.now(),
			"last_status": status or "Success",
			"last_error": "",
		}
	)
	return {"synced": True, "sha": sha, "space_status": status}


def _repo_has_no_markdown(clone_path: str, docs_subdir: str | None) -> bool:
	prefix = (docs_subdir or "").strip("/")
	prefix = f"{prefix}/" if prefix else ""
	for blob in ls_blobs(clone_path):
		path = blob.get("path", "")
		if prefix and not path.startswith(prefix):
			continue
		if path.lower().endswith((".md", ".mdx")):
			return False
	return True


def _space_has_published_pages(space: str) -> bool:
	route = frappe.db.get_value("Wiki Space", space, "route")
	if not route:
		return False
	return bool(
		frappe.db.count(
			"Wiki Document",
			{"is_group": 0, "is_published": 1, "route": ["like", f"{route}/%"]},
		)
	)


@frappe.whitelist()
def pull_now(source: str) -> dict:
	"""Desk button on Wiki Pull Source: pull synchronously."""
	frappe.has_permission("Wiki Pull Source", "write", throw=True)
	return pull_source(source)


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
