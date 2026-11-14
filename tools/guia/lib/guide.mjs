/**
 * Guide sources: loading and validation.
 *
 * A guide is `<guides root>/<area>/<slug>.guide.mjs` whose default export is
 *
 *   {
 *     question: '¿Cómo …?',                  the page title, as the user asks it
 *     quien: ['cajero', 'encargado'],        roles, in the shop's words
 *     place: 'productos.etiquetas',          place key (doco manual/places.py)
 *     donde: 'Productos › Etiquetas',        where it is, as the menu reads
 *     format: 'phone' | 'desktop' | 'desktop-wide',
 *     fixture: 'catalogo-con-precio',        named demo fixture (fixtures/<name>.mjs)
 *     resumen: ['…', '…', '…'],              «En pocas palabras», 3 lines at most
 *     steps: [{
 *       text: '[[1]] Abre …',                one action; [[n]] matches mark n
 *       caption: 'Abre …',                   video caption (default: text without marks)
 *       route: '/crm/…',                     go here first (optional; may be a function of the data)
 *       ready: '[data-x]',                   wait for this before the shot
 *       busy: ['Cargando'],                  texts that must be gone before the shot (plus the guide's)
 *       action: async (w, data) => {},       walker actions (optional)
 *       after: async (w, data) => {},        the tap the text asks for, after the shot (video: under this caption)
 *       marks: [{ ring: '[aria-label=…]', n: 1 }, { note: '…', to: '…' }],
 *       settle: 450,                         ms after ready, before the shot
 *     }],
 *     ysi: [['¿Y si …?', 'respuesta'], …],    3–5 real cases
 *     asistente: '¿…?',                      what to ask the assistant
 *     help: [{ context_type, context_key }], Wiki Help Mapping rows
 *     allowEnglish: ['…'],                   words the English probe may ignore
 *     busy: ['Buscando', '…'],               in-between texts every step waits out
 *   }
 *
 * `marks`, `text`, `caption`, `route`, `ready` and `busy` may be functions of the fixture data.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const FORMATS = ['phone', 'desktop', 'desktop-wide']
export const MAX_STEPS = 8
export const MAX_RESUMEN = 3
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MARK_KEYS = new Set(['ring', 'tap', 'note', 'to', 'at', 'spot', 'n', 'shape', 'pad', 'nAt', 'tapAt', 'gap', 'shift'])
// ERPNext names a worker never reads (PLAN §2.1 writing rules).
const DOCTYPE_WORDS = /\b(Material Transfer|Salary Slip|Stock Entry|Journal Entry|Payment Entry|Purchase Invoice|Sales Invoice|Purchase Receipt|Stock Reconciliation|Item Price|Price List)\b/

/** Every problem with a guide source, as es-MX lines; empty when it is valid. */
export function validateGuide(guide, { area, slug } = {}) {
  const problems = []
  const need = (ok, text) => { if (!ok) problems.push(text) }
  if (!guide || typeof guide !== 'object') return ['la guía no exporta un objeto por defecto']
  need(SLUG.test(area || ''), `área inválida «${area}»: minúsculas, números y guiones`)
  need(SLUG.test(slug || ''), `slug inválido «${slug}»: minúsculas, números y guiones`)
  need(typeof guide.question === 'string' && /^¿.+\?$/.test(guide.question.trim()), 'question: una pregunta entre ¿ y ?')
  need(Array.isArray(guide.quien) && guide.quien.length > 0, 'quien: al menos un rol')
  need(typeof guide.place === 'string' && /^[a-z0-9_.-]+$/.test(guide.place), 'place: la clave del lugar (p. ej. productos.etiquetas)')
  need(typeof guide.donde === 'string' && guide.donde.trim().length > 0, 'donde: dónde está, como lo dice el menú')
  need(FORMATS.includes(guide.format), `format: uno de ${FORMATS.join(', ')}`)
  need(typeof guide.fixture === 'string' && SLUG.test(guide.fixture), 'fixture: el nombre de un fixture de demo')
  need(Array.isArray(guide.resumen) && guide.resumen.length >= 1 && guide.resumen.length <= MAX_RESUMEN, `resumen: de 1 a ${MAX_RESUMEN} líneas`)
  need(Array.isArray(guide.steps) && guide.steps.length >= 1 && guide.steps.length <= MAX_STEPS, `steps: de 1 a ${MAX_STEPS} pasos; más pasos piden cambiar la pantalla antes`)
  for (const [index, step] of (guide.steps || []).entries()) {
    const at = `paso ${index + 1}`
    need(typeof step.text === 'string' || typeof step.text === 'function', `${at}: falta text`)
    need(step.route || step.action, `${at}: necesita route o action`)
    if (step.route) need(typeof step.route === 'function' || (typeof step.route === 'string' && step.route.startsWith('/')), `${at}: route empieza con / (o es una función de los datos)`)
    if (typeof step.route === 'string') need(!/^\/app(\/|$)/.test(step.route), `${at}: lleva a Desk (/app); las guías van por la app`)
    if (step.action) need(typeof step.action === 'function', `${at}: action es una función (w, data)`)
    if (step.after !== undefined) need(typeof step.after === 'function', `${at}: after es una función (w, data)`)
    if (Array.isArray(step.marks)) {
      for (const mark of step.marks) {
        const unknown = Object.keys(mark).filter(key => !MARK_KEYS.has(key))
        need(!unknown.length, `${at}: marca con claves desconocidas ${unknown.join(', ')}`)
        need(mark.ring || mark.tap || mark.note || mark.spot, `${at}: una marca necesita ring, tap, note o spot`)
      }
    } else {
      need(step.marks === undefined || typeof step.marks === 'function', `${at}: marks es una lista o una función`)
    }
    if (typeof step.text === 'string') need(!DOCTYPE_WORDS.test(step.text), `${at}: usa el nombre del botón, no el del documento de ERPNext`)
  }
  if (guide.busy !== undefined) need(Array.isArray(guide.busy) && guide.busy.every(text => typeof text === 'string' && text), 'busy: lista de textos')
  if (guide.ysi !== undefined) {
    need(Array.isArray(guide.ysi) && guide.ysi.every(pair => Array.isArray(pair) && pair.length === 2), 'ysi: pares [pregunta, respuesta]')
  }
  for (const row of guide.help || []) {
    need(row && typeof row.context_type === 'string' && typeof row.context_key === 'string', 'help: filas { context_type, context_key }')
  }
  return problems
}

