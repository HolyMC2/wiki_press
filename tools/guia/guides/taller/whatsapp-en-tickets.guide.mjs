// Taller y caja, nivel 4: the shop's WhatsApp on its tickets (caja and Taller).
// The walk only shows the setting; it does not save it.
import { BUSY, TECNICO } from './_comun.mjs'

const AREA = 'button[aria-pressed]:has-text("Comunicación")'
const NUMERO = '[data-wa-shop-number]'
const TICKETS = '[data-wa-tickets]'

export default {
  question: '¿Cómo pongo el WhatsApp de la tienda en los tickets?',
  titulo: 'El WhatsApp en los tickets',
  quien: ['dueño', 'encargado'],
  place: 'taller',
  donde: 'Taller › Configuración › Comunicación › Canal de WhatsApp',
  manual: 'taller-cobro',
  nivel: 4,
  format: 'desktop-wide',
  fixture: 'orden-taller-demo',
  order: 70,
  busy: BUSY,
  resumen: [
    'Los tickets de caja y de Taller imprimen el WhatsApp de la tienda debajo del nombre.',
    'Si tu WhatsApp Business está conectado, Muelle toma el número solo.',
    'Puedes escribir otro número o apagarlo.',
  ],
  steps: [
    {
      text: 'En Taller abre **Configuración** y toca **Comunicación** [[1]]. En **Número de WhatsApp del negocio** [[2]] escribe el número que quieres en los tickets; vacío, se usa el de tu WhatsApp Business conectado.',
      caption: 'Configuración › Comunicación › Número de WhatsApp del negocio',
      route: '/taller/settings',
      async action(w) {
        await w.tap(AREA)
        await w.wait(TICKETS, 30000)
        await w.reveal([NUMERO, TICKETS])
      },
      ready: TICKETS,
      marks: [
        { ring: AREA, n: 1, shape: 'box', pad: 3, nAt: 'b' },
        { ring: NUMERO, n: 2, shape: 'box', pad: 4, nAt: 'l' },
      ],
    },
    {
      text: '**Imprimir el WhatsApp en los tickets de caja y de Taller** [[3]] lo enciende o lo apaga; abajo dice el número que sale. Toca **Guardar canal** [[4]].',
      caption: 'Enciéndelo y guarda',
      async action(w) {
        await w.reveal([TICKETS, 'button:has-text("Guardar canal")'])
      },
      ready: TICKETS,
      marks: [
        { ring: TICKETS, n: 3, shape: 'box', pad: 4, nAt: 'l' },
        { ring: 'button:has-text("Guardar canal")', n: 4, shape: 'box', pad: 3, nAt: 'l' },
      ],
    },
  ],
  ysi: [
    ['¿Y si dice que aún no conocemos el número?', 'Llega solo con el próximo mensaje de un cliente a tu WhatsApp Business. Mientras, escríbelo arriba.'],
    ['¿Qué tickets lo llevan?', 'El ticket de venta de caja y los de Taller: recibo de reparación, orden, acuse de entrega y comprobante de ingreso.'],
  ],
  asistente: '¿Cómo pongo mi WhatsApp en los tickets?',
  soporte: [
    'El número sale de Ajustes de WhatsApp: el número del negocio escrito, si no el que Meta muestra para la cuenta conectada (se guarda con cada mensaje que llega).',
  ],
  tecnico: TECNICO,
  help: [
    { context_type: 'SPA Route', context_key: '/taller/settings' },
    { context_type: 'DocType', context_key: 'WhatsApp Settings' },
  ],
}
