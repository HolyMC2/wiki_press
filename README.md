# Wiki Press

Companion app for [Frappe Wiki](https://github.com/frappe/wiki) v3. Adds what a
product manual needs on top of the upstream wiki, with **zero core edits**:

| Module | Status | What it does |
|---|---|---|
| Book PDF exporter | planned (P2) | Compile a whole Wiki Space (or subtree) into a book-style PDF — cover, TOC with page numbers, running headers, PDF outline — via a single WeasyPrint pass |
| Git publish | planned (P3) | Push merged wiki content to a git repo in the exact layout upstream's one-way GitHub sync consumes (the missing "push" half) |
| Tenant pull scheduler | planned (P3) | Cron-driven pull for `git_synced` spaces (upstream only has webhook/manual triggers) |
| Canonical SEO | planned (P3) | `rel=canonical` on synced-space pages pointing at the master docs domain |
| Contextual help | planned (P5) | Map DocTypes / POS screens / storefront pages to manual routes |

## Design rules

- Vertical-neutral: no shop- or vertical-specific logic; everything configurable per space via doctypes.
- Layered: thin `api.py`; heavy lifting in `builder/`, `pdf/`, `git_publish/`, `queries.py`.
- Upstream-friendly: anything generally useful is shaped as a frappe/wiki PR candidate.

## Requirements

- Frappe ≥ 16, frappe/wiki v3 (tested against v3.0.0-rc.5)
- WeasyPrint (pip; pango/cairo/gdk-pixbuf system libs)

## License

MIT
