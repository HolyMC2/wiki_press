/**
 * Manuals (PLAN §12): one app's guides for one audience, by level, lowest
 * first, as one PDF. A manual index is `manuales/<manual>.manual.mjs`:
 *
 *   {
 *     manual: 'bancos', titulo: 'Bancos', subtitulo: '¿Por qué no me cuadra el banco?',
 *     para_que: 'one sentence: what the app is for',
 *     niveles: { 1: { aprendes: 'one line', guias: ['bancos/cuadra-mi-banco'] }, 2: …, 3: …, 4: … },
 *   }
 *
 * The PDF is HTML printed by Chromium: a cover, the ladder of levels, then
 * every guide on its own page with its stills large and numbered, whole
 * phones never cropped. Nothing names a shop: «tu empresa», «tu tienda».
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { NIVELES, loadGuide, plainText } from './guide.mjs'
import { guideDirs, readJson, ensure } from './paths.mjs'
import { INK } from './render.mjs'

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Who reads each audience's PDF (PLAN §12.2), by the shop words a guide's
 * `quien` uses. `equipo` stops at level 3; `soporte` adds «Para soporte».
 */
export const AUDIENCIAS = {
  equipo: { para: 'Para el equipo de la tienda', roles: ['cajero', 'vendedor', 'mostrador', 'técnico'], hasta: 3 },
  dueno: { para: 'Para el dueño y el encargado', roles: ['dueño', 'encargado', 'contador'], hasta: 4 },
  soporte: { para: 'Para el equipo de soporte de Muelle', roles: ['dueño', 'encargado', 'contador', 'cajero', 'vendedor', 'mostrador', 'técnico'], hasta: 4, soporte: true },
}

export function validateManual(index, id) {
  const problems = []
  const need = (ok, text) => { if (!ok) problems.push(text) }
  if (!index || typeof index !== 'object') return ['el manual no exporta un objeto por defecto']
  need(index.manual === id, `manual: debe ser «${id}», como el archivo`)
  need(typeof index.titulo === 'string' && index.titulo.trim(), 'titulo: el nombre de la app')
  need(typeof index.para_que === 'string' && index.para_que.trim(), 'para_que: una frase de para qué sirve')
  need(index.niveles && typeof index.niveles === 'object', 'niveles: { 1: { aprendes, guias }, … }')
  for (const [nivel, entry] of Object.entries(index.niveles || {})) {
    need(Object.hasOwn(NIVELES, nivel), `nivel ${nivel}: solo 1 a 4`)
    need(typeof entry?.aprendes === 'string' && entry.aprendes.trim(), `nivel ${nivel}: falta aprendes`)
    need(Array.isArray(entry?.guias) && entry.guias.every(g => /^[a-z0-9-]+\/[a-z0-9-]+$/.test(g)), `nivel ${nivel}: guias es una lista de <área>/<slug>`)
  }
  return problems
}

export async function loadManual(dir, id) {
  if (!SLUG.test(id || '')) throw new Error(`manual inválido «${id}»`)
  const file = path.join(dir, `${id}.manual.mjs`)
  if (!fs.existsSync(file)) throw new Error(`no existe el manual ${file}`)
  const index = (await import(pathToFileURL(file).href)).default
  const problems = validateManual(index, id)
  if (problems.length) throw new Error(`manual ${id} inválido:\n- ${problems.join('\n- ')}`)
  return index
}

/** The guides of `index` an audience reads, by level: [{ nivel, nombre, aprendes, guias: [guide] }]. Pure. */
export function chapters(index, guides, audiencia) {
  const who = AUDIENCIAS[audiencia]
  if (!who) throw new Error(`audiencia desconocida «${audiencia}»: ${Object.keys(AUDIENCIAS).join(', ')}`)
  const out = []
  for (const nivel of Object.keys(NIVELES).map(Number)) {
    if (nivel > who.hasta) continue
    const entry = index.niveles[nivel]
    if (!entry) continue
    const picked = entry.guias.map(id => guides[id]).filter(guide => guide && guide.quien.some(role => who.roles.includes(role)))
    if (picked.length) out.push({ nivel, nombre: NIVELES[nivel], aprendes: entry.aprendes, guias: picked })
  }
  return out
}

