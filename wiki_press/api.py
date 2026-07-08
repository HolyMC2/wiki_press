"""Public API surface of wiki_press.

Thin layer only: permission checks + dispatch. Implementation lives in the
feature packages (builder/, pdf/, git_publish/) as they land.

Planned endpoints (spec §7):
- build_book(book)      P2 — enqueue a book PDF build, returns {"task_id"}
- download_book(book)   P2 — serve the last built PDF, mirrors space access
- get_help_url(...)     P5 — contextual help lookup
"""
