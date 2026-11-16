/**
 * Ported from scanner_kit frontend/manual/kit/marks.mjs; keep the two in step.
 *
 * Drawing over a live screen: what a trainer would draw on a printed
 * screenshot with a marker.
 *
 *   { ring: target, n: 1 }            a hand-drawn loop around it, with a number
 *                                     (shape: oval | box, pad, nAt: the side the
 *                                     number tries first: tl tr br bl l r t b)
 *   { tap: target }                   a finger-press ripple on it
 *   { note: 'Toca aquí', to: target } a label with a curved arrow to it
 *   { note: '…', at: { x: .5, y: .2 } }  a label alone, at a fraction of the screen
 *   { spot: [target, …] }             dims everything else
 *
 * A target is any Playwright selector (`text=Lleno`, `[data-test=stop]`), a
 * function `(tab) => Locator`, a list of targets (one loop around them all) or,
 * for `to`, a point `{ x, y }` as fractions of the screen (something inside a
 * camera picture). Boxes are read in Node and the drawing is one fixed
 * overlay, so the app underneath is never touched. Numbers sit outside their
 * loop, where they cover no other mark and no word, icon or control, and
 * never nearer another control than their own loop (bubbles.mjs).
 */

import { placeBubbles, ringShape } from './bubbles.mjs'

export const INK = '#FF5A1F'

async function boxOf(tab, target) {
  if (Array.isArray(target)) {
    const boxes = await Promise.all(target.map(one => boxOf(tab, one)))
    const x = Math.min(...boxes.map(box => box.x))
    const y = Math.min(...boxes.map(box => box.y))
    return { x, y, width: Math.max(...boxes.map(box => box.x + box.width)) - x, height: Math.max(...boxes.map(box => box.y + box.height)) - y }
  }
  if (target && typeof target === 'object' && typeof target.x === 'number') {
    const { width, height } = tab.viewportSize()
    return { x: target.x * width, y: target.y * height, width: 0, height: 0 }
  }
  // Apps keep hidden copies of some controls (phone and desktop bars): mark the visible one.
  const locator = typeof target === 'function' ? target(tab) : tab.locator(target).filter({ visible: true }).first()
  const box = await locator.boundingBox({ timeout: 4000 }).catch(() => null)
  if (!box) throw new Error(`mark: nothing to draw on for ${String(target)}`)
  return box
}

/**
 * Numbers of the ring marks that do not show whole on screen (pure: tested). A
 * ring around a control scrolled out of view (below a sheet's fold, under a
 * bar) would point at nothing in the shot; its step must reveal it first.
 */
export function offscreenMarks(resolved, { width, height }, slack = 2) {
  return resolved
    .filter(mark => mark.ring && (mark.ring.y < -slack || mark.ring.x < -slack || mark.ring.y + mark.ring.height > height + slack || mark.ring.x + mark.ring.width > width + slack || !mark.ring.height))
    .map(mark => mark.n ?? '·')
}

/**
 * Draw `marks` over the page. Call `clearMarks` before the next step's actions.
 * Returns the marks as drawn (boxes in viewport pixels).
 */
export async function drawMarks(tab, marks, { seed = 7 } = {}) {
  const resolved = []
  for (const mark of marks) {
    const out = { ...mark }
    for (const key of ['ring', 'tap', 'to']) if (mark[key]) out[key] = await boxOf(tab, mark[key])
    if (mark.spot) out.spot = await Promise.all(mark.spot.map(target => boxOf(tab, target)))
    if (out.ring) out.shape = ringShape(out)
    resolved.push(out)
  }
  // Bubbles go where they cover no other mark and no word or icon on the page.
  const obstacles = resolved.some(mark => mark.n != null) ? await tab.evaluate(visibleInk) : []
  const { width, height } = tab.viewportSize()
  for (const [index, at] of placeBubbles(resolved, obstacles, { width, height })) resolved[index].bubble = at
  await tab.evaluate(paint, { marks: resolved, ink: INK, seed })
  return resolved
}

/*
 * Runs in the page: boxes of the words and icons a person sees, so bubbles
 * can stay off them. Text hidden under an overlay or clipped by a scroller
 * is left out (the topmost element at its centre must be its own).
 */
