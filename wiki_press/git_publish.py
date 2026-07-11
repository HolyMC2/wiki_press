"""Export a Wiki Space to a git repo — the push half upstream doesn't have.

Layout matches exactly what upstream ``wiki.wiki.git_sync.build_nodes``
infers back: folders = groups, ``<slug>.md`` leaves with YAML front matter
(title/slug/published/order), folder landing content in ``README.md``, and
images copied to ``assets/`` with repo-relative links (so the importer
re-imports them per site instead of pointing at the master's /files URLs).
"""

import os
import re
import shutil
import urllib.parse

import frappe

from wiki_press.git_repo import commit_and_push, ensure_work_clone
from wiki_press.queries import walk_space_tree

SITE_IMAGE_RE = re.compile(r"(!\[[^\]]*\]\()((?:/private)?/files/[^)\s]+)((?:\s+[^)]*)?\))")


LANDING_SLUGS = {"index", "readme"}


def _front_matter(title: str, slug: str, order: int, published: bool = True) -> str:
	# Serialize with a YAML dumper, not string interpolation — a title with a
	# backslash or quote otherwise produces invalid YAML that upstream's
	# strip_front_matter rejects, dropping metadata and leaking the raw block.
	import yaml

	meta = yaml.safe_dump(
		{"title": title, "slug": slug, "order": order, "published": bool(published)},
		allow_unicode=True,
		default_flow_style=False,
		sort_keys=False,
	)
	return f"---\n{meta}---\n\n"


def _slug_of(doc: dict) -> str:
	route = (doc.get("route") or "").rstrip("/")
	slug = route.rsplit("/", 1)[-1] if route else ""
	slug = slug or frappe.scrub(doc["title"]).replace("_", "-")
	# A page slugged index/readme would collide with the folder-landing
	# basename on re-import (upstream treats README/index as the folder's
	# landing, not a standalone page). Suffix it so it stays a real page.
	if slug in LANDING_SLUGS:
		slug = f"{slug}-page"
	return slug


def _export_images(content: str, assets_dir: str, assets_rel_prefix: str) -> str:
	"""Copy /files images into the repo and rewrite links repo-relative."""
	from wiki_press.builder.html_builder import resolve_local_file

	def replace(match: re.Match) -> str:
		src = match.group(2)
		full = resolve_local_file(src)
		if not full:
			return match.group(0)
		filename = os.path.basename(urllib.parse.unquote(src.split("?", 1)[0]))
		os.makedirs(assets_dir, exist_ok=True)
		shutil.copyfile(full, os.path.join(assets_dir, filename))
		return f"{match.group(1)}{assets_rel_prefix}assets/{filename}{match.group(3)}"

	return SITE_IMAGE_RE.sub(replace, content)


