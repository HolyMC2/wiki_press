/**
 * A catalogue item with a selling price on the site's default selling price
 * list, and a search for it that only finds clean demo rows. `args.buscar`
 * narrows the pick to names containing that word, so the guide shows a
 * generic accessory rather than a model-specific part.
 *
 * The search (`data.query`) is the shortest start of the item's name whose
 * matches all have a price and a tidy name: no «Sin precio», no price typed
 * into the name, no stray spacing or shouting. Steps filter the product list
 * with it too, so no real catalogue row with a typo reaches a shot.
 *
 * The Productos list (`data.listQuery`) is filtered harder: its search is
 * looser than the Item name filter (word stems, the item group), so a short
 * search there brings other products whose photos carry a store's logo or
 * shelf sticker, and a photo cannot be renamed. `listQuery` is the first of
 * the item's whole name and its code whose list rows (the Productos service's
 * own `queue`, as the page reads it) are few, include the item, and all show
 * no photo (the app's initials placeholder) or a photo on PHOTOS_CHECKED.
 */
import { shopNames } from '../lib/fixtures.mjs'

const MAX_MATCHES = 4
// The Productos page's own list read (doco), so the rows checked are the rows shown.
const LIST_METHOD = 'doco.workspaces.products.queue'
const MAX_LIST_ROWS = 4

/**
 * Item codes whose product photo was opened and looked at for a guide (no
 * store logo, sticker, person or name). Empty: the chosen list shows only
 * products without a photo. Add a code only after looking at its thumbnail.
 */
export const PHOTOS_CHECKED = new Set()

/**
 * The Productos list rows that may not reach public media (pure: tested):
 * a row with a photo nobody checked. Empty when every row is clean.
 */
export function uncheckedPhotos(rows, checked = PHOTOS_CHECKED) {
  return (rows || []).filter(row => row.image && !checked.has(row.name))
}

/**
 * The search that filters the Productos list to the item and clean rows only,
 * or null. `queue(search)` answers the list's rows as the page reads them.
 */
export async function pickListQuery(pick, queue, { checked = PHOTOS_CHECKED, maxRows = MAX_LIST_ROWS } = {}) {
  for (const search of [pick.item_name.trim(), pick.item_code]) {
    const rows = (await queue(search)) || []
    if (!rows.length || rows.length > maxRows) continue
    if (!rows.some(row => row.name === pick.item_code)) continue
    if (uncheckedPhotos(rows, checked).length) continue
    return search
  }
  return null
}

/** A name fit for public media: words, not a code; no price, no doubled spaces, not all caps, no stuck keys. */
export function tidyName(name) {
  const text = String(name || '')
  const words = text.trim().split(/\s+/)
  return text === text.trim()
    && !/\s{2,}/.test(text)
    && !/\$|\d+\s*(pesos|mxn)\b/i.test(text)
    && words.length >= 2
    && text !== text.toUpperCase()
    && !/([^\d\s])\1\1/.test(text)
}

export default {
  name: 'catalogo-con-precio',
  describe: 'Un producto del catálogo con precio de venta y una búsqueda que solo encuentra filas limpias (solo lectura).',
  async resolve({ get, args }) {
    const settings = await get('frappe.client.get_value', { doctype: 'Selling Settings', fieldname: 'selling_price_list', filters: 'Selling Settings' })
    const priceList = settings?.selling_price_list
    const priced = [['selling', '=', 1], ['price_list_rate', '>', 0]]
    if (priceList) priced.push(['price_list', '=', priceList])
    const filters = [...priced]
    if (args.buscar) filters.push(['item_name', 'like', `%${args.buscar}%`])
    const prices = await get('frappe.client.get_list', {
      doctype: 'Item Price', fields: ['item_code', 'item_name', 'price_list_rate'], filters, order_by: 'item_name asc', limit_page_length: 40,
    })
    const tried = new Set()
    for (const pick of prices) {
      if (tried.has(pick.item_code) || !tidyName(pick.item_name)) continue
      tried.add(pick.item_code)
      const words = pick.item_name.trim().split(/\s+/)
      for (let n = Math.min(2, words.length); n <= words.length; n += 1) {
        const query = words.slice(0, n).join(' ')
        const matches = await get('frappe.client.get_list', {
          doctype: 'Item', fields: ['item_code', 'item_name'], filters: [['disabled', '=', 0], ['item_name', 'like', `%${query}%`]], limit_page_length: MAX_MATCHES + 1,
        })
        if (!matches.length || matches.length > MAX_MATCHES) continue
        // A longer search only drops rows: an untidy or unpriced match may go with one more word.
        if (!matches.every(row => tidyName(row.item_name))) continue
        const codes = matches.map(row => row.item_code)
        const rates = await get('frappe.client.get_list', {
          doctype: 'Item Price', fields: ['item_code'], filters: [...priced, ['item_code', 'in', codes]], limit_page_length: 50,
        })
        const withPrice = new Set(rates.map(row => row.item_code))
        if (!codes.every(code => withPrice.has(code))) continue
        const listQuery = await pickListQuery(pick, async (search) => (await get(LIST_METHOD, { view: 'todos', search, page_length: 30 }))?.rows)
        if (!listQuery) break
        return {
          data: { item_code: pick.item_code, item_name: pick.item_name, query, listQuery, price: pick.price_list_rate, matches: matches.length },
          rename: await shopNames(get),
        }
      }
    }
    throw new Error(`no hay un producto con precio${args.buscar ? ` que diga «${args.buscar}»` : ''} cuya búsqueda solo traiga filas limpias con precio y fotos revisadas`)
  },
}
