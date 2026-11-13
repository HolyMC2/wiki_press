/**
 * `guia critique`: a contact sheet of every shot with what the probes found,
 * and DEFECTS.md. Exits non-zero when anything blocks publishing; the person
 * running it still looks at every frame (the probes do not see design).
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadPlaywright } from './session.mjs'
import { guideDirs, ensure, readJson } from './paths.mjs'

/** Shot time as the shop reads it; shots.json keeps the ISO value. */
export function shotTime(iso, timeZone = 'America/Mazatlan') {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return String(iso)
  return date.toLocaleString('es-MX', { timeZone, dateStyle: 'medium', timeStyle: 'short' })
}

const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** DEFECTS.md for a shots.json (pure: tested). */
export function defectsMarkdown(guide, shot) {
  const lines = [`# Hallazgos: ${guide.question}`, '', `Guía \`${guide.area}/${guide.slug}\` · sitio ${shot.site} · ${shot.format} · tomada ${shotTime(shot.shotAt)}`, '']
  const all = shot.shots.flatMap(s => s.defects.map(d => ({ ...d, step: s.step, image: s.image, path: s.path })))
  const blocking = all.filter(d => d.blocks)
  lines.push(blocking.length ? `**Bloquea publicar: ${blocking.length}.** Arreglar la pantalla (o la guía) y volver a tomar.` : '**Nada bloquea según las sondas.** Falta la revisión a ojo de cada foto.', '')
  if (shot.failed) lines.push(`El recorrido se detuvo en ${shot.failed}.`, '')
  for (const s of shot.shots) {
    lines.push(`## Paso ${s.step} · \`${s.image}\` · ${s.path}`, '')
    if (!s.defects.length) lines.push('Sin hallazgos de las sondas.', '')
    for (const d of s.defects) lines.push(`- ${d.blocks ? '**bloquea**' : 'revisar'} · ${d.kind}: ${d.text}`)
    if (s.defects.length) lines.push('')
  }
  lines.push('## Revisión a ojo', '', 'Anotar aquí lo que las sondas no ven: aspecto viejo, iconos de relleno, estados vacíos, nombres reales, carga a medias.', '')
  return `${lines.join('\n')}\n`
}

function sheetHtml(guide, shot, dir, videoFrames = []) {
  const cards = shot.shots.map((s) => {
    const src = `data:image/png;base64,${fs.readFileSync(path.join(dir, s.image)).toString('base64')}`
    const defects = s.defects.map(d => `<li class="${d.blocks ? 'b' : 'r'}">${esc(d.kind)}: ${esc(d.text)}</li>`).join('')
    return `<figure><div class="n">${s.step}</div><img src="${src}"><figcaption><p>${esc(s.caption)}</p><ul>${defects}</ul></figcaption></figure>`
  }).join('')
  const frames = videoFrames.map(({ n, file, caption }) =>
    `<figure><div class="n">${n}</div><img src="data:image/png;base64,${fs.readFileSync(file).toString('base64')}"><figcaption><p>${esc(caption)}</p></figcaption></figure>`).join('')
  const videoPart = frames ? `<h2>Video: final de cada paso</h2><div class="grid v">${frames}</div>` : ''
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;padding:28px;font:15px/1.35 system-ui,sans-serif;background:#f4f4f5;color:#17181c}
    h1{font-size:22px;margin:0 0 4px} .meta{color:#666;margin:0 0 20px}
    .grid{display:grid;grid-template-columns:repeat(${guide.format === 'phone' ? 4 : 2},1fr);gap:22px}
    figure{margin:0;background:#fff;border-radius:14px;padding:12px;position:relative;box-shadow:0 1px 3px rgba(0,0,0,.08)}
    img{width:100%;display:block} .n{position:absolute;top:8px;left:8px;background:#FF5A1F;color:#fff;font-weight:800;border-radius:999px;width:30px;height:30px;display:grid;place-items:center;z-index:1}
    h2{font-size:19px;margin:30px 0 14px} .grid.v{grid-template-columns:repeat(5,1fr)}
    figcaption p{font-weight:600;margin:8px 0 4px} ul{margin:0;padding-left:18px;font-size:13px} li.b{color:#b42318} li.r{color:#8a5a00}
  </style></head><body><h1>${esc(guide.question)}</h1><p class="meta">${esc(guide.area)}/${esc(guide.slug)} · ${esc(shot.site)} · ${esc(shot.format)} · ${esc(shotTime(shot.shotAt))}</p><div class="grid">${cards}</div>${videoPart}</body></html>`
}

export async function critique(guide, { out, log = console.log }) {
  const dirs = guideDirs(out, guide)
  const shot = readJson(dirs.shotsJson, null)
  if (!shot) throw new Error(`no hay fotos de ${guide.area}/${guide.slug}: corre guia shoot primero`)
  ensure(dirs.critique)
  const { chromium } = await loadPlaywright()
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: guide.format === 'phone' ? 1600 : 1800, height: 900 } })
    const timeline = readJson(path.join(dirs.video, 'timeline.json'), null)
    const videoFrames = (timeline?.steps || [])
      .map(step => ({ n: step.n, caption: step.caption, file: path.join(dirs.video, 'cuadros', `paso-${step.n}.png`) }))
      .filter(frame => fs.existsSync(frame.file))
    await page.setContent(sheetHtml(guide, shot, dirs.shots, videoFrames))
    await page.waitForFunction(() => [...document.images].every(img => img.complete))
    await page.screenshot({ path: path.join(dirs.critique, 'contact-sheet.png'), fullPage: true })
  } finally {
    await browser.close()
  }
  fs.writeFileSync(path.join(dirs.critique, 'DEFECTS.md'), defectsMarkdown(guide, shot))
  const blocking = shot.shots.flatMap(s => s.defects).filter(d => d.blocks)
  log(`hoja: ${path.join(dirs.critique, 'contact-sheet.png')}`)
  log(`hallazgos: ${path.join(dirs.critique, 'DEFECTS.md')} (${blocking.length} bloquea(n))`)
  return { blocking: blocking.length + (shot.failed ? 1 : 0), dirs }
}
