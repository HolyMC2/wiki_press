/**
 * Real names out of the site's JSON answers before the app reads them.
 *
 * The DOM mask (walker.mjs renameInPage) swaps names after they paint; a label
 * preview is an iframe srcdoc that redraws whole, so a real name could show
 * for a few frames before the mask reached it. Here the capture context's
 * routes rewrite every `/api/` JSON answer instead (the labels service's
 * `preview` HTML in `message.html`, `bootstrap`'s `message.design.shop`, and
 * any other field), so the app draws the demo word from its first paint. The
 * DOM mask stays as a second guard.
 */

// html.escape (Python) and the common numeric forms: a name inside preview HTML.
const HTML_FORMS = [
  (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;'),
  (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
]

/** Every [from, to] pair plus its HTML-escaped forms, longest `from` first. */
export function expandPairs(pairs) {
  const out = new Map()
  for (const [from, to] of pairs || []) {
    if (!from || from === to) continue
    if (!out.has(from)) out.set(from, to)
    for (const form of HTML_FORMS) {
      const escaped = form(from)
      if (!out.has(escaped)) out.set(escaped, form(to))
    }
  }
  return [...out].sort((a, b) => b[0].length - a[0].length)
}

/** `text` with every real name swapped (pairs already expanded). */
export function rewriteText(text, expanded) {
  let value = text
  for (const [from, to] of expanded) if (value.includes(from)) value = value.split(from).join(to)
  return value
}

/** A deep copy of a JSON value with every string (keys included) rewritten. */
export function rewriteJson(value, expanded) {
  if (typeof value === 'string') return rewriteText(value, expanded)
  if (Array.isArray(value)) return value.map((item) => rewriteJson(item, expanded))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [key, item] of Object.entries(value)) out[rewriteText(key, expanded)] = rewriteJson(item, expanded)
    return out
  }
  return value
}

/**
 * A JSON body with the names swapped (pairs already expanded), or null when
 * nothing changed (the original answer goes through untouched) or the body is
 * not JSON. Parsed, not searched: the server may write a name as \u escapes.
 */
export function rewriteBody(body, expanded) {
  if (!expanded?.length) return null
  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  const next = JSON.stringify(rewriteJson(parsed, expanded))
  return next === JSON.stringify(parsed) ? null : next
}

/** The site's API calls (same origin, `/api/`): the only answers rewritten. */
export function isApiUrl(url, base) {
  const u = new URL(url)
  return u.origin === new URL(base).origin && u.pathname.startsWith('/api/')
}

/**
 * Route every API answer of the context through the rewriter. Fixture reads go
 * through `context.request`, which routes do not touch, so fixtures still see
 * the real names they must list.
 */
export async function installResponseRename(context, base, pairs) {
  const expanded = expandPairs(pairs)
  if (!expanded.length) return
  await context.route((url) => isApiUrl(url.href, base), async (route) => {
    let response
    try {
      response = await route.fetch()
    } catch {
      return route.continue().catch(() => {})
    }
    const type = response.headers()['content-type'] || ''
    if (!/json/i.test(type)) return route.fulfill({ response })
    const next = rewriteBody(await response.text(), expanded)
    if (next == null) return route.fulfill({ response })
    const headers = { ...response.headers() }
    delete headers['content-length']
    delete headers['content-encoding']
    return route.fulfill({ response, headers, body: next })
  })
}
