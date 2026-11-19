// Taller y caja, nivel 4: the owner turns on «Cobrar las órdenes en caja» and «Inventario en taller».
// The walk only shows the switches; it does not flip them (the lab keeps its own setup).
import { BUSY, TECNICO } from './_comun.mjs'

const AREA = 'button[aria-pressed]:has-text("Operación")'
const TARJETA = '[data-cobro-caja]'
const COBRO = '[data-cobro-switch]'
const INVENTARIO = '[data-inventario-switch]'

export default {
  question: '¿Cómo enciendo el cobro de las órdenes en caja?',
  titulo: 'Encender el cobro en caja',
  quien: ['dueño', 'encargado'],
  place: 'taller',
  donde: 'Taller › Configuración › Operación y calidad › Cobro en caja',
  manual: 'taller-cobro',
  nivel: 4,
  format: 'desktop-wide',
  fixture: 'orden-taller-demo',
  order: 60,
  busy: BUSY,
  resumen: [
    'Un solo interruptor manda las órdenes listas a caja y deja cobrar el anticipo ahí.',
    'Muelle enciende también lo que la caja necesita; no hay que tocar nada más.',
    '«Inventario en taller» aparta la pieza en cuanto se pone en la orden.',
  ],
  steps: [
    {
      text: 'En Taller abre **Configuración** y toca **Operación y calidad** [[1]]. En **Cobro en caja** [[2]] están los dos interruptores.',
      caption: 'Configuración › Operación y calidad › Cobro en caja',
      route: '/taller/settings',
      async action(w) {
        await w.tap(AREA)
        await w.wait(TARJETA, 30000)
        await w.reveal([TARJETA])
      },
      ready: TARJETA,
      marks: [
        { ring: AREA, n: 1, shape: 'box', pad: 3, nAt: 'b' },
        { ring: TARJETA, n: 2, shape: 'box', pad: 4, nAt: 'l' },
      ],
    },
    {
      text: '**Cobrar las órdenes en caja** [[3]]: la orden lista llega sola a caja con su anticipo. Abajo ves qué cajas quedaron listas. **Inventario en taller** [[4]]: la pieza sale del almacén de venta al ponerla en la orden.',
      caption: 'Enciende «Cobrar las órdenes en caja» e «Inventario en taller»',
      async action(w) {
        await w.reveal([COBRO, INVENTARIO])
      },
      ready: COBRO,
      marks: [
        { ring: COBRO, n: 3, shape: 'box', pad: 4, nAt: 'l' },
        { ring: INVENTARIO, n: 4, shape: 'box', pad: 4, nAt: 'l' },
      ],
    },
  ],
  ysi: [
    ['¿Y si la caja no muestra las órdenes?', 'La caja lo ve al abrir su siguiente turno o al recargar la página.'],
    ['¿Y si hoy las piezas se descuentan al guardarlas?', 'El interruptor dice «Cambiar a inventario en taller»: al encenderlo deja de descontarlas al guardar.'],
    ['¿Y si lo apago?', 'Las órdenes dejan de llegar a caja y se cobran con un documento desde la orden. Las cajas no cambian.'],
  ],
  asistente: '¿Cómo hago que las órdenes de Taller se cobren en caja?',
  soporte: [
    'Encender «Cobrar las órdenes en caja» enciende en las cajas de los laboratorios las solicitudes de cobro y el crédito del cliente.',
  ],
  tecnico: TECNICO,
  help: [
    { context_type: 'SPA Route', context_key: '/taller/settings' },
    { context_type: 'DocType', context_key: 'Taller App Settings' },
  ],
}
