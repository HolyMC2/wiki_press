/**
 * banco-demo: an invented business's bank, card and cash for the Bancos guides.
 *
 * A lab mirror holds real books (people's names in transfer descriptions, real
 * balances), so the Bancos screens are never shot with its answers: every call
 * these screens make is answered here (rewrite.mjs installAnswers) with data of
 * the shape crm/api/bancos.py and crm/api/bancos_cuadre.py return. The screens
 * are the app's own code; only the numbers and names are made up. The company
 * and the permissions come from the site, renamed to «Tu empresa».
 *
 * The cuadre adds up: bank − books = 48,250.00 − 45,120.50 = 3,129.50
 *   = pares 0 + solo_banco 2,329.50 + solo_libros 1,800.00 + antes −1,000.00.
 * Dates count back from today in the shop's zone, so a reshoot stays current.
 */
import { shopNames } from '../lib/fixtures.mjs'

const ZONE = 'America/Mazatlan'
const CHEQUES = 'Cuenta de cheques - TE'
const TARJETA = 'Tarjeta del negocio - TE'
const CAJA = 'Caja - TE'
const CONEXION = 'SYNC-DEMO-0001'
const CAN = {
  bancos: true,
  catalogo: true,
  saldos: true,
  movimientos: true,
  conciliar: true,
  crear_cuenta: true,
  conectados: true,
  conectar: true,
}

