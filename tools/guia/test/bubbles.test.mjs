// Bubble placement and the capture rules: node --test tools/guia/test
import test from 'node:test'
import assert from 'node:assert/strict'
import { placeBubbles, ringArea, drawnBox, distanceTo, rivalControls, BUBBLE_R, CLEAR } from '../lib/bubbles.mjs'
import { CAPTURE_CSS, FORMATS } from '../lib/session.mjs'
import { validateGuide } from '../lib/guide.mjs'
import { tidyName } from '../fixtures/catalogo-con-precio.mjs'

const PHONE = { width: 412, height: 915 }
const HIT = BUBBLE_R + 3

/** True when a bubble at c (radius HIT) touches the rect. */
function touches(c, rect) {
  const nx = Math.max(rect.x, Math.min(c.x, rect.x + rect.width))
  const ny = Math.max(rect.y, Math.min(c.y, rect.y + rect.height))
  return Math.hypot(nx - c.x, ny - c.y) < HIT
}

const inside = (c, { width, height }) => c.x - HIT >= 0 && c.y - HIT >= 0 && c.x + HIT <= width && c.y + HIT <= height

test('a lone ring takes its preferred corner, outside its loop', () => {
  const mark = { ring: { x: 120, y: 300, width: 180, height: 44 }, n: 1, shape: 'box', pad: 4 }
  const at = placeBubbles([mark], [], PHONE).get(0)
  assert.equal(at.key, 'tl')
  assert.ok(at.clear)
  const box = drawnBox(mark)
  assert.ok(at.x < box.x && at.y < box.y, 'top-left of the loop')
  const tr = placeBubbles([{ ...mark, nAt: 'tr' }], [], PHONE).get(0)
  assert.equal(tr.key, 'tr')
})

test('two stacked boxes: the lower number never sits on the upper loop (search over results)', () => {
  // The shot-2 case: a search field ringed 2 and the first result just under it ringed 3.
  const search = { ring: { x: 16, y: 120, width: 380, height: 44 }, n: 2, shape: 'box', pad: 4 }
  const result = { ring: { x: 16, y: 176, width: 380, height: 52 }, n: 3, shape: 'box', pad: 3 }
  const marks = [search, result]
  const placed = placeBubbles(marks, [], PHONE)
  const two = placed.get(0)
  const three = placed.get(1)
  assert.ok(!touches(three, ringArea(search)), `3 at ${three.key} touches ring 2`)
  assert.ok(!touches(two, ringArea(result)), `2 at ${two.key} touches ring 3`)
  for (const c of [two, three]) assert.ok(inside(c, PHONE))
  assert.ok(Math.hypot(two.x - three.x, two.y - three.y) >= 2 * HIT, 'bubbles do not overlap each other')
})

test('a number steps off words and icons next to its loop', () => {
  // Print bar: «Imprimir» ringed 7 with a label above its top-left corner and an icon at its top-right.
  const mark = { ring: { x: 150, y: 820, width: 240, height: 48 }, n: 7, shape: 'box', pad: 3 }
  const words = [{ x: 110, y: 780, width: 70, height: 20 }, { x: 370, y: 780, width: 30, height: 30 }]
  const at = placeBubbles([mark], words, PHONE).get(0)
  assert.ok(at.clear, `no clear spot, took ${at.key}`)
  for (const box of words) assert.ok(!touches(at, box), `7 at ${at.key} covers text`)
  assert.ok(inside(at, PHONE))
})

test('no clear spot: the least-covering one, never over another mark', () => {
  const a = { ring: { x: 40, y: 400, width: 120, height: 40 }, n: 5, shape: 'box', pad: 2 }
  const b = { ring: { x: 200, y: 400, width: 120, height: 40 }, n: 6, shape: 'box', pad: 2, nAt: 'l' }
  // Words all around both rings.
  const words = []
  for (let y = 300; y < 560; y += 22) words.push({ x: 0, y, width: 412, height: 16 })
  const placed = placeBubbles([a, b], words, PHONE)
  const six = placed.get(1)
  const five = placed.get(0)
  assert.ok(!touches(six, ringArea(a)), `6 at ${six.key} sits on ring 5`)
  assert.ok(!touches(five, ringArea(b)), `5 at ${five.key} sits on ring 6`)
})

test('rings at the screen edge keep their number on screen', () => {
  const row = { ring: { x: 0, y: 0, width: 412, height: 60 }, n: 1, shape: 'box', pad: 0 }
  const at = placeBubbles([row], [], PHONE).get(0)
  assert.ok(inside(at, PHONE), `${at.key} at ${at.x},${at.y}`)
})

test('tap ripples count as marks and get a number off the other loops', () => {
  const ring = { ring: { x: 100, y: 200, width: 200, height: 40 }, n: 1, shape: 'box' }
  const tap = { tap: { x: 180, y: 260, width: 60, height: 40 }, n: 2 }
  const placed = placeBubbles([ring, tap], [], PHONE)
  assert.ok(!touches(placed.get(1), ringArea(ring)))
  assert.ok(!touches(placed.get(0), { x: 210 - 42, y: 280 - 42, width: 84, height: 84 }))
})

