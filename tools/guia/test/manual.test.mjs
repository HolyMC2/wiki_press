import test from 'node:test'
import assert from 'node:assert/strict'
import { validateGuide, NIVELES } from '../lib/guide.mjs'
import { cardText, cardAudience, cardKey, fotoName, renderCard } from '../lib/card.mjs'
import { AUDIENCIAS, chapters, manualProblems, validateManual, manualHtml, rich } from '../lib/manual.mjs'
import { methodOf, requestParams } from '../lib/rewrite.mjs'
import { walkBase } from '../lib/session.mjs'
import { demo, day } from '../fixtures/banco-demo.mjs'

const step = (text, extra = {}) => ({ text, route: '/crm/x', ...extra })
const guide = (over = {}) => ({
  question: '¿Por qué no me cuadra el banco?',
  quien: ['dueño', 'encargado', 'contador'],
  place: 'bancos',
  donde: 'Bancos',
  format: 'phone',
  fixture: 'banco-demo',
  resumen: ['Una.', 'Dos.'],
  steps: [step('[[1]] Toca **Bancos**.')],
  manual: 'bancos',
  nivel: 3,
  area: 'bancos',
  slug: 'por-que-no-cuadra',
  ...over,
})

test('levels are the four of PLAN §12.3', () => {
  assert.deepEqual(Object.values(NIVELES), ['Lo básico', 'El día a día', 'Cuando algo sale mal', 'Para el encargado o dueño'])
})

test('a guide names its manual and level together, 1 to 4', () => {
  assert.deepEqual(validateGuide(guide(), { area: 'bancos', slug: 'x' }), [])
  assert.ok(validateGuide(guide({ nivel: 5 }), { area: 'bancos', slug: 'x' }).some(p => p.startsWith('nivel')))
  assert.ok(validateGuide(guide({ manual: undefined }), { area: 'bancos', slug: 'x' }).some(p => p.includes('van juntos')))
  assert.ok(validateGuide(guide({ tecnico: 'no-path' }), { area: 'bancos', slug: 'x' }).some(p => p.startsWith('tecnico')))
})

test('a step may go on from the screen the previous step opened', () => {
  const steps = [step('[[1]] a', { after: async () => {} }), { text: '[[2]] b' }]
  assert.deepEqual(validateGuide(guide({ steps }), { area: 'bancos', slug: 'x' }), [])
  const stuck = [step('[[1]] a'), { text: '[[2]] b' }]
  assert.ok(validateGuide(guide({ steps: stuck }), { area: 'bancos', slug: 'x' }).some(p => p.includes('paso 2')))
})

test('card text keeps bold, numbers the marks and escapes the rest', () => {
  assert.equal(cardText('[[2]] Toca **Ligar** <ya>'), '② Toca <strong>Ligar</strong> &lt;ya&gt;')
  assert.equal(rich('[[3]] **A**'), '<span class="n">3</span> <strong>A</strong>')
})

test('card readers are doco puestos; contador is nobody on the team list', () => {
  assert.deepEqual(cardAudience(['dueño', 'encargado', 'contador']), ['Dueño', 'Encargado'])
  assert.deepEqual(cardAudience(['vendedor', 'mostrador', 'cajero']), ['Cajero'])
  assert.deepEqual(cardAudience(['contador']), [])
})

