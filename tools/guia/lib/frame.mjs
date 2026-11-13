/**
 * Ported from scanner_kit frontend/manual/kit/frame.mjs.
 *
 * Puts a screenshot in a phone body: a dark bezel, a status bar, rounded glass
 * and a soft shadow on a transparent background, so the page reads as a phone
 * in hand on the wiki's light and dark themes alike.
 */
const BAR = 34

export async function framePhone(browser, png, { width, height, dark = false, scale = 2 }) {
  const bezel = 11
  const margin = 18
  const page = await browser.newPage({ viewport: { width: width + 2 * (bezel + margin), height: height + BAR + 2 * (bezel + margin) }, deviceScaleFactor: scale })
  const src = `data:image/png;base64,${png.toString('base64')}`
  const ink = dark ? '#f2f2f3' : '#17181c'
  const glass = dark ? '#111214' : '#ffffff'
  // Signal bars and a battery, drawn rather than shipped as icons.
  const bars = [5, 8, 11, 14].map((h) => `<span style="display:inline-block;width:3px;height:${h}px;margin-left:2px;border-radius:1px;background:${ink}"></span>`).join('')
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent;font-family:-apple-system,'Archivo',system-ui,sans-serif">
    <div id="phone" style="margin:${margin}px;width:${width}px;height:${height + BAR}px;border:${bezel}px solid #17181c;border-radius:52px;overflow:hidden;
      box-shadow:0 0 0 1.5px #3a3c44, 0 14px 30px rgba(0,0,0,.22);background:${glass}">
      <div style="height:${BAR}px;display:flex;align-items:center;justify-content:space-between;padding:4px 30px 0;color:${ink};font-size:15px;font-weight:600;box-sizing:border-box">
        <span>9:41</span>
        <span style="display:flex;align-items:flex-end;gap:7px">
          <span style="display:flex;align-items:flex-end;height:14px">${bars}</span>
          <span style="display:inline-block;width:24px;height:12px;border:1.5px solid ${ink};border-radius:4px;padding:1.5px;box-sizing:border-box;opacity:.9">
            <span style="display:block;width:75%;height:100%;border-radius:1.5px;background:${ink}"></span></span>
        </span>
      </div>
      <img src="${src}" style="display:block;width:${width}px;height:${height}px">
    </div></body></html>`)
  await page.waitForFunction(() => document.querySelector('img')?.complete)
  const out = await page.screenshot({ omitBackground: true, fullPage: true })
  await page.close()
  return out
}