test('marks without a number get no bubble', () => {
  const placed = placeBubbles([{ ring: { x: 10, y: 10, width: 50, height: 50 } }, { note: 'Hola', to: { x: 0, y: 0, width: 0, height: 0 } }], [], PHONE)
  assert.equal(placed.size, 0)
})

test('the capture stylesheet hides the bell count and the account notice', () => {
  assert.match(CAPTURE_CSS, /button:has\(> \.lucide-bell\) > \.bg-surface-red-7/)
  assert.match(CAPTURE_CSS, /\[data-testid="shell-cuenta-aviso"\]/)
  assert.match(CAPTURE_CSS, /\[data-guia-hide\]/)
  assert.match(CAPTURE_CSS, /display: none !important/)
})

test('stills and video share one viewport per format', () => {
  for (const f of Object.values(FORMATS)) assert.equal(f.video, undefined)
})

test('a step route may come from the fixture data; busy is a list of texts', () => {
  const guide = {
    question: '¿Cómo hago algo?', quien: ['cajero'], place: 'productos.etiquetas', donde: 'Productos', format: 'phone',
    fixture: 'catalogo-con-precio', resumen: ['Uno.'], busy: ['Buscando'],
    steps: [{ text: 'x', route: (data) => `/crm/productos?q=${data.query}` }],
  }
  assert.deepEqual(validateGuide(guide, { area: 'inventario', slug: 'algo' }), [])
  assert.ok(validateGuide({ ...guide, busy: 'Buscando' }, { area: 'inventario', slug: 'algo' }).some(p => p.startsWith('busy')))
})

test('demo product names: tidy ones pass, typos and prices in the name do not', () => {
  assert.ok(tidyName('Funda Brillos Universal'))
  assert.ok(tidyName('Cable USB-C 1 m'))
  for (const bad of ['FUNDA BRILLOS', 'Funda  doble espacio', 'Funda $99', 'Fundaaa rosa', 'Funda', ' Funda rosa']) assert.equal(tidyName(bad), false, bad)
})

test('a number stays by its own box, never nearer another control (Diseño over the search field)', () => {
  // Phone, step 4: the label preview ringed 5, the full-width «Diseño» box ringed 6 and,
  // 16 px under it, the search field (a control whose placeholder is no text).
  const preview = { ring: { x: 16, y: 150, width: 380, height: 200 }, n: 5, shape: 'box', pad: 2 }
  const diseno = { ring: { x: 16, y: 420, width: 380, height: 56 }, n: 6, shape: 'box', pad: 3, nAt: 'l' }
  const search = { x: 16, y: 492, width: 380, height: 48, control: true }
  const words = [
    { x: 24, y: 360, width: 300, height: 18 }, // the caption under the preview
    { x: 60, y: 430, width: 200, height: 20 }, { x: 60, y: 452, width: 160, height: 18 }, // «Mediana · 50 × 30 mm»
    { x: 340, y: 440, width: 48, height: 18 }, // «Diseño»
    { ...diseno.ring, control: true },
    search,
  ]
  const placed = placeBubbles([preview, diseno], words, PHONE)
  const six = placed.get(1)
  const own = drawnBox(diseno)
  const dOwn = distanceTo(six, own)
  assert.ok(dOwn < distanceTo(six, search), `6 at ${six.key} is nearer the search field than its own box`)
  assert.ok(dOwn <= HIT + 3, `6 at ${six.key} floats ${dOwn.toFixed(1)} px off its box`)
  assert.ok(!touches(six, search), `6 at ${six.key} covers the search field`)
  assert.ok(!touches(six, ringArea(preview)), `6 at ${six.key} sits on ring 5`)
})

test('every placed number touches its own loop and owns its spot', () => {
  const marks = [
    { ring: { x: 16, y: 120, width: 380, height: 44 }, n: 1, shape: 'box', pad: 4 },
    { ring: { x: 16, y: 176, width: 380, height: 52 }, n: 2, shape: 'box', pad: 3 },
    { ring: { x: 300, y: 600, width: 90, height: 40 }, n: 3, pad: 5, nAt: 'tr' },
  ]
  const controls = [
    { x: 16, y: 240, width: 380, height: 48, control: true },
    { x: 200, y: 600, width: 90, height: 40, control: true },
    { x: 300, y: 652, width: 90, height: 40, control: true },
  ]
  const placed = placeBubbles(marks, controls, PHONE)
  for (const [index, at] of placed) {
    const box = drawnBox(marks[index])
    const d = distanceTo(at, box)
    assert.ok(d <= HIT + 3, `${marks[index].n} at ${at.key} is ${d.toFixed(1)} px off its loop`)
    for (const c of rivalControls(marks[index], controls)) assert.ok(distanceTo(at, c) > d, `${marks[index].n} at ${at.key} is nearer another control`)
  }
})

