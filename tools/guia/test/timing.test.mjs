// Caption timing and scroll choice: node --test tools/guia/test
import test from 'node:test'
import assert from 'node:assert/strict'
import { playSteps, captionWindows, PACING } from '../lib/video.mjs'
import { pickScroll, glideMs, MIN_GLIDE, MAX_GLIDE, STILL } from '../lib/scroll.mjs'
import { validateGuide } from '../lib/guide.mjs'
import labels from '../guides/inventario/imprimir-etiquetas.guide.mjs'

/** A fake recording clock: waits and browser work only advance it, and every tap is logged with its time. */
function fakeRun(steps, { runMs = 1200, tapMs = 900 } = {}) {
  let t = 0
  const taps = []
  const tap = (label) => { const at = t; t += tapMs / 1000; taps.push({ label, at, end: t }) }
  const hooks = {
    now: () => t,
    wait: async (ms) => { t += ms / 1000 },
    caption: (step) => step.caption,
    run: async (step) => { if (step.tapIn) tap(step.tapIn); t += runMs / 1000 },
    marks: (step) => step.marks || [],
    draw: async () => {},
    clear: async () => {},
    finish: async (step) => tap(step.tapAfter),
  }
  return { hooks, taps }
}

const STEPS = [
  { caption: 'En Productos, toca «Etiquetas»', marks: [{ ring: 'a', n: 1 }], after: true, tapAfter: 'Etiquetas' },
  { caption: 'Busca el producto y tócalo', tapIn: 'buscador', marks: [{ ring: 'b', n: 2 }], after: true, tapAfter: 'producto' },
  { caption: 'Elige cuántas', tapIn: '+', marks: [{ ring: 'c', n: 4 }] },
]

test('each caption starts when its step starts; a step\'s closing tap plays under its own caption', async () => {
  const { hooks, taps } = fakeRun(STEPS)
  const timeline = await playSteps(STEPS, hooks)
  const windows = captionWindows(timeline, timeline.at(-1).end)
  const captionAt = (t) => windows.findLast(w => t >= w.from && t < w.to)?.n
  assert.deepEqual(taps.map(tap => tap.label), ['Etiquetas', 'buscador', 'producto', '+'])
  // Every tap, from its first frame to its last, shows the caption of the step that asks for it.
  const owner = { Etiquetas: 1, buscador: 2, producto: 2, '+': 3 }
  for (const tap of taps) {
    assert.equal(captionAt(tap.at), owner[tap.label], `${tap.label} starts under caption ${captionAt(tap.at)}`)
    assert.equal(captionAt(tap.end - 1e-6), owner[tap.label], `${tap.label} ends under caption ${captionAt(tap.end - 1e-6)}`)
  }
  for (const [i, step] of timeline.entries()) {
    assert.ok(step.marked > step.start, 'marks come after the caption')
    if (step.after != null) assert.ok(step.after >= step.marked + PACING.marks / 1000, 'the closing tap waits for the marks to go')
    if (timeline[i + 1]) assert.ok(timeline[i + 1].start >= step.end, 'the next caption waits for the step to end')
  }
})

test('a step that ends with a tap hands its caption over as soon as the tap\'s screen is up', async () => {
  const { hooks, taps } = fakeRun(STEPS)
  const timeline = await playSteps(STEPS, hooks)
  const windows = captionWindows(timeline, timeline.at(-1).end)
  const [one, two] = timeline
  const etiquetas = taps.find(tap => tap.label === 'Etiquetas')
  // Step 1 ends the moment its tap has brought up Etiquetas: no tail under caption 1.
  assert.equal(one.end, one.afterEnd)
  assert.equal(one.afterEnd, etiquetas.end)
  assert.equal(windows[0].to, etiquetas.end)
  assert.equal(two.start, etiquetas.end, 'caption 2 takes over with the new page')
  // A step without a closing tap keeps its closing look.
  const last = timeline.at(-1)
  assert.ok(last.end - last.marked >= (PACING.marks + PACING.tail) / 1000 - 1e-9)
})

test('caption windows run back to back from each step start to the next', () => {
  const windows = captionWindows([{ n: 1, start: 0 }, { n: 2, start: 4.2 }, { n: 3, start: 9 }], 12)
  assert.deepEqual(windows, [{ n: 1, from: 0, to: 4.2 }, { n: 2, from: 4.2, to: 9 }, { n: 3, from: 9, to: 12 }])
})

