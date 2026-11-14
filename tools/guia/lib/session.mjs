/**
 * A logged-in browser on a lab site, as the lab playwright-bot user.
 *
 * Credentials are read here, from the host secret file (KEY=value lines:
 * CRM_BASE_URL, CRM_TEST_USER, CRM_TEST_PASSWORD), and never pass through a
 * shell, argv or the output. Login is a POST to /api/method/login: one-time
 * login links are rate-limited and burn out on repeated walks.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const SECRET_FILE = process.env.GUIA_SECRET_FILE || path.join(os.homedir(), '.secrets/lab-bot.env')

// Sites holding data that must not show up in public media, or that are not ours to write.
export const REFUSED_SITES = ['mumu-mirror', 'demo', 'clinica']

/**
 * Screen sizes and device pixel ratio. Stills and video use the same one, so
 * both show the same screen in the same state (a bar that fits one height and
 * not the other would differ between them); the video scales it into the
 * 1080×1920 canvas.
 */
export const FORMATS = {
  phone: { viewport: { width: 412, height: 915 }, scale: 2, mobile: true },
  desktop: { viewport: { width: 1280, height: 800 }, scale: 1.25, mobile: false },
  'desktop-wide': { viewport: { width: 1440, height: 900 }, scale: 1.25, mobile: false },
}

/** The capture-only stylesheet (capture.css): counts and notices that are not the guide's screen. */
export const CAPTURE_CSS = fs.readFileSync(new URL('./capture.css', import.meta.url), 'utf8')

// Installs CAPTURE_CSS in every frame, srcdoc previews included, before the app paints.
export const CAPTURE_SCRIPT = `(() => {
  const css = ${JSON.stringify(CAPTURE_CSS)};
  const add = () => {
    if (document.getElementById('guia-capture-css')) return;
    const s = document.createElement('style'); s.id = 'guia-capture-css'; s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  };
  if (document.documentElement) add(); else addEventListener('DOMContentLoaded', add);
  addEventListener('DOMContentLoaded', add);
})();`

const PHONE_AGENT = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'

