// Pure parts of the guide tool: node --test tools/guia/test
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { validateGuide, markNumbers, plainText, stripMarks, resolveGuide, loadGuide, listGuides } from '../lib/guide.mjs'
import { englishWords, classify } from '../lib/probes.mjs'
import { badges, pageMarkdown, helpRows, playbookStub, mergePlaybook, playbookMarker, manifestEntry } from '../lib/render.mjs'
import { parseEnv, siteBase, checkSite } from '../lib/session.mjs'
import { layout, filterGraph, CANVAS } from '../lib/video.mjs'
import { defectsMarkdown, shotTime } from '../lib/critique.mjs'
import { DEFAULT_GUIDES } from '../lib/paths.mjs'

const GOOD = {
  question: '¿Cómo hago algo?',
  quien: ['cajero'],
  place: 'productos.etiquetas',
  donde: 'Productos › Etiquetas',
  format: 'phone',
  fixture: 'catalogo-con-precio',
  resumen: ['Uno.', 'Dos.'],
  steps: [{ text: '[[1]] Toca **Etiquetas**.', route: '/crm/productos', marks: [{ ring: 'a', n: 1 }] }],
  ysi: [['¿Y si no sale?', 'Revisa la impresora.']],
  asistente: '¿Dónde imprimo?',
  help: [{ context_type: 'DocType', context_key: 'Item' }, { context_type: 'SPA Route', context_key: '/crm/productos' }],
}
const AT = { area: 'inventario', slug: 'algo' }

test('a complete guide is valid', () => {
  assert.deepEqual(validateGuide(GOOD, AT), [])
})

test('the validator refuses Desk, doctype names, too many steps and bad marks', () => {
  const steps = Array.from({ length: 9 }, () => ({ text: 'x', route: '/crm' }))
  assert.ok(validateGuide({ ...GOOD, steps }, AT).some(p => p.includes('de 1 a 8 pasos')))
  assert.ok(validateGuide({ ...GOOD, steps: [{ text: 'x', route: '/app/item' }] }, AT).some(p => p.includes('Desk')))
  assert.ok(validateGuide({ ...GOOD, steps: [{ text: 'Crea un Stock Entry', route: '/crm' }] }, AT).some(p => p.includes('ERPNext')))
  assert.ok(validateGuide({ ...GOOD, steps: [{ text: 'x', route: '/crm', marks: [{ circle: 'a' }] }] }, AT).some(p => p.includes('claves desconocidas')))
  assert.ok(validateGuide({ ...GOOD, question: 'Cómo hago algo' }, AT).some(p => p.startsWith('question')))
  assert.ok(validateGuide(GOOD, { area: 'Inventario', slug: 'x' }).some(p => p.startsWith('área')))
})

test('mark numbers: cited without a ring, drawn without a citation', () => {
  const found = markNumbers('[[1]] y [[2]]', [{ ring: 'a', n: 1 }, { ring: 'b', n: 3 }, { note: 'x' }])
  assert.deepEqual(found.missing, [2])
  assert.deepEqual(found.unexplained, [3])
})

test('plain caption text drops marks and emphasis', () => {
  assert.equal(plainText('[[1]] Toca **Imprimir**  ya'), 'Toca Imprimir ya')
})

test('a mark mid-sentence leaves no space before punctuation', () => {
  assert.equal(stripMarks('Toca el producto en la lista [[3]].'), 'Toca el producto en la lista.')
  assert.equal(stripMarks('Así sale tu etiqueta [[5]]: nombre y precio. En **Diseño** [[6]] cambias'), 'Así sale tu etiqueta: nombre y precio. En **Diseño** cambias')
  assert.equal(plainText('Con **−** y **+** [[4]] eliges'), 'Con − y + eliges')
})

test('playbook steps carry no stray space from marks', () => {
  const md = playbookStub({ ...GOOD, ...AT, steps: [{ text: 'Toca el producto en la lista [[3]].' }] }, { images: [], video: null })
  assert.match(md, /1\. Toca el producto en la lista\.\n/)
})

