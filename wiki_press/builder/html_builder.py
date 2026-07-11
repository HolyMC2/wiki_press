"""Assemble one combined HTML document for a Wiki Book.

The whole point of the exporter is a SINGLE HTML document rendered in a
SINGLE WeasyPrint pass — that is the only way to get a unified TOC with page
numbers, continuous numbering and one PDF outline. Never concatenate PDFs.

Rendering parity: pages are rendered with the wiki's own markdown renderer
(``wiki.wiki.markdown.render_markdown``) so callouts, tables and embeds look
the same as on the web.
"""

import os
import re
import urllib.parse

import frappe
from wiki.wiki.markdown import render_markdown

from wiki_press.builder.highlight import highlight_code_blocks

STRINGS = {
	"es": {"toc": "Contenido", "built": "Generado el"},
	"en": {"toc": "Contents", "built": "Built on"},
}

HEADING_TAG_RE = re.compile(r"(</?h)([1-6])")
FIRST_HEADING_RE = re.compile(r"<h[1-6][^>]*>(.*?)</h[1-6]>", re.DOTALL)
ID_ATTR_RE = re.compile(r'\bid="([^"]+)"')
HREF_RE = re.compile(r'\bhref="([^"]+)"')
LOCAL_SRC_RE = re.compile(r'\bsrc="((?:/private)?/files/[^"]+|/assets/[^"]+)"')


def _strip_tags(text: str) -> str:
	return re.sub(r"<[^>]+>", "", text).strip()


def _demote_headings(html: str, delta: int) -> str:
	if delta <= 0:
		return html
	return HEADING_TAG_RE.sub(lambda m: f"{m.group(1)}{min(int(m.group(2)) + delta, 6)}", html)


def _drop_duplicate_title_heading(html: str, title: str) -> str:
	m = FIRST_HEADING_RE.search(html)
	if m and _strip_tags(m.group(1)).casefold() == title.strip().casefold():
		return html[: m.start()] + html[m.end() :]
	return html


def _prefix_ids(html: str, prefix: str) -> str:
	return ID_ATTR_RE.sub(lambda m: f'id="{prefix}-{m.group(1)}"', html)


def _rewrite_internal_links(html: str, route_map: dict[str, str]) -> str:
	def replace(m: re.Match) -> str:
		href = m.group(1)
		if href.startswith(("#", "mailto:", "tel:", "data:")):
			return m.group(0)
		path = href.split("#", 1)[0].split("?", 1)[0].strip("/")
		target = route_map.get(path)
		if target:
			return f'href="#doc-{target}"'
		return m.group(0)

	return HREF_RE.sub(replace, html)


def resolve_local_file(url_path: str) -> str | None:
	"""Map a site-relative asset URL to an absolute path, refusing escapes."""
	path = urllib.parse.unquote(url_path.split("?", 1)[0])
	bench_root = os.path.realpath(os.path.join(frappe.get_site_path(), "..", ".."))
	if path.startswith("/private/files/"):
		base = os.path.realpath(frappe.get_site_path("private", "files"))
		full = os.path.realpath(os.path.join(base, path[len("/private/files/") :]))
	elif path.startswith("/files/"):
		base = os.path.realpath(frappe.get_site_path("public", "files"))
		full = os.path.realpath(os.path.join(base, path[len("/files/") :]))
	elif path.startswith("/assets/"):
		base = os.path.realpath(os.path.join(bench_root, "sites", "assets"))
		full = os.path.realpath(os.path.join(base, path[len("/assets/") :]))
	else:
		return None
	if not full.startswith(base + os.sep) or not os.path.isfile(full):
		return None
	return full


def _rewrite_local_images(html: str) -> str:
	def replace(m: re.Match) -> str:
		full = resolve_local_file(m.group(1))
		if not full:
			# Leave unresolvable references out of the PDF instead of failing
			return 'src=""'
		return f'src="file://{full}"'

	return LOCAL_SRC_RE.sub(replace, html)


SRC_RE = re.compile(r'\bsrc="([^"]+)"')


