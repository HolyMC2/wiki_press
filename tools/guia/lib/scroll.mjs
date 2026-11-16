/**
 * Where a step scrolls to, and how it gets there. `pickScroll` is pure (tested);
 * `measureScroll` and `glideScroll` run in the page.
 *
 * A scroll shows every target whole between the sticky header and the sticky
 * bottom bar, moves as little as it can from where the page is, and never
 * leaves a control cut by either bar (a chip half under the header): it
 * shifts to show the cut control whole or to hide it under the bar.
 *
 * When every target already shows whole between the bars (within STILL px)
 * the page stays put: no nudge to add the margin, no shift for a cut control,
 * so consecutive steps on one screen do not bob up and down.
 */

// Gap between a shown target and a bar, in CSS pixels.
export const MARGIN = 12
// A target this far under a bar still counts as showing (no scroll for it).
export const STILL = 4
// Video scrolls glide at one pace: px per ms, inside these bounds.
export const PACE = 1.2
export const MIN_GLIDE = 280
export const MAX_GLIDE = 900

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/**
 * `plan` is in the scroller's content coordinates (0 = its top):
 *   current, max                 scrollTop now and at the end
 *   band: { top, bottom }        the unobstructed part of the scroller's view (under the header, over the bottom bar)
 *   targets: [{ top, bottom }]   what must show whole
 *   controls: [{ top, bottom }]  what must not be cut by a bar
 * Returns the scrollTop to go to.
 */
export function pickScroll({ current, max, band, targets = [], controls = [], margin = MARGIN }) {
  const room = band.bottom - band.top
  if (targets.length && targets.every(t => t.top >= current + band.top - STILL && t.bottom <= current + band.bottom + STILL)) {
    return clamp(current, 0, max)
  }
  let lo = 0
  let hi = max
  if (targets.length) {
    const top = Math.min(...targets.map(t => t.top))
    const bottom = Math.max(...targets.map(t => t.bottom))
    const need = bottom - top + 2 * margin
    if (need > room) {
      // Too tall to show whole: its top goes under the header.
      lo = hi = clamp(top - margin - band.top, 0, max)
    } else {
      lo = clamp(bottom + margin - band.bottom, 0, max)
      hi = clamp(top - margin - band.top, 0, max)
      if (lo > hi) hi = lo
    }
  }
  const allowed = (s) => s >= lo - 0.5 && s <= hi + 0.5
  const fits = controls.filter(c => c.bottom - c.top < room)
  const cuts = (s) => {
    const edges = [s + band.top, s + band.bottom]
    return fits.filter(c => edges.some(e => c.top < e - 0.5 && c.bottom > e + 0.5))
  }
  const start = clamp(current, lo, hi)
  const seen = new Set()
  let best = { s: start, cut: cuts(start).length }
  let frontier = [start]
  for (let round = 0; round < 3 && best.cut; round++) {
    const next = []
    for (const s of frontier) {
      for (const c of cuts(s)) {
        // Show it whole under the header or over the bar, or tuck it fully under either.
        for (const t of [c.top - band.top - 2, c.bottom - band.top, c.bottom - band.bottom + 2, c.top - band.bottom]) {
          const k = Math.round(t * 2) / 2
          if (seen.has(k) || !allowed(k) || k < 0 || k > max) continue
          seen.add(k)
          next.push(k)
          const cut = cuts(k).length
          if (cut < best.cut || (cut === best.cut && Math.abs(k - current) < Math.abs(best.s - current))) best = { s: k, cut }
        }
      }
    }
    frontier = next
  }
  return best.s
}

/** How long a glide over `distance` px takes, in ms (0: no move). */
export function glideMs(distance) {
  const d = Math.abs(distance)
  if (d < 1) return 0
  return Math.round(clamp(d / PACE, MIN_GLIDE, MAX_GLIDE))
}

/*
 * Runs in the page: finds the scroller of `els[0]`, the bars over it, and
 * returns a plan for pickScroll. The scroller is kept on window.__guiaScroller
 * for glideScroll. Targets inside a sticky or fixed bar of their own scroller
 * never need a scroll; a whole fixed panel that scrolls inside (a bottom
 * sheet) is not such a bar: its content is revealed in its own scroller.
 */
export function measureScroll({ els }) {
  const scrollerOf = (el) => {
    for (let n = el?.parentElement; n && n !== document.body; n = n.parentElement) {
      const oy = getComputedStyle(n).overflowY
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n
    }
    return document.scrollingElement
  }
  const scroller = scrollerOf(els.find(Boolean))
  // Sticky or fixed between the element and its scroller: it does not move with the scroll.
  const pinned = (el) => {
    for (let n = el; n && n !== scroller && n !== document.body; n = n.parentElement) {
      const pos = getComputedStyle(n).position
      if (pos === 'sticky' || pos === 'fixed') return n
    }
    return null
  }
  window.__guiaScroller = scroller
  const root = scroller === document.scrollingElement
  const r = root ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect()
  const viewTop = Math.max(0, r.top)
  const viewBottom = Math.min(window.innerHeight, r.bottom)
  let headerBottom = viewTop
  let barTop = viewBottom
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('#manual-marks')) continue
    const pos = getComputedStyle(el).position
    if (pos !== 'sticky' && pos !== 'fixed') continue
    if (pos === 'sticky' && !scroller.contains(el)) continue
    const b = el.getBoundingClientRect()
    if (!b.width || !b.height || b.height > (viewBottom - viewTop) / 3) continue
    if (b.top <= viewTop + 4 && b.bottom > viewTop) headerBottom = Math.max(headerBottom, b.bottom)
    else if (b.bottom >= viewBottom - 4 && b.top < viewBottom) barTop = Math.min(barTop, b.top)
  }
  const current = scroller.scrollTop
  const toContent = (b) => ({ top: b.top - viewTop + current, bottom: b.bottom - viewTop + current })
  const targets = els.filter(el => el && !pinned(el)).map(el => toContent(el.getBoundingClientRect()))
  const controls = []
  for (const el of scroller.querySelectorAll('input:not([type=hidden]), textarea, select, button, a[href], [role="button"]')) {
    if (pinned(el)) continue
    const b = el.getBoundingClientRect()
    if (b.width && b.height) controls.push(toContent(b))
  }
  return {
    current,
    max: scroller.scrollHeight - scroller.clientHeight,
    band: { top: headerBottom - viewTop, bottom: barTop - viewTop },
    targets,
    controls,
  }
}

/* Runs in the page: move window.__guiaScroller to `top`, gliding at a steady pace for `ms` (instant when 0). */
export function glideScroll({ top, ms }) {
  const el = window.__guiaScroller || document.scrollingElement
  const from = el.scrollTop
  const keep = el.style.scrollBehavior
  el.style.scrollBehavior = 'auto'
  if (!ms) {
    el.scrollTop = top
    el.style.scrollBehavior = keep
    return Promise.resolve()
  }
  return new Promise((done) => {
    const t0 = performance.now()
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / ms)
      el.scrollTop = from + (top - from) * ease(t)
      if (t < 1) requestAnimationFrame(frame)
      else { el.style.scrollBehavior = keep; done() }
    }
    requestAnimationFrame(frame)
  })
}
