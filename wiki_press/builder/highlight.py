"""Server-side syntax highlighting for book HTML.

WeasyPrint runs no JavaScript, so the highlight.js classes the wiki uses on
the web do nothing in a PDF. Post-process rendered HTML and replace fenced
code blocks with pygments output (inline styles, print-friendly).
"""

import html as html_lib
import re

CODE_BLOCK_RE = re.compile(
	r'<pre><code class="language-([\w+-]+)">(.*?)</code></pre>', re.DOTALL
)

MERMAID_NOTE = {
	"es": "Diagrama: consulta la versión en línea del manual.",
	"en": "Diagram: see the online version of the manual.",
}


def highlight_code_blocks(html: str, language: str = "es") -> str:
	try:
		from pygments import highlight
		from pygments.formatters import HtmlFormatter
		from pygments.lexers import get_lexer_by_name
	except ImportError:
		return html

	formatter = HtmlFormatter(noclasses=True, nowrap=False)

	def replace(match: re.Match) -> str:
		lang, body = match.group(1), html_lib.unescape(match.group(2))
		if lang == "mermaid":
			note = MERMAID_NOTE.get(language, MERMAID_NOTE["es"])
			return (
				f'<div class="mermaid-print"><p class="mermaid-note">{note}</p>'
				f"<pre><code>{match.group(2)}</code></pre></div>"
			)
		try:
			lexer = get_lexer_by_name(lang)
		except Exception:
			return match.group(0)
		return f'<div class="codehilite">{highlight(body, lexer, formatter)}</div>'

	return CODE_BLOCK_RE.sub(replace, html)
