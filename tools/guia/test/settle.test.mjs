// Empty-focus frames, a preview still drawing, and the eye-check note. node --test tools/guia/test
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { typingPlan, armFocusFill, disarmFocusFill, settle } from '../lib/walker.mjs'
import { defectsMarkdown, eyeNotes } from '../lib/critique.mjs'
import labels, { LABEL_DRAWN } from '../guides/inventario/imprimir-etiquetas.guide.mjs'

const DATA = { query: 'Funda Brillos', listQuery: 'Funda Brillos Universal', item_name: 'Funda Brillos Universal' }

test('typing puts the first letter (shots: the whole text) in with the focus', () => {
  assert.deepEqual(typingPlan('Funda', { video: true }), { onFocus: 'F', rest: 'unda' })
  assert.deepEqual(typingPlan('Funda', { video: false }), { onFocus: 'Funda', rest: '' })
  assert.deepEqual(typingPlan('Ñu', { video: true }), { onFocus: 'Ñ', rest: 'u' })
  assert.deepEqual(typingPlan('más', { video: true, clear: false }), { onFocus: null, rest: 'más' })
  assert.deepEqual(typingPlan('', { video: true }), { onFocus: null, rest: '' })
})

/** A window and an input whose app handler reads the value on focus, as Etiquetas' openSearch does. */
function fakeField() {
  const listeners = []
  class Event { constructor(type, init = {}) { this.type = type; this.bubbles = !!init.bubbles } }
  const win = {
    Event,
    addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
    removeEventListener: (type, fn, capture) => {
      const i = listeners.findIndex(l => l.type === type && l.fn === fn && l.capture === capture)
      if (i >= 0) listeners.splice(i, 1)
    },
  }
  const seenOnFocus = []
  const inputs = []
  const el = {
    value: '',
    ownerDocument: { defaultView: win },
    dispatchEvent(event) { if (event.type === 'input') inputs.push(el.value) },
  }
  // The browser: window capture listeners first, then the app's own handler.
  const focus = () => {
    for (const l of [...listeners]) if (l.type === 'focus' && l.capture) l.fn({ target: el })
    seenOnFocus.push(el.value)
  }
  return { el, win, focus, seenOnFocus, inputs, listeners }
}

test('the app sees the text already there when the field gets focus, never an empty field', () => {
  const f = fakeField()
  armFocusFill(f.el, 'F')
  f.focus()
  assert.deepEqual(f.seenOnFocus, ['F'], 'the focus handler ran with the letter in')
  assert.deepEqual(f.inputs, ['F'], 'v-model heard it before the focus handler')
  assert.equal(disarmFocusFill(f.el), true)
  assert.equal(f.listeners.length, 0, 'one focus only')
  f.focus()
  assert.deepEqual(f.inputs, ['F'], 'a later focus is left alone')
})

test('a field that was already focused gets no focus event: disarm says so and leaves nothing behind', () => {
  const f = fakeField()
  armFocusFill(f.el, 'Funda')
  assert.equal(disarmFocusFill(f.el), false)
  assert.equal(f.listeners.length, 0)
  assert.equal(f.el.value, '')
})

test('the labels search is typed with its focus, never tapped empty first', async () => {
  const calls = []
  const w = {
    type: async (...a) => calls.push(['type', ...a]),
    tap: async (...a) => calls.push(['tap', ...a]),
    wait: async (...a) => calls.push(['wait', ...a]),
  }
  await labels.steps[1].action(w, DATA)
  assert.equal(calls[0][0], 'type')
  assert.equal(calls[0][1], '[data-etq-search]')
  assert.ok(!calls.some(c => c[0] === 'tap'), 'no tap that would focus the empty field')
})

test('the capture stylesheet hides the «recently edited» list and its heading', () => {
  const css = fs.readFileSync(fileURLToPath(new URL('../lib/capture.css', import.meta.url)), 'utf8')
  assert.match(css, /\[data-etq-results\] ul\[aria-label="Editados hace poco"\]/)
  assert.match(css, /p:has\(\+ ul\[aria-label="Editados hace poco"\]\)/)
  assert.match(css, /\[data-guia-recent-edits\]/)
  // All in the rule that hides.
  const rule = css.slice(css.indexOf('Editados hace poco'))
  assert.match(rule, /\{\s*display: none !important;\s*\}/)
})

