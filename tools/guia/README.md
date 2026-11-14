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
site is swapped for «Tu empresa» / «Tu tienda». The swap happens first in
the data: the capture context routes every `/api/` JSON answer of the site
through `lib/rewrite.mjs` (tested), so the app draws the demo word from its
first paint (the labels service's `bootstrap` carries the shop in
`message.design.shop`, its `preview` in the label HTML of `message.html`).
An init script in every frame then swaps whatever still reaches the screen,
label previews in srcdoc frames included. Fixture reads go through
`context.request`, which routes skip, so fixtures still see the real names.
Phone numbers and IMEIs keep only their last four digits (the walk.mjs mask).

A fixture also picks the search the steps use (`data.query`) so that it only
finds clean demo rows: `catalogo-con-precio` takes the shortest start of the
product's name whose matches all have a price and a tidy name (no «Sin
precio», no price in the name, no doubled spaces, all caps or stuck keys), and
the guide filters the product list with it (`route` may be a function of the
data). Prefer that over seeding data; if a site has nothing clean, seed one
named demo product on a lab site only, never on prod.

Photos cannot be renamed: a product photo with a store's logo, a shelf
sticker, a person or a name is a defect no mask fixes. The Productos list
searches looser than the Item name filter (word stems, the item group), so
`catalogo-con-precio` also picks `data.listQuery` for it: the item's whole
name, else its code, whose rows in the page's own read
(`doco.workspaces.products.queue`) are at most four, include the item, and
show no photo or only photos on `PHOTOS_CHECKED` (tested). A code goes on
`PHOTOS_CHECKED` only after someone opened its thumbnail and looked at it.
On doco-mirror «Funda Brillos Universal» lists one row, the item, with the
app's initials placeholder; «Funda Brillos» listed twelve, seven with
photos, two of them branded.

### Capture rules

- **No counts, no notices.** `lib/capture.css` is loaded into every frame of
  `shoot` and `video` before the app paints, and never ships with the app. It
  hides what belongs to the capture account or the lab and not to the screen
  the guide shows: the Avisos bell's red count, red count pills in the shell's
  header, rail and bottom bar, and the Mi cuenta notice. A badge or banner in a
  guide is a defect; hide it here rather than writing to the lab. An app can
  mark its own capture-noise with `data-guia-hide`.
- **Same screen in stills and video.** Both use the format's one viewport and
  device scale; the video scales it into the canvas. Every step ends the same
  way in both (`runStep`): its `ready` selector, no request in flight for
  700 ms, none of the guide's `busy` texts on screen («Buscando», «Dibujando
  las etiquetas»), then `ready` again. The video's first screen settles the
  same way before recording starts.
- **The finger lands where the step acts.** A tap waits until the control
  stops moving (restored scrolls, rows scrolling themselves into view), puts
  the dot there and presses at that exact point, so the ripple is on the
  control.
- **A tap's ring goes with its control.** The video's ripple lasts at most
  350 ms (`RING_MS`) and is watched every frame: it ends at once when the
  tapped control leaves the page, moves, fades out or is no longer under the
  finger (`ringEnds`, tested), and the finger's dot goes with it. A tap
  returns only when neither shows, so no ring is on screen when the next
  caption starts.
- **Numbers clear everything.** Each mark's number sits outside its loop: the
  `nAt` side first, then the other corners, the sides, and above or below its
  ends. It takes the first place on screen that touches no other loop, ripple
  or number and no word, icon, card border or bar edge on the page, with
  at least 4 px of air (`lib/bubbles.mjs`, tested). A number never sits nearer another control (a search field, a button)
  than its own loop.
- **A tap plays under its own caption.** The tap a step's text asks for
  («toca Etiquetas», «tócalo») goes in the step's `after`: it runs after the
  shot, and in the video after the marks and before the next caption starts.
  The step ends as soon as `after` sees its result (the new page's field, the
  picked row), so the next caption takes over with the screen it describes.
- **Scrolls are small and steady.** `w.reveal(targets)` and every tap scroll
  only as far as it takes to show the targets whole between the sticky
  header and the bottom bar, without leaving a control cut by either
  (`lib/scroll.mjs`, tested). When the targets already show whole between
  the bars (within 4 px) the page does not move at all; the video glides there at one pace, inside the
  step's action, before it settles.

## A guide

`guides/<area>/<slug>.guide.mjs`, default export:

```js
export default {
  question: '¿Cómo imprimo las etiquetas con precio y código?',
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

- `text`, `caption`, `route`, `ready`, `busy`, `marks` may be functions of the
  fixture data. `busy` (guide or step): texts no shot or step end may show.
- The walker `w` has `goto`, `wait`, `tap`, `tapText`, `type`, `press`, `show`,
  `settle`, `locator`, `byText`; `shoot` and `video` run the same steps (the
  video shows the finger and types slowly). `type` puts the first letter in
  with the focus, so no frame shows a focused empty field (a search's recent
  list). `settle({ ready, frame, busy })` waits until a screen has finished
  drawing (an iframe loaded, no busy text, nothing in flight): an `after`
  whose result keeps drawing ends with it, so the next caption never opens
  on a loading screen.
- Marks: `{ ring, n, shape: 'oval'|'box', pad, nAt: 'tl'|'tr'|'br'|'bl'|'l'|'r'|'t'|'b' }`
  (`nAt` is the side the number tries first),
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
states, real names) and write what you saw at the end of `DEFECTS.md`. Each
run writes its own note under «Revisión a ojo» (when, how many shots, a box
per shot) and keeps what a person wrote there before. A
screen that fails is an app defect to fix, not something to crop around.

## Publishing (not automated here)

`build` output is what a wiki release kit loads (the posawesome promociones
manifest shape plus `area`, `route`, `video`). Pending pieces of the plan's
pipeline: `guia steps` (measured taps), `guia kit` (parameterized prod kit),
the bot corpus entry and the Shop Manual template, and `SPA Route` help rows,
which wait for the Wiki Help Mapping type (WP-1).
