"""WeasyPrint rendering with a hardened fetcher and book-grade paged CSS.

CSS notes (paid for in blood during P0):
- ``target-counter(attr(href url), page)`` — the ``url`` type token is
  REQUIRED; without it TOC page numbers silently disappear.
- The cover uses a named page (``@page cover``) and an explicit
  ``page-break-after`` so it owns its sheet.
"""

import frappe

FOOTER_STRINGS = {
	"es": {"page": "Página", "of": "de"},
	"en": {"page": "Page", "of": "of"},
}

BOOK_CSS = """
@page {{
  size: {paper_size};
  margin: 22mm 18mm;
  @top-center {{ content: string(chapter); font-size: 8pt; color: #666; }}
  @bottom-right {{ content: "{page_word} " counter(page) " {of_word} " counter(pages); font-size: 8pt; color: #666; }}
}}
@page cover {{ margin: 0; @top-center {{ content: none }} @bottom-right {{ content: none }} }}

body {{ font-family: 'DejaVu Sans', sans-serif; font-size: 10pt; line-height: 1.5; color: #1a1a1a; hyphens: auto; }}
p, li {{ orphans: 3; widows: 3; }}
h1, h2, h3, h4 {{ page-break-after: avoid; }}

.cover {{ page: cover; page-break-after: always; padding-top: 38vh; text-align: center; }}
.cover-title {{ font-size: 28pt; margin: 0 0 8pt 0; }}
.cover-subtitle {{ font-size: 13pt; color: #555; margin: 0 0 4pt 0; }}
.cover-version, .cover-date {{ font-size: 10pt; color: #777; margin: 2pt 0; }}
.cover-image {{ max-width: 45mm; max-height: 45mm; margin-bottom: 12pt; }}

.toc {{ page-break-after: always; }}
.toc ul {{ list-style: none; padding: 0; }}
.toc a {{ text-decoration: none; color: #1a1a1a; }}
.toc a::after {{ content: leader(".") target-counter(attr(href url), page); }}
.toc .toc-depth-1 {{ font-weight: 600; margin-top: 6pt; }}
.toc .toc-depth-2 {{ margin-left: 12pt; }}
.toc .toc-depth-3 {{ margin-left: 24pt; }}

h1.chapter {{ string-set: chapter content(); page-break-before: always; font-size: 20pt; border-bottom: 1pt solid #ddd; padding-bottom: 4pt; }}
h1 {{ font-size: 18pt; }} h2 {{ font-size: 14pt; }} h3 {{ font-size: 12pt; }}
h4, h5, h6 {{ font-size: 10.5pt; }}

pre, table, img, .codehilite, .mermaid-print {{ page-break-inside: avoid; }}
pre {{ background: #f6f6f6; border: 0.5pt solid #ddd; border-radius: 3pt; padding: 6pt; font-size: 8.5pt; white-space: pre-wrap; word-wrap: break-word; }}
code {{ font-family: 'DejaVu Sans Mono', monospace; font-size: 8.5pt; }}

table {{ border-collapse: collapse; width: 100%; margin: 6pt 0; }}
th, td {{ border: 0.5pt solid #ccc; padding: 4pt 6pt; text-align: left; font-size: 9pt; }}
th {{ background: #f2f2f2; }}

img {{ max-width: 100%; }}

aside.callout {{ border: 0.5pt solid #d0d7de; border-left: 3pt solid #6b7280; border-radius: 3pt; padding: 6pt 8pt; margin: 8pt 0; background: #f8f9fa; }}
aside.callout .callout-icon {{ display: none; }}
aside.callout .callout-title {{ font-weight: 600; display: block; margin-bottom: 2pt; }}
aside.callout-caution {{ border-left-color: #d97706; background: #fff8eb; }}
aside.callout-danger {{ border-left-color: #dc2626; background: #fef2f2; }}
aside.callout-info, aside.callout-note {{ border-left-color: #2563eb; background: #eff6ff; }}
aside.callout-tip, aside.callout-success {{ border-left-color: #16a34a; background: #f0fdf4; }}

.mermaid-print {{ border: 0.5pt dashed #bbb; padding: 6pt; }}
.mermaid-note {{ font-size: 8pt; color: #777; margin: 0 0 4pt 0; }}

.wiki-pdf-embed {{ border: 0.5pt dashed #bbb; padding: 6pt; font-size: 9pt; }}
"""


def build_css(book) -> str:
	strings = FOOTER_STRINGS.get(book.language or "es", FOOTER_STRINGS["es"])
	css = BOOK_CSS.format(
		paper_size=book.paper_size or "Letter",
		page_word=strings["page"],
		of_word=strings["of"],
	)
	if book.custom_css:
		css += "\n" + book.custom_css
	return css


def _hardened_url_fetcher(url: str):
	"""Allow data: URIs and file:// paths under the site/assets roots. Deny
	every network scheme — all legitimate references were rewritten to
	file:// by the builder, so anything else is a bug or an injection."""
	from weasyprint import default_url_fetcher

	from wiki_press.builder.html_builder import resolve_local_file

	if url.startswith("data:"):
		return default_url_fetcher(url)
	if url.startswith("file://"):
		import os
		import urllib.parse

		path = urllib.parse.unquote(url[len("file://") :])
		site_rel = _to_site_relative(path)
		if site_rel and resolve_local_file(site_rel) == os.path.realpath(path):
			return default_url_fetcher(url)
	raise ValueError(f"wiki_press: blocked external resource in book render: {url[:120]}")


def _to_site_relative(path: str) -> str | None:
	import os

	real = os.path.realpath(path)
	pub = os.path.realpath(frappe.get_site_path("public"))
	priv = os.path.realpath(frappe.get_site_path("private"))
	bench_root = os.path.realpath(os.path.join(frappe.get_site_path(), "..", ".."))
	assets = os.path.realpath(os.path.join(bench_root, "sites", "assets"))
	if real.startswith(pub + os.sep):
		return real[len(pub) :]
	if real.startswith(priv + os.sep):
		return "/private" + real[len(priv) :]
	if real.startswith(assets + os.sep):
		return "/assets" + real[len(assets) :]
	return None


def render_book_pdf(body_html: str, book) -> bytes:
	from weasyprint import CSS, HTML

	lang = book.language or "es"
	document = (
		f'<!DOCTYPE html><html lang="{lang}"><head><meta charset="utf-8">'
		f"<title>{frappe.utils.escape_html(book.title)}</title></head>"
		f"<body>{body_html}</body></html>"
	)
	html = HTML(string=document, url_fetcher=_hardened_url_fetcher, base_url=None)
	return html.write_pdf(stylesheets=[CSS(string=build_css(book))])
