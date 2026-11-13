/**
 * Pure renderers for `guia build`: the wiki page (PLAN §2.1 template), the
 * manifest entry, Wiki Help Mapping rows and the bot playbook stub.
 */
import { stripMarks } from './guide.mjs'

export const INK = '#FF5A1F'
const BADGE = `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:1.4em;height:1.4em;padding:0 .3em;border-radius:999px;background:${INK};color:#fff;font-size:.78em;font-weight:700;line-height:1;vertical-align:.12em">{n}</span>`
const attr = (text) => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** [[n]] → the orange badge drawn on the shots. */
export const badges = (text) => String(text).replace(/\[\[(\d+)\]\]/g, (_, n) => BADGE.replace('{n}', n))

export const imageBlock = (name, alt, width) =>
  `<div style="max-width:${width}px;margin:1.25rem auto"><img src="/files/${name}" alt="${attr(alt)}" style="display:block;width:100%;height:auto;border:0;box-shadow:none;background:none;border-radius:0"></div>`

export const videoBlock = (video, poster, width) =>
  `<div style="max-width:${width}px;margin:1.25rem auto"><video controls playsinline preload="none" poster="/files/${poster}" src="/files/${video}" style="display:block;width:100%;height:auto;border-radius:12px"></video></div>`

/**
 * The wiki page body. The wiki prints the title itself, so the markdown
 * starts after it; `title` goes to the manifest.
 */
export function pageMarkdown(guide, { images, video = null, poster = null }) {
  const width = guide.format === 'phone' ? 320 : 760
  const parts = [`Para: ${guide.quien.join(', ')} · Dónde: ${guide.donde}`, '', '**En pocas palabras**', '']
  parts.push(guide.resumen.join('  \n'), '')
  if (video) parts.push(videoBlock(video, poster, guide.format === 'phone' ? 300 : 720), '')
  parts.push('**Paso a paso**', '')
  guide.steps.forEach((step, index) => {
    parts.push(`**${index + 1}.** ${badges(step.text)}`, '')
    if (images[index]) parts.push(imageBlock(images[index], step.caption || `Paso ${index + 1}`, width), '')
  })
  if (guide.ysi?.length) {
    parts.push('**¿Y si…?**', '')
    for (const [question, answer] of guide.ysi) parts.push(`- ${question} → ${answer}`)
    parts.push('')
  }
  if (guide.asistente) parts.push('**Pídeselo al asistente**', '', `«${guide.asistente}»`, '')
  return `${parts.join('\n').trim()}\n`
}

export function manifestEntry(guide, { images, video, poster, order = 0 }) {
  return {
    slug: guide.slug,
    area: guide.area,
    route: guide.route,
    title: guide.question,
    order,
    place: guide.place,
    donde: guide.donde,
    quien: guide.quien,
    markdown: `${guide.slug}.md`,
    images,
    video: video || null,
    poster: poster || null,
  }
}

// Wiki Help Mapping context types the DocType accepts today. «SPA Route» rows
// wait for WP-1 (lane ayuda-ruta-spa) and are written apart until it lands.
export const HELP_TYPES = ['DocType', 'Desk Page', 'POS Screen', 'Storefront Page']

/**
 * Wiki Help Mapping rows in the fixture's shape (wiki_press/fixtures/
 * wiki_help_mapping.json), without `name`: { rows, pending }.
 */
export function helpRows(guide) {
  const all = (guide.help || []).map(row => ({
    doctype: 'Wiki Help Mapping',
    context_type: row.context_type,
    context_key: row.context_key,
    wiki_route: guide.route,
    enabled: 1,
  }))
  return { rows: all.filter(row => HELP_TYPES.includes(row.context_type)), pending: all.filter(row => !HELP_TYPES.includes(row.context_type)) }
}

export const playbookMarker = (guide) => `<!-- guia: ${guide.route} -->`

/**
 * The generated half of the bot playbook. The «Criterio» section below the
 * line is written by hand in doco and kept when the stub is regenerated.
 */
export function playbookStub(guide, { images, video }) {
  const lines = [
    playbookMarker(guide),
    `# ${guide.question}`,
    '',
    `- Quién: ${guide.quien.join(', ')}`,
    `- Dónde: ${guide.donde} (lugar \`${guide.place}\`)`,
    `- Guía: /${guide.route}`,
    '',
    '## En pocas palabras',
    '',
    ...guide.resumen,
    '',
    '## Pasos',
    '',
    ...guide.steps.map((step, index) => `${index + 1}. ${stripMarks(step.text)}`),
    '',
    '## Medios',
    '',
    ...images.map((name, index) => `- Paso ${index + 1}: \`${name}\``),
    ...(video ? [`- Video: \`${video}\``] : []),
    '',
  ]
  if (guide.ysi?.length) {
    lines.push('## ¿Y si…?', '')
    for (const [question, answer] of guide.ysi) lines.push(`- ${question} → ${answer}`)
    lines.push('')
  }
  lines.push('<!-- guia:fin — lo de abajo se escribe a mano y no se regenera -->', '', '## Criterio', '', '')
  return lines.join('\n')
}

/** Keep the hand-written part of an existing playbook when regenerating. */
export function mergePlaybook(stub, existing) {
  const cut = '<!-- guia:fin'
  if (!existing || !existing.includes(cut)) return stub
  const hand = existing.slice(existing.indexOf(cut))
  return stub.slice(0, stub.indexOf(cut)) + hand
}
