// Taller y caja, nivel 1: caja charges a ready order; the anticipo comes off by itself.
// The walk stops before «Cobrar e imprimir»: the sale stays a draft, so a reshoot finds the same charge.
import { ORDENES, TARJETA, DETALLE, TOTALES, BANDA, PRIMARIO, ANTICIPO_VENTA, LINEA, NOTA_PRECIO, BUSY, TECNICO, AYUDA_CAJA } from './_comun.mjs'

const RIEL = '[data-testid="register-rail"] :text("Orden de servicio")'
const CERRAR_LINEA = '[data-testid="line-detail-close"]'
const CATALOGO = '[data-testid="catalog-drawer-close"]'

export default {
  question: '¿Cómo cobro en caja una reparación que ya está lista?',
  titulo: 'Cobrar la orden en caja',
  quien: ['cajero', 'mostrador', 'encargado'],
  place: 'caja',
  donde: 'Caja › Orden de servicio',
  manual: 'taller-cobro',
  nivel: 1,
  format: 'desktop-wide',
  fixture: 'orden-taller-demo',
  order: 40,
  busy: BUSY,
  resumen: [
    'Las órdenes listas llegan solas a Caja › Orden de servicio, con su anticipo.',
    'Las piezas y la mano de obra entran con el precio de la orden; en caja no se cambian.',
    'Al pagar, el anticipo ya está descontado: solo cobras lo que falta.',
  ],
  steps: [
    {
      text: 'En la caja, abre **Orden de servicio** [[1]]. Cada orden lista dice su anticipo y su total [[2]]. Tócala.',
      caption: 'Abre «Orden de servicio» y toca la orden',
      route: ORDENES,
      ready: (data) => TARJETA(data),
      settle: 1500,
      marks: (data) => [
        { ring: RIEL, n: 1, shape: 'box', pad: 4, nAt: 'r' },
        { ring: TARJETA(data), n: 2, shape: 'box', pad: 3, nAt: 'b' },
      ],
      async after(w, data) {
        await w.tap(TARJETA(data))
        await w.wait(DETALLE)
        await w.wait(`${BANDA}:has-text("Saldo")`)
      },
    },
    {
      text: 'Revisa lo que lleva [[3]]. La orden menos el anticipo es el **Saldo** [[4]]: eso es lo que cobras. Toca **Cobrar** [[5]].',
      caption: 'La orden menos el anticipo es lo que cobras; toca «Cobrar»',
      ready: DETALLE,
      marks: [
        { ring: `${DETALLE} table, ${DETALLE} .orden-detail__lines`, n: 3, shape: 'box', pad: 3, nAt: 't' },
        { ring: TOTALES, n: 4, shape: 'box', pad: 4, nAt: 'b' },
        { ring: PRIMARIO, n: 5, shape: 'box', pad: 3, nAt: 'l' },
      ],
      async after(w, data) {
        await w.tap(PRIMARIO)
        await w.wait(LINEA(data), 60000)
        await w.gone(['Orden cargada'], 20000).catch(() => {})
        // The anchored catalogue takes half the screen and cuts the lines' names.
        if (await w.showing(CATALOGO)) {
          await w.tap(CATALOGO)
          await w.gone(['Explorar catálogo · Anclado'], 5000).catch(() => {})
        }
      },
    },
    {
      text: 'Las piezas y la mano de obra llegan con el precio de la orden [[6]]. Arriba dice el total de la orden completa; el anticipo se descuenta al pagar. Si tocas una línea [[7]] verás por qué su precio no se cambia aquí.',
      caption: 'Llega con los precios de la orden',
      ready: (data) => LINEA(data),
      settle: 1500,
      marks: (data) => [
        { ring: [`tr:has(${LINEA(data)})`, 'tr:has(td:has-text("Mano de obra"))'], n: 6, shape: 'box', pad: 3, nAt: 't' },
        { ring: LINEA(data), n: 7, shape: 'box', pad: 3, nAt: 'b' },
      ],
      async after(w, data) {
        await w.tap(LINEA(data))
        await w.wait(NOTA_PRECIO, 20000)
      },
    },
    {
      text: '«Este precio viene de la orden» [[8]]: lo que el cliente ya pagó se descuenta al pagar. Si hay que cambiar el precio, se cambia en Taller y vuelves a cargar el cobro. Cierra [[9]] y toca **Pagar**.',
      caption: 'El precio de la orden no se cambia en caja',
      ready: NOTA_PRECIO,
      marks: [
        { ring: NOTA_PRECIO, n: 8, shape: 'box', pad: 4, nAt: 't' },
        { ring: CERRAR_LINEA, n: 9, shape: 'oval', pad: 4, nAt: 'l' },
      ],
      async after(w) {
        await w.tap(CERRAR_LINEA)
        await w.gone(['Este precio viene de la orden'], 10000).catch(() => {})
        await w.tap(PRIMARIO)
        await w.wait(ANTICIPO_VENTA, 60000)
      },
    },
    {
      text: 'El anticipo ya está descontado [[10]] y en Efectivo queda solo lo que falta [[11]]. Recibe el dinero y toca **Cobrar e imprimir** [[12]].',
      caption: 'El anticipo ya está descontado: cobra lo que falta',
      ready: ANTICIPO_VENTA,
      settle: 1500,
      // The customer-credit row (below the fold) labels a narrow field «Valor almacenado disponible».
      allowCut: ['Valor almacenado disponible'],
      marks: [
        { ring: ANTICIPO_VENTA, n: 10, shape: 'box', pad: 3, nAt: 't' },
        { ring: '[data-testid^="cobro-tender-"]:has-text("Efectivo")', n: 11, shape: 'box', pad: 3, nAt: 'b' },
        { ring: PRIMARIO, n: 12, shape: 'box', pad: 3, nAt: 'l' },
      ],
    },
  ],
  ysi: [
    ['¿Y si el cliente quiere un descuento o el precio está mal?', 'En caja no se cambia: la línea dice «Este precio viene de la orden». Que lo cambien en Taller y vuelve a cargar el cobro.'],
    ['¿Y si la orden dice «anticipo sin recibo de caja»?', 'Ese dinero no se cobró en caja (quizá en otro ticket). Revisa los tickets del cliente en Cobranza antes de cobrar.'],
    ['¿Y si caja dice que la orden ya se vendió?', 'Sus piezas salieron en otro ticket. Cobra lo que falte en Cobranza contra ese ticket y entrega la orden desde Taller.'],
    ['¿Y si el cliente también compra un accesorio?', 'Agrégalo a la misma venta: lo que agregas sí se puede cambiar.'],
  ],
  asistente: '¿Cómo cobro una orden de Taller en caja?',
  soporte: [
    'El cobro de la orden es una solicitud de cobro que Taller arma sola al pasar la orden a «Listo»; caja la abre desde Orden de servicio.',
    'El anticipo aplicado es el recibo de caja a nombre de la orden; el resto en efectivo se registra como pago de la venta.',
  ],
  tecnico: TECNICO,
  help: AYUDA_CAJA,
}
