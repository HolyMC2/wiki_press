/**
 * Where each numbered bubble of a shot goes. Pure, so the rules are tested
 * without a browser; `marks.mjs` feeds it the resolved boxes and the page's
 * visible text and icons.
 *
 * A bubble sits outside its own loop, on one of the four corners (the guide's
 * `nAt` first), then beside or above/below it. It takes the first place that
 * stays on screen and clears every other loop, ripple, bubble, and the words
 * and icons on the page. When nothing is clear it takes the place that covers
 * the least, marks weighing far more than text, and only then falls back to
 * sitting on its own stroke.
 *
 * Every bubble keeps CLEAR px between its white halo and what it avoids:
 * other loops and bubbles, words, icons, and the drawn edges of cards and
 * bars (obstacles with `edge: true`, thin strips along a border or a sticky
 * bar's edge), so a number never rests on a card's border line.
 *
 * A bubble belongs to its own loop: a spot nearer another control (an
 * obstacle with `control: true`, such as a search field next to the ringed
 * box) than to its own loop is never taken, so a number cannot read as the
 * other control's.
 */

export const BUBBLE_R = 16
// The white halo around the bubble, plus air between it and what it avoids.
const HALO = 3
export const CLEAR = 4
// Loops wobble and carry a white halo: their drawn edge reaches past the box.
const STROKE_REACH = 8
const RIPPLE_R = 36 + 6

/** The loop's shape: an oval for compact targets, a box for long rows (as `paint` draws it). */
export function ringShape(mark) {
  return mark.shape || (mark.ring.width / Math.max(1, mark.ring.height) > 3.2 ? 'box' : 'oval')
}

const padBox = (box, by) => ({ x: box.x - by, y: box.y - by, width: box.width + by * 2, height: box.height + by * 2 })

/** The padded box the loop is drawn around. */
export function loopBox(mark) {
  return padBox(mark.ring, mark.pad ?? 7)
}

/** The area the drawn loop covers, stroke included. */
export function ringArea(mark) {
  return padBox(drawnBox(mark), STROKE_REACH)
}

export function tapPoint(mark) {
  return {
    x: mark.tap.x + mark.tap.width * (mark.tapAt?.[0] ?? 0.5),
    y: mark.tap.y + mark.tap.height * (mark.tapAt?.[1] ?? 0.5),
  }
}

function tapArea(mark) {
  const p = tapPoint(mark)
  return { x: p.x - RIPPLE_R, y: p.y - RIPPLE_R, width: RIPPLE_R * 2, height: RIPPLE_R * 2 }
}

/** Area of a circle's bounding square that falls inside a rect (cheap and conservative). */
function overlap(c, rect, r) {
  const left = Math.max(c.x - r, rect.x)
  const right = Math.min(c.x + r, rect.x + rect.width)
  const top = Math.max(c.y - r, rect.y)
  const bottom = Math.min(c.y + r, rect.y + rect.height)
  if (right <= left || bottom <= top) return 0
  // The square's corners are not the circle: a hit only counts if the rect comes within r of the centre.
  const nx = Math.max(rect.x, Math.min(c.x, rect.x + rect.width))
  const ny = Math.max(rect.y, Math.min(c.y, rect.y + rect.height))
  if (Math.hypot(nx - c.x, ny - c.y) >= r) return 0
  return (right - left) * (bottom - top)
}

/**
 * Candidate centres around the drawn loop `box`, preferred side first. Corner
 * bubbles touch the box's corner point from outside; side ones clear its edge.
 */
function candidates(box, prefer, hit) {
  const { x, y, width: w, height: h } = box
  const k = (hit + 1) * Math.SQRT1_2
  const side = hit + 2
  const spots = {
    tl: { x: x - k, y: y - k },
    tr: { x: x + w + k, y: y - k },
    br: { x: x + w + k, y: y + h + k },
    bl: { x: x - k, y: y + h + k },
    l: { x: x - side, y: y + h / 2 },
    r: { x: x + w + side, y: y + h / 2 },
    // Above or below an end, for rows as wide as the screen where corners fall off it.
    tli: { x: x + hit + 6, y: y - side },
    tri: { x: x + w - hit - 6, y: y - side },
    bri: { x: x + w - hit - 6, y: y + h + side },
    bli: { x: x + hit + 6, y: y + h + side },
    t: { x: x + w / 2, y: y - side },
    b: { x: x + w / 2, y: y + h + side },
  }
  const order = ['tl', 'tr', 'br', 'bl', 'l', 'r', 'tli', 'tri', 'bri', 'bli', 't', 'b']
  // A preferred corner that falls off screen gives way to its inset twin first.
  const twin = { tl: 'tli', tr: 'tri', br: 'bri', bl: 'bli' }
  const first = prefer && spots[prefer] ? [prefer, ...(twin[prefer] ? [twin[prefer]] : [])] : []
  return [...first, ...order.filter(key => !first.includes(key))].map(key => ({ key, ...spots[key] }))
}

/** The box the loop's stroke runs along (the oval's own bounds for ovals). */
export function drawnBox(mark) {
  const box = loopBox(mark)
  if (ringShape(mark) !== 'oval') return box
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const rx = (box.width / 2) * 1.1
  const ry = (box.height / 2) * 1.2
  return { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 }
}

