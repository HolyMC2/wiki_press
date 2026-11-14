/**
 * The actions a guide step runs, shared by `shoot` and `video` so both replay
 * the same walk. In video mode every tap shows the finger dot first and typing
 * is slow enough to read; in shoot mode the same calls run at once.
 */

import { pickScroll, glideMs, measureScroll, glideScroll } from './scroll.mjs'

// Apps keep hidden copies of some controls (phone and desktop bars): act on the visible one.
const seen = (page, target) => (typeof target === 'string' ? page.locator(target) : target).filter({ visible: true }).first()

// Requests that never end on their own (realtime, telemetry) do not count for «quiet».
const LONG_LIVED = /socket\.io|telemetry|\/api\/method\/frappe\.realtime|eventsource/i
const TRACKED = new Set(['document', 'xhr', 'fetch', 'script', 'stylesheet', 'image', 'font'])

/** A box that no longer moves: two reads 80 ms apart that agree (scrolls and layout shifts are over). */
async function stableBox(loc, { timeout = 2500 } = {}) {
  const until = Date.now() + timeout
  let last = await loc.boundingBox()
  while (Date.now() < until) {
    await loc.page().waitForTimeout(80)
    const now = await loc.boundingBox()
    if (last && now && Math.abs(now.x - last.x) < 0.5 && Math.abs(now.y - last.y) < 0.5 && Math.abs(now.width - last.width) < 0.5 && Math.abs(now.height - last.height) < 0.5) return now
    last = now
  }
  return last
}

export function walker(page, base, { video = false } = {}) {
  const pause = (ms) => (video ? page.waitForTimeout(ms) : Promise.resolve())
  const inflight = new Set()
  let lastChange = Date.now()
  const track = (request) => TRACKED.has(request.resourceType()) && !LONG_LIVED.test(request.url())
  page.on('request', (request) => { if (track(request)) { inflight.add(request); lastChange = Date.now() } })
  const done = (request) => { if (inflight.delete(request)) lastChange = Date.now() }
  page.on('requestfinished', done)
  page.on('requestfailed', done)
  const w = {
    page,
    base,
    video,
    locator: (target) => seen(page, target),
    byText: (text) => page.getByText(text, { exact: false }).filter({ visible: true }).first(),
    async goto(route, ready) {
      await page.goto(route.startsWith('http') ? route : base + route, { waitUntil: 'load' })
      if (ready) await w.wait(ready)
    },
    async wait(target, timeout = 30000) {
      await seen(page, target).waitFor({ state: 'visible', timeout })
    },
    async tap(target, { hold = 450 } = {}) {
      const loc = seen(page, target)
      // Whole and clear of the sticky bars (a bar can cover a control that is merely "in view"),
      // with as little scroll as it takes: no jump when it already shows.
      await w.reveal(loc)
      // The page may still be scrolling or shifting (a restored scroll, a row that
      // scrolls itself into view): the finger goes where the control ends up.
      let box = await stableBox(loc)
      if (video && box) {
        const dot = (b) => page.evaluate(([x, y]) => window.__guiaDot?.(x, y), [b.x + b.width / 2, b.y + b.height / 2])
        await dot(box)
        await page.waitForTimeout(hold)
        const after = await stableBox(loc)
        if (after && (Math.abs(after.x - box.x) > 1 || Math.abs(after.y - box.y) > 1)) {
          box = after
          await dot(box)
          await page.waitForTimeout(250)
        }
      }
      // Press exactly where the dot is: the ripple then lands on this control.
      if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      else await loc.click()
      if (video) {
        await page.evaluate(() => window.__guiaDotOff?.())
        // The tap ends with its ring and dot gone (≤ RING_MS): neither is ever
        // on screen when the next caption starts or the next shot is taken.
        await page.waitForFunction(() => !window.__guiaTouchIdle || window.__guiaTouchIdle(), null, { timeout: 2000, polling: 'raf' }).catch(() => {})
      }
    },
    async tapText(text, options) {
      await w.tap(w.byText(text), options)
    },
    async type(target, text, { clear = true } = {}) {
      const loc = seen(page, target)
      await w.tap(loc, { hold: 250 })
      if (clear) await loc.fill('')
      if (video) await loc.pressSequentially(text, { delay: 70 })
      else await loc.fill(text)
    },
    async press(target, key) {
      await seen(page, target).press(key)
    },
    /**
     * Wait until the page has no request in flight for `idle` ms (debounced
     * searches, label drawing). Gives up quietly after `timeout`.
     */
    async quiet({ idle = 700, timeout = 10000 } = {}) {
      const until = Date.now() + timeout
      while (Date.now() < until) {
        if (!inflight.size && Date.now() - lastChange >= idle) return true
        await page.waitForTimeout(60)
      }
      return false
    },
    /** Wait until none of `texts` («Buscando…», «Dibujando las etiquetas…») shows in any frame. */
    async gone(texts, timeout = 20000) {
      if (!texts?.length) return
      const until = Date.now() + timeout
      for (;;) {
        let showing = null
        for (const frame of page.frames()) {
          for (const text of texts) {
            if (await frame.getByText(text, { exact: false }).filter({ visible: true }).count().catch(() => 0)) { showing = text; break }
          }
          if (showing) break
        }
        if (!showing) return
        if (Date.now() > until) throw new Error(`sigue en pantalla «${showing}»`)
        await page.waitForTimeout(100)
      }
    },
    /**
     * Scroll so every target shows whole between the sticky header and the
     * bottom bar, moving as little as it can and leaving no control cut by a
     * bar (scroll.mjs). Video glides at a steady pace; shots jump at once.
     * A target may be a list; returns the pixels scrolled.
     */
    async reveal(targets, { margin } = {}) {
      const list = (Array.isArray(targets) ? targets : [targets]).map(t => seen(page, t))
      const els = []
      for (const loc of list) els.push(await loc.elementHandle({ timeout: 10000 }))
      const plan = await page.evaluate(measureScroll, { els })
      for (const el of els) await el.dispose()
      const top = pickScroll(margin == null ? plan : { ...plan, margin })
      const distance = top - plan.current
      if (Math.abs(distance) < 1) return 0
      await page.evaluate(glideScroll, { top, ms: video ? glideMs(distance) : 0 })
      return distance
    },
    /** Bring an element (or a list) into clear sight; in video, a short look after. */
    async show(target) {
      await w.reveal(target)
      await pause(500)
    },
    pause,
  }
  return w
}