export function parseEnv(text) {
  const out = {}
  for (const line of text.split('\n')) {
    const found = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (found) out[found[1]] = found[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

/**
 * The base URL of `site` (the first DNS label, e.g. `lab` or `doco-mirror`),
 * on the same lab domain as the secret file's base URL. Without a site, the
 * secret's own base.
 */
export function siteBase(secretBase, site) {
  const base = new URL(secretBase)
  if (!site) return base.origin
  if (!/^[a-z0-9-]+$/.test(site)) throw new Error(`sitio inválido «${site}»`)
  const rest = base.hostname.split('.').slice(1).join('.')
  return `${base.protocol}//${site}.${rest}`
}

export function checkSite(base) {
  const label = new URL(base).hostname.split('.')[0]
  if (REFUSED_SITES.includes(label)) throw new Error(`el sitio «${label}» está en cuarentena para guías; usa doco-mirror o lab`)
  return label
}

export function readSecret() {
  if (!fs.existsSync(SECRET_FILE)) throw new Error(`falta ${SECRET_FILE}; córrelo con muelle/scripts/ensure-lab-bot.sh <sitio>`)
  const env = parseEnv(fs.readFileSync(SECRET_FILE, 'utf8'))
  for (const key of ['CRM_BASE_URL', 'CRM_TEST_USER', 'CRM_TEST_PASSWORD']) if (!env[key]) throw new Error(`${SECRET_FILE} no trae ${key}`)
  return { base: env.CRM_BASE_URL, user: env.CRM_TEST_USER, password: env.CRM_TEST_PASSWORD }
}

/** Playwright from PLAYWRIGHT, this tree, or the crm checkout. */
export async function loadPlaywright() {
  const tries = [
    process.env.PLAYWRIGHT,
    'playwright',
    path.join(os.homedir(), 'muelle-host/crm/node_modules/playwright/index.mjs'),
    path.join(os.homedir(), 'muelle-host/crm/frontend/node_modules/playwright/index.mjs'),
  ].filter(Boolean)
  for (const spec of tries) {
    try {
      return await import(spec)
    } catch { /* next */ }
  }
  throw new Error('no encuentro Playwright: PLAYWRIGHT=/ruta/a/playwright/index.mjs')
}

// Phone numbers and IMEIs keep only their last four digits on screen
// (muelle-studio scripts/lib/walk.mjs): runs of 9–16 digits with single spaces.
export const MASK_SCRIPT = `(() => {
  const re = /(^|[^\\w$.,:/-])(\\+?\\d(?: ?\\d){8,15})(?![\\w.,:/-])/g;
  const hide = (num) => { let keep = 4; return [...num].reverse().map((ch) => (/\\d/.test(ch) ? (keep-- > 0 ? ch : '•') : ch)).reverse().join(''); };
  const mask = (s) => (s && /\\d{3}/.test(s) ? s.replace(re, (m, pre, num) => pre + hide(num)) : s);
  const fix = (n) => { const p = n.parentElement; if (p && /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.tagName)) return; const v = n.nodeValue; const m = mask(v); if (m !== v) n.nodeValue = m; };
  const sweep = (root) => { const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = it.nextNode())) fix(n); };
  const start = () => {
    sweep(document.body);
    new MutationObserver((records) => { for (const r of records) { if (r.type === 'characterData') fix(r.target); else for (const n of r.addedNodes) n.nodeType === 3 ? fix(n) : n.nodeType === 1 && sweep(n); } })
      .observe(document.body, { subtree: true, childList: true, characterData: true });
  };
  if (document.body) start(); else addEventListener('DOMContentLoaded', start);
})();`

/** The longest a tap's ring stays on screen (ms): it never outlives the tap's own screen. */
export const RING_MS = 350

/**
 * Whether a tap's ring must go now (pure: tested, and inlined in TOUCH_SCRIPT).
 * It ends at RING_MS, or as soon as the tapped control leaves: off the page,
 * moved or resized by more than a pixel (a row that slides up), fading out or
 * no longer what is under the finger (a list closing with a leave transition
 * while the next controls slide in under it). The ring marks a control, never
 * the screen that replaced it.
 */
export function ringEnds({ elapsed, connected, from, to, shown = true }, cap = RING_MS) {
  if (elapsed >= cap || !connected || !shown || !from || !to) return true
  return Math.abs(to.x - from.x) > 1 || Math.abs(to.y - from.y) > 1 || Math.abs(to.width - from.width) > 1 || Math.abs(to.height - from.height) > 1
}

// Video only: a dot where the finger lands and a ring on press. The ring is
// watched every frame (ringEnds) and removed with its control's change;
// window.__guiaTouchIdle() says when neither shows, so a tap ends only then.
export const TOUCH_SCRIPT = `(() => {
  if (window.__guiaTouch) return; window.__guiaTouch = true;
  const RING_MS = ${RING_MS};
  const ringEnds = ${ringEnds.toString()};
  const css = '.guia-dot{position:fixed;z-index:2147483646;pointer-events:none;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(255,90,31,.28);border:3px solid rgba(255,255,255,.95);box-shadow:0 2px 10px rgba(0,0,0,.35);transition:opacity .25s,transform .25s;opacity:0;transform:scale(.6)}'
    + '.guia-ring{position:fixed;z-index:2147483646;pointer-events:none;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid rgba(255,90,31,.9);animation:guia-ring ' + RING_MS + 'ms ease-out forwards}'
    + '@keyframes guia-ring{from{transform:scale(.6);opacity:1}to{transform:scale(1.9);opacity:0}}';
  const add = () => { const s = document.createElement('style'); s.textContent = css; document.documentElement.appendChild(s); };
  if (document.documentElement) add(); else addEventListener('DOMContentLoaded', add);
  let dot;
  let dotUntil = 0;
  const rings = new Set();
  window.__guiaDot = (x, y) => {
    if (!dot || !dot.isConnected) { dot = document.createElement('div'); dot.className = 'guia-dot'; document.body.appendChild(dot); }
    dot.style.left = x + 'px'; dot.style.top = y + 'px';
    requestAnimationFrame(() => { dot.style.opacity = '1'; dot.style.transform = 'scale(1)'; });
  };
  window.__guiaDotOff = () => { if (dot) { dot.style.opacity = '0'; dot.style.transform = 'scale(.6)'; dotUntil = performance.now() + 260; } };
  window.__guiaTouchIdle = () => !rings.size && performance.now() >= dotUntil;
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
  // The tapped control, not the label span inside it.
  const control = (el) => el.closest('button, a, input, select, textarea, label, [role="button"], [role="option"], li') || el;
  const opacity = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= +getComputedStyle(n).opacity; return o; };
  // Still showing and still what the finger is on: not fading out, not covered.
  const shown = (el, x, y) => {
    if (opacity(el) < 0.9) return false;
    const hit = document.elementFromPoint(x, y);
    return !!hit && (el.contains(hit) || hit.contains(el));
  };
  addEventListener('pointerdown', (e) => {
    const r = document.createElement('div'); r.className = 'guia-ring';
    r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
    document.body.appendChild(r); rings.add(r);
    const el = e.target instanceof Element ? control(e.target) : null;
    const from = el ? box(el) : null;
    const x = e.clientX; const y = e.clientY;
    const t0 = performance.now();
    const end = () => { r.remove(); rings.delete(r); };
    const watch = () => {
      if (!rings.has(r)) return;
      const connected = !!el && el.isConnected;
      const state = { elapsed: performance.now() - t0, connected, from, to: connected ? box(el) : null, shown: connected && shown(el, x, y) };
      if (ringEnds(state, RING_MS)) {
        end();
        // The control left before the cap: the finger's dot goes with it, no fade over the new screen.
        if (state.elapsed < RING_MS && dot) { dot.style.transition = 'none'; dot.style.opacity = '0'; dot.style.transform = 'scale(.6)'; requestAnimationFrame(() => { dot.style.transition = ''; }); }
      } else requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
    // A backstop for a hidden tab, where frames stop.
    setTimeout(end, RING_MS);
  }, true);
})();`

/**
 * A browser context at the guide's format, logged in, with the capture
 * stylesheet and the phone-number mask. `video` adds the touch dot only; the
 * viewport is the stills' one.
 */
export async function openSession(browser, { base, user, password, format, video = false }) {
  const f = FORMATS[format]
  const size = { ...f.viewport, scale: f.scale }
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.scale,
    locale: 'es-MX',
    timezoneId: 'America/Mazatlan',
    serviceWorkers: 'block',
    ...(f.mobile ? { userAgent: PHONE_AGENT, isMobile: true, hasTouch: true } : {}),
  })
  await context.addInitScript(CAPTURE_SCRIPT)
  await context.addInitScript(MASK_SCRIPT)
  if (video) await context.addInitScript(TOUCH_SCRIPT)
  const answer = await context.request.post(`${base}/api/method/login`, { form: { usr: user, pwd: password }, failOnStatusCode: false })
  if (answer.status() !== 200) {
    await context.close()
    throw new Error(`el inicio de sesión del bot respondió ${answer.status()}`)
  }
  const who = await context.request.get(`${base}/api/method/frappe.auth.get_logged_user`, { failOnStatusCode: false })
  const logged = who.ok() ? (await who.json()).message : null
  if (!logged || logged === 'Guest') {
    await context.close()
    throw new Error('la sesión quedó como Guest')
  }
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(`pageerror: ${error.message.split('\n')[0]}`))
  page.on('console', message => {
    if (message.type() !== 'error') return
    const url = message.location()?.url || ''
    // Known noise: telemetry pulse 403 for non-admins, socket.io sid churn, and
    // sandboxed srcdoc previews (label previews) refusing their inline scripts.
    if (/telemetry\.pulse|socket\.io/.test(url) || /socket\.io|about:srcdoc' because the document's frame is sandboxed/.test(message.text())) return
    errors.push(`console: ${message.text().slice(0, 200)}`)
  })
  return { context, page, errors, size }
}

/** A whitelisted method from Node with the session's cookies (read-only fixtures). */
export async function apiGet(context, base, method, args = {}) {
  const url = new URL(`${base}/api/method/${method}`)
  for (const [key, value] of Object.entries(args)) url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value))
  const answer = await context.request.get(url.href, { failOnStatusCode: false })
  if (!answer.ok()) throw new Error(`${method} respondió ${answer.status()}`)
  return (await answer.json()).message
}