test('picking the product ends only once the label preview is drawn', async () => {
  const calls = []
  let settled = false
  const w = {
    tap: async (t) => calls.push(['tap', t]),
    wait: async (t) => calls.push(['wait', t]),
    settle: async (opts) => { calls.push(['settle', opts]); await new Promise(r => setTimeout(r, 20)); settled = true },
  }
  await labels.steps[1].after(w, DATA)
  assert.ok(settled, 'after waited for settle')
  assert.deepEqual(calls.map(c => c[0]), ['tap', 'wait', 'settle'])
  assert.equal(calls[2][1], LABEL_DRAWN)
  assert.match(LABEL_DRAWN.ready, /\[data-etq-stage\]\[aria-busy="false"\] iframe/)
  assert.match(LABEL_DRAWN.frame, /iframe/)
  assert.ok(LABEL_DRAWN.busy.includes('Dibujando las etiquetas'))
})

/** A walker whose screen answers from a script: each look takes the next state. */
function fakeWalker(states) {
  const log = []
  let i = 0
  const now = () => states[Math.min(i, states.length - 1)]
  return {
    log,
    wait: async (t) => log.push(`wait ${t}`),
    quiet: async () => log.push('quiet'),
    gone: async () => log.push('gone'),
    frameLoaded: async (t) => log.push(`frame ${t}`),
    // Each round reads idleNow first: that read moves the screen to its next state.
    idleNow: () => { const s = now(); i++; return s.idle },
    busyNow: async () => states[Math.min(i - 1, states.length - 1)].busy,
    showing: async () => states[Math.min(i - 1, states.length - 1)].ready,
  }
}

test('settle waits out a redraw that starts after a quiet spell', async () => {
  const w = fakeWalker([{ idle: false, busy: null, ready: true }, { idle: true, busy: 'Dibujando las etiquetas', ready: true }, { idle: true, busy: null, ready: true }])
  const rounds = await settle(w, LABEL_DRAWN)
  assert.equal(rounds, 3)
  assert.equal(w.log.filter(l => l.startsWith('frame')).length, 3, 'the frame is checked every round')
  assert.deepEqual(w.log.slice(0, 4), [`wait ${LABEL_DRAWN.ready}`, 'quiet', 'gone', `frame ${LABEL_DRAWN.frame}`])
})

test('settle gives up loudly when the screen never stops drawing', async () => {
  const w = fakeWalker([{ idle: false, busy: null, ready: true }])
  w.showing = async () => true
  await assert.rejects(settle(w, { ...LABEL_DRAWN, rounds: 3 }), /no termina de dibujarse/)
})

const SHOT = {
  site: 'lab', format: 'phone', shotAt: '2026-11-14T18:00:00Z', failed: null,
  shots: [
    { step: 1, image: 'paso-1.png', path: '/crm/productos', caption: 'En Productos, toca «Etiquetas»', defects: [] },
    { step: 2, image: 'paso-2.png', path: '/crm/productos/etiquetas', caption: 'Busca el producto', defects: [{ kind: 'aviso', blocks: false, text: 'x' }] },
  ],
}
const GUIDE = { question: '¿Cómo imprimo?', area: 'inventario', slug: 'imprimir-etiquetas' }

test('DEFECTS.md always has a note under «Revisión a ojo», with a box per shot', () => {
  const md = defectsMarkdown(GUIDE, SHOT, { at: '2026-11-14T18:30:00Z', videoFrames: 5 })
  const eye = md.slice(md.indexOf('## Revisión a ojo'))
  assert.match(eye, /Crítica corrida 14 nov 2026, 11:30/, 'shop time, not UTC')
  assert.match(eye, /2 foto\(s\) y 5 cuadro\(s\) del video/)
  assert.match(eye, /0 bloquea\(n\), 1 a revisar/)
  assert.match(eye, /- \[ \] Paso 1 · `paso-1\.png` · En Productos, toca «Etiquetas»/)
  assert.match(eye, /- \[ \] Paso 2 · `paso-2\.png`/)
  assert.ok(eye.replace('## Revisión a ojo', '').trim().length > 0)
})

test('a new critique keeps what a person wrote under «Revisión a ojo» and replaces its own note', () => {
  const first = defectsMarkdown(GUIDE, SHOT, { at: '2026-11-14T18:30:00Z' })
  const edited = `${first}- Paso 3: el botón se ve viejo.\n`
  const kept = eyeNotes(edited)
  assert.equal(kept, '- Paso 3: el botón se ve viejo.')
  const second = defectsMarkdown(GUIDE, SHOT, { at: '2026-11-14T19:00:00Z', eye: kept })
  assert.equal(second.match(/Crítica corrida/g).length, 1)
  assert.match(second, /12:00[\s\S]*el botón se ve viejo/)
  assert.equal(eyeNotes('# sin sección\n'), '')
  // The old fixed hint is not a person's note.
  assert.equal(eyeNotes('## Revisión a ojo\n\nAnotar aquí lo que las sondas no ven: aspecto viejo, iconos de relleno, estados vacíos, nombres reales, carga a medias.\n'), '')
})
