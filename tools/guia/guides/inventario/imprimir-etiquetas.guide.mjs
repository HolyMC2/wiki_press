// I-10 (PLAN §3.4): labels with price and item code, from Productos › Etiquetas.
// The walk stops before «Imprimir»: printing creates a print job on the site.
export default {
  question: '¿Cómo imprimo las etiquetas con precio y código?',
  quien: ['cajero', 'encargado'],
  place: 'productos.etiquetas',
  donde: 'Productos › Etiquetas',
  format: 'phone',
  fixture: 'catalogo-con-precio',
  fixtureArgs: { buscar: 'Funda' },
  order: 10,
  resumen: [
    'En Productos › Etiquetas buscas o escaneas lo que quieres etiquetar.',
    'La etiqueta sale con el precio de venta y el código; tú eliges cuántas copias.',
    'Tocas «Imprimir» y sale en tu impresora de etiquetas, o la compartes en PDF.',
  ],
  steps: [
    {
      text: '[[1]] En **Productos**, toca **Etiquetas**.',
      caption: 'En Productos, toca «Etiquetas»',
      route: '/crm/productos',
      ready: 'a[href="/crm/productos/etiquetas"]',
      marks: [{ ring: 'a[href="/crm/productos/etiquetas"]', n: 1, shape: 'box', pad: 4, nAt: 'tr' }],
    },
    {
      text: '[[2]] Escribe el nombre o el código, o escanea la etiqueta del proveedor. Toca el producto en la lista [[3]].',
      caption: 'Busca el producto por nombre o código y tócalo',
      async action(w, data) {
        await w.tap('a[href="/crm/productos/etiquetas"]')
        await w.wait('[data-etq-search]')
        await w.type('[data-etq-search]', data.query)
        await w.wait('[data-etq-results] li button')
      },
      ready: (data) => `[data-etq-results] li button:has-text("${data.item_name}")`,
      marks: (data) => [
        { ring: '[data-etq-search]', n: 2, shape: 'box', pad: 4 },
        { ring: `[data-etq-results] li button:has-text("${data.item_name}")`, n: 3, shape: 'box', pad: 3 },
      ],
    },
    {
      text: 'Queda en **Por imprimir**. Con **−** y **+** [[4]] eliges cuántas etiquetas salen de ese producto.',
      caption: 'Elige cuántas etiquetas salen',
      async action(w, data) {
        await w.tap(`[data-etq-results] li button:has-text("${data.item_name}")`)
        await w.wait('[data-etq-row]')
        await w.tap(`button[aria-label="Una copia más de ${data.item_name}"]`)
        await w.show('[data-etq-rows]')
      },
      ready: '[data-etq-row]',
      marks: (data) => [
        { ring: [`button[aria-label="Una copia menos de ${data.item_name}"]`, `button[aria-label="Una copia más de ${data.item_name}"]`], n: 4, shape: 'box', pad: 5, nAt: 'tr' },
      ],
    },
    {
      text: 'Así sale tu etiqueta [[5]]: nombre, precio y código. En **Diseño** [[6]] cambias la medida y lo que lleva.',
      caption: 'Revisa cómo sale; en «Diseño» cambias la medida',
      async action(w) {
        await w.page.locator('[data-etiquetas]').evaluate(el => el.scrollTo({ top: 0, behavior: 'instant' }))
      },
      ready: '[data-etq-layout]',
      marks: [
        { ring: '[data-etq-preview] > :first-child', n: 5, shape: 'box', pad: 2 },
        { ring: '[data-etq-layout]', n: 6, shape: 'box', pad: 3, nAt: 'l' },
      ],
    },
    {
      text: 'Toca **Imprimir** [[7]] y elige tu impresora de etiquetas. Si imprime otra persona, **Compartir PDF** [[8]] se lo manda.',
      caption: 'Toca «Imprimir» o comparte el PDF',
      async action(w) {
        await w.wait('[data-etq-print]')
      },
      ready: '[data-etq-print] button[aria-label^="Imprimir"]',
      marks: [
        { ring: '[data-etq-print] button[aria-label^="Imprimir"]', n: 7, shape: 'box', pad: 3 },
        { ring: '[data-etq-pdf]', n: 8, shape: 'box', pad: 3, nAt: 'tr' },
      ],
    },
  ],
  ysi: [
    ['¿Y si acaba de llegar mercancía?', 'Toca «Llegó mercancía» y trae todo lo de esa entrada, una etiqueta por pieza.'],
    ['¿Y si cambié precios?', '«Cambió el precio» trae lo que cambió en los últimos días.'],
    ['¿Y si sale «sin precio»?', 'Ponle precio desde el aviso o quítalo de la lista antes de imprimir.'],
    ['¿Y si no tengo impresora de etiquetas?', '«Compartir PDF» la manda a quien sí tiene, o imprímela en hoja.'],
  ],
  asistente: '¿Dónde imprimo las etiquetas con precio?',
  help: [
    { context_type: 'DocType', context_key: 'Doco Label Print Job' },
    { context_type: 'SPA Route', context_key: '/crm/productos/etiquetas' },
  ],
}
