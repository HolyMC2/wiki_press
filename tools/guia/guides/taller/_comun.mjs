// Shared by the «Taller y caja» guides: one demo order walked from its anticipo to its charge.
export const ORDEN = (data, tab = '') => `/taller/orders/${encodeURIComponent(data.order)}${tab ? `?tab=${tab}` : ''}`
export const TAB = (label) => `nav.order-sections button:has-text("${label}")`
export const ANTICIPO = '[data-testid="advance-card"]'
export const COBRAR_ANTICIPO = '[data-testid="advance-collect"]'
export const RECIBOS = '[data-testid="advance-receipts"]'
export const SALDO_CHIP = '[data-band-cobro]'
export const AGREGAR = 'button:has-text("Agregar refacción o servicio")'
export const BUSCAR_PIEZA = 'input[placeholder^="Nombre o código"]'
export const CONFIRMAR = 'button:has-text("Confirmar y agregar")'
export const RESERVADA = 'span:has-text("Reservada en")'
export const PRECIO = 'button[title="Editar precio"]'
export const NO_CUADRA = '[data-testid="quote-difference"]'
// Caja
export const FUENTE = '[data-testid="pay-source"]'
export const ENVIAR = '[data-testid="pay-submit"]'
export const VOLVER = '[data-testid="shell-return"]'
export const ORDENES = '/posapp/pos/service-order'
export const TARJETA = (data) => `[data-testid="orden-card-${data.pcr}"]`
export const DETALLE = '[data-testid="orden-detail"]'
export const TOTALES = '.orden-detail__totals'
export const BANDA = '[data-testid="action-band"]'
export const PRIMARIO = '[data-testid="band-primary"]'
export const ANTICIPO_VENTA = '[data-testid="sale-advance"]'
export const LINEA = (data) => `td:has-text("${data.part}")`
export const NOTA_PRECIO = '[data-testid="line-detail-charge-price"]'
export const BUSY = ['Cargando', 'Abriendo caja', 'Guardando', 'Buscando']
export const TECNICO = 'taller/docs/PLAN.md'
export const AYUDA_TALLER = [
  { context_type: 'SPA Route', context_key: '/taller/orders' },
  { context_type: 'DocType', context_key: 'Repair Order' },
]
export const AYUDA_CAJA = [
  { context_type: 'SPA Route', context_key: '/posapp/pos/service-order' },
  { context_type: 'DocType', context_key: 'POS Charge Request' },
]
