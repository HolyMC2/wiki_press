/**
 * `guia video`: replay the guide's own steps on the lab site, record the
 * screen through the DevTools screencast, and compose a silent 1080×1920
 * video: the question on top, the whole phone, each step's es-MX caption
 * under it, an opening card with the question and a closing card with where
 * to find it. H.264, faststart, at most 16 MB, plus a poster PNG.
 *
 * Recording is ported from muelle-studio scripts/lib/walk.mjs (startRecording).
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { openSession, readSecret, siteBase, checkSite, loadPlaywright } from './session.mjs'
import { resolveFixture } from './fixtures.mjs'
import { walker, runStep, applyRename } from './walker.mjs'
import { drawMarks, clearMarks } from './marks.mjs'
import { plainText, resolve } from './guide.mjs'
import { guideDirs, ensure, writeJson, videoName, posterName } from './paths.mjs'

export const FPS = 30
export const CANVAS = [1080, 1920]
export const MAX_BYTES = 16 * 1024 * 1024
const INTRO = 2.5
const OUTRO = 3
const INK = '#FF5A1F'
const PAPER = '#F5F2EC'
const BODY = '#17181c'

const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const even = (n) => 2 * Math.round(n / 2)

async function startRecording(context, page, size) {
  const cdp = await context.newCDPSession(page)
  const frames = []
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    frames.push({ t: metadata.timestamp, data })
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: size[0], maxHeight: size[1], everyNthFrame: 1 })
  const startedAt = Date.now() / 1000
  return {
    startedAt,
    async stop(file) {
      const stoppedAt = Date.now() / 1000
      await cdp.send('Page.stopScreencast')
      if (!frames.length) throw new Error('el screencast no mandó cuadros')
      // Frames arrive only when the screen changes; the last one repeats to fill 30 fps.
      const n = Math.ceil((stoppedAt - startedAt) * FPS)
      const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
        '-vf', `scale=${size[0]}:${size[1]}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-r', String(FPS), file], { stdio: ['pipe', 'inherit', 'inherit'] })
      const done = new Promise((ok, fail) => ff.on('close', code => (code ? fail(new Error(`ffmpeg salió con ${code}`)) : ok())))
      let broken = false
      let wake = () => {}
      ff.stdin.on('error', () => { broken = true; wake() })
      ff.on('close', () => { broken = true; wake() })
      ff.stdin.on('drain', () => wake())
      let k = 0
      for (let i = 0; i < n && !broken; i++) {
        const t = startedAt + i / FPS
        while (k + 1 < frames.length && frames[k + 1].t <= t) k++
        if (!ff.stdin.write(Buffer.from(frames[k].data, 'base64'))) await new Promise(r => { wake = r })
      }
      ff.stdin.end()
      await done
      return { seconds: stoppedAt - startedAt, frames: frames.length }
    },
  }
}

/** Where the screen sits on the canvas (phone: under the question, over the caption). */
export function layout(screen) {
  const [W, H] = CANVAS
  const band = 230
  const caption = 200
  const room = H - band - caption
  const scale = Math.min(1, (W - 120) / screen[0], (room - 40) / screen[1])
  const w = even(screen[0] * scale)
  const h = even(screen[1] * scale)
  return { W, H, band, caption, x: even((W - w) / 2), y: even(band + (room - h) / 2), w, h, bezel: 16, radius: 44 }
}

