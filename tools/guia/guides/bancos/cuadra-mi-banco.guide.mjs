// Bancos, nivel 1 (PLAN §12.5): know whether an account agrees with its bank. 0 taps on the list.
import { CARD, CARD_TARJETA, SHEET_READY, BUSY, TECNICO, AYUDA } from './_comun.mjs'

export default {
  question: '¿Cuadra mi banco con mis libros?',
  titulo: '¿Cuadra mi banco?',
  quien: ['dueño', 'encargado', 'contador'],
  place: 'bancos',
  donde: 'Bancos',
  manual: 'bancos',
  nivel: 1,
  format: 'phone',
  fixture: 'banco-demo',
  order: 10,
  busy: BUSY,
  resumen: [
    'En Bancos, cada cuenta dice si tus libros y el banco dicen lo mismo.',
    '«Cuadra con el banco» es que todo está bien.',
    '«No cuadra por $…» es la diferencia: tócala y Muelle te dice por qué.',
  ],
  steps: [
    {
      text: 'Abre **Bancos**. Cada cuenta dice si cuadra: [[1]] **Cuadra con el banco** es que todo está bien; [[2]] **No cuadra por $3,129.50** es que tus libros y el banco no dicen lo mismo. Toca esa cuenta.',
      caption: 'En Bancos, cada cuenta dice si cuadra',
      route: '/crm/bancos',
      ready: (data) => `${CARD(data)} [data-bancos-card-cuadre]`,
      marks: (data) => [
        { ring: CARD_TARJETA, n: 1, shape: 'box', pad: 4, nAt: 't' },
        { ring: CARD(data), n: 2, shape: 'box', pad: 4, nAt: 't' },
      ],
      async after(w, data) {
        await w.tap(CARD(data))
        await w.wait('[data-bancos-cuadre-abrir]')
      },
    },
    {
      text: '[[3]] Arriba ves cuánto hay en tus libros y en el banco. Toca **No cuadra por $3,129.50**.',
      caption: 'Toca «No cuadra por…» para ver por qué',
      ready: '[data-bancos-cuadre-abrir]',
      marks: [{ ring: '[data-bancos-cuadre-abrir]', n: 3, shape: 'box', pad: 3, nAt: 'b' }],
      async after(w) {
        await w.tap('[data-bancos-cuadre-abrir]')
        await w.wait(SHEET_READY)
      },
    },
    {
      text: '[[4]] La hoja te dice lo que hay **en el banco**, lo que hay **en libros** y la **diferencia**. Abajo, por qué.',
      caption: 'Banco, libros y la diferencia, con sus razones',
      ready: SHEET_READY,
      settle: 600,
      marks: [{ ring: '[data-bancos-cuadre-cifras]', n: 4, shape: 'box', pad: 7, nAt: 'b' }],
    },
  ],
  ysi: [
    ['¿Y si mi cuenta no dice nada debajo?', 'No está conectada al banco. Ábrela, toca «¿Cuadra con tu banco?» y escribe lo que dice la app de tu banco.'],
    ['¿Y si dice «Cuadra con el banco»?', 'Todo está bien: tus libros y el banco dicen lo mismo.'],
    ['¿Y si es una tarjeta?', 'Compara lo que debes según el banco con lo que debes según tus libros.'],
  ],
  asistente: '¿Mis cuentas cuadran con el banco?',
  soporte: [
    'Pregunta qué cuenta y qué dice su línea: «Cuadra», «No cuadra por $…» o nada.',
    'Sin línea: la cuenta no tiene conexión; el saldo del banco se escribe en la hoja y no se guarda.',
  ],
  tecnico: TECNICO,
  playbook: 'bank-reconciliation',
  help: AYUDA,
}
