// Bancos, nivel 3 (PLAN §12.5): why an account does not agree, reason by reason. Before 11-16: not possible in the app.
import { cuentaRoute, RAZON, SHEET_READY, BUSY, TECNICO, AYUDA } from './_comun.mjs'

const SIN_BANCO = '[aria-label="Filtrar movimientos"] button:has-text("Sin banco")'

export default {
  question: '¿Por qué no me cuadra el banco?',
  titulo: '¿Por qué no me cuadra el banco?',
  quien: ['dueño', 'encargado', 'contador'],
  place: 'bancos',
  donde: 'Bancos › tu cuenta › No cuadra por…',
  manual: 'bancos',
  nivel: 3,
  format: 'phone',
  fixture: 'banco-demo',
  order: 30,
  busy: BUSY,
  resumen: [
    'La diferencia siempre tiene razones: lo que el banco tiene y tus libros no, y al revés.',
    'La hoja «¿Cuadra con el banco?» te las da una por una, con su importe.',
    'Cada razón trae su botón: ver los movimientos, ver los registros o pedir ayuda.',
  ],
  steps: [
    {
      text: '[[1]] En tu cuenta, toca **No cuadra por $3,129.50** y baja a **Por qué no cuadra**.',
      caption: 'Toca «No cuadra por…»: ahí están las razones',
      route: (data) => cuentaRoute(data, '?cuadre=1'),
      ready: SHEET_READY,
      settle: 600,
      marks: [{ ring: '[data-bancos-cuadre-razones] h3', n: 1, shape: 'box', pad: 4, nAt: 'r' }],
    },
    {
      text: '[[2]] **Movimientos del banco sin registrar**: el banco los tiene y tus libros no. Toca **Ver movimientos** para registrarlos, o **Que me ayude el asistente** [[3]].',
      caption: 'Lo que el banco tiene y tus libros no',
      action: async (w) => { await w.reveal([RAZON('solo_banco')]) },
      ready: RAZON('solo_banco'),
      marks: [
        { ring: `${RAZON('solo_banco')} button:has-text("Ver movimientos")`, n: 2, shape: 'box', pad: 3, nAt: 'b' },
        { ring: '[data-bancos-cuadre-asistente]', n: 3, shape: 'box', pad: 3, nAt: 'b' },
      ],
    },
    {
      text: '[[4]] **Registros sin movimiento del banco**: están en tus libros y el banco no los muestra. Toca **Ver registros**.',
      caption: 'Lo que tus libros tienen y el banco no',
      action: async (w) => { await w.reveal([RAZON('solo_libros')]) },
      ready: RAZON('solo_libros'),
      marks: [{ ring: `${RAZON('solo_libros')} button:has-text("Ver registros")`, n: 4, shape: 'box', pad: 3, nAt: 'b' }],
      async after(w) {
        await w.tap(`${RAZON('solo_libros')} button:has-text("Ver registros")`)
        await w.wait(SIN_BANCO)
        await w.wait('[data-bancos-movimientos]')
      },
    },
    {
      text: '[[5]] Se abren tus libros con **Sin banco**. Revisa cada uno: ¿es de otra cuenta, de otra fecha o está de más?',
      caption: 'Tus libros con «Sin banco»: revisa cada uno',
      ready: '[data-bancos-movimientos]',
      marks: [{ ring: SIN_BANCO, n: 5, shape: 'box', pad: 3, nAt: 'b' }],
    },
    {
      text: '[[6]] **Antes del…**: Muelle no tiene los movimientos del banco de antes. Falta el saldo inicial o subir los estados de cuenta que dice abajo [[7]].',
      caption: 'Antes del…: falta el saldo inicial o estados de cuenta',
      route: (data) => cuentaRoute(data, '?cuadre=1'),
      action: async (w) => {
        await w.wait(SHEET_READY)
        await w.reveal([RAZON('antes'), '[data-bancos-cuadre-huecos]'])
      },
      ready: '[data-bancos-cuadre-huecos]',
      marks: [
        { ring: RAZON('antes'), n: 6, shape: 'box', pad: 7, nAt: 't' },
        { ring: '[data-bancos-cuadre-huecos]', n: 7, shape: 'box', pad: 5, nAt: 'b' },
      ],
    },
  ],
  ysi: [
    ['¿Y si mi cuenta no está conectada al banco?', 'La hoja te pregunta «¿Cuánto dice tu banco hoy?». Escríbelo y toca «Comparar»; no se guarda.'],
    ['¿Y si la primera línea dice que ya están en tus libros?', 'Esos no cambian la diferencia: ligarlos deja a la vista lo que sí falta. Ver «¿Cómo ligo los movimientos que ya están en mis libros?».'],
    ['¿Y si un registro de «Sin banco» era de otra cuenta?', 'Corrígelo en ese registro, o pídele a tu contador que lo mueva a la cuenta correcta.'],
    ['¿Y si sale «Movimientos del banco que Muelle no tiene»?', 'El banco se movió después de lo último que llegó. Conecta tu banco o sube el estado de cuenta.'],
  ],
  asistente: '¿Por qué no cuadra mi cuenta de cheques con el banco?',
  soporte: [
    'Pide la línea de la diferencia y las razones con su importe: suman la diferencia.',
    '«Antes del…» con importe es saldo inicial o estados de cuenta faltantes: decisión del dueño (DINERO_EN_ORDEN lane 3).',
    'Una venta en caja pagada directo a la cuenta todavía no se liga desde la hoja (DINERO_EN_ORDEN lane 2).',
  ],
  tecnico: TECNICO,
  playbook: 'bank-reconciliation',
  help: AYUDA,
}
