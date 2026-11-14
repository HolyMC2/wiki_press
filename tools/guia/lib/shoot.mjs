/**
 * `guia shoot`: walk the guide on a lab site as the bot, probe each screen,
 * draw the marks, and write the whole screen (framed in a phone for phone
 * guides) per step, plus shots.json with the probes.
 */
import fs from 'node:fs'
import path from 'node:path'
import { FORMATS, openSession, readSecret, siteBase, checkSite, loadPlaywright } from './session.mjs'
import { resolveFixture } from './fixtures.mjs'
import { walker, runStep, finishStep, applyRename, installRename } from './walker.mjs'
import { installResponseRename } from './rewrite.mjs'
import { drawMarks, clearMarks } from './marks.mjs'
import { framePhone } from './frame.mjs'
import { collectProbes, classify } from './probes.mjs'
import { markNumbers, plainText, resolve } from './guide.mjs'
import { guideDirs, imageName, ensure, writeJson } from './paths.mjs'

export async function shoot(guide, { out, site, fixtures, log = console.log }) {
  const secret = readSecret()
  const base = siteBase(secret.base, site)
  const siteLabel = checkSite(base)
  const dirs = guideDirs(out, guide)
  for (const dir of [dirs.shots, dirs.raw]) {
    fs.rmSync(dir, { recursive: true, force: true })
    ensure(dir)
  }
  const { chromium } = await loadPlaywright()
  const browser = await chromium.launch()
  const shots = []
  let failed = null
  try {
    const { context, page, errors, size } = await openSession(browser, { base, user: secret.user, password: secret.password, format: guide.format })
    const { data, rename } = await resolveFixture(fixtures, guide.fixture, { context, base, args: guide.fixtureArgs || {} })
    await installResponseRename(context, base, rename)
    await installRename(context, rename)
    log(`sitio ${siteLabel}, fixture ${guide.fixture}: ${Object.keys(data).join(', ') || 'sin datos'}; ${rename.length} nombre(s) reemplazado(s)`)
    const w = walker(page, base)
    for (const [index, step] of guide.steps.entries()) {
      const name = imageName(guide, index)
      try {
        errors.length = 0
        await runStep(w, step, data, { busy: guide.busy })
        await applyRename(page, rename)
        await page.waitForTimeout(150)
        const raw = await collectProbes(page)
        raw.errors = [...errors]
        const defects = classify(raw, { allowEnglish: guide.allowEnglish, allowCut: resolve(step.allowCut, data) })
        const marks = resolve(step.marks, data) || []
        const text = resolve(step.text, data)
        const numbers = markNumbers(text, marks)
        for (const n of numbers.missing) defects.push({ kind: 'marca', blocks: true, text: `el texto cita [[${n}]] y la foto no la dibuja` })
        for (const n of numbers.unexplained) defects.push({ kind: 'marca', blocks: false, text: `la foto dibuja ${n} y el texto no la cita` })
        await drawMarks(page, marks, { seed: 11 + index })
        const png = await page.screenshot()
        await clearMarks(page)
        fs.writeFileSync(path.join(dirs.raw, name), png)
        const framed = guide.format === 'phone' ? await framePhone(browser, png, { width: size.width, height: size.height }) : png
        fs.writeFileSync(path.join(dirs.shots, name), framed)
        shots.push({ step: index + 1, image: name, text, caption: resolve(step.caption, data) || plainText(text), path: raw.path, defects, texts: raw.texts })
        log(`  ${index + 1}. ${name}${defects.length ? `  (${defects.length} hallazgo(s))` : ''}`)
        await finishStep(w, step, data)
      } catch (error) {
        failed = `paso ${index + 1}: ${error.message.split('\n')[0]}`
        await page.screenshot({ path: path.join(dirs.root, 'error.png') }).catch(() => {})
        break
      }
    }
    writeJson(dirs.shotsJson, {
      guide: `${guide.area}/${guide.slug}`, site: siteLabel, format: guide.format, viewport: size,
      shotAt: new Date().toISOString(), fixture: { name: guide.fixture, data }, failed, shots,
    })
    await context.close()
  } finally {
    await browser.close()
  }
  if (failed) throw new Error(`shoot falló en ${failed}; ver ${path.join(dirs.root, 'error.png')}`)
  return { dirs, shots }
}

export { FORMATS }
