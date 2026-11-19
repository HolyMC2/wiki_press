// Taller y caja, nivel 2: a part's price changes on the order, and the order goes back onto the agreed quote.
import { ORDEN, TAB, PRECIO, NO_CUADRA, BUSY, TECNICO, AYUDA_TALLER } from './_comun.mjs'

const PRECIO_NUEVO = 'input[type="number"][inputmode="decimal"]'
const GUARDAR = 'button:text-is("Guardar")'
const USAR_LISTA = 'button:has-text("Usar lista")'
const RESPETAR = '[data-testid="fit-labor"]'
const COBRAR_MAS = '[data-testid="fit-quote"]'

export default {
  question: '¿Cómo cambio el precio de una pieza o de la mano de obra?',
  titulo: 'Cambiar un precio',
  quien: ['encargado', 'mostrador', 'técnico'],
  place: 'taller',
  donde: 'Taller › la orden › Refacciones',
  manual: 'taller-cobro',
  nivel: 2,
  format: 'desktop-wide',
  fixture: 'orden-taller-demo',
  fixtureArgs: { precio: 900 },
  order: 30,
  busy: BUSY,
  resumen: [
    'Los precios se cambian en la orden, nunca en caja: caja cobra lo que dice la orden.',
    'Toca el precio de la pieza (o el lápiz de la mano de obra), escribe y guarda.',
    'Si el total ya no es lo que aceptó el cliente, la orden te pregunta qué hacer.',
  ],
  steps: [
    {
      text: 'En la orden, abre **Refacciones** [[1]] y toca el precio de la pieza [[2]].',
      caption: 'En «Refacciones», toca el precio de la pieza',
      route: (data) => ORDEN(data),
      async action(w) {
        await w.tap(TAB('Refacciones'))
        await w.wait(PRECIO)
        await w.reveal([PRECIO])
      },
      ready: PRECIO,
      marks: [
        { ring: TAB('Refacciones'), n: 1, shape: 'box', pad: 3, nAt: 'b' },
        { ring: PRECIO, n: 2, shape: 'box', pad: 4, nAt: 'l' },
      ],
      async after(w) {
        await w.tap(PRECIO)
        await w.wait(PRECIO_NUEVO)
      },
    },
    {
      text: 'Escribe el precio nuevo [[3]] y toca **Guardar** [[4]]. **Usar lista** [[5]] lo regresa al precio de tu lista.',
      caption: 'Escribe el precio y toca «Guardar»',
      async action(w, data) {
        await w.type(PRECIO_NUEVO, String(data.precio || 900))
        await w.reveal([PRECIO_NUEVO, GUARDAR])
      },
      ready: GUARDAR,
      marks: [
        { ring: PRECIO_NUEVO, n: 3, shape: 'box', pad: 3, nAt: 'l' },
        { ring: GUARDAR, n: 4, shape: 'box', pad: 3, nAt: 'b' },
        { ring: USAR_LISTA, n: 5, shape: 'box', pad: 2, nAt: 'l' },
      ],
      async after(w) {
        await w.tap(GUARDAR)
        await w.wait(PRECIO)
        await w.tap(TAB('Cliente y cobro'))
        await w.wait(NO_CUADRA, 30000)
        await w.gone(['Precio actualizado'], 15000).catch(() => {})
      },
    },
    {
      text: 'Si el total ya no es la cotización que aceptó el cliente, **Cliente y cobro** te avisa [[6]] y caja espera. Elige: **Respetar** [[7]] baja la mano de obra y el cliente paga lo acordado; **Cobrar** [[8]] sube el total y el cliente debe aprobarlo.',
      caption: 'Si no cuadra con la cotización, elige «Respetar» o «Cobrar»',
      ready: NO_CUADRA,
      async action(w) {
        await w.reveal([NO_CUADRA])
      },
      marks: [
        { ring: `${NO_CUADRA} > p:first-child`, n: 6, shape: 'box', pad: 3, nAt: 't' },
        { ring: RESPETAR, n: 7, shape: 'box', pad: 3, nAt: 'l' },
        { ring: COBRAR_MAS, n: 8, shape: 'box', pad: 3, nAt: 'r' },
      ],
      async after(w) {
        await w.tap(RESPETAR)
        await w.gone(['El desglose no coincide con la cotización'], 30000)
      },
    },
    {
      text: 'Listo: el total vuelve a ser la cotización [[9]] y caja cobrará eso. La mano de obra se cambia igual, con el lápiz junto a su precio.',
      caption: 'La orden vuelve a cuadrar con la cotización',
      ready: '[data-testid="quote-row"]',
      async action(w) {
        await w.reveal(['dl:has([data-testid="quote-row"])'])
        await w.gone(['Mano de obra ajustada'], 15000).catch(() => {})
      },
      marks: [
        { ring: 'dl:has([data-testid="quote-row"])', n: 9, shape: 'box', pad: 6, nAt: 'l' },
      ],
    },
  ],
  ysi: [
    ['¿Y si no me deja cambiar el precio?', 'Te sale «Proponer precio»: escribe el precio y el motivo; el encargado lo aprueba y se aplica solo.'],
    ['¿Y si caja ya había cargado el cobro?', 'Caja libera ese cobro en «Cobros pendientes» › «Liberar borrador» y lo vuelve a cargar desde «Orden de servicio»: entra con el precio nuevo.'],
    ['¿Y si el cliente pide descuento en caja?', 'En caja el precio de la orden no se cambia. Haz el descuento aquí, en la orden, y caja vuelve a cargar el cobro.'],
    ['¿Y si quiero cambiar la cotización?', '«Cobrar …» cambia el total; mándale al cliente la nueva cotización para que la apruebe.'],
  ],
  asistente: '¿Cómo cambio el precio de una pieza en una orden?',
  soporte: [
    'Quién puede cambiar precios lo decide el encargado (permiso de precios en Taller); los demás proponen y el encargado aprueba.',
    'Caja no deja cambiar el precio ni el descuento de una línea que viene de la orden: avisa «Este precio viene de la orden…».',
  ],
  tecnico: TECNICO,
  help: AYUDA_TALLER,
}