def export_space_to_worktree(space_name: str, root: str, root_document: str | None = None) -> None:
	"""Write the published tree of ``space_name`` under directory ``root``."""
	docs = walk_space_tree(space_name, root_document)

	# Wipe managed content (markdown + assets) so deletes/moves propagate.
	for dirpath, dirnames, filenames in os.walk(root, topdown=True):
		dirnames[:] = [d for d in dirnames if d != ".git"]
		for f in filenames:
			if f.lower().endswith((".md", ".mdx")) or f == ".wiki.json":
				os.remove(os.path.join(dirpath, f))
	assets_root = os.path.join(root, "assets")
	if os.path.isdir(assets_root):
		shutil.rmtree(assets_root)

	# Root landing from the space's root group content
	space = frappe.get_doc("Wiki Space", space_name)
	root_group = frappe.db.get_value(
		"Wiki Document", root_document or space.root_group, ["title", "content"], as_dict=True
	)
	if root_group and (root_group.content or "").strip():
		body = _export_images(root_group.content, assets_root, "")
		with open(os.path.join(root, "README.md"), "w") as f:
			f.write(_front_matter(root_group.title, "index", 0) + body)

	dir_by_docname: dict[str, str] = {}
	order_counter: dict[str, int] = {}
	# Slugs already used within each parent dir, so two siblings that scrub to
	# the same slug don't overwrite each other's file.
	used_slugs: dict[str, set] = {}

	def unique_slug(parent_dir: str, slug: str) -> str:
		taken = used_slugs.setdefault(parent_dir, set())
		candidate, n = slug, 2
		while candidate in taken:
			candidate = f"{slug}-{n}"
			n += 1
		taken.add(candidate)
		return candidate

	for doc in docs:
		parent_dir = dir_by_docname.get(doc.get("parent_wiki_document"), root)
		order = order_counter.get(parent_dir, 0) + 1
		order_counter[parent_dir] = order
		slug = unique_slug(parent_dir, _slug_of(doc))
		# ../ hops from the file's directory back to the repo root (where
		# assets/ lives): a group README sits `depth` levels down, a page file
		# sits inside its parent group = depth-1 levels down.
		group_prefix = "../" * doc["depth"]
		page_prefix = "../" * (doc["depth"] - 1)

		if doc["is_group"]:
			group_dir = os.path.join(parent_dir, slug)
			os.makedirs(group_dir, exist_ok=True)
			dir_by_docname[doc["name"]] = group_dir
			if (doc.get("content") or "").strip():
				body = _export_images(doc["content"], assets_root, group_prefix)
				with open(os.path.join(group_dir, "README.md"), "w") as f:
					f.write(_front_matter(doc["title"], slug, order) + body)
			else:
				# Landing carries the folder's title + order for the importer
				with open(os.path.join(group_dir, "README.md"), "w") as f:
					f.write(_front_matter(doc["title"], slug, order))
		else:
			body = _export_images(doc.get("content") or "", assets_root, page_prefix)
			with open(os.path.join(parent_dir, f"{slug}.md"), "w") as f:
				f.write(_front_matter(doc["title"], slug, order) + body)


def publish_target(target_name: str) -> dict:
	"""Export + commit + push one Wiki Publish Target. Returns push info.
	Records last_status/last_error on the target so a non-console operator can
	see the outcome on the form."""
	target = frappe.get_doc("Wiki Publish Target", target_name)
	if not target.enabled:
		return {"pushed": False, "reason": "disabled"}

	from wiki_press.git_repo import validate_subdir

	try:
		validate_subdir(target.docs_subdir)
		clone = ensure_work_clone(target.remote_url, target.branch or "main", f"publish-{target.name}")
		subdir = (target.docs_subdir or "").strip("/")
		root = os.path.join(clone, subdir) if subdir else clone
		# Defense in depth: the export wipes markdown+assets under `root`; make
		# certain that never escapes the clone even if validation is bypassed.
		if os.path.realpath(root) != os.path.realpath(clone) and not os.path.realpath(root).startswith(
			os.path.realpath(clone) + os.sep
		):
			frappe.throw("Resolved docs_subdir escapes the repository root")
		os.makedirs(root, exist_ok=True)

		export_space_to_worktree(target.space, root)

		space_title = frappe.db.get_value("Wiki Space", target.space, "space_name")
		sha = commit_and_push(
			clone,
			target.branch or "main",
			target.remote_url,
			f"wiki_press: publish {space_title} ({frappe.utils.now()})",
		)
	except Exception:
		err = frappe.get_traceback(with_context=False)[-1000:]
		target.db_set({"last_status": "Error", "last_error": err})
		raise
	updates = {"last_status": "Success" if sha else "No Change", "last_error": ""}
	if sha:
		updates.update({"last_pushed_sha": sha, "last_pushed_on": frappe.utils.now()})
	target.db_set(updates)
	return {"pushed": bool(sha), "sha": sha}


@frappe.whitelist()
def publish_now(target: str) -> dict:
	"""Desk button on Wiki Publish Target: publish synchronously."""
	frappe.has_permission("Wiki Publish Target", "write", throw=True)
	return publish_target(target)


def enqueue_publish(target_name: str) -> None:
	frappe.enqueue(
		"wiki_press.git_publish.publish_target",
		target_name=target_name,
		queue="long",
		timeout=600,
		job_id=f"wiki_press:publish:{target_name}",
		deduplicate=True,
	)


def handle_cr_merge_publish(space_name: str) -> None:
	for name in frappe.get_all(
		"Wiki Publish Target", filters={"space": space_name, "enabled": 1}, pluck="name"
	):
		enqueue_publish(name)
