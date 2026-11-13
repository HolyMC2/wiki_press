# guia: «¿Cómo hago…?» guides from one source

One guide source gives the marked shots, a critique, the wiki page with its
manifest, help-mapping rows, the bot playbook stub, and a whole-phone video.
It follows the guide standard in the guías program (PLAN §2.1–2.5) and absorbs
three earlier stacks: the selector marks and phone frame from scanner_kit
`frontend/manual/kit`, the badge renderer and manifest from posawesome
`docs/manual/promociones/build.py`, and the screencast recording from
muelle-studio `scripts/lib/walk.mjs`.

Shots and videos come from a real lab site, walked as the lab playwright-bot
user. The pixel boxes of `shots.py` are gone: marks are placed by selector, so
a reshoot after a UI change is the same command.

## Commands

From the wiki_press root, on the workstation (Playwright comes from
`PLAYWRIGHT`, this tree, or the crm checkout):

```sh
node tools/guia/guia.mjs list
node tools/guia/guia.mjs check    inventario/imprimir-etiquetas
heavy -- node tools/guia/guia.mjs shoot    inventario/imprimir-etiquetas --site doco-mirror
heavy -- node tools/guia/guia.mjs video    inventario/imprimir-etiquetas --site doco-mirror
heavy -- node tools/guia/guia.mjs critique inventario/imprimir-etiquetas
node tools/guia/guia.mjs build    inventario/imprimir-etiquetas
heavy -- node tools/guia/guia.mjs all      inventario/imprimir-etiquetas --site doco-mirror
node --test 'tools/guia/test/*.test.mjs'
```

| Command | Writes (under `<out>/<area>/<slug>/`) |
|---|---|
| `shoot` | `shots/<area>-<slug>-NN.png` (whole screen, framed in a phone for phone guides), `raw/` (unframed), `shots.json` (texts, captions, probes, defects) |
| `video` | `video/<area>-<slug>.mp4` (1080×1920, H.264 High, yuv420p, faststart, silent, ≤16 MB), `video/<area>-<slug>-video.png` (poster), `video/cuadros/` (last frame of each step), `video/timeline.json` |
| `critique` | `critique/contact-sheet.png` (every shot and video step with its findings), `critique/DEFECTS.md`; exits 1 when something blocks publishing |
| `build` | `build/<slug>.md` (wiki page), the images, video and poster, `manifest.json`, `help-mapping.json`, `help-mapping-pendiente.json` (types the DocType does not accept yet), `playbook/<slug>.md` |

Options: `--site <first DNS label of a lab site>` (default: the site of the bot
secret), `--out <dir>` (default `$GUIA_OUT` or `<repo>/.scratch/guia`, which
git ignores), `--guides <dir>`, `--fixtures <dir>`. Guides may live in the repo
that owns the screen (`docs/manual/<area>/`) and be pointed at with `--guides`.

### Login and sites

The bot credentials are read inside Node from `~/.secrets/lab-bot.env`
(`CRM_BASE_URL`, `CRM_TEST_USER`, `CRM_TEST_PASSWORD`; kept by
`muelle/scripts/ensure-lab-bot.sh <site>`). They never go through argv, the
shell or the output. Login is a POST to `/api/method/login`, not a one-time
link: those are limited to a few per hour and burn out on repeated walks.
`mumu-mirror`, `demo` and `clinica` are refused.

### Demo data

A guide names a fixture (`fixtures/<name>.mjs`). Fixtures only read the site
(GET with the bot's session) and return the data the steps use (which product
to search) plus `rename` pairs: every company and Mercado shop name on the
site is swapped for «Tu empresa» / «Tu tienda» on screen, label previews in
srcdoc frames included, before each shot and every 200 ms while recording.
Phone numbers and IMEIs keep only their last four digits (the walk.mjs mask).

## A guide

`guides/<area>/<slug>.guide.mjs`, default export:

```js
export default {
  question: '¿Cómo imprimo las etiquetas con precio y código de barras?',
  quien: ['cajero', 'encargado'],
  place: 'productos.etiquetas',          // place key (doco manual/places.py)
  donde: 'Productos › Etiquetas',        // as the menu reads
  format: 'phone',                       // phone 412 px · desktop 1280 · desktop-wide 1440
  fixture: 'catalogo-con-precio',
  fixtureArgs: { buscar: 'Funda' },
  resumen: ['…', '…', '…'],              // «En pocas palabras», ≤ 3 lines
  steps: [{                              // ≤ 8; one action each
    text: '[[1]] En **Productos**, toca **Etiquetas**.',
    caption: 'En Productos, toca «Etiquetas»',   // video caption
    route: '/crm/productos',             // and/or action: async (w, data) => …
    ready: 'a[href="/crm/productos/etiquetas"]',
    marks: [{ ring: 'a[href="/crm/productos/etiquetas"]', n: 1, shape: 'box' }],
  }],
  ysi: [['¿Y si …?', '…']],
  asistente: '¿…?',
  help: [{ context_type: 'DocType', context_key: '…' }, { context_type: 'SPA Route', context_key: '/crm/…' }],
}
```

- `text`, `caption`, `ready`, `marks` may be functions of the fixture data.
- The walker `w` has `goto`, `wait`, `tap`, `tapText`, `type`, `press`, `show`,
  `locator`, `byText`; `shoot` and `video` run the same steps (the video shows
  the finger and types slowly).
- Marks: `{ ring, n, shape: 'oval'|'box', pad, nAt: 'tl'|'tr'|'l' }`,
  `{ tap }`, `{ note: 'Toca aquí', to }`, `{ spot: [...] }`. A target is a
  Playwright selector (first visible match) or a list (one loop around all).
  Every `[[n]]` in the text needs a mark `n`; `shoot` reports the ones missing.
- `check` refuses Desk routes (`/app`), more than 8 steps, ERPNext document
  names in the text and unknown mark keys.

## What the critique probes

On every shot, before the marks: floating toasts and alerts, English words,
text cut with an ellipsis or a line clamp, page overflow, broken images,
loading skeletons, a Desk route, console errors. It does not see design: look
at every frame of the contact sheet (old looks, placeholder icons, empty
states, real names) and write what you saw at the end of `DEFECTS.md`. A
screen that fails is an app defect to fix, not something to crop around.

## Publishing (not automated here)

`build` output is what a wiki release kit loads (the posawesome promociones
manifest shape plus `area`, `route`, `video`). Pending pieces of the plan's
pipeline: `guia steps` (measured taps), `guia kit` (parameterized prod kit),
the bot corpus entry and the Shop Manual template, and `SPA Route` help rows,
which wait for the Wiki Help Mapping type (WP-1).
