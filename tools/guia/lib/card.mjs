/**
 * The in-app form of a guide: a starter card for the Manual de la tienda
 * (doco manual/guias/<key>.json + manual/fotos/<foto>.webp), in the shape of
 * doco manual/tarjetas.py: a heading, the picture and one line per step. The
 * owner gets it from «Empezar con plantillas», edits it and publishes it; it is
 * never published on its own. Pure renderers here; `writeCard` writes files.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { NIVELES, plainText } from './guide.mjs'
import { ensure, writeJson } from './paths.mjs'

// doco manual/tarjetas.py SCREEN_WIDTH: screenshots show at 300 px; the file is drawn at 520 for sharp screens.
export const SCREEN_WIDTH = 300
export const FOTO_WIDTH = 520
// The puestos of doco manual/service.py PUESTOS that a guide's `quien` names.
const PUESTOS = { dueño: 'Dueño', encargado: 'Encargado', cajero: 'Cajero', vendedor: 'Cajero', mostrador: 'Cajero', técnico: 'Técnico' }
const CIRCLED = ['⓪', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫']

const escape = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** `guia.bancos.por_que_no_cuadra`: doco template keys use dots and underscores. */
export const cardKey = (guide) => `guia.${guide.area}.${guide.slug}`.replace(/-/g, '_')
/** `guia-bancos-por-que-no-cuadra-01`: doco tarjetas.with_photos reads `foto:[a-z0-9-]+`. */
export const fotoName = (guide, index) => `guia-${guide.area}-${guide.slug}-${String(index + 1).padStart(2, '0')}`

/** Step text for the card: **bold** kept, [[n]] as the circled number drawn on the picture. */
export function cardText(text) {
  return escape(String(text))
    .replace(/\[\[(\d+)\]\]/g, (_, n) => CIRCLED[Number(n)] || `(${n})`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\s+([,.;:])/g, '$1')
    .trim()
}

/** The puestos that read the card; none (the whole team) when `quien` names nobody on the list. */
export function cardAudience(quien = []) {
  return [...new Set(quien.map(role => PUESTOS[role]).filter(Boolean))]
}

/**
 * The card for doco: { key, title, category, summary, place, requires, audience, nivel, order, body, fotos }.
 * `shots` are the shot texts (a step's text may depend on the fixture's data);
 * `manual` is the guide's manual index (its `titulo` names the group).
 */
export function renderCard(guide, { shots, manual }) {
  const fotos = shots.map((_, index) => fotoName(guide, index))
  const parts = []
  if (guide.nivel) parts.push(`<p><strong>Nivel ${guide.nivel} · ${NIVELES[guide.nivel]}</strong></p>`)
  parts.push(`<p>${guide.resumen.map(cardText).join('<br>')}</p>`)
  shots.forEach((shot, index) => {
    const caption = shot.caption || plainText(shot.text)
    parts.push(`<h2>${index + 1}. ${escape(caption)}</h2>`)
    parts.push(`<p><img src="foto:${fotos[index]}" alt="${escape(caption)}" width="${SCREEN_WIDTH}"></p>`)
    parts.push(`<p>${cardText(shot.text)}</p>`)
  })
  if (guide.ysi?.length) {
    parts.push('<h2>¿Y si…?</h2><ul>')
    for (const [question, answer] of guide.ysi) parts.push(`<li><strong>${cardText(question)}</strong> ${cardText(answer)}</li>`)
    parts.push('</ul>')
  }
  parts.push(`<h2>📱 En Muelle</h2><p>${escape(guide.donde)}</p>`)
  if (guide.asistente) parts.push(`<h2>Pídeselo al asistente</h2><p>«${escape(guide.asistente)}»</p>`)
  return {
    key: cardKey(guide),
    title: guide.titulo || guide.question,
    category: manual?.titulo || 'Guías de Muelle',
    summary: guide.resumen[0],
    place: guide.place,
    requires: guide.requires ?? null,
    audience: cardAudience(guide.quien),
    nivel: guide.nivel ?? null,
    order: (guide.nivel ?? 0) * 100 + (guide.order ?? 0),
    guia: `${guide.area}/${guide.slug}`,
    body: parts.join(''),
    fotos,
  }
}

/** Write the card JSON and its pictures (webp, FOTO_WIDTH wide) under `dir`: <dir>/<key>.json, <dir>/fotos/. */
export function writeCard(card, { dir, shotsDir, images }) {
  ensure(path.join(dir, 'fotos'))
  writeJson(path.join(dir, `${card.key}.json`), card)
  images.forEach((image, index) => {
    const out = path.join(dir, 'fotos', `${card.fotos[index]}.webp`)
    execFileSync('magick', [path.join(shotsDir, image), '-resize', `${FOTO_WIDTH}x`, '-quality', '82', out])
  })
  return path.join(dir, `${card.key}.json`)
}

/** Copy a built card into a doco checkout: doco/manual/guias/<key>.json and doco/manual/fotos/. */
export function copyToDoco(cardDir, card, docoRoot) {
  const manual = path.join(docoRoot, 'doco', 'manual')
  if (!fs.existsSync(path.join(manual, 'tarjetas.py'))) throw new Error(`${docoRoot} no es una copia de doco (falta doco/manual/tarjetas.py)`)
  ensure(path.join(manual, 'guias'))
  fs.copyFileSync(path.join(cardDir, `${card.key}.json`), path.join(manual, 'guias', `${card.key}.json`))
  for (const foto of card.fotos) fs.copyFileSync(path.join(cardDir, 'fotos', `${foto}.webp`), path.join(manual, 'fotos', `${foto}.webp`))
  return path.join(manual, 'guias', `${card.key}.json`)
}