function visibleInk() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const out = []
  const onScreen = (r) => r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh
  const seen = (el, r) => {
    const x = Math.min(vw - 1, Math.max(0, r.left + r.width / 2))
    const y = Math.min(vh - 1, Math.max(0, r.top + r.height / 2))
    const top = document.elementFromPoint(x, y)
    return Boolean(top && (top === el || el.contains(top) || top.contains(el)))
  }
  const add = (r) => out.push({ x: r.left, y: r.top, width: r.width, height: r.height })
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let node
  while ((node = walk.nextNode()) && out.length < 2000) {
    if (!node.nodeValue.trim()) continue
    const parent = node.parentElement
    if (!parent || parent.closest('#manual-marks')) continue
    range.selectNodeContents(node)
    for (const r of range.getClientRects()) if (onScreen(r) && seen(parent, r)) add(r)
  }
  for (const el of document.querySelectorAll('svg, img, iframe, canvas, video, [class*="lucide-"]')) {
    if (el.closest('#manual-marks')) continue
    const r = el.getBoundingClientRect()
    if (onScreen(r) && seen(el, r)) add(r)
  }
  // Drawn edges: a card's border or shadow, the edge of a sticky or fixed bar.
  // Each becomes a thin strip so a number can sit inside a card but not on its line.
  const painted = (c) => c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c)
  const strip = (x, y, width, height) => {
    const left = Math.max(0, x)
    const top = Math.max(0, y)
    const w = Math.min(vw, x + width) - left
    const h = Math.min(vh, y + height) - top
    if (w > 0 && h > 0) out.push({ x: left, y: top, width: w, height: h, edge: true })
  }
  let edges = 0
  for (const el of document.body.querySelectorAll('*')) {
    if (edges > 600) break
    if (el.closest('#manual-marks') || el instanceof SVGElement) continue
    const r = el.getBoundingClientRect()
    if (r.width < 40 || r.height < 20 || !onScreen(r)) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'contents') continue
    const pinned = cs.position === 'fixed' || cs.position === 'sticky'
    const shadow = cs.boxShadow && cs.boxShadow !== 'none'
    const sides = [
      ['Top', () => strip(r.left, r.top, r.width, 1), r.left + r.width / 2, r.top + 0.5],
      ['Bottom', () => strip(r.left, r.bottom - 1, r.width, 1), r.left + r.width / 2, r.bottom - 0.5],
      ['Left', () => strip(r.left, r.top, 1, r.height), r.left + 0.5, r.top + r.height / 2],
      ['Right', () => strip(r.right - 1, r.top, 1, r.height), r.right - 0.5, r.top + r.height / 2],
    ]
    for (const [side, add, px, py] of sides) {
      const bordered = parseFloat(cs[`border${side}Width`]) > 0 && painted(cs[`border${side}Color`]) && cs[`border${side}Style`] !== 'none'
      const barEdge = pinned && painted(cs.backgroundColor) && (side === 'Top' || side === 'Bottom')
      if (!bordered && !shadow && !barEdge) continue
      const x = Math.min(vw - 1, Math.max(0, px))
      const y = Math.min(vh - 1, Math.max(0, py))
      const hit = document.elementFromPoint(x, y)
      if (!hit || !(hit === el || el.contains(hit))) continue
      add()
      edges += 1
    }
  }
  // Controls: a field's placeholder is no text node, and a number must not sit nearer another control than its own.
  for (const el of document.querySelectorAll('input:not([type=hidden]), textarea, select, button, a[href], [role="button"], [contenteditable="true"]')) {
    if (el.closest('#manual-marks')) continue
    const r = el.getBoundingClientRect()
    if (onScreen(r) && seen(el, r)) out.push({ x: r.left, y: r.top, width: r.width, height: r.height, control: true })
  }
  return out
}

export async function clearMarks(tab) {
  await tab.evaluate(() => document.getElementById('manual-marks')?.remove())
}

