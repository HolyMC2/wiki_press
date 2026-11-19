// Taller y caja, nivel 1: the customer leaves an anticipo; caja takes it and the order shows it.
import { ORDEN, ANTICIPO, COBRAR_ANTICIPO, RECIBOS, SALDO_CHIP, FUENTE, ENVIAR, VOLVER, BUSY, TECNICO, AYUDA_TALLER } from './_comun.mjs'

export default {
  question: '¿Cómo cobro el anticipo de una reparación?',
  titulo: 'Cobrar un anticipo',
  quien: ['mostrador', 'cajero', 'encargado'],
  place: 'taller',
  donde: 'Taller › la orden › Cliente y cobro',
  manual: 'taller-cobro',
  nivel: 1,
  format: 'desktop-wide',
  fixture: 'orden-taller-demo',
  order: 10,
  busy: BUSY,
  resumen: [
    'El anticipo se cobra en caja desde la orden, con un botón.',
    'Caja lo guarda a nombre de la orden; no se vende ninguna pieza todavía.',
    'Al cobrar la orden, el anticipo se descuenta solo.',
  ],
  steps: [
    {
      text: 'Abre la orden en **Cliente y cobro**. En **Anticipo** [[1]] ves lo que el cliente va a dejar. Toca **Cobrar en caja** [[2]].',
      caption: 'En la orden, toca «Cobrar … en caja»',
      route: (data) => ORDEN(data, 'cobro'),
      ready: COBRAR_ANTICIPO,
      async action(w) {
        await w.reveal([ANTICIPO])
      },
      marks: [
        { ring: '[data-testid="advance-pending"]', n: 1, shape: 'box', pad: 4, nAt: 't' },
        { ring: COBRAR_ANTICIPO, n: 2, shape: 'box', pad: 3, nAt: 'b' },
      ],
      async after(w) {
        await w.tap(COBRAR_ANTICIPO)
        await w.wait(FUENTE, 60000)
      },
    },
    {
      text: 'Se abre la caja con el anticipo de la orden [[3]] y el monto ya escrito [[4]]. Recibe el dinero y toca **Enviar** [[5]]; con **Enviar e imprimir** le das su comprobante.',
      caption: 'Caja ya trae el anticipo: recibe el dinero y toca «Enviar»',
      ready: FUENTE,
      settle: 1500,
      // The bank reference field's placeholder is longer than the field by design.
      allowCut: ['Referencia bancaria (clave de rastreo)'],
      async action(w) {
        await w.reveal([FUENTE, ENVIAR])
      },
      marks: [
        { ring: FUENTE, n: 3, shape: 'box', pad: 4, nAt: 'b' },
        { ring: '.pay-totals input[type="number"], input[type="number"]', n: 4, shape: 'box', pad: 6, nAt: 'l' },
        { ring: ENVIAR, n: 5, shape: 'box', pad: 3, nAt: 'b' },
      ],
      async after(w) {
        await w.tap(ENVIAR)
        // Recorded: the screen leaves the anticipo and shows the customer's payments.
        await w.gone(['Queda como anticipo del cliente'], 60000)
        // The lab answers 429 to a burst; let caja's own reads finish first.
        await w.quiet({ idle: 2000, timeout: 20000 })
        await w.tap(VOLVER)
        await w.wait(RECIBOS, 60000)
      },
    },
    {
      text: 'Con **Volver a la orden** regresas a Taller. El anticipo queda **Recibido en caja**, con fecha y forma de pago [[6]], y el saldo de la orden ya lo descuenta [[7]].',
      caption: 'La orden ya muestra el anticipo recibido',
      ready: RECIBOS,
      async action(w) {
        // A read refused by the lab's rate limit offers «Reintentar»; take it.
        if (await w.showing('text=No se pudo verificar el cobro')) {
          await w.tapText('Reintentar')
          await w.gone(['No se pudo verificar el cobro'], 20000)
        }
        await w.reveal([ANTICIPO])
      },
      marks: [
        { ring: RECIBOS, n: 6, shape: 'box', pad: 4, nAt: 't' },
        { ring: SALDO_CHIP, n: 7, shape: 'box', pad: 3, nAt: 'b' },
      ],
    },
  ],
  ysi: [
    ['¿Y si el cliente deja otra cantidad?', 'En la caja cambia el monto antes de tocar «Enviar». En la orden, «Cambiar» ajusta lo que se pide.'],
    ['¿Y si me pagó por transferencia?', 'Si el depósito ya llegó al banco, la orden lo propone en «¿Llegó por transferencia?»: toca «Es este anticipo».'],
    ['¿Y si el cliente ya no quiere la reparación?', 'El encargado le devuelve el anticipo desde Cobranza; la orden lo muestra como «Devuelto».'],
    ['¿Y si cobré el anticipo vendiendo la pieza en un ticket?', 'Así ya no: la pieza sale vendida dos veces. Si ya pasó, en la orden usa «Vincular documento existente» con ese ticket.'],
  ],
  asistente: '¿Cómo cobro el anticipo de una reparación?',
  soporte: [
    'El anticipo es un pago del cliente a nombre de la orden (no una venta). Se ve en Cobranza como pago sin aplicar.',
    'Si la orden dice «anticipo sin recibo de caja», ese dinero no se registró en caja: revisar los tickets del cliente.',
  ],
  tecnico: TECNICO,
  help: AYUDA_TALLER,
}
