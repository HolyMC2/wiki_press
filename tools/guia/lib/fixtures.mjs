/**
 * Named demo fixtures. A fixture module (`fixtures/<name>.mjs`) exports
 *
 *   { name, describe, async resolve({ get, args }) → { data, rename } }
 *
 * `get(method, args)` is a GET on the site with the bot's session: fixtures
 * read what the site already has and never write. `data` goes to the steps
 * (what to search, which product); `rename` is a list of [real, demo] pairs
 * swapped on screen so no company or store name reaches public media.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { apiGet } from './session.mjs'

export async function loadFixture(dir, name) {
  const file = path.join(dir, `${name}.mjs`)
  if (!fs.existsSync(file)) throw new Error(`no existe el fixture «${name}» (${file})`)
  const fixture = (await import(pathToFileURL(file).href)).default
  if (typeof fixture?.resolve !== 'function') throw new Error(`el fixture «${name}» no exporta resolve()`)
  return fixture
}

export async function resolveFixture(dir, name, { context, base, args = {} }) {
  const fixture = await loadFixture(dir, name)
  const get = (method, params) => apiGet(context, base, method, params)
  const out = (await fixture.resolve({ get, args })) || {}
  return { data: out.data || {}, rename: (out.rename || []).filter(([from, to]) => from && from !== to) }
}

/** Company and store names on the site → demo words. Shared by fixtures. */
export async function shopNames(get) {
  const pairs = []
  const list = async (doctype, field) => {
    try {
      return await get('frappe.client.get_list', { doctype, fields: [field], limit_page_length: 50 })
    } catch {
      return []
    }
  }
  for (const row of await list('Company', 'company_name')) pairs.push([row.company_name, 'Tu empresa'])
  for (const row of await list('Mercado Shop', 'shop_name')) pairs.push([row.shop_name, 'Tu tienda'])
  // Longest first, so «Tienda Centro #1» is swapped before «Tienda Centro».
  return pairs.filter(([from]) => from && from.length > 2).sort((a, b) => b[0].length - a[0].length)
}