const page = (body, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:${CANVAS[0]}px;height:${CANVAS[1]}px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:${BODY}}
  ${extra}</style></head><body>${body}</body></html>`

function backgroundHtml(guide, L) {
  return page(`<div style="position:absolute;inset:0;background:${PAPER}"></div>
    <div style="position:absolute;left:60px;right:60px;top:0;height:${L.band}px;display:flex;align-items:center;justify-content:center;text-align:center">
      <h1 style="margin:0;font-size:52px;line-height:1.12;font-weight:800;text-wrap:balance">${esc(guide.question)}</h1></div>
    <div style="position:absolute;left:${L.x - L.bezel}px;top:${L.y - L.bezel}px;width:${L.w + 2 * L.bezel}px;height:${L.h + 2 * L.bezel}px;border-radius:${L.radius + L.bezel}px;background:${BODY};box-shadow:0 18px 40px rgba(0,0,0,.25)"></div>`)
}

// Paints the bezel over the screen's square corners.
function cornersHtml(L) {
  return page(`<div style="position:absolute;left:${L.x}px;top:${L.y}px;width:${L.w}px;height:${L.h}px;border-radius:${L.radius}px;box-shadow:0 0 0 ${L.radius}px ${BODY}"></div>`, 'body{background:transparent}')
}

function captionHtml(L, n, text) {
  return page(`<div style="position:absolute;left:50px;right:50px;top:${CANVAS[1] - L.caption + 18}px;height:${L.caption - 36}px;display:flex;align-items:center;gap:22px">
      <div style="flex:none;width:72px;height:72px;border-radius:999px;background:${INK};color:#fff;font-size:40px;font-weight:800;display:grid;place-items:center;box-shadow:0 0 0 5px #fff">${n}</div>
      <p style="margin:0;font-size:44px;line-height:1.15;font-weight:700;text-wrap:balance">${esc(text)}</p></div>`, 'body{background:transparent}')
}

function cardHtml(top, main, bottom) {
  return page(`<div style="position:absolute;inset:0;background:${PAPER};display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 90px;text-align:center;gap:40px">
      <p style="margin:0;font-size:40px;font-weight:700;color:${INK}">${esc(top)}</p>
      <h1 style="margin:0;font-size:84px;line-height:1.08;font-weight:800;text-wrap:balance">${esc(main)}</h1>
      ${bottom ? `<p style="margin:0;font-size:40px;color:#555">${esc(bottom)}</p>` : ''}</div>`)
}

async function renderPng(browser, html, file, transparent = false) {
  const p = await browser.newPage({ viewport: { width: CANVAS[0], height: CANVAS[1] } })
  await p.setContent(html)
  await p.evaluate(() => document.fonts.ready)
  await p.screenshot({ path: file, omitBackground: transparent })
  await p.close()
}

/** The ffmpeg filter graph (pure: tested). Inputs: 0 raw, 1 background, 2 corners, 3 intro, 4 outro, 5… captions. */
export function filterGraph(L, steps, body) {
  const end = INTRO + body
  const chain = [
    `[0:v]tpad=start_mode=clone:start_duration=${INTRO}:stop_mode=clone:stop_duration=${OUTRO},scale=${L.w}:${L.h}:flags=lanczos,setsar=1[app]`,
    `[1:v][app]overlay=${L.x}:${L.y}:shortest=1[a]`,
    '[a][2:v]overlay=0:0[b0]',
  ]
  steps.forEach((step, i) => {
    const from = (INTRO + step.start).toFixed(3)
    const to = (INTRO + (steps[i + 1]?.start ?? body)).toFixed(3)
    chain.push(`[b${i}][${i + 5}:v]overlay=0:0:enable='between(t,${from},${to})'[b${i + 1}]`)
  })
  const last = `b${steps.length}`
  chain.push(`[${last}][3:v]overlay=0:0:enable='lt(t,${INTRO})'[c]`)
  // PNG layers are full range; WhatsApp and phones expect limited-range BT.709.
  chain.push(`[c][4:v]overlay=0:0:enable='gte(t,${end.toFixed(3)})',scale=out_range=tv:out_color_matrix=bt709,format=yuv420p[out]`)
  return chain.join(';')
}

export async function video(guide, { out, site, fixtures, log = console.log }) {
  const secret = readSecret()
  const base = siteBase(secret.base, site)
  const siteLabel = checkSite(base)
  const dirs = guideDirs(out, guide)
  ensure(dirs.video)
  const parts = ensure(path.join(dirs.video, 'parts'))
  const rawFile = path.join(parts, 'raw.mp4')
  const { chromium } = await loadPlaywright()
  const browser = await chromium.launch()
  const steps = []
  let rec
  let screen
  try {
    const session = await openSession(browser, { base, user: secret.user, password: secret.password, format: guide.format, video: true })
    const { context, page: tab, size } = session
    screen = [even(size.width * size.scale), even(size.height * size.scale)]
    const { data, rename } = await resolveFixture(fixtures, guide.fixture, { context, base, args: guide.fixtureArgs || {} })
    const w = walker(tab, base, { video: true })
    // The first screen loads before recording starts, so the video opens on a painted page.
    const first = guide.steps[0]
    if (first.route) await w.goto(first.route)
    await applyRename(tab, rename)
    const sweep = setInterval(() => { applyRename(tab, rename).catch(() => {}) }, 200)
    rec = await startRecording(context, tab, screen)
    const now = () => Date.now() / 1000 - rec.startedAt
    try {
      for (const [index, step] of guide.steps.entries()) {
        const caption = resolve(step.caption, data) || plainText(resolve(step.text, data))
        steps.push({ n: index + 1, caption, start: now() })
        await tab.waitForTimeout(700)
        await runStep(w, index === 0 ? { ...step, route: null } : step, data)
        await applyRename(tab, rename)
        await tab.waitForTimeout(500)
        const marks = resolve(step.marks, data) || []
        if (marks.length) {
          await drawMarks(tab, marks, { seed: 11 + index })
          steps[index].marked = now()
          await tab.waitForTimeout(2200)
          await clearMarks(tab)
        }
        await tab.waitForTimeout(900)
        steps[index].end = now()
      }
    } finally {
      clearInterval(sweep)
    }
    const raw = await rec.stop(rawFile)
    writeJson(path.join(dirs.video, 'timeline.json'), { guide: `${guide.area}/${guide.slug}`, site: siteLabel, screen, ...raw, steps })
    log(`grabado ${raw.seconds.toFixed(1)} s (${raw.frames} cuadros)`)
    await context.close()

    // Compose.
    const L = layout(screen)
    const png = (name) => path.join(parts, name)
    await renderPng(browser, backgroundHtml(guide, L), png('fondo.png'))
    await renderPng(browser, cornersHtml(L), png('esquinas.png'), true)
    await renderPng(browser, cardHtml('¿Cómo se hace?', guide.question, guide.quien.length ? `Para: ${guide.quien.join(', ')}` : ''), png('inicio.png'))
    await renderPng(browser, cardHtml('Lo encuentras en', guide.donde, ''), png('cierre.png'))
    for (const step of steps) await renderPng(browser, captionHtml(L, step.n, step.caption), png(`paso-${step.n}.png`), true)
    const file = path.join(dirs.video, videoName(guide))
    const inputs = ['-i', rawFile, '-loop', '1', '-i', png('fondo.png'), '-loop', '1', '-i', png('esquinas.png'), '-loop', '1', '-i', png('inicio.png'), '-loop', '1', '-i', png('cierre.png'),
      ...steps.flatMap(step => ['-loop', '1', '-i', png(`paso-${step.n}.png`)])]
    const total = INTRO + raw.seconds + OUTRO
    let crf = 23
    for (;;) {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filterGraph(L, steps, raw.seconds), '-map', '[out]', '-t', total.toFixed(3),
        '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-r', String(FPS), '-an', '-movflags', '+faststart', file], { stdio: 'inherit' })
      const bytes = fs.statSync(file).size
      if (bytes <= MAX_BYTES || crf >= 35) break
      crf += 3
    }
    const bytes = fs.statSync(file).size
    // Poster: the last step with its marks drawn (the action the guide leads to).
    const poster = path.join(dirs.video, posterName(guide))
    const marked = [...steps].reverse().find(step => step.marked != null)
    const posterAt = INTRO + (marked ? marked.marked + 1 : raw.seconds * 0.5)
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', posterAt.toFixed(2), '-i', file, '-frames:v', '1', poster])
    // A frame per step for the critique: the end of each step.
    const frames = ensure(path.join(dirs.video, 'cuadros'))
    for (const step of steps) {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', (INTRO + step.end - 0.4).toFixed(2), '-i', file, '-frames:v', '1', '-vf', 'scale=540:-2', path.join(frames, `paso-${step.n}.png`)])
    }
    log(`video: ${file} (${(bytes / 1024 / 1024).toFixed(1)} MB, ${total.toFixed(1)} s, crf ${crf})`)
    log(`póster: ${poster}`)
    if (bytes > MAX_BYTES) throw new Error(`el video pesa más de 16 MB (${bytes} bytes)`)
    if (total < 20 || total > 60) log(`aviso: dura ${total.toFixed(1)} s; la norma pide de 20 a 60 s`)
    return { file, poster, seconds: total, bytes }
  } finally {
    await browser.close()
  }
}