def _rewrite_remote_assets(html: str) -> str:
	"""Central manual-asset URLs (R2 public CDN / role-gated tech ref) are
	downloaded to a temp file and rewritten to file:// so the hardened
	WeasyPrint fetcher (which denies every network scheme) still embeds them.
	Anything that isn't a manual asset is left for _rewrite_local_images."""
	from wiki_press import assets

	cache: dict[str, str] = {}
	state: dict[str, str | None] = {"tmpdir": None}

	def replace(m: re.Match) -> str:
		url = m.group(1)
		if not assets.is_manual_asset_url(url):
			return m.group(0)
		if url in cache:
			return f'src="file://{cache[url]}"'
		data = assets.fetch_asset_bytes(url)
		if not data:
			return 'src=""'
		import hashlib
		import tempfile

		if state["tmpdir"] is None:
			state["tmpdir"] = tempfile.mkdtemp(prefix="wikibook-assets-")
		path = os.path.join(state["tmpdir"], hashlib.sha256(url.encode()).hexdigest()[:32])
		with open(path, "wb") as fh:
			fh.write(data)
		cache[url] = path
		return f'src="file://{path}"'

	return SRC_RE.sub(replace, html)


def _cover_html(book, strings: dict) -> str:
	cover_img = ""
	if book.cover_image:
		full = resolve_local_file(book.cover_image)
		if full:
			cover_img = f'<img class="cover-image" src="file://{full}">'
	subtitle = f'<p class="cover-subtitle">{frappe.utils.escape_html(book.subtitle)}</p>' if book.subtitle else ""
	version = f'<p class="cover-version">{frappe.utils.escape_html(book.version_label)}</p>' if book.version_label else ""
	built = f'<p class="cover-date">{strings["built"]} {frappe.utils.formatdate(frappe.utils.nowdate())}</p>'
	return (
		'<div class="cover"><div class="cover-inner">'
		f"{cover_img}<h1 class=\"cover-title\">{frappe.utils.escape_html(book.title)}</h1>"
		f"{subtitle}{version}{built}</div></div>"
	)


def _toc_html(docs: list[dict], toc_depth: int, strings: dict) -> str:
	items = []
	for doc in docs:
		if doc["depth"] > toc_depth:
			continue
		title = frappe.utils.escape_html(doc["title"])
		items.append(
			f'<li class="toc-depth-{doc["depth"]}">'
			f'<a href="#doc-{doc["name"]}">{title}</a></li>'
		)
	return f'<nav class="toc"><h1>{strings["toc"]}</h1><ul>{"".join(items)}</ul></nav>'


def assemble_book_html(book, docs: list[dict]) -> str:
	"""Build the full book body (cover + TOC + sections) as one HTML string."""
	strings = STRINGS.get(book.language or "es", STRINGS["es"])
	route_map = {(d.get("route") or "").strip("/"): d["name"] for d in docs if d.get("route")}

	sections = []
	for i, doc in enumerate(docs):
		depth = doc["depth"]
		heading_level = min(depth, 5)
		chapter_class = ' class="chapter"' if depth == 1 else ""
		title = frappe.utils.escape_html(doc["title"])

		body = ""
		if not doc["is_group"] and (doc.get("content") or "").strip():
			body = render_markdown(doc["content"])
			body = _drop_duplicate_title_heading(body, doc["title"])
			body = _demote_headings(body, depth)
			body = _prefix_ids(body, f"d{i}")
			body = highlight_code_blocks(body, book.language or "es")

		sections.append(
			f'<section class="book-section" id="doc-{doc["name"]}">'
			f"<h{heading_level}{chapter_class}>{title}</h{heading_level}>{body}</section>"
		)

	html = _cover_html(book, strings)
	if book.include_toc:
		html += _toc_html(docs, book.toc_depth or 3, strings)
	html += "".join(sections)
	html = _rewrite_internal_links(html, route_map)
	html = _rewrite_remote_assets(html)
	html = _rewrite_local_images(html)
	return html