test('a card has a doco key, a picture per step and its manual as group', () => {
  const g = guide({ steps: [step('[[1]] a'), step('[[2]] b')], ysi: [['¿Y si…?', 'Así.']], asistente: '¿Cuadra?' })
  const shots = [{ text: '[[1]] Toca **A**.', caption: 'Toca A', image: 'x-01.png' }, { text: '[[2]] B.', caption: 'B', image: 'x-02.png' }]
  const card = renderCard(g, { shots, manual: { titulo: 'Bancos' } })
  assert.equal(card.key, 'guia.bancos.por_que_no_cuadra')
  assert.equal(cardKey(g), card.key)
  assert.deepEqual(card.fotos, ['guia-bancos-por-que-no-cuadra-01', 'guia-bancos-por-que-no-cuadra-02'])
  assert.ok(card.fotos.every(name => /^[a-z0-9-]+$/.test(name)))
  assert.equal(fotoName(g, 0), card.fotos[0])
  assert.equal(card.category, 'Bancos')
  assert.equal(card.order, 300)
  assert.deepEqual(card.audience, ['Dueño', 'Encargado'])
  assert.equal((card.body.match(/src="foto:/g) || []).length, 2)
  assert.match(card.body, /Nivel 3 · Cuando algo sale mal/)
  assert.match(card.body, /① Toca <strong>A<\/strong>/)
  assert.match(card.body, /¿Y si…\?/)
  assert.match(card.body, /📱 En Muelle/)
  assert.doesNotMatch(card.body, /undefined/)
})

const index = {
  manual: 'bancos',
  titulo: 'Bancos',
  para_que: 'Para qué.',
  niveles: {
    1: { aprendes: 'Uno.', guias: ['bancos/a'] },
    3: { aprendes: 'Tres.', guias: ['bancos/c', 'bancos/t'] },
    4: { aprendes: 'Cuatro.', guias: ['bancos/d'] },
  },
}
const guides = {
  'bancos/a': guide({ slug: 'a', nivel: 1, question: '¿A?' }),
  'bancos/c': guide({ slug: 'c', nivel: 3, question: '¿C?' }),
  'bancos/t': guide({ slug: 't', nivel: 3, question: '¿T?', quien: ['cajero'] }),
  'bancos/d': guide({ slug: 'd', nivel: 4, question: '¿D?' }),
}

test('a manual index is checked and must agree with its guides', () => {
  assert.deepEqual(validateManual(index, 'bancos'), [])
  assert.ok(validateManual({ ...index, niveles: { 7: { aprendes: 'x', guias: [] } } }, 'bancos').some(p => p.includes('nivel 7')))
  assert.deepEqual(manualProblems(index, guides), [])
  const moved = { ...guides, 'bancos/c': guide({ slug: 'c', nivel: 2 }) }
  assert.equal(manualProblems(index, moved).length, 1)
})

test('each audience reads its guides, lowest level first; the team stops at level 3', () => {
  const owner = chapters(index, guides, 'dueno')
  assert.deepEqual(owner.map(ch => [ch.nivel, ch.guias.map(g => g.slug)]), [[1, ['a']], [3, ['c']], [4, ['d']]])
  const team = chapters(index, guides, 'equipo')
  assert.deepEqual(team.map(ch => [ch.nivel, ch.guias.map(g => g.slug)]), [[3, ['t']]])
  assert.equal(AUDIENCIAS.equipo.hasta, 3)
  assert.throws(() => chapters(index, guides, 'nadie'))
})

test('the manual opens each level once, and only support reads «Para soporte»', () => {
  const g = (slug, nivel) => guide({ slug, nivel, question: `¿${slug}?`, soporte: ['Pregunta la cuenta.'], ysi: [['¿Y si?', 'Así.']] })
  const list = [{ nivel: 3, nombre: NIVELES[3], aprendes: 'Tres.', guias: [g('c', 3), g('e', 3)] }]
  const shots = { 'bancos/c': [{ text: '[[1]] a', image: 'c-01.png' }], 'bancos/e': [{ text: '[[1]] a', image: 'e-01.png' }, { text: 'b', image: 'e-02.png' }] }
  const img = (id, image) => `file:///x/${image}`
  const owner = manualHtml(index, list, { audiencia: 'dueno', shots, img })
  assert.equal((owner.match(/class="banda"/g) || []).length, 1)
  assert.equal((owner.match(/class="nivel-tag"/g) || []).length, 1)
  assert.doesNotMatch(owner, /Para soporte/)
  // One step: the cases go in the cell beside it; two steps: below.
  assert.equal((owner.match(/class="paso extra"/g) || []).length, 1)
  assert.match(owner, /Los nombres y las cantidades son de ejemplo/)
  assert.doesNotMatch(owner, /undefined/)
  assert.match(manualHtml(index, list, { audiencia: 'soporte', shots, img }), /Para soporte/)
})

test('the bank demo adds up: bank − books is the sum of the reasons', () => {
  const now = new Date('2026-11-16T20:00:00Z')
  const d = demo(now)
  const c = d.cuadre
  assert.equal(Math.round((c.bank - c.books) * 100), Math.round(c.difference * 100))
  assert.equal(Math.round(c.lines.reduce((sum, line) => sum + line.effect, 0) * 100), Math.round(c.difference * 100))
  assert.equal(Math.round((c.opening.bank - c.opening.books) * 100), Math.round(c.lines.find(l => l.key === 'antes').effect * 100))
  assert.equal(c.pairs.length, c.pairs_total)
  const cheques = d.cards.find(card => card.cuenta === d.CHEQUES)
  assert.equal(cheques.diferencia, c.difference)
  assert.equal(d.sinBanco.length, c.lines.find(l => l.key === 'solo_libros').count)
  assert.equal(day(0, now), '2026-11-16')
  assert.equal(day(1, now), '2026-11-15')
})

test('demo answers find the method and its arguments, JSON or form', () => {
  assert.equal(methodOf('http://localhost:5199/api/method/crm.api.bancos.cuenta?x=1'), 'crm.api.bancos.cuenta')
  assert.equal(methodOf('http://localhost:5199/api/resource/Item'), '')
  assert.deepEqual(requestParams('http://h/api/method/m?a=1', '{"cuenta":"C"}', 'application/json'), { a: '1', cuenta: 'C' })
  assert.deepEqual(requestParams('http://h/api/method/m', 'cuenta=C&vista=libros', 'application/x-www-form-urlencoded'), { cuenta: 'C', vista: 'libros' })
})

test('a guide walks a lab site or a local preview, never another host', () => {
  const secret = { base: 'https://doco-mirror.lab.example.com' }
  assert.deepEqual(walkBase(secret, { base: 'http://localhost:5199/crm' }), { base: 'http://localhost:5199', label: 'vista previa localhost:5199' })
  assert.throws(() => walkBase(secret, { base: 'https://prod.example.com' }))
  assert.equal(walkBase(secret, { site: 'lab' }).base, 'https://lab.lab.example.com')
})
