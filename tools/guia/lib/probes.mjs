/**
 * DOM probes taken on every shot, before the marks are drawn, and the rules
 * that turn them into defects (PLAN §2.2: what blocks publishing).
 *
 * `collectProbes(page)` gathers raw facts from every frame; `classify` is
 * pure so the rules are tested without a browser.
 */

// Words that only appear in English UI copy. Spanish homographs (Total, No,
// Error, Normal, Global, Final) are left out on purpose.
export const ENGLISH = [
  'the', 'and', 'with', 'your', 'you', 'from', 'this', 'please',
  'Save', 'Cancel', 'Print', 'New', 'Pay', 'Submit', 'Delete', 'Edit', 'Search', 'Loading', 'Settings',
  'Add', 'Remove', 'Close', 'Back', 'Next', 'Previous', 'Price', 'Item', 'Items', 'Label', 'Labels',
  'Release', 'hold', 'Upload', 'Download', 'Select', 'Apply', 'Discard', 'Open', 'Show', 'Hide', 'More',
  'Less', 'Yes', 'View', 'Clear', 'Filter', 'Sort', 'Refresh', 'Retry', 'Draft', 'Cancelled', 'Paid',
  'Unpaid', 'Overdue', 'Pending', 'Submitted', 'Customer', 'Supplier', 'Invoice', 'Payment', 'Amount',
  'Quantity', 'Date', 'Status', 'Name', 'Description', 'Something', 'went', 'wrong', 'Not', 'found',
  'Today', 'Yesterday', 'Week', 'Month', 'Help', 'Login', 'Logout', 'Sign', 'Welcome', 'Stock', 'Warehouse',
]
const ENGLISH_RE = new RegExp(`(^|[^\\p{L}])(${ENGLISH.join('|')})(?=$|[^\\p{L}])`, 'u')

/** English words in a visible string, minus the guide's allow list. */
export function englishWords(text, allow = []) {
  const found = []
  const re = new RegExp(ENGLISH_RE.source, 'gu')
  for (const m of String(text).matchAll(re)) {
    const word = m[2]
    if (!allow.includes(word) && !found.includes(word)) found.push(word)
  }
  return found
}

/**
 * Raw facts → defects. Each defect is { kind, blocks, text }: `blocks` true
 * stops publishing (`guia critique` exits 1).
 */
export function classify(raw, { allowEnglish = [], allowCut = [] } = {}) {
  const defects = []
  const add = (kind, blocks, text) => defects.push({ kind, blocks, text })
  if (/^\/app(\/|$)/.test(raw.path || '')) add('desk', true, `la pantalla es Desk (${raw.path}); las guías van por la app`)
  for (const toast of raw.toasts || []) add('aviso', true, `aviso flotante en pantalla: «${toast}»`)
  for (const text of raw.alerts || []) add('alerta', false, `mensaje en la página: «${text}»`)
  for (const text of raw.texts || []) {
    const words = englishWords(text, allowEnglish)
    if (words.length) add('ingles', true, `texto en inglés (${words.join(', ')}): «${text.slice(0, 90)}»`)
  }
  for (const cut of raw.cut || []) {
    if (allowCut.some(allowed => cut.includes(allowed))) continue
    add('cortado', true, `texto cortado: «${cut.slice(0, 90)}»`)
  }
  if (raw.pageOverflow > 1) add('desborde', true, `la página se sale ${raw.pageOverflow}px a lo ancho`)
  for (const src of raw.brokenImages || []) add('imagen', true, `imagen rota: ${src.slice(0, 90)}`)
  if (raw.skeletons > 0) add('cargando', true, `${raw.skeletons} bloque(s) cargando en la foto`)
  for (const error of raw.errors || []) add('consola', false, error)
  return defects
}

/** Runs in each frame: visible text, cut text, toasts, broken images, skeletons. */
function probeFrame() {
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false
    const s = getComputedStyle(el)
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05
  }
  const out = { texts: [], cut: [], toasts: [], alerts: [], brokenImages: [], skeletons: 0, pageOverflow: 0 }
  if (!document.body) return out
  const marks = document.getElementById('manual-marks')
  const walkerText = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const seenText = new Set()
  let n
  while ((n = walkerText.nextNode())) {
    const el = n.parentElement
    const text = n.nodeValue.replace(/\s+/g, ' ').trim()
    if (!el || !text || text.length < 2 || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) continue
    if (marks?.contains(el) || !visible(el)) continue
    const block = (el.closest('p,li,button,a,h1,h2,h3,h4,label,span,div,td,th') || el).innerText?.replace(/\s+/g, ' ').trim() || text
    if (!seenText.has(block)) { seenText.add(block); out.texts.push(block) }
  }
  for (const el of document.body.querySelectorAll('*')) {
    if (marks?.contains(el) || !visible(el)) continue
    const s = getComputedStyle(el)
    const own = [...el.childNodes].some(c => c.nodeType === 3 && c.nodeValue.trim())
    if (own && (s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none' && s.webkitLineClamp) &&
        (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) {
      out.cut.push(el.innerText.replace(/\s+/g, ' ').trim())
    }
    if (el.tagName === 'IMG' && el.complete && el.naturalWidth === 0 && el.getAttribute('src')) out.brokenImages.push(el.getAttribute('src'))
    if (/(^|\s)animate-pulse(\s|$)/.test(el.className?.baseVal ?? el.className ?? '') && el.getBoundingClientRect().height > 8) out.skeletons += 1
  }
  for (const el of document.body.querySelectorAll('[role=alert],[role=status],[data-sonner-toast],[class*="toast" i]')) {
    if (!visible(el)) continue
    const text = el.innerText?.replace(/\s+/g, ' ').trim()
    if (!text) continue
    // Floating: under a fixed box of its own (a toast). A status line inside a
    // dialog or bottom sheet (role=dialog, itself fixed) is part of that screen.
    let floating = false
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      if (p !== el && p.getAttribute('role') === 'dialog') break
      if (getComputedStyle(p).position === 'fixed') { floating = true; break }
    }
    ;(floating ? out.toasts : out.alerts).push(text)
  }
  const root = document.scrollingElement || document.documentElement
  out.pageOverflow = Math.max(0, root.scrollWidth - innerWidth)
  return out
}

export async function collectProbes(page) {
  const raw = { path: new URL(page.url()).pathname, texts: [], cut: [], toasts: [], alerts: [], brokenImages: [], skeletons: 0, pageOverflow: 0 }
  for (const frame of page.frames()) {
    const part = await frame.evaluate(probeFrame).catch(() => null)
    if (!part) continue
    for (const key of ['texts', 'cut', 'toasts', 'alerts', 'brokenImages']) raw[key].push(...part[key])
    raw.skeletons += part.skeletons
    if (frame === page.mainFrame()) raw.pageOverflow = part.pageOverflow
  }
  for (const key of ['texts', 'cut', 'toasts', 'alerts', 'brokenImages']) raw[key] = [...new Set(raw[key])]
  return raw
}