/** Mark numbers a step's text cites and the numbers its marks draw, to catch a [[n]] with no ring. */
export function markNumbers(text, marks) {
  const cited = [...String(text).matchAll(/\[\[(\d+)\]\]/g)].map(m => Number(m[1]))
  const drawn = (marks || []).filter(mark => mark.n != null).map(mark => Number(mark.n))
  return {
    cited,
    drawn,
    missing: cited.filter(n => !drawn.includes(n)),
    unexplained: drawn.filter(n => !cited.includes(n)),
  }
}

/** `inventario/imprimir-etiquetas` (or a path to the file) → { area, slug, file }. */
export function resolveGuide(root, id) {
  const asPath = id.endsWith('.guide.mjs') ? path.resolve(id) : path.join(root, `${id}.guide.mjs`)
  const slug = path.basename(asPath, '.guide.mjs')
  const area = path.basename(path.dirname(asPath))
  return { area, slug, file: asPath }
}

export function listGuides(root) {
  if (!fs.existsSync(root)) return []
  const out = []
  for (const area of fs.readdirSync(root).sort()) {
    const dir = path.join(root, area)
    if (!fs.statSync(dir).isDirectory()) continue
    for (const name of fs.readdirSync(dir).sort()) if (name.endsWith('.guide.mjs')) out.push(`${area}/${name.replace(/\.guide\.mjs$/, '')}`)
  }
  return out
}

export async function loadGuide(root, id) {
  const { area, slug, file } = resolveGuide(root, id)
  if (!fs.existsSync(file)) throw new Error(`no existe la guía ${file}`)
  const guide = (await import(pathToFileURL(file).href)).default
  const problems = validateGuide(guide, { area, slug })
  if (problems.length) throw new Error(`guía ${area}/${slug} inválida:\n- ${problems.join('\n- ')}`)
  return { ...guide, area, slug, file, route: `manual/${area}/${slug}` }
}

/** A value of the guide that may depend on the fixture's data. */
export const resolve = (value, data) => (typeof value === 'function' ? value(data) : value)

/** Step text without [[n]] marks; no space is left before punctuation. */
export function stripMarks(text) {
  return String(text)
    .replace(/\s*\[\[\d+\]\]\s*/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ([.,:;!?…)])/g, '$1')
    .trim()
}

/** Plain caption text: no [[n]], no markdown emphasis. */
export function plainText(text) {
  return stripMarks(text)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