/** Every listed guide must say it belongs to this manual at this level: the index and the guides never drift. */
export function manualProblems(index, guides) {
  const problems = []
  for (const [nivel, entry] of Object.entries(index.niveles)) {
    for (const id of entry.guias) {
      const guide = guides[id]
      if (!guide) problems.push(`${id}: no existe`)
      else if (guide.manual !== index.manual || String(guide.nivel) !== String(nivel)) problems.push(`${id}: dice manual «${guide.manual}» nivel ${guide.nivel}, el índice lo pone en nivel ${nivel}`)
    }
  }
  return problems
}

const escape = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const badge = (n) => `<span class="n">${n}</span>`
/** Step and answer text: **bold** and [[n]] as the orange number drawn on the still. */
export const rich = (text) => escape(text).replace(/\[\[(\d+)\]\]/g, (_, n) => badge(n)).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

const CSS = `
@page { size: Letter; margin: 0.55in 0.6in 0.7in; }
* { box-sizing: border-box; }
body { font-family: 'Inter', 'Noto Sans', 'Helvetica Neue', Arial, sans-serif; color: #1b1b1f; margin: 0; font-size: 12.5pt; line-height: 1.4; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { page-break-after: always; break-after: page; }
.page:last-child { page-break-after: auto; break-after: auto; }
.cover { height: 9.6in; display: flex; flex-direction: column; justify-content: space-between; }
.brand { font-weight: 800; letter-spacing: .02em; color: ${INK}; font-size: 15pt; }
.cover h1 { font-size: 44pt; line-height: 1.05; margin: 0 0 .15in; }
.cover h2 { font-size: 22pt; font-weight: 600; margin: 0 0 .3in; color: #333; }
.cover .para { display: inline-block; background: #fff1ea; color: #9a3412; border-radius: 999px; padding: .08in .22in; font-weight: 600; font-size: 13pt; }
.cover .que { font-size: 15pt; max-width: 6in; margin-top: .35in; color: #333; }
.cover .pie { color: #666; font-size: 10.5pt; }
h1.q { font-size: 23pt; line-height: 1.15; margin: 0 0 .06in; }
.meta { color: #555; font-size: 10.5pt; margin-bottom: .14in; }
.nivel-tag { display: inline-block; background: #1b1b1f; color: #fff; border-radius: 6px; padding: 2px 8px; font-size: 9.5pt; font-weight: 700; margin-bottom: .1in; }
.resumen { background: #f6f5f3; border-radius: 12px; padding: .14in .2in; margin-bottom: .18in; }
.resumen b { display: block; font-size: 10pt; text-transform: uppercase; letter-spacing: .06em; color: #777; margin-bottom: .04in; }
.pasos { display: grid; grid-template-columns: 1fr 1fr; gap: .22in .3in; }
.paso { break-inside: avoid; page-break-inside: avoid; }
.paso .t { display: flex; gap: .1in; align-items: flex-start; margin-bottom: .08in; min-height: .62in; font-size: 12pt; }
.paso .num { flex: none; width: .44in; height: .44in; border-radius: 50%; background: ${INK}; color: #fff; font-weight: 800; font-size: 17pt; display: flex; align-items: center; justify-content: center; }
/* Two steps fit under a guide's title: the whole phone, about its real size. */
.paso img { display: block; height: 5in; width: auto; max-width: 100%; margin: 0 auto; }
.paso.extra .box:first-child { margin-top: 0; }
.banda { display: flex; gap: .16in; align-items: center; background: #1b1b1f; color: #fff; border-radius: 12px; padding: .1in .16in; margin-bottom: .14in; }
.banda .num { flex: none; width: .42in; height: .42in; border-radius: 9px; background: ${INK}; color: #fff; font-size: 17pt; font-weight: 800; display: flex; align-items: center; justify-content: center; }
.banda b { font-size: 13pt; } .banda span { color: #d6d6db; font-size: 10.5pt; }
.n { display: inline-flex; align-items: center; justify-content: center; min-width: 1.35em; height: 1.35em; border-radius: 999px; background: ${INK}; color: #fff; font-size: .8em; font-weight: 800; padding: 0 .25em; vertical-align: .08em; }
.box { break-inside: avoid; page-break-inside: avoid; border: 1.5px solid #e7e4df; border-radius: 12px; padding: .14in .2in; margin-top: .2in; }
.box h3 { margin: 0 0 .08in; font-size: 13pt; }
.ysi { width: 100%; border-collapse: collapse; }
.ysi td { vertical-align: top; padding: .05in 0; border-top: 1px solid #eee; }
.ysi td:first-child { width: 44%; padding-right: .15in; font-weight: 600; }
.ysi tr:first-child td { border-top: 0; }
.asistente { background: #eef6ff; border-color: #cfe3fb; }
.soporte { background: #fbf7e9; border-color: #efe2b3; }
.escalera h1 { font-size: 26pt; margin: 0 0 .1in; }
.escalera .intro { font-size: 13.5pt; color: #333; margin-bottom: .25in; }
.peldano { display: flex; gap: .2in; align-items: flex-start; border: 1.5px solid #e7e4df; border-radius: 14px; padding: .16in .2in; margin-bottom: .16in; break-inside: avoid; }
.peldano .num { flex: none; width: .6in; height: .6in; border-radius: 14px; background: ${INK}; color: #fff; font-size: 24pt; font-weight: 800; display: flex; align-items: center; justify-content: center; }
.peldano h2 { margin: 0; font-size: 15pt; }
.peldano p { margin: .03in 0 .06in; color: #333; }
.peldano ul { margin: 0; padding-left: .2in; color: #555; font-size: 11pt; }
.separador { height: 9.4in; display: flex; flex-direction: column; justify-content: center; }
.separador .num { width: 1.1in; height: 1.1in; border-radius: 24px; background: ${INK}; color: #fff; font-size: 48pt; font-weight: 800; display: flex; align-items: center; justify-content: center; margin-bottom: .25in; }
.separador h1 { font-size: 34pt; margin: 0 0 .1in; }
.separador p { font-size: 16pt; color: #333; max-width: 6in; }
`