test('a control the ring sits on is its own, not a rival', () => {
  const ring = { x: 100, y: 300, width: 120, height: 40 }
  const rivals = rivalControls({ ring }, [{ ...ring, control: true }, { x: 90, y: 290, width: 300, height: 60, control: true }, { x: 100, y: 350, width: 120, height: 40, control: true }, { x: 0, y: 0, width: 10, height: 10 }])
  assert.equal(rivals.length, 1)
  assert.equal(rivals[0].y, 350)
})

/** Gap between a bubble's halo and a rect (negative: overlapping). */
const gap = (c, rect) => distanceTo(c, rect) - HIT

test('numbers keep CLEAR px off a card border (7 and 8 on «Funda Brillos Universal»)', () => {
  // A product card 16–396 × 300–420; its quantity and print buttons ringed 7 and 8 near the bottom edge.
  const card = { x: 16, y: 300, width: 380, height: 120 }
  const edges = [
    { x: card.x, y: card.y, width: card.width, height: 1, edge: true },
    { x: card.x, y: card.y + card.height - 1, width: card.width, height: 1, edge: true },
    { x: card.x, y: card.y, width: 1, height: card.height, edge: true },
    { x: card.x + card.width - 1, y: card.y, width: 1, height: card.height, edge: true },
  ]
  const seven = { ring: { x: 40, y: 376, width: 120, height: 32 }, n: 7, shape: 'box', pad: 3, nAt: 'bl' }
  const eight = { ring: { x: 240, y: 376, width: 130, height: 32 }, n: 8, shape: 'box', pad: 3, nAt: 'br' }
  const placed = placeBubbles([seven, eight], edges, PHONE)
  for (const [index, at] of placed) {
    assert.ok(at.clear, `${index ? 8 : 7} found no clear spot`)
    for (const e of edges) assert.ok(gap(at, e) >= CLEAR, `${index ? 8 : 7} at ${at.key} is ${gap(at, e).toFixed(1)} px from the card edge`)
  }
})

test('a number keeps CLEAR px off an icon beside its loop (6 and the Diseño slider icon)', () => {
  const diseno = { ring: { x: 60, y: 420, width: 300, height: 56 }, n: 6, shape: 'box', pad: 3, nAt: 'tr' }
  const box = drawnBox(diseno)
  // The slider icon just right of the loop's top-right corner, where a bubble used to almost touch it.
  const icon = { x: box.x + box.width + 2, y: box.y - 26, width: 22, height: 22 }
  const at = placeBubbles([diseno], [icon], PHONE).get(0)
  assert.ok(at.clear)
  assert.ok(gap(at, icon) >= CLEAR, `6 at ${at.key} is ${gap(at, icon).toFixed(1)} px from the icon`)
})

test('a number stays off the tab bar edge (2 on the tab bar)', () => {
  // Fixed tab bar 0–56 with its bottom border; a tab row ringed 2 right under it.
  const bar = { x: 0, y: 55, width: 412, height: 1, edge: true }
  const two = { ring: { x: 16, y: 72, width: 200, height: 40 }, n: 2, shape: 'box', pad: 3 }
  const at = placeBubbles([two], [bar], PHONE).get(0)
  assert.ok(at.clear, `took ${at.key}`)
  assert.ok(gap(at, bar) >= CLEAR, `2 at ${at.key} is ${gap(at, bar).toFixed(1)} px from the tab bar edge`)
})

test('a number keeps CLEAR px off the next loop and off other numbers (2 beside box 3)', () => {
  const two = { ring: { x: 16, y: 120, width: 180, height: 44 }, n: 2, shape: 'box', pad: 4, nAt: 'br' }
  const three = { ring: { x: 16, y: 176, width: 380, height: 52 }, n: 3, shape: 'box', pad: 3 }
  const placed = placeBubbles([two, three], [], PHONE)
  const a = placed.get(0)
  const b = placed.get(1)
  assert.ok(gap(a, ringArea(three)) >= CLEAR, `2 at ${a.key} is ${gap(a, ringArea(three)).toFixed(1)} px from loop 3`)
  assert.ok(gap(b, ringArea(two)) >= CLEAR, `3 at ${b.key} is ${gap(b, ringArea(two)).toFixed(1)} px from loop 2`)
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) - 2 * HIT >= CLEAR, 'bubbles keep CLEAR px apart')
})

test("the ringed box's own border is not in the way", () => {
  const field = { x: 120, y: 300, width: 180, height: 44 }
  const own = [
    { x: field.x, y: field.y, width: field.width, height: 1, edge: true },
    { x: field.x, y: field.y + field.height - 1, width: field.width, height: 1, edge: true },
  ]
  const at = placeBubbles([{ ring: field, n: 1, shape: 'box', pad: 2 }], own, PHONE).get(0)
  assert.equal(at.key, 'tl')
  assert.ok(at.clear)
})
