// Bancos, nivel 2 (PLAN §12.5): link what is already on both sides. 27 taps → 2 from the sheet.
import { cuentaRoute, RAZON, SHEET_READY, BUSY, TECNICO, AYUDA } from './_comun.mjs'

export default {
  question: '¿Cómo ligo los movimientos que ya están en mis libros?',
  titulo: 'Ligar lo que ya está',
  quien: ['dueño', 'encargado', 'contador'],
  place: 'bancos',
  donde: 'Bancos › tu cuenta › ¿Cuadra con el banco?',
  manual: 'bancos',
  nivel: 2,
  format: 'phone',
  fixture: 'banco-demo',
  order: 20,
  busy: BUSY,
  resumen: [
    'Muchos movimientos del banco ya están en tus libros: mismo importe y fecha cercana.',
    'Muelle los encuentra; tú los revisas y los ligas todos con un toque.',
    'Ligarlos no cambia la diferencia: deja a la vista lo que sí falta.',
  ],
  steps: [
    {
      text: 'En tu cuenta, toca **No cuadra por $3,129.50**. [[1]] La primera línea dice cuántos movimientos ya están en tus libros. Toca **Revisar y ligar** [[2]].',
      caption: 'Lo que ya está en tus libros: «Revisar y ligar»',
      route: (data) => cuentaRoute(data, '?cuadre=1'),
      ready: SHEET_READY,
      settle: 600,
      marks: [
        { ring: `${RAZON('pares')} > div:first-child`, n: 1, shape: 'box', pad: 6, nAt: 't' },
        { ring: '[data-bancos-cuadre-pares]', n: 2, shape: 'box', pad: 4, nAt: 'r' },
      ],
      async after(w) {
        await w.tap('[data-bancos-cuadre-pares]')
        await w.wait('[data-bancos-cuadre-ligar]')
      },
    },
    {
      text: 'Revisa la lista: cada movimiento del banco con su registro en tus libros. Si todos están bien, toca **Ligar 4 movimientos** [[3]].',
      caption: 'Revisa la lista y toca «Ligar 4 movimientos»',
      // The list opens with a transition: reveal the button once the list has its full height.
      action: async (w) => {
        await w.page.waitForTimeout(450)
        await w.reveal(['[data-bancos-cuadre-ligar]'])
      },
      ready: '[data-bancos-cuadre-ligar]',
      marks: [{ ring: '[data-bancos-cuadre-ligar]', n: 3, shape: 'box', pad: 4, nAt: 't' }],
      async after(w) {
        await w.tap('[data-bancos-cuadre-ligar]')
        await w.wait('[data-bancos-cuadre-lista] [role="status"]')
      },
    },
    {
      text: '[[4]] Listo: cada uno dice **Ligado**. Si alguno no se pudo, dice por qué.',
      caption: 'Listo: cada uno dice «Ligado»',
      action: async (w) => { await w.reveal(['[data-bancos-cuadre-lista] ul']) },
      ready: '[data-bancos-cuadre-lista] [role="status"]',
      marks: [{ ring: '[data-bancos-cuadre-lista] ul', n: 4, shape: 'box', pad: 3, nAt: 't' }],
    },
  ],
  ysi: [
    ['¿Y si uno dice «Aún no se puede ligar desde aquí»?', 'Es una venta o compra pagada directo en esa cuenta. Por ahora la liga tu contador.'],
    ['¿Y si no me deja ligar?', 'Ligar es de quien concilia los bancos. Pide a tu encargado que lo revise.'],
    ['¿Y si ligué uno que no era?', 'Abre ese movimiento en Bancos y deshaz la liga.'],
    ['¿Y si hay más de los que se ven?', 'Liga estos y vuelve a abrir la hoja: aparecen los que siguen.'],
  ],
  asistente: 'Liga los movimientos de mi cuenta de cheques que ya están en mis libros.',
  soporte: [
    'Ligar usa el conciliador del sitio (Contador donde lo tiene, el de ERPNext en los demás).',
    'Un par rechazado trae su motivo en la lista; con ese texto se sabe si es un mes cerrado o un permiso.',
  ],
  tecnico: TECNICO,
  playbook: 'bank-reconciliation',
  help: AYUDA,
}