test('the labels guide taps what each step asks for in that step, not the next', () => {
  assert.deepEqual(validateGuide(labels, { area: 'inventario', slug: 'imprimir-etiquetas' }), [])
  const [one, two, three] = labels.steps
  assert.equal(typeof one.after, 'function', 'step 1 says «toca Etiquetas»')
  assert.equal(typeof two.after, 'function', 'step 2 says «tócalo»')
  assert.ok(!/etiquetas"\]'\)/.test(String(two.action)), 'step 2 no longer taps Etiquetas')
  assert.ok(!/etq-results\] li button/.test(String(three.action)), 'step 3 no longer picks the product')
  assert.ok(validateGuide({ ...labels, steps: [{ ...one, after: 'tap' }] }, { area: 'inventario', slug: 'x' }).some(p => p.includes('after')))
})

// A phone scroller of 760 px: sticky header 0–64, sticky print bar 640–760.
const BAND = { top: 64, bottom: 640 }

test('a target already clear of both bars does not scroll', () => {
  assert.equal(pickScroll({ current: 300, max: 2000, band: BAND, targets: [{ top: 500, bottom: 600 }] }), 300)
})

test('a target already showing whole stays put, even inside the margin (no 14 px bob on step 4)', () => {
  // Bottom 6 px above the print bar: inside MARGIN, still whole on screen.
  assert.equal(pickScroll({ current: 300, max: 2000, band: BAND, targets: [{ top: 820, bottom: 934 }] }), 300)
  // Top 4 px under the header: within STILL.
  assert.equal(pickScroll({ current: 300, max: 2000, band: BAND, targets: [{ top: 300 + 64 - STILL, bottom: 500 }] }), 300)
  // Several targets that all show: no move.
  assert.equal(pickScroll({ current: 300, max: 2000, band: BAND, targets: [{ top: 370, bottom: 400 }, { top: 900, bottom: 940 }] }), 300)
})

test('a showing target is not moved for a cut control, so the next step does not scroll back', () => {
  const plan = { current: 300, max: 2000, band: BAND, targets: [{ top: 500, bottom: 600 }], controls: [{ top: 350, bottom: 380 }] }
  assert.equal(pickScroll(plan), 300)
})

test('a target more than STILL px under a bar still scrolls', () => {
  const s = pickScroll({ current: 300, max: 2000, band: BAND, targets: [{ top: 500, bottom: 300 + 640 + STILL + 2 }] })
  assert.ok(s > 300, `stayed at ${s}`)
})

test('a target under the print bar scrolls just enough to end above it', () => {
  const s = pickScroll({ current: 0, max: 2000, band: BAND, targets: [{ top: 600, bottom: 680 }] })
  assert.equal(s, 680 + 12 - 640)
})

test('a target under the header scrolls just enough to show whole below it', () => {
  const s = pickScroll({ current: 400, max: 2000, band: BAND, targets: [{ top: 420, bottom: 480 }] })
  assert.equal(s, 420 - 12 - 64)
})

test('no control is left cut by the header: the «Mediana» chip shows whole or not at all', () => {
  // Target row at 700–760; the chip at 80–140 would sit across the header edge at the minimal scroll.
  const plan = { current: 0, max: 2000, band: BAND, targets: [{ top: 700, bottom: 760 }], controls: [{ top: 90, bottom: 150 }] }
  const s = pickScroll(plan)
  const edge = s + BAND.top
  assert.ok(!(90 < edge && 150 > edge), `chip cut at scroll ${s}`)
  assert.ok(760 + 12 <= s + BAND.bottom && 700 - 12 >= s + BAND.top, 'the target stays whole')
})

test('several targets show together; one too tall puts its top under the header', () => {
  const s = pickScroll({ current: 0, max: 2000, band: BAND, targets: [{ top: 300, bottom: 500 }, { top: 620, bottom: 690 }] })
  assert.ok(s + BAND.top <= 288 && s + BAND.bottom >= 702)
  assert.equal(pickScroll({ current: 0, max: 2000, band: BAND, targets: [{ top: 300, bottom: 1300 }] }), 300 - 12 - 64)
})

test('glides run at one pace within bounds', () => {
  assert.equal(glideMs(0), 0)
  assert.equal(glideMs(10), MIN_GLIDE)
  assert.equal(glideMs(5000), MAX_GLIDE)
  assert.ok(glideMs(-600) > glideMs(400))
})
