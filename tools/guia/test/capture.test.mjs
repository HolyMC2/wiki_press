// Public-media guards: list photos and the tap ring. node --test tools/guia/test
import test from 'node:test'
import assert from 'node:assert/strict'
import { uncheckedPhotos, pickListQuery } from '../fixtures/catalogo-con-precio.mjs'
import { ringEnds, RING_MS, TOUCH_SCRIPT } from '../lib/session.mjs'
import labels from '../guides/inventario/imprimir-etiquetas.guide.mjs'

const PICK = { item_code: 'IPN004134', item_name: 'Funda Brillos Universal' }
const ROW = { name: 'IPN004134', image: null }
const LOGO = { name: 'IPN000453', image: '/files/case-brillo-pop.jpg' }

test('a list row with a photo nobody checked may not reach a shot', () => {
  assert.deepEqual(uncheckedPhotos([ROW, { name: 'X', image: '' }]), [])
  assert.deepEqual(uncheckedPhotos([ROW, LOGO]), [LOGO])
  assert.deepEqual(uncheckedPhotos([ROW, LOGO], new Set(['IPN000453'])), [])
})

test('the list search is the whole name, then the code, and only with clean, few rows that include the item', async () => {
  const asked = []
  const answers = {
    'Funda Brillos Universal': [ROW, LOGO],
    IPN004134: [ROW],
  }
  const queue = async (search) => { asked.push(search); return answers[search] }
  assert.equal(await pickListQuery(PICK, queue), 'IPN004134')
  assert.deepEqual(asked, ['Funda Brillos Universal', 'IPN004134'])
  assert.equal(await pickListQuery(PICK, async () => [ROW]), 'Funda Brillos Universal')
  // The item missing, too many rows, or every row with an unchecked photo: no search.
  assert.equal(await pickListQuery(PICK, async () => [{ name: 'OTRO', image: null }]), null)
  assert.equal(await pickListQuery(PICK, async () => [ROW, ROW, ROW, ROW, ROW]), null)
  assert.equal(await pickListQuery(PICK, async () => [ROW, LOGO]), null)
  assert.equal(await pickListQuery(PICK, async () => [ROW, LOGO], { checked: new Set(['IPN000453']) }), 'Funda Brillos Universal')
})

test('the labels guide opens Productos with the list search, not the short one', () => {
  const route = labels.steps[0].route({ query: 'Funda Brillos', listQuery: 'Funda Brillos Universal' })
  assert.equal(route, '/crm/productos?q=Funda%20Brillos%20Universal')
})

test('a tap ring ends at its cap or when its control leaves or moves', () => {
  const box = { x: 10, y: 400, width: 380, height: 60 }
  assert.ok(RING_MS <= 350)
  assert.equal(ringEnds({ elapsed: 100, connected: true, from: box, to: box }), false)
  assert.equal(ringEnds({ elapsed: RING_MS, connected: true, from: box, to: box }), true)
  assert.equal(ringEnds({ elapsed: 50, connected: false, from: box, to: null }), true, 'the list closed')
  assert.equal(ringEnds({ elapsed: 50, connected: true, from: box, to: { ...box, y: 300 } }), true, 'the row slid up')
  assert.equal(ringEnds({ elapsed: 50, connected: true, from: box, to: { ...box, height: 0 } }), true, 'the row collapsed')
  assert.equal(ringEnds({ elapsed: 50, connected: true, from: box, to: { ...box, y: 400.5 } }), false, 'sub-pixel jitter')
  assert.equal(ringEnds({ elapsed: 50, connected: true, from: box, to: box, shown: false }), true, 'the list fades out in place')
})

test('the touch script parses, inlines the ring check and says when it is idle', () => {
  assert.doesNotThrow(() => new Function(TOUCH_SCRIPT))
  assert.match(TOUCH_SCRIPT, /const ringEnds = function ringEnds\(/)
  assert.match(TOUCH_SCRIPT, new RegExp(`animation:guia-ring ' \\+ RING_MS \\+ 'ms`))
  assert.match(TOUCH_SCRIPT, /__guiaTouchIdle/)
  assert.doesNotMatch(TOUCH_SCRIPT, /setTimeout\(\(\) => r\.remove\(\), 600\)/)
})