/* Runs in the page. Self-contained: nothing outside this function exists there. */
function paint({ marks, ink, seed }) {
  document.getElementById('manual-marks')?.remove()
  const vw = window.innerWidth
  const vh = window.innerHeight
  let state = seed
  const random = () => { state = (state * 16807) % 2147483647; return state / 2147483647 }
  const NS = 'http://www.w3.org/2000/svg'
  const font = getComputedStyle(document.body).fontFamily
  const root = document.createElement('div')
  root.id = 'manual-marks'
  root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('width', String(vw))
  svg.setAttribute('height', String(vh))
  svg.style.cssText = 'position:absolute;inset:0;overflow:visible'
  root.appendChild(svg)
  document.body.appendChild(root)
  const el = (tag, attrs, parent = svg) => {
    const node = document.createElementNS(NS, tag)
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
    parent.appendChild(node)
    return node
  }
  const stroke = (d, width = 4.5) => {
    el('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': width + 4.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.85 })
    el('path', { d, fill: 'none', stroke: ink, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
  }
  const pad = (box, by) => ({ x: box.x - by, y: box.y - by, width: box.width + by * 2, height: box.height + by * 2 })

  // A point on the loop around a box, t in [0, 1): an ellipse for compact
  // targets, a rounded rectangle for long rows where an ellipse would swallow the screen.
  function perimeter(box, shape) {
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    if (shape === 'oval') {
      const rx = box.width / 2 * 1.1
      const ry = box.height / 2 * 1.2
      return (t) => {
        const angle = -Math.PI * 0.62 + t * Math.PI * 2
        return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry, nx: Math.cos(angle), ny: Math.sin(angle) }
      }
    }
    const r = Math.min(18, box.height / 2, box.width / 2)
    const w = box.width - 2 * r
    const h = box.height - 2 * r
    const arc = (Math.PI / 2) * r
    const total = 2 * w + 2 * h + 4 * arc
    const segments = [
      ['line', box.x + r, box.y, 1, 0, w, 0, -1], ['arc', box.x + box.width - r, box.y + r, -Math.PI / 2],
      ['line', box.x + box.width, box.y + r, 0, 1, h, 1, 0], ['arc', box.x + box.width - r, box.y + box.height - r, 0],
      ['line', box.x + box.width - r, box.y + box.height, -1, 0, w, 0, 1], ['arc', box.x + r, box.y + box.height - r, Math.PI / 2],
      ['line', box.x, box.y + box.height - r, 0, -1, h, -1, 0], ['arc', box.x + r, box.y + r, Math.PI],
    ]
    return (t) => {
      let d = ((t % 1) + 1) % 1 * total
      for (const seg of segments) {
        if (seg[0] === 'line') {
          const [, x, y, dx, dy, len, nx, ny] = seg
          if (d <= len) return { x: x + dx * d, y: y + dy * d, nx, ny }
          d -= len
        } else {
          const [, x, y, start] = seg
          if (d <= arc) {
            const angle = start + d / r
            return { x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r, nx: Math.cos(angle), ny: Math.sin(angle) }
          }
          d -= arc
        }
      }
      return { x: box.x + r, y: box.y, nx: 0, ny: -1 }
    }
  }

  // Marker strokes wobble a little and overshoot where they started.
  function loop(box, shape) {
    const at = perimeter(box, shape)
    const phase = random() * Math.PI * 2
    const start = shape === 'oval' ? 0 : 0.03
    const points = []
    const steps = 96
    for (let i = 0; i <= steps; i += 1) {
      const t = start + (i / steps) * 1.05
      const p = at(t)
      const wobble = Math.sin(t * Math.PI * 4 + phase) * 1.6 + (i / steps) * 3
      points.push(`${(p.x + p.nx * wobble).toFixed(1)},${(p.y + p.ny * wobble).toFixed(1)}`)
    }
    return `M${points.join(' L')}`
  }

  const spots = marks.filter(mark => mark.spot)
  if (spots.length) {
    const defs = el('defs', {})
    const mask = el('mask', { id: 'manual-spot' }, defs)
    el('rect', { x: 0, y: 0, width: vw, height: vh, fill: '#fff' }, mask)
    for (const mark of spots) for (const box of mark.spot) {
      const hole = pad(box, 8)
      el('rect', { x: hole.x, y: hole.y, width: hole.width, height: hole.height, rx: 16, fill: '#000' }, mask)
    }
    el('rect', { x: 0, y: 0, width: vw, height: vh, fill: 'rgba(12,12,16,.52)', mask: 'url(#manual-spot)' })
  }

  const badge = (x, y, n) => {
    const cx = Math.min(vw - 18, Math.max(18, x))
    const cy = Math.min(vh - 18, Math.max(18, y))
    el('circle', { cx, cy, r: 16, fill: ink, stroke: '#fff', 'stroke-width': 3 })
    const label = el('text', { x: cx, y: cy + 0.5, fill: '#fff', 'font-size': 18, 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': font })
    label.textContent = String(n)
  }

  // Bubbles are drawn after every loop and ripple, so no stroke crosses a number.
  const bubbles = []
  for (const mark of marks) {
    if (mark.ring) {
      const shape = mark.shape || (mark.ring.width / Math.max(1, mark.ring.height) > 3.2 ? 'box' : 'oval')
      const box = pad(mark.ring, mark.pad ?? 7)
      stroke(loop(box, shape))
      if (mark.n != null && mark.bubble) bubbles.push([mark.bubble.x, mark.bubble.y, mark.n])
    }
    if (mark.tap) {
      const x = mark.tap.x + mark.tap.width * (mark.tapAt?.[0] ?? 0.5)
      const y = mark.tap.y + mark.tap.height * (mark.tapAt?.[1] ?? 0.5)
      // A press ripple: hollow, so the word under the finger stays readable.
      for (const [r, opacity] of [[24, 1], [36, 0.45]]) {
        el('circle', { cx: x, cy: y, r, fill: 'none', stroke: '#fff', 'stroke-width': 7, opacity: 0.8 * opacity })
        el('circle', { cx: x, cy: y, r, fill: 'none', stroke: ink, 'stroke-width': 3.5, opacity })
      }
      if (mark.n != null) bubbles.push([mark.bubble?.x ?? x + 28, mark.bubble?.y ?? y - 28, mark.n])
    }
  }
  for (const [x, y, n] of bubbles) badge(x, y, n)

  for (const mark of marks) {
    if (!mark.note) continue
    const note = document.createElement('div')
    note.textContent = mark.note
    note.style.cssText = [
      'position:absolute', `max-width:${Math.min(250, vw - 40)}px`, `background:${ink}`, 'color:#fff', `font-family:${font}`,
      'font-size:16px', 'line-height:1.25', 'font-weight:700', 'padding:9px 13px', 'border-radius:14px',
      'box-shadow:0 0 0 3px #fff, 0 8px 22px rgba(0,0,0,.28)', 'text-wrap:balance',
    ].join(';')
    root.appendChild(note)
    const w = note.offsetWidth
    const h = note.offsetHeight
    const target = mark.to
    let x
    let y
    if (mark.at && typeof mark.at === 'object') {
      x = mark.at.x * vw - w / 2
      y = mark.at.y * vh - h / 2
    } else if (target) {
      const side = mark.at || (target.y + target.height / 2 > vh * 0.55 ? 'above' : 'below')
      const gap = mark.gap ?? 64
      const midX = target.x + target.width / 2 + (mark.shift ?? 0)
      if (side === 'above') { x = midX - w / 2; y = target.y - gap - h }
      if (side === 'below') { x = midX - w / 2; y = target.y + target.height + gap }
      if (side === 'left') { x = target.x - gap - w; y = target.y + target.height / 2 - h / 2 }
      if (side === 'right') { x = target.x + target.width + gap; y = target.y + target.height / 2 - h / 2 }
    }
    x = Math.min(vw - w - 14, Math.max(14, x))
    y = Math.min(vh - h - 14, Math.max(14, y))
    note.style.left = `${x}px`
    note.style.top = `${y}px`
    if (!target) continue
    // From the note's nearest edge to just outside the target, bowed like a hand-drawn arrow.
    const tx = Math.min(Math.max(x + w / 2, target.x + 10), target.x + target.width - 10)
    const ty = Math.min(Math.max(y + h / 2, target.y), target.y + target.height)
    const sx = Math.min(Math.max(tx, x + 18), x + w - 18)
    const startY = ty < y ? y - 4 : ty > y + h ? y + h + 4 : y + h / 2
    const startX = ty >= y && ty <= y + h ? (tx < x ? x - 4 : x + w + 4) : sx
    const endY = ty < startY ? target.y + target.height + 10 : target.y - 10
    const dx = tx - startX
    const dy = endY - startY
    const length = Math.hypot(dx, dy) || 1
    const bend = Math.min(60, length * 0.28) * (dx >= 0 ? 1 : -1)
    const qx = (startX + tx) / 2 - (dy / length) * bend
    const qy = (startY + endY) / 2 + (dx / length) * bend
    stroke(`M${startX},${startY} Q${qx},${qy} ${tx},${endY}`, 4)
    const angle = Math.atan2(endY - qy, tx - qx)
    const head = (offset) => `${tx - Math.cos(angle + offset) * 16},${endY - Math.sin(angle + offset) * 16}`
    stroke(`M${head(0.5)} L${tx},${endY} L${head(-0.5)}`, 4)
  }
}
