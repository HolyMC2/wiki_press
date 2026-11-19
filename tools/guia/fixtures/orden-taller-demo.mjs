/**
 * orden-taller-demo: the newest repair order of the lab's demo customer, the
 * charge caja holds for it.
 *
 * The «Anticipos y cobro de una orden» guides walk ONE order from reception to
 * the charge: anticipo in caja, the part, its price, the charge. Every shoot
 * starts on a fresh demo order seeded on a lab tenant with demo data only
 * (customer «Sofía Ramos», a «Pantalla Honor X7A» in stock); this fixture only
 * reads it.
 */
const list = (get, doctype, filters, fields, extra = {}) =>
  get('frappe.client.get_list', { doctype, filters, fields, limit_page_length: 1, order_by: 'creation desc', ...extra })

export default {
  name: 'orden-taller-demo',
  describe: 'La orden de demostración más nueva y su cobro en caja.',
  async resolve({ get, args }) {
    const customer = args.cliente || 'Sofía Ramos'
    const [order] = (await list(get, 'Repair Order', { customer }, ['name', 'status', 'quote_amount'])) || []
    if (!order) throw new Error(`no hay orden de «${customer}»: siembra una orden demo en el sitio de laboratorio`)
    const [request] = (await list(get, 'POS Charge Request', { reference_doctype: 'Repair Order', reference_name: order.name, status: 'Open' }, ['name'])) || []
    // Only display words: the register reads company, warehouse and user
    // names as identifiers in its API answers, and a renamed company there
    // makes it treat its own device as a stranger. The lab demo tenant holds
    // no real shop names, so nothing else needs hiding.
    const rename = [['lista Standard Selling', 'lista de precios'], ['Material Transfer', 'Traspaso'], [' Nos disponibles', ' disponibles']]
    return {
      data: {
        order: order.name,
        status: order.status,
        pcr: request ? request.name : '',
        customer,
        part: args.pieza || 'Pantalla Honor X7A',
        partCode: args.codigo || 'PANT-HX7A',
        precio: Number(args.precio) || 900,
      },
      rename,
    }
  },
}