test('shot time shows in the shop time zone, not UTC', () => {
  const shown = shotTime('2026-11-13T19:04:12.301Z')
  assert.doesNotMatch(shown, /Z|T19/)
  assert.match(shown, /12:04/)
  assert.equal(shotTime('x'), 'x')
})

test('guide ids resolve to area and slug', () => {
  const found = resolveGuide('/g', 'inventario/imprimir-etiquetas')
  assert.equal(found.area, 'inventario')
  assert.equal(found.slug, 'imprimir-etiquetas')
  assert.equal(found.file, path.join('/g', 'inventario/imprimir-etiquetas.guide.mjs'))
})

test('every committed guide loads and validates', async () => {
  const ids = listGuides(DEFAULT_GUIDES)
  assert.ok(ids.length >= 1)
  for (const id of ids) {
    const guide = await loadGuide(DEFAULT_GUIDES, id)
    assert.equal(guide.route, `manual/${id}`)
  }
})

test('English words are found, Spanish homographs are not', () => {
  assert.deepEqual(englishWords('Release hold'), ['Release', 'hold'])
  assert.deepEqual(englishWords('Pay from'), ['Pay', 'from'])
  assert.deepEqual(englishWords('Total $150 · No hay error'), [])
  assert.deepEqual(englishWords('Imprimir 2 etiquetas'), [])
  assert.deepEqual(englishWords('Print labels', ['Print']), [])
  // Inside a Spanish word is not a match.
  assert.deepEqual(englishWords('Theodoro andando'), [])
})

test('classify: toasts, Desk, cut text, overflow and skeletons block; page notes do not', () => {
  const defects = classify({
    path: '/app/item', toasts: ['Sin conexión'], alerts: ['30 de 5,104 productos'], texts: ['Save'],
    cut: ['Tienda, Nombre, Precio…', 'Nombre largo'], pageOverflow: 12, brokenImages: ['/x.png'], skeletons: 2, errors: ['console: x'],
  }, { allowCut: ['Nombre largo'] })
  const kinds = defects.map(d => `${d.kind}:${d.blocks}`)
  assert.deepEqual(kinds, ['desk:true', 'aviso:true', 'alerta:false', 'ingles:true', 'cortado:true', 'desborde:true', 'imagen:true', 'cargando:true', 'consola:false'])
})

