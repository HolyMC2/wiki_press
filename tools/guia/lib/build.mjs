/**
 * `guia build`: wiki markdown, manifest.json, help-mapping rows and the
 * playbook stub, from the guide and its last shoot (and video, if made).
 */
import fs from 'node:fs'
import path from 'node:path'
import { guideDirs, ensure, readJson, writeJson, videoName, posterName } from './paths.mjs'
import { pageMarkdown, manifestEntry, helpRows, playbookStub, mergePlaybook } from './render.mjs'

export function build(guide, { out, log = console.log }) {
  const dirs = guideDirs(out, guide)
  const shot = readJson(dirs.shotsJson, null)
  if (!shot) throw new Error(`no hay fotos de ${guide.area}/${guide.slug}: corre guia shoot primero`)
  if (shot.failed) throw new Error(`la última toma falló (${shot.failed}); vuelve a tomarla`)
  if (shot.shots.length !== guide.steps.length) throw new Error(`la toma tiene ${shot.shots.length} fotos y la guía ${guide.steps.length} pasos; vuelve a tomarla`)
  // Texts as shot: a step's text may depend on the fixture's data.
  const resolved = { ...guide, steps: guide.steps.map((step, index) => ({ ...step, text: shot.shots[index].text, caption: shot.shots[index].caption })) }
  fs.rmSync(dirs.build, { recursive: true, force: true })
  ensure(dirs.build)
  const images = shot.shots.map(s => s.image)
  for (const name of images) fs.copyFileSync(path.join(dirs.shots, name), path.join(dirs.build, name))
  let video = null
  let poster = null
  if (fs.existsSync(path.join(dirs.video, videoName(guide)))) {
    video = videoName(guide)
    poster = posterName(guide)
    fs.copyFileSync(path.join(dirs.video, video), path.join(dirs.build, video))
    fs.copyFileSync(path.join(dirs.video, poster), path.join(dirs.build, poster))
  }
  const media = { images, video, poster }
  fs.writeFileSync(path.join(dirs.build, `${guide.slug}.md`), pageMarkdown(resolved, media))
  writeJson(path.join(dirs.build, 'manifest.json'), [manifestEntry(resolved, { ...media, order: guide.order ?? 0 })])
  const help = helpRows(resolved)
  writeJson(path.join(dirs.build, 'help-mapping.json'), help.rows)
  if (help.pending.length) writeJson(path.join(dirs.build, 'help-mapping-pendiente.json'), help.pending)
  const playbookFile = path.join(ensure(path.join(dirs.build, 'playbook')), `${guide.slug}.md`)
  const existing = guide.playbookPath && fs.existsSync(guide.playbookPath) ? fs.readFileSync(guide.playbookPath, 'utf8') : null
  fs.writeFileSync(playbookFile, mergePlaybook(playbookStub(resolved, media), existing))
  log(`página: ${path.join(dirs.build, `${guide.slug}.md`)}`)
  log(`manifest, help-mapping.json, playbook/${guide.slug}.md en ${dirs.build}`)
  if (!video) log('sin video: corre guia video y vuelve a correr build para incluirlo')
  return { dirs, media }
}
