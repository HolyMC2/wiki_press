// Taller y caja, nivel 1: the part goes on the order; it leaves the shelf for the order's WIP.
import { ORDEN, TAB, AGREGAR, BUSCAR_PIEZA, CONFIRMAR, RESERVADA, PRECIO, BUSY, AYUDA_TALLER } from './_comun.mjs'

const RESULTADO = (data) => `button:has-text("${data.partCode}")`

export default {
  question: '¿Cómo pongo la pieza en la orden?',
  titulo: 'Poner la pieza en la orden',
  quien: ['técnico', 'mostrador', 'encargado'],
  place: 'taller',
  donde: 'Taller › la orden › Refacciones',
  manual: 'taller-cobro',
  nivel: 1,
  format: 'desktop-wide',
  fixture: 'orden-taller-demo',
  order: 20,
  busy: BUSY,
  resumen: [
    'La pieza se agrega en la orden, en Refacciones, cuando la tomas del cajón.',
    'Sale del almacén de venta y queda apartada para esa orden: en caja ya no se vende por error.',
    'Su precio entra al cobro de la orden; el inventario se ajusta solo.',
  ],
  steps: [
    {
      text: 'En la orden, abre **Refacciones** [[1]] y toca **Agregar refacción o servicio** [[2]].',
      caption: 'Abre «Refacciones» y toca «Agregar refacción o servicio»',
      route: (data) => ORDEN(data),
      async action(w) {
        await w.tap(TAB('Refacciones'))
        await w.wait(AGREGAR)
      },
      ready: AGREGAR,
      marks: [
        { ring: TAB('Refacciones'), n: 1, shape: 'box', pad: 3, nAt: 'b' },
        { ring: AGREGAR, n: 2, shape: 'box', pad: 3, nAt: 'l' },
      ],
      async after(w) {
        await w.tap(AGREGAR)
        await w.wait(BUSCAR_PIEZA)
      },
    },
    {
      text: 'Escribe el nombre o el código [[3]] y toca la pieza [[4]]. Ahí ves cuántas tienes y su precio.',
      caption: 'Busca la pieza y tócala',
      async action(w, data) {
        await w.type(BUSCAR_PIEZA, data.part.split(' ')[0])
        await w.wait(RESULTADO(data))
        await w.reveal([BUSCAR_PIEZA, RESULTADO(data)])
      },
      ready: (data) => RESULTADO(data),
      marks: (data) => [
        { ring: BUSCAR_PIEZA, n: 3, shape: 'box', pad: 3, nAt: 't' },
        { ring: RESULTADO(data), n: 4, shape: 'box', pad: 3, nAt: 'l' },
      ],
      async after(w, data) {
        await w.tap(RESULTADO(data))
        await w.wait(CONFIRMAR)
      },
    },
    {
      text: 'Muelle te dice qué pasa [[5]]: la pieza sale del almacén de venta y queda apartada para esta orden. Toca **Confirmar y agregar** [[6]].',
      caption: 'Revisa el aviso y toca «Confirmar y agregar»',
      ready: CONFIRMAR,
      async action(w) {
        await w.reveal(['[data-stock-confirm]'])
      },
      marks: [
        { ring: '[data-stock-confirm]', n: 5, shape: 'box', pad: 3, nAt: 't' },
        { ring: CONFIRMAR, n: 6, shape: 'box', pad: 4, nAt: 'r' },
      ],
      async after(w) {
        await w.tap(CONFIRMAR)
        await w.wait(RESERVADA, 60000)
      },
    },
    {
      text: 'La pieza queda en la orden **Reservada** [[7]] y con su precio [[8]]. La actividad de la orden [[9]] guarda el movimiento.',
      caption: 'La pieza queda reservada para la orden, con su precio',
      ready: RESERVADA,
      async action(w) {
        await w.reveal([`li:has(${RESERVADA})`])
        await w.gone(['Artículo agregado'], 15000).catch(() => {})
      },
      marks: [
        { ring: RESERVADA, n: 7, shape: 'box', pad: 3, nAt: 't' },
        { ring: PRECIO, n: 8, shape: 'box', pad: 3, nAt: 'l' },
        { ring: 'aside :text("Traspaso de inventario"), :text("Traspaso de inventario")', n: 9, shape: 'box', pad: 4, nAt: 'l' },
      ],
    },
  ],
  ysi: [
    ['¿Y si no hay piezas?', 'Muelle avisa cuántas hay. Pide la pieza y agrégala cuando llegue; la orden puede esperar en «Esperando pieza».'],
    ['¿Y si me equivoqué de pieza?', 'Toca «quitar». Si no se usó, elige «Devolver a stock»; si ya se dañó (una pantalla pegada), confírmala como merma.'],
    ['¿Y si la pieza se rompió al instalarla?', '«Marcar como dañada»: decide si se cobra al cliente o queda como merma.'],
    ['¿Y si la pieza es de garantía?', '«Garantía (sin cargo)»: no se cobra y su costo va a la reparación original.'],
  ],
  asistente: '¿Cómo agrego una pieza a una orden de Taller?',
  soporte: [
    'Con el inventario en taller encendido, agregar la pieza la traspasa al almacén «Taller WIP»; al cobrar, la venta la descuenta de ahí.',
    'Quitar con «Devolver a stock» la regresa al almacén de venta; la merma la da de baja.',
  ],
  tecnico: 'taller/taller/repair/wip_transfer.py',
  help: AYUDA_TALLER,
}