/**
 * Run one step: its route, its actions, its ready wait, then until the screen
 * is settled: no `busy` text (the guide's and the step's) and no request in
 * flight, so a debounced search or a label still drawing never reaches a shot
 * or a step's last video frame. The fixture's data goes to the action so
 * guides never hardcode a product, person or store. `shoot` and `video` both
 * end each step here, so stills and video show the same state.
 */
export async function runStep(w, step, data, { busy = [] } = {}) {
  const value = (v) => (typeof v === 'function' ? v(data) : v)
  const route = value(step.route)
  if (route) await w.goto(route)
  if (step.action) await step.action(w, data)
  const ready = value(step.ready)
  const waiting = [...busy, ...(value(step.busy) || [])]
  if (ready) await w.wait(ready)
  await w.quiet()
  await w.gone(waiting)
  // A late answer can replace what was ready; it must still be there.
  if (ready) await w.wait(ready)
  await w.page.evaluate(() => document.fonts.ready)
  await w.page.waitForTimeout(step.settle ?? 450)
}

/**
 * End a step with the tap its text asks for (`after`: «toca Etiquetas»,
 * «tócalo»), once its shot is taken or its marks have shown: in the video it
 * plays under its own step's caption, never under the next one. Returns as
 * soon as `after` sees its result on screen (the new page's field, the picked
 * row): the requests it started are waited out by the next step's runStep,
 * under the next caption.
 */
export async function finishStep(w, step, data) {
  if (!step.after) return false
  await step.after(w, data)
  return true
}

/**
 * Replace real names (company, store) with demo words in every frame, label
 * previews in srcdoc iframes included. Installed as an observer per frame so
 * text that renders later is replaced too.
 */
/**
 * In-page: swap every real name in this document for its demo word, now and
 * on every later change. Runs as an init script (before the frame paints) and
 * again from applyRename for documents that were already open.
 */
function renameInPage(pairs) {
  const swap = (node) => {
    let value = node.nodeValue
    for (const [from, to] of pairs) if (from && value.includes(from)) value = value.split(from).join(to)
    if (value !== node.nodeValue) node.nodeValue = value
  }
  const sweep = (root) => {
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let n
    while ((n = it.nextNode())) swap(n)
  }
  sweep(document)
  if (window.__guiaRename) return
  window.__guiaRename = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') swap(r.target)
      else for (const n of r.addedNodes) n.nodeType === 3 ? swap(n) : n.nodeType === 1 && sweep(n)
    }
  })
  // The document itself, so text parsed before <body> exists is caught too.
  window.__guiaRename.observe(document, { subtree: true, childList: true, characterData: true })
}

/**
 * Every frame the context opens from now on (label previews in srcdoc frames
 * included) renames before its first paint, so no frame of a video shows a
 * real name between sweeps.
 */
export async function installRename(context, pairs) {
  if (!pairs?.length) return
  await context.addInitScript(renameInPage, pairs)
}

export async function applyRename(page, pairs) {
  if (!pairs?.length) return
  for (const frame of page.frames()) {
    await frame.evaluate(renameInPage, pairs).catch(() => { /* a frame that navigated away mid-sweep */ })
  }
}