/** The month the manual was made, in the shop's zone: «noviembre de 2026». */
export function madeOn(now = new Date()) {
  return new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mazatlan', month: 'long', year: 'numeric' }).format(now)
}

/**
 * The manual as one HTML document. `shots[id]` holds each guide's shots.json
 * entries; `img(id, image)` gives the still's URL. Pure.
 */
export function manualHtml(index, chaptersList, { audiencia, shots, img, now = new Date() }) {
  const who = AUDIENCIAS[audiencia]
  const pages = []
  pages.push(`<section class="page cover">
  <div class="brand">Muelle</div>
  <div>
    <h1>Manual de ${escape(index.titulo)}</h1>
    ${index.subtitulo ? `<h2>${escape(index.subtitulo)}</h2>` : ''}
    <span class="para">${escape(who.para)}</span>
    <p class="que">${escape(index.para_que)}</p>
  </div>
  <div class="pie">Hecho con las pantallas de Muelle, ${escape(madeOn(now))}. Los nombres y las cantidades son de ejemplo.</div>
</section>`)
  const peldanos = chaptersList.map(ch => `<div class="peldano"><div class="num">${ch.nivel}</div><div><h2>Nivel ${ch.nivel} · ${escape(ch.nombre)}</h2><p>${escape(ch.aprendes)}</p><ul>${ch.guias.map(g => `<li>${escape(g.question)}</li>`).join('')}</ul></div></div>`).join('')
  pages.push(`<section class="page escalera">
  <h1>Cómo usar este manual</h1>
  <p class="intro">Empieza por el nivel 1. Cuando lo hagas sin ayuda, pasa al siguiente. Cada página es un solo trabajo: los números de las fotos son los pasos.</p>
  ${peldanos}
</section>`)
  for (const ch of chaptersList) {
    for (const [position, guide] of ch.guias.entries()) {
      const id = `${guide.area}/${guide.slug}`
      const taken = shots[id] || []
      const pasos = taken.map((shot, i) => `<div class="paso"><div class="t"><div class="num">${i + 1}</div><div>${rich(shot.text)}</div></div><img src="${escape(img(id, shot.image))}" alt="${escape(shot.caption || plainText(shot.text))}"></div>`).join('')
      const ysi = guide.ysi?.length ? `<div class="box"><h3>¿Y si…?</h3><table class="ysi">${guide.ysi.map(([q, a]) => `<tr><td>${rich(q)}</td><td>${rich(a)}</td></tr>`).join('')}</table></div>` : ''
      const asistente = guide.asistente ? `<div class="box asistente"><h3>Pídeselo al asistente</h3>«${escape(guide.asistente)}»</div>` : ''
      const soporte = who.soporte && guide.soporte?.length ? `<div class="box soporte"><h3>Para soporte</h3><ul>${guide.soporte.map(line => `<li>${rich(line)}</li>`).join('')}</ul></div>` : ''
      // The level opens on its first guide's page, not a page of its own.
      const head = position === 0
        ? `<div class="banda"><div class="num">${ch.nivel}</div><div><b>Nivel ${ch.nivel} · ${escape(ch.nombre)}</b><br><span>${escape(ch.aprendes)}</span></div></div>`
        : `<div class="nivel-tag">Nivel ${guide.nivel} · ${escape(NIVELES[guide.nivel])}</div>`
      // An odd last step leaves a cell beside it: the cases and the assistant go there.
      const extra = `${ysi}${asistente}${soporte}`
      const beside = taken.length % 2 === 1 && extra
      pages.push(`<section class="page guia">
  ${head}
  <h1 class="q">${escape(guide.question)}</h1>
  <div class="meta">Para: ${escape(guide.quien.join(', '))} · Dónde: ${escape(guide.donde)}</div>
  <div class="resumen"><b>En pocas palabras</b>${guide.resumen.map(rich).join('<br>')}</div>
  <div class="pasos">${pasos}${beside ? `<div class="paso extra">${extra}</div>` : ''}</div>
  ${beside ? '' : extra}
</section>`)
    }
  }
  return `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><title>Manual de ${escape(index.titulo)} · ${escape(who.para)}</title><style>${CSS}</style></head><body>${pages.join('\n')}</body></html>`
}

