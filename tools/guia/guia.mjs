#!/usr/bin/env node
/**
 * guia: one source per «¿Cómo hago…?» guide → marked shots, critique,
 * wiki page + manifest + help rows + playbook stub, and a phone video.
 *
 *   node tools/guia/guia.mjs list
 *   node tools/guia/guia.mjs check   <area>/<slug>
 *   node tools/guia/guia.mjs shoot   <area>/<slug> [--site doco-mirror]
 *   node tools/guia/guia.mjs critique <area>/<slug>
 *   node tools/guia/guia.mjs build   <area>/<slug>
 *   node tools/guia/guia.mjs video   <area>/<slug> [--site doco-mirror]
 *   node tools/guia/guia.mjs all     <area>/<slug> [--site …]   shoot, video, critique, build
 *
 * Options: --guides <dir> (default tools/guia/guides), --fixtures <dir>,
 * --out <dir> (default $GUIA_OUT or <repo>/.scratch/guia), --site <first DNS
 * label of a lab site> (default: the bot secret's own site).
 * Wrap shoot, video and all in `heavy --` on the workstation. Guide: README.md.
 */
import path from 'node:path'
import { loadGuide, listGuides, validateGuide } from './lib/guide.mjs'
import { DEFAULT_GUIDES, DEFAULT_FIXTURES, DEFAULT_OUT } from './lib/paths.mjs'

const argv = process.argv.slice(2)
const option = (name, fallback) => {
  const at = argv.indexOf(`--${name}`)
  if (at < 0) return fallback
  const value = argv[at + 1]
  argv.splice(at, 2)
  return value
}
const guides = path.resolve(option('guides', DEFAULT_GUIDES))
const fixtures = path.resolve(option('fixtures', DEFAULT_FIXTURES))
const out = path.resolve(option('out', DEFAULT_OUT))
const site = option('site', process.env.GUIA_SITE || '')
const [command, id] = argv

async function main() {
  if (command === 'list') {
    for (const entry of listGuides(guides)) console.log(entry)
    return 0
  }
  if (!id) {
    console.error('uso: guia list | check|shoot|critique|build|video|all <área>/<slug> [--site …] [--out …]')
    return 2
  }
  const guide = await loadGuide(guides, id)
  const options = { out, site, fixtures }
  if (command === 'check') {
    console.log(`ok ${guide.area}/${guide.slug}: ${guide.steps.length} pasos, ${validateGuide(guide, guide).length} problemas`)
    return 0
  }
  if (command === 'shoot' || command === 'all') {
    const { shoot } = await import('./lib/shoot.mjs')
    await shoot(guide, options)
  }
  if (command === 'video' || command === 'all') {
    const { video } = await import('./lib/video.mjs')
    await video(guide, options)
  }
  let blocking = 0
  if (command === 'critique' || command === 'all') {
    const { critique } = await import('./lib/critique.mjs')
    blocking = (await critique(guide, options)).blocking
  }
  if (command === 'build' || command === 'all') {
    const { build } = await import('./lib/build.mjs')
    build(guide, options)
  }
  if (!['shoot', 'critique', 'video', 'build', 'all'].includes(command)) {
    console.error(`no conozco «${command}»`)
    return 2
  }
  return blocking ? 1 : 0
}

main().then(code => process.exit(code), (error) => {
  console.error(error.message)
  process.exit(1)
})