/** On the loop's own stroke (the old placement): the last resort when nothing outside fits. */
function onStroke(mark, box) {
  if (mark.ring && ringShape(mark) === 'oval') {
    return { key: 'stroke', x: box.x + box.width / 2 - (box.width / 2) * 1.1 * 0.72, y: box.y + box.height / 2 - (box.height / 2) * 1.2 * 0.72 }
  }
  if (mark.nAt === 'tr') return { key: 'stroke', x: box.x + box.width - 2, y: box.y - 2 }
  if (mark.nAt === 'l') return { key: 'stroke', x: box.x - 2, y: box.y + box.height / 2 }
  return { key: 'stroke', x: box.x - 2, y: box.y - 2 }
}

/** Distance from a point to a rect (0 inside it). */
export function distanceTo(c, rect) {
  const dx = Math.max(rect.x - c.x, 0, c.x - (rect.x + rect.width))
  const dy = Math.max(rect.y - c.y, 0, c.y - (rect.y + rect.height))
  return Math.hypot(dx, dy)
}

const intersects = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/**
 * Controls on the page other than the mark's own: a control that overlaps
 * the ringed box (the box itself, a button inside it, the row around it) is its own.
 */
export function rivalControls(mark, obstacles) {
  const own = mark.ring || mark.tap
  if (!own) return []
  const core = { x: own.x + 1, y: own.y + 1, width: Math.max(0, own.width - 2), height: Math.max(0, own.height - 2) }
  return obstacles.filter(box => box.control && !intersects(core, box))
}

/** True when the bubble at `c` sits nearer its own loop than any rival control. */
export function ownsSpot(c, ownBox, rivals) {
  const own = distanceTo(c, ownBox)
  return rivals.every(box => distanceTo(c, box) > own)
}

const ALIAS = { l: 'l', tl: 'tl', tr: 'tr', bl: 'bl', br: 'br', r: 'r', t: 't', b: 'b' }
const DEFAULT_SIDE = 'tl'

/**
 * `marks` are resolved (ring/tap are pixel boxes). `obstacles` are boxes of
 * the page's visible words, icons, card and bar edges, and controls
 * (controls carry `control: true`, edges `edge: true`). Returns, per mark index with a number, `{ x, y, key, clear }`: the bubble centre, which side it took, and whether it
 * touches nothing.
 */
export function placeBubbles(marks, obstacles = [], { width, height, r = BUBBLE_R } = {}) {
  const hit = r + HALO
  const areas = marks.map(mark => (mark.ring ? ringArea(mark) : mark.tap ? tapArea(mark) : null))
  const placed = new Map()
  const bubbles = []
  marks.forEach((mark, index) => {
    if (mark.n == null || !(mark.ring || mark.tap)) return
    const own = areas[index]
    const others = areas.filter((area, j) => area && j !== index)
    const rivals = rivalControls(mark, obstacles)
    // The mark's own controls (the ringed box, a row around it) are not in the way; their words and icons still are.
    // Edges drawn by the ringed box itself (an input's own border) lie inside the loop and are its own too.
    const mine = mark.ring ? padBox(mark.ring, 1) : null
    const within = (box) => mine && box.x >= mine.x && box.y >= mine.y && box.x + box.width <= mine.x + mine.width && box.y + box.height <= mine.y + mine.height
    const ink = obstacles.filter(box => (box.control ? rivals.includes(box) : !(box.edge && within(box))))
    const score = (c) => {
      let marksHit = 0
      for (const area of others) marksHit += overlap(c, area, hit + CLEAR)
      for (const b of bubbles) marksHit += Math.hypot(b.x - c.x, b.y - c.y) < 2 * hit + CLEAR ? (2 * hit) ** 2 : 0
      let textHit = 0
      for (const box of ink) textHit += overlap(c, box, hit + CLEAR)
      return { marksHit, textHit, total: marksHit * 10 + textHit }
    }
    const inside = (c) => c.x - hit >= 0 && c.y - hit >= 0 && c.x + hit <= width && c.y + hit <= height
    const ownBox = mark.ring ? drawnBox(mark) : own
    const list = candidates(ownBox, ALIAS[mark.nAt] || DEFAULT_SIDE, hit).filter(c => inside(c) && ownsSpot(c, ownBox, rivals))
    let best = null
    for (const c of list) {
      const s = score(c)
      if (s.total === 0) { best = { ...c, clear: true }; break }
      if (!best || s.total < best.total) best = { ...c, total: s.total, clear: false }
    }
    if (!best || best.total > 0) {
      const box = mark.ring ? loopBox(mark) : own
      const fallback = mark.ring ? onStroke(mark, box) : { key: 'stroke', x: tapPoint(mark).x + 28, y: tapPoint(mark).y - 28 }
      fallback.x = Math.min(width - hit, Math.max(hit, fallback.x))
      fallback.y = Math.min(height - hit, Math.max(hit, fallback.y))
      const s = score(fallback)
      // The stroke spot only wins when it covers clearly less than the best outside spot.
      if (!best || s.total * 2 < best.total) best = { ...fallback, total: s.total, clear: s.total === 0 }
    }
    const out = { x: best.x, y: best.y, key: best.key, clear: best.clear }
    placed.set(index, out)
    bubbles.push(out)
  })
  return placed
}