/** `guia manual <manual> --para <audiencia>`: <out>/manuales/<manual>/<manual>-<audiencia>.{html,pdf}. */
export async function buildManual(id, { audiencia, guides: guidesRoot, manuales, out, log = console.log }) {
  const index = await loadManual(manuales, id)
  const guides = {}
  for (const entry of Object.values(index.niveles)) for (const gid of entry.guias) guides[gid] = await loadGuide(guidesRoot, gid)
  const problems = manualProblems(index, guides)
  if (problems.length) throw new Error(`el índice y las guías no coinciden:\n- ${problems.join('\n- ')}`)
  const list = chapters(index, guides, audiencia)
  if (!list.length) throw new Error(`el manual ${id} no tiene guías para «${audiencia}»`)
  const shots = {}
  for (const ch of list) for (const guide of ch.guias) {
    const dirs = guideDirs(out, guide)
    const shot = readJson(dirs.shotsJson, null)
    if (!shot || shot.failed || shot.shots.length !== guide.steps.length) throw new Error(`${guide.area}/${guide.slug}: falta una toma completa (guia shoot)`)
    const critique = path.join(dirs.critique, 'DEFECTS.md')
    if (!fs.existsSync(critique)) throw new Error(`${guide.area}/${guide.slug}: falta la crítica (guia critique)`)
    const blocked = /\*\*Bloquea publicar: (\d+)\.\*\*/.exec(fs.readFileSync(critique, 'utf8'))
    if (blocked && Number(blocked[1]) > 0) throw new Error(`${guide.area}/${guide.slug}: la crítica bloquea publicar (${blocked[1]})`)
    shots[`${guide.area}/${guide.slug}`] = shot.shots
  }
  const dir = ensure(path.join(out, 'manuales', id))
  const img = (gid, image) => pathToFileURL(path.join(guideDirs(out, guides[gid]).shots, image)).href
  const html = manualHtml(index, list, { audiencia, shots, img })
  const htmlFile = path.join(dir, `${id}-${audiencia}.html`)
  fs.writeFileSync(htmlFile, html)
  const pdfFile = path.join(dir, `${id}-${audiencia}.pdf`)
  const { loadPlaywright } = await import('./session.mjs')
  const { chromium } = await loadPlaywright()
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    const who = AUDIENCIAS[audiencia]
    await page.pdf({
      path: pdfFile,
      format: 'Letter',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="width:100%;font-size:8pt;color:#777;padding:0 .6in;display:flex;justify-content:space-between;font-family:Arial,sans-serif"><span>Muelle · Manual de ${escape(index.titulo)} · ${escape(who.para.toLowerCase())}</span><span><span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`,
      margin: { top: '0.55in', bottom: '0.7in', left: '0.6in', right: '0.6in' },
    })
  } finally {
    await browser.close()
  }
  log(`manual: ${pdfFile}`)
  log(`html: ${htmlFile}`)
  return { pdf: pdfFile, html: htmlFile, chapters: list.map(ch => ({ nivel: ch.nivel, guias: ch.guias.map(g => `${g.area}/${g.slug}`) })) }
}
