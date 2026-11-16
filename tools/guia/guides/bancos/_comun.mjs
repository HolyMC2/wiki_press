// Shared by the Bancos guides (PLAN §12.5). Hooks frozen by lane cuadre's owner.
export const cuentaRoute = (data, query = '') => `/crm/bancos/cuenta/${encodeURIComponent(data.cuenta)}${query}`
export const CARD = (data) => `[data-bancos-card][data-cuenta="${data.cuenta}"]`
export const CARD_TARJETA = '[data-bancos-card][data-cuenta="Tarjeta del negocio - TE"]'
export const SHEET = '[data-bancos-cuadre]'
export const RAZON = (key) => `[data-cuadre-razon="${key}"]`
// The sheet's reasons drawn, nothing still comparing.
export const SHEET_READY = '[data-bancos-cuadre-razones]'
export const BUSY = ['Comparando con el banco', 'Cargando movimientos', 'Cargando']
export const TECNICO = 'crm/docs/DINERO_EN_ORDEN.md'
export const AYUDA = [
  { context_type: 'SPA Route', context_key: '/crm/bancos' },
  { context_type: 'DocType', context_key: 'Bank Transaction' },
]