/** YYYY-MM-DD of today minus `back` days, in the shop's zone. */
export function day(back = 0, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const date = new Date(`${today}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - back)
  return date.toISOString().slice(0, 10)
}
const month = (back) => day(back).slice(0, 7)

/** The demo's answers; `now` fixes the dates in tests. */
export function demo(now = new Date()) {
  const d = (back) => day(back, now)
  const syncedAt = `${d(0)} 09:15:00`
  const bankFigure = { amount: 48250, at: syncedAt }
  const cards = [
    { cuenta: CHEQUES, kind: 'banco', label: 'Cuenta de cheques', bank: '', last4: '4821', ledger: CHEQUES, currency: 'MXN', balance: 45120.5, bank_balance: bankFigure, diferencia: 3129.5, pending: 10, reconcilable: true },
    { cuenta: TARJETA, kind: 'tarjeta', label: 'Tarjeta del negocio', bank: '', last4: '0937', ledger: TARJETA, currency: 'MXN', balance: 6380, bank_balance: { amount: 6380, at: syncedAt }, diferencia: 0, pending: 0, reconcilable: true },
    { cuenta: CAJA, kind: 'efectivo', label: 'Caja', bank: '', last4: '', ledger: CAJA, currency: 'MXN', balance: 7450, bank_balance: null, diferencia: null, pending: null, reconcilable: false },
  ]
  const account = { name: 'SA-DEMO-0001', label: 'Cuenta de cheques', last4: '4821', type: 'Checking', currency: 'MXN', balance: 48250, balance_at: syncedAt, cuenta: CHEQUES, cuenta_label: 'Cuenta de cheques', linked: true, contador: false, relink: false, waiting: { revisar: 0, sin_enlazar: 0 } }
  const conexion = {
    name: CONEXION, title: 'Tu banco', bank: 'Tu banco', user: '', kind: 'Bank', kind_word: 'Banco',
    status: 'Connected', word: 'Conectada', tone: 'ok', step: 'sync', detail: '', asks_code: false,
    ready_at: '', refreshed_at: syncedAt, pulled_at: syncedAt, feeds_contador: false, company: '', credential: 'demo',
  }
  const mov = (name, back, amount, title, detail = '') => ({ name, date: d(back), amount, title, detail })
  const reg = (doctype, name, back, amount, word, party) => ({ doctype, name, date: d(back), amount, word, party, matchable: true, readable: true })
  const pairs = [
    { movimiento: mov('ACC-BTN-2026-0101', 3, 1850, 'Transferencia recibida', 'Cliente de mostrador'), registro: reg('Payment Entry', 'ACC-PAY-2026-0201', 3, 1850, 'Cobro', 'Cliente de mostrador'), ligable: true },
    { movimiento: mov('ACC-BTN-2026-0102', 6, -3420, 'Proveedor de refacciones', 'Transferencia enviada'), registro: reg('Payment Entry', 'ACC-PAY-2026-0202', 6, -3420, 'Pago', 'Proveedor de refacciones'), ligable: true },
    { movimiento: mov('ACC-BTN-2026-0103', 9, 960, 'Transferencia recibida', 'Cliente de mostrador'), registro: reg('Payment Entry', 'ACC-PAY-2026-0203', 10, 960, 'Cobro', 'Cliente de mostrador'), ligable: true },
    { movimiento: mov('ACC-BTN-2026-0104', 13, -8500, 'Renta del local', 'Transferencia enviada'), registro: reg('Payment Entry', 'ACC-PAY-2026-0204', 13, -8500, 'Pago', 'Renta del local'), ligable: true },
  ]
  const start = d(76)
  const cuadre = {
    cuenta: CHEQUES, kind: 'banco', currency: 'MXN', as_of: d(0),
    bank: 48250, bank_at: syncedAt, bank_source: 'conexion', books: 45120.5, difference: 3129.5, agrees: false,
    start, first: d(160), holes: [month(105)], behind: false,
    before: { count: 12, from: d(160), to: d(120) },
    opening: { bank: 12400, books: 13400 },
    lines: [
      { key: 'pares', count: 4, amount: -9110, effect: 0 },
      { key: 'solo_banco', count: 6, amount: 2329.5, effect: 2329.5 },
      { key: 'solo_libros', count: 2, amount: -1800, effect: 1800 },
      { key: 'antes', count: 0, amount: -1000, effect: -1000 },
    ],
    pairs, pairs_total: 4, only_bank: [], only_bank_total: 6, only_books: [], only_books_total: 2,
    conexion: CONEXION, can: { ligar: true, conectar: true }, engine: 'erpnext',
  }
  const bankRow = (name, back, amount, title, detail, state = 'pendiente') => ({
    name, date: d(back), amount, currency: 'MXN', title, detail, reference: '', remaining: state === 'conciliado' ? 0 : Math.abs(amount), state, matches: [],
  })
  const bankRows = [
    bankRow('ACC-BTN-2026-0110', 1, 3000, 'Depósito en efectivo', 'Depósito'),
    bankRow('ACC-BTN-2026-0111', 2, -116, 'Comisión del banco', 'Cargo'),
    bankRow('ACC-BTN-2026-0101', 3, 1850, 'Transferencia recibida', 'Cliente de mostrador'),
    bankRow('ACC-BTN-2026-0112', 4, -310.5, 'Pago con tarjeta de débito', 'Papelería'),
    bankRow('ACC-BTN-2026-0102', 6, -3420, 'Proveedor de refacciones', 'Transferencia enviada'),
    bankRow('ACC-BTN-2026-0113', 7, -244, 'Pago de internet', 'Cargo domiciliado'),
    bankRow('ACC-BTN-2026-0103', 9, 960, 'Transferencia recibida', 'Cliente de mostrador'),
    bankRow('ACC-BTN-2026-0104', 13, -8500, 'Renta del local', 'Transferencia enviada'),
    bankRow('ACC-BTN-2026-0090', 15, 5200, 'Transferencia recibida', 'Cliente de mostrador', 'conciliado'),
  ]
  const bookRow = (name, back, amount, title, detail, doctype, voucher, paymentType = null) => ({
    name, date: d(back), amount, debit: amount > 0 ? amount : 0, credit: amount < 0 ? -amount : 0, title, detail,
    voucher: { doctype, name: voucher, payment_type: paymentType }, balance: null, account: CHEQUES,
  })
  const sinBanco = [
    bookRow('ACC-GLE-2026-0301', 5, -1200, 'Proveedor de pantallas', 'Pago', 'Payment Entry', 'ACC-PAY-2026-0301', 'Pay'),
    bookRow('ACC-GLE-2026-0302', 11, -600, 'Pago de luz', 'Póliza', 'Journal Entry', 'ACC-JV-2026-0302'),
  ]
  const bookRows = [
    bookRow('ACC-GLE-2026-0201', 3, 1850, 'Cliente de mostrador', 'Cobro', 'Payment Entry', 'ACC-PAY-2026-0201', 'Receive'),
    sinBanco[0],
    bookRow('ACC-GLE-2026-0202', 6, -3420, 'Proveedor de refacciones', 'Pago', 'Payment Entry', 'ACC-PAY-2026-0202', 'Pay'),
    bookRow('ACC-GLE-2026-0203', 10, 960, 'Cliente de mostrador', 'Cobro', 'Payment Entry', 'ACC-PAY-2026-0203', 'Receive'),
    sinBanco[1],
    bookRow('ACC-GLE-2026-0204', 13, -8500, 'Renta del local', 'Pago', 'Payment Entry', 'ACC-PAY-2026-0204', 'Pay'),
    bookRow('ACC-GLE-2026-0190', 15, 5200, 'Cliente de mostrador', 'Cobro', 'Payment Entry', 'ACC-PAY-2026-0190', 'Receive'),
  ]
  const header = (card) => ({
    ...card,
    ledger_label: card.label,
    company: '',
    conexion: card.cuenta === CHEQUES ? { ...conexion, waiting: { revisar: 0, sin_enlazar: 0 } } : null,
  })
  return { cards, conexion: { ...conexion, accounts: [account] }, cuadre, bankRows, bookRows, sinBanco, header, CHEQUES }
}

export default {
  name: 'banco-demo',
  describe: 'Cuenta de cheques que no cuadra por $3,129.50, tarjeta que cuadra y caja: datos inventados',
  async resolve({ get }) {
    const rename = await shopNames(get)
    const data = demo()
    const company = async (real) => {
      try {
        return (await real())?.company || ''
      } catch {
        return ''
      }
    }
    const answers = {
      'crm.api.bancos.cuentas': async (_params, real) => {
        const name = await company(real)
        return {
          company: name, empresas: name ? [name] : [], currency: 'MXN', as_of: day(0),
          total: 52570.5, pending: 10, cards: data.cards, can: CAN, engine: 'erpnext',
        }
      },
      'crm.api.bancos.conexiones': async () => ({
        enabled: true, environment: 'Production', company: '', conexiones: [data.conexion], can: CAN,
      }),
      'crm.api.bancos.cuenta': async (params) => {
        const card = data.cards.find(row => row.cuenta === params.cuenta) || data.cards[0]
        return { header: data.header(card), can: CAN, engine: 'erpnext' }
      },
      'crm.api.bancos.movimientos': async (params) => {
        const libros = params.vista === 'libros' || params.cuenta === CAJA
        if (params.cuenta !== data.CHEQUES) return { rows: [], next: null, readable: true, vista: libros ? 'libros' : 'banco', ...(libros ? { carry: null } : {}) }
        if (!libros) {
          const rows = params.filtro === 'pendientes' ? data.bankRows.filter(row => row.state !== 'conciliado') : data.bankRows
          return { rows, next: null, readable: true, vista: 'banco' }
        }
        return { rows: params.filtro === 'sin_banco' ? data.sinBanco : data.bookRows, next: null, readable: true, vista: 'libros', carry: null }
      },
      'crm.api.bancos_cuadre.cuadre': async () => data.cuadre,
      'crm.api.bancos_cuadre.ligar': async (params) => {
        let pares = []
        try {
          pares = JSON.parse(params.pares || '[]')
        } catch { /* none */ }
        return { ligados: pares.map(pair => ({ movimiento: pair.movimiento, name: pair.name })), rechazados: [] }
      },
    }
    return { data: { cuenta: CHEQUES, pares: data.cuadre.pairs.length }, rename, answers }
  },
}
