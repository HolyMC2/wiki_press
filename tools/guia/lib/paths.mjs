/** Where a guide's generated files go: <out>/<area>/<slug>/{shots,raw,critique,build,video}. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const TOOL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DEFAULT_GUIDES = path.join(TOOL, 'guides')
export const DEFAULT_FIXTURES = path.join(TOOL, 'fixtures')
export const DEFAULT_MANUALES = path.join(TOOL, 'manuales')
export const DEFAULT_OUT = process.env.GUIA_OUT || path.resolve(TOOL, '../../.scratch/guia')

/** The wiki stores images flat under /files, so every name carries area and slug. */
export const imageName = (guide, index) => `${guide.area}-${guide.slug}-${String(index + 1).padStart(2, '0')}.png`
export const videoName = (guide) => `${guide.area}-${guide.slug}.mp4`
export const posterName = (guide) => `${guide.area}-${guide.slug}-video.png`

export function guideDirs(out, guide) {
  const root = path.join(out, guide.area, guide.slug)
  const dirs = {
    root,
    shots: path.join(root, 'shots'),
    raw: path.join(root, 'raw'),
    critique: path.join(root, 'critique'),
    build: path.join(root, 'build'),
    video: path.join(root, 'video'),
  }
  dirs.shotsJson = path.join(root, 'shots.json')
  return dirs
}

export function ensure(dir) {
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function readJson(file, fallback) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback
}

export function writeJson(file, value) {
  ensure(path.dirname(file))
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}
