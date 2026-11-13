"""Pull a git repo into a git-synced Wiki Space using upstream's own sync
engine over a LOCAL git transport.

Upstream's ``wiki.wiki.git_sync`` documents its ``_fetch_*`` helpers as the
transport seam ("module-level so tests can monkeypatch them — the engine
itself is transport-agnostic"). We use exactly that seam: clone/fetch the
repo with plain git, then serve head/tree/blob lookups from the local clone.

Why: works with ANY remote (no per-site GitHub App), no secrets sprawl, and
every reconciliation/read-only/logging behavior stays upstream's.
"""

import re
import subprocess
from contextlib import contextmanager

import frappe
from frappe.utils import add_to_date, cint, get_datetime, now_datetime

from wiki_press.git_repo import _redact, cat_blob, ensure_work_clone, head_sha, ls_blobs

PLACEHOLDER_REPO = "wiki-press/local-git"

# A source whose pull fails (remote gone or unreachable, wipe guard) waits
# before the scheduled pull tries it again: 30 min after the first failure,
# doubling up to a day. pull_now («Sincronizar ahora») always tries.
BACKOFF_FIRST_MINUTES = 30
BACKOFF_MAX_MINUTES = 24 * 60
# The cron ticks every 30 min and the job runs shortly after the tick, so a
# wait that ends within this slack of a tick counts as due at that tick.
SCHEDULE_SLACK_MINUTES = 5
# While the same error repeats, it reaches the Error Log at most this often.
RELOG_AFTER_HOURS = 24
ERROR_TEXT_LIMIT = 1000


def backoff_minutes(failures: int) -> int:
	"""Minutes the scheduled pull waits after ``failures`` failed pulls in a row."""
	if failures < 1:
		return 0
	return min(BACKOFF_FIRST_MINUTES * 2 ** min(failures - 1, 16), BACKOFF_MAX_MINUTES)


def _failure_text(exc: BaseException) -> str:
	"""The text a failed fetch leaves on the source and in the Error Log.

	frappe messages from git_repo already carry git's redacted stderr. Other
	exceptions keep their class and message, except a timeout, whose message
	would repeat the git argv (and with it the per-command auth header)."""
	if isinstance(exc, subprocess.TimeoutExpired):
		text = f"git timed out after {exc.timeout} s"
	elif isinstance(exc, frappe.ValidationError):
		text = str(exc)
	else:
		text = f"{type(exc).__name__}: {exc}"
	return _redact(text)[:ERROR_TEXT_LIMIT]


def _error_key(error: str | None) -> str:
	"""The part of an error that says what failed. git's network errors carry
	a timing ("after 133042 ms") and tracebacks carry line numbers, so digit
	runs do not count as a change."""
	return re.sub(r"\d+", "N", error or "")


def _should_log(source, error: str) -> bool:
	"""One Error Log when a failure streak starts or its error text changes,
	then at most one every RELOG_AFTER_HOURS while it repeats."""
	if not cint(source.consecutive_failures) or _error_key(source.last_error) != _error_key(error):
		return True
	last_logged = frappe.db.get_value(
		"Error Log",
		{"reference_doctype": "Wiki Pull Source", "reference_name": source.name},
		"creation",
		order_by="creation desc",
	)
	return not last_logged or get_datetime(last_logged) <= add_to_date(
		now_datetime(), hours=-RELOG_AFTER_HOURS
	)


def _record_failure(source, error: str, title: str = "wiki_press: pull failed") -> dict:
	"""Record a failed pull on the source and push its next scheduled try out.

	Returns instead of raising: a raise into the job runner rolls this record
	back and logs a fresh Error Log on every run."""
	failures = cint(source.consecutive_failures) + 1
	next_attempt = add_to_date(now_datetime(), minutes=backoff_minutes(failures))
	if _should_log(source, error):
		frappe.log_error(
			title=title,
			message=(
				f"Wiki Pull Source {source.name} ({_redact(source.remote_url)}, "
				f"branch {source.branch or 'main'}): {error}\n\n"
				f"Failed pulls in a row: {failures}. The scheduled pull tries again after "
				f"{next_attempt}; «Sincronizar ahora» on the source tries at once. While the "
				f"error stays the same it is logged at most once every {RELOG_AFTER_HOURS} h."
			),
			reference_doctype="Wiki Pull Source",
			reference_name=source.name,
		)
	source.db_set(
		{
			"last_status": "Error",
			"last_error": error,
			"consecutive_failures": failures,
			"next_attempt_after": next_attempt,
		}
	)
	return {"failures": failures, "next_attempt_after": next_attempt}


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

	# A remote that cannot be fetched (moved, deleted, or out of this cell's
	# reach) is a recorded failure with a backoff, not an exception.
	try:
		clone = ensure_work_clone(source.remote_url, source.branch or "main", f"pull-{source.name}")
	except Exception as exc:
		error = _failure_text(exc)
		return {"synced": False, "reason": "fetch-failed", "detail": error, **_record_failure(source, error)}

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
		_record_failure(source, msg, title="wiki_press: pull wipe guard")
		return {"synced": False, "reason": "wipe-guard", "detail": msg}

	try:
		_ensure_space_sync_fields(source)
		with _local_transport(clone) as git_sync:
			git_sync.sync_space(source.space, trigger="Manual")
	except Exception:
		# Raised outside upstream's own try (space config, transport contract):
		# recorded and backed off like a failed fetch.
		error = _redact(frappe.get_traceback(with_context=False))[-ERROR_TEXT_LIMIT:]
		failure = _record_failure(source, error, title="wiki_press: pull sync failed")
		return {"synced": False, "reason": "sync-failed", "detail": error, **failure}

	# upstream sync_space catches its own errors: it logs them, sets the space's
	# last_sync_status «Error» and returns. Only «Success» (also written for an
	# unchanged head) is a full pull.
	status, sync_error = frappe.db.get_value(
		"Wiki Space", source.space, ["last_sync_status", "last_sync_error"]
	)
	if status != "Success":
		error = _redact(sync_error or f"space sync ended with status {status or '(none)'}")
		error = error[-ERROR_TEXT_LIMIT:]
		failure = _record_failure(source, error, title="wiki_press: pull sync failed")
		return {"synced": False, "reason": "sync-failed", "space_status": status, "detail": error, **failure}

	source.db_set(
		{
			"last_synced_sha": sha,
			"last_synced_on": frappe.utils.now(),
			"last_status": "Success",
			"last_error": "",
			"consecutive_failures": 0,
			"next_attempt_after": None,
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
	"""Scheduler entry: pull every enabled source that is due, isolated per
	source. A source that failed waits until its next_attempt_after."""
	due_by = add_to_date(now_datetime(), minutes=SCHEDULE_SLACK_MINUTES)
	for row in frappe.get_all(
		"Wiki Pull Source", filters={"enabled": 1}, fields=["name", "next_attempt_after"]
	):
		if row.next_attempt_after and get_datetime(row.next_attempt_after) > due_by:
			continue
		frappe.enqueue(
			"wiki_press.git_pull.pull_source",
			source_name=row.name,
			queue="long",
			timeout=600,
			job_id=f"wiki_press:pull:{row.name}",
			deduplicate=True,
		)