test('badges turn [[n]] into the orange badge', () => {
  assert.match(badges('[[3]] Toca'), /background:#FF5A1F[^>]*>3<\/span> Toca/)
})

test('the page follows the template: who, summary, steps with shots, y si, asistente', () => {
  const guide = { ...GOOD, ...AT, route: 'manual/inventario/algo' }
  const md = pageMarkdown(guide, { images: ['inventario-algo-01.png'], video: 'inventario-algo.mp4', poster: 'inventario-algo-video.png' })
  assert.ok(md.startsWith('Para: cajero · Dónde: Productos › Etiquetas'))
  assert.match(md, /\*\*En pocas palabras\*\*\n\nUno\.  \nDos\./)
  assert.match(md, /<video [^>]*poster="\/files\/inventario-algo-video\.png" src="\/files\/inventario-algo\.mp4"/)
  assert.match(md, /\*\*1\.\*\* <span[^>]*>1<\/span> Toca \*\*Etiquetas\*\*\./)
  assert.match(md, /src="\/files\/inventario-algo-01\.png"/)
  assert.match(md, /- ¿Y si no sale\? → Revisa la impresora\./)
  assert.match(md, /«¿Dónde imprimo\?»/)
  assert.ok(!md.includes('# ¿Cómo'), 'the wiki prints the title itself')
})

test('help rows: accepted types go to the fixture, SPA routes wait apart', () => {
  const { rows, pending } = helpRows({ ...GOOD, route: 'manual/inventario/algo' })
  assert.deepEqual(rows, [{ doctype: 'Wiki Help Mapping', context_type: 'DocType', context_key: 'Item', wiki_route: 'manual/inventario/algo', enabled: 1 }])
  assert.equal(pending[0].context_type, 'SPA Route')
})

test('playbook stub carries the marker and keeps the hand-written part', () => {
  const guide = { ...GOOD, ...AT, route: 'manual/inventario/algo' }
  const stub = playbookStub(guide, { images: ['a.png'], video: null })
  assert.ok(stub.startsWith(playbookMarker(guide)))
  assert.equal(playbookMarker(guide), '<!-- guia: manual/inventario/algo -->')
  assert.match(stub, /1\. Toca \*\*Etiquetas\*\*\./)
  const edited = `${stub}Pregunta primero qué impresora tiene.\n`
  const regenerated = mergePlaybook(playbookStub({ ...guide, resumen: ['Nuevo.'] }, { images: [], video: null }), edited)
  assert.match(regenerated, /Nuevo\./)
  assert.match(regenerated, /Pregunta primero qué impresora tiene\./)
})

test('manifest entry names the route, media and place', () => {
  const entry = manifestEntry({ ...GOOD, ...AT, route: 'manual/inventario/algo' }, { images: ['a.png'], video: 'v.mp4', poster: 'p.png', order: 3 })
  assert.equal(entry.route, 'manual/inventario/algo')
  assert.equal(entry.title, GOOD.question)
  assert.equal(entry.markdown, 'algo.md')
  assert.equal(entry.order, 3)
})

test('secret parsing and lab site URLs', () => {
  const env = parseEnv('CRM_BASE_URL="https://a.lab.example.test/"\nexport CRM_TEST_USER=bot\n# c\n')
  assert.equal(env.CRM_BASE_URL, 'https://a.lab.example.test/')
  assert.equal(env.CRM_TEST_USER, 'bot')
  assert.equal(siteBase(env.CRM_BASE_URL, 'doco-mirror'), 'https://doco-mirror.lab.example.test')
  assert.equal(siteBase(env.CRM_BASE_URL, ''), 'https://a.lab.example.test')
  assert.throws(() => siteBase(env.CRM_BASE_URL, 'x.y'))
  assert.throws(() => checkSite('https://mumu-mirror.lab.example.test'), /cuarentena/)
  assert.equal(checkSite('https://doco-mirror.lab.example.test'), 'doco-mirror')
})

test('video layout fits the whole screen in the 1080×1920 canvas with even sides', () => {
  const L = layout([866, 1470])
  assert.equal(L.W, CANVAS[0])
  assert.ok(L.x >= 0 && L.x + L.w <= L.W)
  assert.ok(L.y >= L.band && L.y + L.h <= L.H - L.caption)
  for (const n of [L.x, L.y, L.w, L.h]) assert.equal(n % 2, 0)
})

test('the filter graph shows each caption until the next step and the cards at both ends', () => {
  const graph = filterGraph(layout([866, 1470]), [{ start: 0 }, { start: 5 }], 10)
  assert.match(graph, /\[b0\]\[5:v\]overlay=0:0:enable='between\(t,2\.500,7\.500\)'\[b1\]/)
  assert.match(graph, /\[b1\]\[6:v\]overlay=0:0:enable='between\(t,7\.500,12\.500\)'\[b2\]/)
  assert.match(graph, /\[b2\]\[3:v\]overlay=0:0:enable='lt\(t,2\.5\)'/)
  assert.match(graph, /enable='gte\(t,12\.500\)'/)
})

test('DEFECTS.md says what blocks and lists each step', () => {
  const md = defectsMarkdown({ ...GOOD, ...AT }, {
    site: 'lab', format: 'phone', shotAt: 'x', failed: null,
    shots: [{ step: 1, image: 'a.png', path: '/crm', defects: [{ kind: 'aviso', blocks: true, text: 'toast' }] }, { step: 2, image: 'b.png', path: '/crm', defects: [] }],
  })
  assert.match(md, /\*\*Bloquea publicar: 1\.\*\*/)
  assert.match(md, /- \*\*bloquea\*\* · aviso: toast/)
  assert.match(md, /## Paso 2[^\n]*\n\nSin hallazgos/)
})
