/**
 * The actions a guide step runs, shared by `shoot` and `video` so both replay
 * the same walk. In video mode every tap shows the finger dot first and typing
 * is slow enough to read; in shoot mode the same calls run at once.
 */

// Apps keep hidden copies of some controls (phone and desktop bars): act on the visible one.
const seen = (page, target) => (typeof target === 'string' ? page.locator(target) : target).filter({ visible: true }).first()

export function walker(page, base, { video = false } = {}) {
  const pause = (ms) => (video ? page.waitForTimeout(ms) : Promise.resolve())
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
      // Centre it: a sticky bar at the bottom can cover a control that is merely "in view".
      await loc.evaluate((el) => el.scrollIntoView({ behavior: 'instant', block: 'center' }))
      if (video) {
        const box = await loc.boundingBox()
        if (box) await page.evaluate(([x, y]) => window.__guiaDot?.(x, y), [box.x + box.width / 2, box.y + box.height / 2])
        await page.waitForTimeout(hold)
      }
      await loc.click()
      if (video) await page.evaluate(() => window.__guiaDotOff?.())
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
    /** Scroll an element to the middle of the screen. */
    async show(target) {
      await seen(page, target).evaluate((el) => el.scrollIntoView({ behavior: 'instant', block: 'center' }))
      await pause(500)
    },
    pause,
  }
  return w
}

/**
 * Run one step: its route, its actions, its ready wait. The fixture's data
 * goes to the action so guides never hardcode a product, person or store.
 */
export async function runStep(w, step, data) {
  if (step.route) await w.goto(step.route)
  if (step.action) await step.action(w, data)
  if (step.ready) await w.wait(typeof step.ready === 'function' ? step.ready(data) : step.ready)
  await w.page.evaluate(() => document.fonts.ready)
  await w.page.waitForTimeout(step.settle ?? 450)
}

/**
 * Replace real names (company, store) with demo words in every frame, label
 * previews in srcdoc iframes included. Installed as an observer per frame so
 * text that renders later is replaced too.
 */
export async function applyRename(page, pairs) {
  if (!pairs?.length) return
  for (const frame of page.frames()) {
    await frame.evaluate((pairs) => {
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
      if (!document.body) return
      sweep(document.body)
      if (window.__guiaRename) return
      window.__guiaRename = new MutationObserver((records) => {
        for (const r of records) {
          if (r.type === 'characterData') swap(r.target)
          else for (const n of r.addedNodes) n.nodeType === 3 ? swap(n) : n.nodeType === 1 && sweep(n)
        }
      })
      window.__guiaRename.observe(document.body, { subtree: true, childList: true, characterData: true })
    }, pairs).catch(() => { /* a frame that navigated away mid-sweep */ })
  }
}
