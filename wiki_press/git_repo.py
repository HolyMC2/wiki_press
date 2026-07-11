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

# git config that neuters the shell-bearing transports (ext::, and any
# non-user protocol) regardless of what slips through validation. Prepended
# to every git invocation.
_SAFE_GIT_CONFIG = [
	"-c", "protocol.ext.allow=never",
	"-c", "protocol.allow=user",
	"-c", "core.fsmonitor=false",
]

_ALLOWED_URL_RE = re.compile(r"^(https://|ssh://|git@|file:///)")


def validate_remote_url(url: str) -> None:
	"""Reject remote URLs that could smuggle a shell (ext::), credentials in
	the netloc, an option (leading '-'), or an unvetted scheme."""
	url = (url or "").strip()
	if not url:
		frappe.throw("Remote URL is required")
	if url.startswith("-") or "::" in url:
		frappe.throw("Remote URL must not start with '-' or contain '::'")
	if not _ALLOWED_URL_RE.match(url):
		frappe.throw("Remote URL must use https://, ssh://, git@ or file:/// (no other transports)")
	# Only https carries a token risk (user:pass@host). ssh://git@host and
	# git@host:path use '@' for a username, which is normal and safe.
	if url.startswith("https://"):
		netloc = url.split("//", 1)[-1].split("/", 1)[0]
		if "@" in netloc:
			frappe.throw(
				"Do not embed credentials in the remote URL. "
				"Set wiki_press_git_token in site_config instead."
			)


def validate_ref(ref: str, label: str = "Branch") -> None:
	"""Reject a branch/ref that git could parse as an option."""
	ref = (ref or "").strip()
	if not ref:
		return
	if ref.startswith("-") or ref.startswith("+") or ".." in ref or any(c in ref for c in " \t~^:?*[\\"):
		frappe.throw(f"{label} contains characters not allowed in a git ref")


def validate_subdir(subdir: str) -> None:
	"""Reject a docs_subdir that escapes the clone root."""
	subdir = (subdir or "").strip()
	if not subdir:
		return
	if subdir.startswith("/") or ".." in subdir.split("/"):
		frappe.throw("Docs Subdirectory must be a relative path without '..'")


def _cache_root() -> str:
	path = frappe.get_site_path("private", "wiki_press", "git")
	os.makedirs(path, exist_ok=True)
	return path


def _auth_args(remote_url: str) -> list[str]:
	"""Per-command auth for https remotes: an Authorization header passed via
	`-c http.extraHeader`, so the token never lands in .git/config or argv of
	a URL. Empty for ssh/file:// remotes (they carry their own auth or none)."""
	token = frappe.conf.get("wiki_press_git_token")
	if token and remote_url.startswith("https://"):
		import base64

		basic = base64.b64encode(f"x-access-token:{token}".encode()).decode()
		return ["-c", f"http.extraHeader=Authorization: Basic {basic}"]
	return []


def _redact(text: str) -> str:
	return re.sub(r"://[^/@\s]+@", "://***@", text or "")


def _run(args: list[str], cwd: str | None = None) -> subprocess.CompletedProcess:
	return subprocess.run(
		["git", *_SAFE_GIT_CONFIG, *args],
		cwd=cwd,
		capture_output=True,
		text=True,
		timeout=300,
		env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
	)


def run_git(args: list[str], cwd: str | None = None) -> str:
	result = _run(args, cwd=cwd)
	if result.returncode != 0:
		frappe.throw(f"git {args[0]} failed: {_redact(result.stderr.strip())[:500]}")
	return result.stdout


def ensure_work_clone(remote_url: str, branch: str, cache_key: str) -> str:
	"""Clone (or fetch+reset) a working copy of ``branch``. Returns its path.

	An empty remote (no branch yet) yields an initialized clone on a fresh
	local branch, so the first publish can create the branch.
	"""
	# Key the cache by remote too: doc names can repeat (test rollbacks rewind
	# naming series; retargeted docs keep their name) and a stale clone for a
	# different remote silently yields "nothing to commit".
	import hashlib

	validate_remote_url(remote_url)
	validate_ref(branch)

	remote_key = hashlib.sha1(remote_url.encode()).hexdigest()[:10]
	path = os.path.join(_cache_root(), f"{frappe.scrub(cache_key)}-{remote_key}")
	# Store the RAW url — never bake the token into .git/config (it would sit
	# there in plaintext forever). Auth is injected per-command via _auth_args.
	if not os.path.isdir(os.path.join(path, ".git")):
		os.makedirs(path, exist_ok=True)
		run_git(["init", "-q", "-b", branch], cwd=path)
		run_git(["remote", "add", "origin", "--", remote_url], cwd=path)
	else:
		run_git(["remote", "set-url", "origin", "--", remote_url], cwd=path)
	fetch = _run([*_auth_args(remote_url), "fetch", "-q", "origin", "--", branch], cwd=path)
	if fetch.returncode == 0:
		run_git(["checkout", "-q", "-B", branch, f"refs/remotes/origin/{branch}"], cwd=path)
	else:
		# A missing ref means the branch/remote is genuinely empty (fine — the
		# first publish creates it). Any OTHER fetch error (network, auth,
		# transport) must raise: silently keeping a stale checkout and
		# reporting success would sync wrong/old content.
		stderr = _redact(fetch.stderr or "")
		ref_absent = "couldn't find remote ref" in stderr or "Repository is empty" in stderr
		if not ref_absent and stderr.strip():
			frappe.throw(f"git fetch failed: {stderr[:500]}")
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
		["git", *_SAFE_GIT_CONFIG, "cat-file", "blob", sha],
		cwd=clone_path,
		capture_output=True,
		timeout=300,
	)
	if result.returncode != 0:
		frappe.throw(f"git cat-file failed for {sha}")
	return result.stdout


def commit_and_push(clone_path: str, branch: str, remote_url: str, message: str) -> str | None:
	"""Commit staged+unstaged changes and push. Returns the new sha, or None
	when there was nothing to commit. Raises on a rejected (non-fast-forward)
	push so the caller does not record a phantom last_pushed_sha."""
	validate_ref(branch)
	run_git(["add", "-A"], cwd=clone_path)
	status = run_git(["status", "--porcelain"], cwd=clone_path)
	if not status.strip():
		return None
	run_git(
		[
			"-c", f"user.name={GIT_AUTHOR[0]}",
			"-c", f"user.email={GIT_AUTHOR[1]}",
			"commit", "-q", "-m", message,
		],
		cwd=clone_path,
	)
	push = _run([*_auth_args(remote_url), "push", "-q", "origin", branch], cwd=clone_path)
	if push.returncode != 0:
		frappe.throw(f"git push failed: {_redact(push.stderr.strip())[:500]}")
	return head_sha(clone_path)
