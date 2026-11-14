// Real names out of the site's JSON answers: node --test tools/guia/test
import test from 'node:test'
import assert from 'node:assert/strict'
import { expandPairs, rewriteText, rewriteJson, rewriteBody, isApiUrl } from '../lib/rewrite.mjs'

const PAIRS = [['Tienda Hidalgo #1', 'Tu tienda'], ['Tienda Hidalgo', 'Tu tienda'], ['Doco & Hijos', 'Tu empresa']]
const X = expandPairs(PAIRS)

test('longer names swap before the names they contain', () => {
  assert.equal(rewriteText('Tienda Hidalgo #1 y Tienda Hidalgo', X), 'Tu tienda y Tu tienda')
  assert.ok(!rewriteText('Tienda Hidalgo #1', X).includes('#1'))
})

test('a name inside a string is swapped, the rest of the string stays', () => {
  assert.equal(rewriteText('Etiquetas de Tienda Hidalgo #1, mediana', X), 'Etiquetas de Tu tienda, mediana')
})

test('nested objects and arrays: bootstrap design.shop and preview html', () => {
  const answer = {
    message: {
      design: { shop: 'Tienda Hidalgo #1', shop_max: 40, parts: [{ key: 'shop', label: 'Tienda' }] },
      layouts: [{ name: 'mediana', label: 'Mediana' }, { name: 'x', note: ['Tienda Hidalgo', 3, null, true] }],
      html: '<div data-part="shop">Tienda Hidalgo #1</div><div>Doco &amp; Hijos</div>',
    },
  }
  const out = rewriteJson(answer, X)
  assert.equal(out.message.design.shop, 'Tu tienda')
  assert.equal(out.message.design.shop_max, 40)
  assert.deepEqual(out.message.design.parts, [{ key: 'shop', label: 'Tienda' }])
  assert.deepEqual(out.message.layouts[1].note, ['Tu tienda', 3, null, true])
  assert.equal(out.message.html, '<div data-part="shop">Tu tienda</div><div>Tu empresa</div>')
  assert.equal(answer.message.design.shop, 'Tienda Hidalgo #1', 'the original answer is not mutated')
})

test('names used as object keys are swapped too', () => {
  assert.deepEqual(rewriteJson({ 'Tienda Hidalgo': 2 }, X), { 'Tu tienda': 2 })
})

test('HTML-escaped forms of a name (html.escape quotes) are swapped', () => {
  const x = expandPairs([["Lupita's", 'Tu tienda']])
  assert.equal(rewriteText('<b>Lupita&#x27;s</b> <i>Lupita&#39;s</i>', x), '<b>Tu tienda</b> <i>Tu tienda</i>')
})

test('a body: rewritten JSON, null when untouched or not JSON', () => {
  const body = JSON.stringify({ message: { design: { shop: 'Tienda Hidalgo #1' } } })
  assert.deepEqual(JSON.parse(rewriteBody(body, X)), { message: { design: { shop: 'Tu tienda' } } })
  assert.equal(rewriteBody(JSON.stringify({ message: { ok: 1 } }), X), null)
  assert.equal(rewriteBody('<html>Tienda Hidalgo</html>', X), null)
  assert.equal(rewriteBody(body, []), null)
})

test('a body that writes the name with \\u escapes is still caught', () => {
  const x = expandPairs([['Tienda Él', 'Tu tienda']])
  const body = '{"message":{"shop":"Tienda \\u00c9l"}}'
  assert.deepEqual(JSON.parse(rewriteBody(body, x)), { message: { shop: 'Tu tienda' } })
})

test('empty and self pairs are dropped', () => {
  assert.deepEqual(expandPairs([['', 'x'], ['Tu tienda', 'Tu tienda']]), [])
})

test('only the site\'s own /api/ answers are rewritten', () => {
  const base = 'https://lab.example.test'
  assert.ok(isApiUrl('https://lab.example.test/api/method/doco.workspaces.labels.preview', base))
  assert.ok(!isApiUrl('https://lab.example.test/assets/crm/app.js', base))
  assert.ok(!isApiUrl('https://other.example.test/api/method/x', base))
})
