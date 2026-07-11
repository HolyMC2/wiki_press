# Wiki Press

Companion app for [Frappe Wiki](https://github.com/frappe/wiki) v3. Adds what a
product manual needs on top of the upstream wiki, with **zero core edits**:

| Module | Status | What it does |
|---|---|---|
| Book PDF exporter | ✅ | Compile a Wiki Space (or subtree) into a book-style PDF — cover, TOC with real page numbers, running headers, PDF outline — one WeasyPrint pass |
| Git publish | ✅ | Push merged wiki content to a git repo in exactly the layout upstream's one-way sync imports back |
| Git pull (local transport) | ✅ | Drive upstream's sync engine from a plain git clone — any remote, no GitHub App, content read-only on the target |
| Canonical SEO | ✅ | Point synced tenant copies' `rel=canonical` at the master docs domain |
| Contextual help | ✅ | Map DocTypes / POS screens / storefront pages to manual routes; «Manual» entry in the Desk Help menu |

## How it fits together

```
master site (editable, CR review)
   └─ Wiki Publish Target ──merge──▶ hub git repo (bare, bench-local or remote)
                                        │
tenant sites (read-only copies) ◀──cron─┘   Wiki Pull Source per space
```

## Usage

**Book PDF** — create a *Wiki Book* (space, language, paper size, cover), press
**Generar PDF** on the form (or `wiki_press.api.build_book`). Download mirrors
the space's read access: public space → public file + guest endpoint; restricted
space → private file served only through `api.download_book`. Books rebuild
automatically on Change Request merge (`auto_rebuild_on_merge`), deduplicated,
hash-gated. Failures land in *Last Build Error* on the form.

**Distribution** — on the master, create a *Wiki Publish Target* (space, remote
URL, branch, subdir). On each tenant, create the space (roles included) and a
*Wiki Pull Source* pointing at the same repo/subdir; the `*/30` cron pulls, or
call `wiki_press.git_pull.pull_source`. A space cannot be both target and source.

**Credentials** — never in doctypes. https remotes read
`wiki_press_git_token` from site_config; `file://` and ssh remotes need none.

**site_config keys**

| Key | Where | Effect |
|---|---|---|
| `wiki_press_git_token` | master/tenants using https remotes | injected per-command into git URLs |
| `wiki_canonical_base` | tenant sites only | canonical URL base for synced wiki pages (needs backend restart) |
| `wiki_help_base_url` | sites without a local manual | absolute base for contextual-help links |

**Contextual help** — *Wiki Help Mapping* rows map a context (`DocType` /
`Desk Page` / `POS Screen` / `Storefront Page` + key, `*` = fallback per type)
to a manual route. `wiki_press.api.get_help_url(context_type, context_key)`
resolves; the bundled Desk script adds a «Manual» Help-menu entry. Default
es-MX mappings ship as fixtures.

## Design rules

- Vertical-neutral: no shop-specific logic; everything is doctype data.
- Layered: thin `api.py`; work in `builder/`, `pdf/`, `git_publish`, `git_pull`, `queries.py`.
- Library code never commits — job wrappers and the request lifecycle do.
- Upstream-friendly: generally useful pieces are frappe/wiki PR candidates
  (git push-back, book PDF).

## Requirements

- Frappe ≥ 16, frappe/wiki v3 ≥ develop@3dd6507 (needs the git-sync engine; rc.5 is too old)
- WeasyPrint ≥ 68 (pip; pango/cairo system libs), pygments
- `git` CLI in the backend/worker image

## License

MIT
