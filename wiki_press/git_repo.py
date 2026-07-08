"""Thin git-CLI plumbing shared by git_publish (push) and git_pull (fetch).

Works with any git remote — file:// paths, plain https, or ssh. Credentials
are never stored in doctypes: an https token comes from site_config
(``wiki_press_git_token``) and is injected into the remote URL only for the
lifetime of a command.
"""

import os
import re
import subprocess

import frappe

GIT_AUTHOR = ("Wiki Press", "wiki-press@noreply.local")


def _cache_root() -> str:
	path = frappe.get_site_path("private", "wiki_press", "git")
	os.makedirs(path, exist_ok=True)
	return path


def _authenticated(remote_url: str) -> str:
	token = frappe.conf.get("wiki_press_git_token")
	if token and remote_url.startswith("https://") and "@" not in remote_url.split("//", 1)[1].split("/", 1)[0]:
		return remote_url.replace("https://", f"https://x-access-token:{token}@", 1)
	return remote_url


def _redact(text: str) -> str:
	return re.sub(r"://[^/@\s]+@", "://***@", text or "")


def run_git(args: list[str], cwd: str | None = None) -> str:
	result = subprocess.run(
		["git", *args],
		cwd=cwd,
		capture_output=True,
		text=True,
		timeout=300,
		env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
	)
	if result.returncode != 0:
		frappe.throw(f"git {args[0]} failed: {_redact(result.stderr.strip())[:500]}")
	return result.stdout


def ensure_work_clone(remote_url: str, branch: str, cache_key: str) -> str:
	"""Clone (or fetch+reset) a working copy of ``branch``. Returns its path.

	An empty remote (no branch yet) yields an initialized clone on a fresh
	local branch, so the first publish can create the branch.
	"""
	path = os.path.join(_cache_root(), frappe.scrub(cache_key))
	url = _authenticated(remote_url)
	if not os.path.isdir(os.path.join(path, ".git")):
		os.makedirs(path, exist_ok=True)
		run_git(["init", "-q", "-b", branch], cwd=path)
		run_git(["remote", "add", "origin", url], cwd=path)
	else:
		run_git(["remote", "set-url", "origin", url], cwd=path)
	fetch = subprocess.run(
		["git", "fetch", "-q", "origin", branch],
		cwd=path,
		capture_output=True,
		text=True,
		timeout=300,
		env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
	)
	if fetch.returncode == 0:
		run_git(["checkout", "-q", "-B", branch, f"origin/{branch}"], cwd=path)
	# fetch failure = empty remote/new branch: keep the fresh local branch
	return path


def head_sha(clone_path: str) -> str | None:
	try:
		return run_git(["rev-parse", "HEAD"], cwd=clone_path).strip()
	except Exception:
		return None  # unborn branch


def ls_blobs(clone_path: str, ref: str = "HEAD") -> list[dict]:
	"""Flat blob listing shaped like the GitHub tree API entries the upstream
	sync engine consumes: [{"path", "sha", "type": "blob"}, ...]."""
	out = run_git(["ls-tree", "-r", "-z", ref], cwd=clone_path)
	entries = []
	for line in out.split("\0"):
		if not line:
			continue
		meta, path = line.split("\t", 1)
		_mode, obj_type, sha = meta.split()
		if obj_type == "blob":
			entries.append({"path": path, "sha": sha, "type": "blob"})
	return entries


def cat_blob(clone_path: str, sha: str) -> bytes:
	result = subprocess.run(
		["git", "cat-file", "blob", sha], cwd=clone_path, capture_output=True, timeout=300
	)
	if result.returncode != 0:
		frappe.throw(f"git cat-file failed for {sha}")
	return result.stdout


def commit_and_push(clone_path: str, branch: str, message: str) -> str | None:
	"""Commit staged+unstaged changes and push. Returns the new sha, or None
	when there was nothing to commit."""
	run_git(["add", "-A"], cwd=clone_path)
	status = run_git(["status", "--porcelain"], cwd=clone_path)
	if not status.strip():
		return None
	run_git(
		[
			"-c",
			f"user.name={GIT_AUTHOR[0]}",
			"-c",
			f"user.email={GIT_AUTHOR[1]}",
			"commit",
			"-q",
			"-m",
			message,
		],
		cwd=clone_path,
	)
	run_git(["push", "-q", "origin", branch], cwd=clone_path)
	return head_sha(clone_path)
