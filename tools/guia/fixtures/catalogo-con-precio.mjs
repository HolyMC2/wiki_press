/**
 * A catalogue item with a selling price on the site's default selling price
 * list. `args.buscar` narrows the pick to names containing that word, so the
 * guide shows a generic accessory rather than a model-specific part.
 */
import { shopNames } from '../lib/fixtures.mjs'

export default {
  name: 'catalogo-con-precio',
  describe: 'Un producto del catálogo con precio de venta (solo lectura).',
  async resolve({ get, args }) {
    const settings = await get('frappe.client.get_value', { doctype: 'Selling Settings', fieldname: 'selling_price_list', filters: 'Selling Settings' })
    const priceList = settings?.selling_price_list
    const filters = [['selling', '=', 1], ['price_list_rate', '>', 0]]
    if (priceList) filters.push(['price_list', '=', priceList])
    if (args.buscar) filters.push(['item_name', 'like', `%${args.buscar}%`])
    const prices = await get('frappe.client.get_list', {
      doctype: 'Item Price', fields: ['item_code', 'item_name', 'price_list_rate'], filters, order_by: 'item_name asc', limit_page_length: 40,
    })
    // A readable name: no price in the name, not a one-word code.
    const pick = prices.find(row => !/\$/.test(row.item_name) && row.item_name.trim().split(/\s+/).length >= 2)
    if (!pick) throw new Error(`no hay un producto con precio${args.buscar ? ` que diga «${args.buscar}»` : ''}`)
    const words = pick.item_name.trim().split(/\s+/)
    return {
      data: { item_code: pick.item_code, item_name: pick.item_name, query: words.slice(0, 2).join(' '), price: pick.price_list_rate },
      rename: await shopNames(get),
    }
  },
}
