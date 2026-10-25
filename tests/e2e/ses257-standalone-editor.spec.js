import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const fixture = new URL('../fixtures/gtab10c/smoosic-like-source.musicxml', import.meta.url)

async function nativeOpen(page, name) {
  const open = page.frameLocator('#smoosic-editor-frame').locator('#mobile-xml-open')
  await expect(open).toBeVisible()
  await expect(open).toBeEnabled()
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()])
  await chooser.setFiles({ name, mimeType: 'application/xml', buffer: await readFile(fixture) })
  await expect(page.frameLocator('#smoosic-editor-frame').locator('#poc-status')).toHaveAttribute('data-loaded-file-name', name)
}

test.describe('mobile XML controls across browser engines', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('SES-257 opens without a parent source, imports and saves through native controls', async ({ page }) => {
    test.setTimeout(120000)
    await page.addInitScript(() => Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }))
    await page.goto('/')
    await page.locator('#smoosic-tab-btn').click()
    const editor = page.frameLocator('#smoosic-editor-frame')
    await expect(editor.locator('#mobile-xml-open')).toBeEnabled({ timeout: 60000 })
    await expect(page.locator('#smoosic-editor-frame')).toBeVisible()
    await expect(page.locator('#smoosic-apply-btn')).toBeDisabled()
    await nativeOpen(page, 'independent.musicxml')
    await expect(page.locator('#xml-output')).toBeEmpty()
    const download = page.waitForEvent('download')
    await editor.locator('#mobile-xml-export').click()
    const result = await download
    expect(await readFile(await result.path(), 'utf8')).toContain('<score-partwise')
    await expect(page.locator('#smoosic-apply-btn')).toBeDisabled()
  })

  test('SES-257 native B survives a parent replacement until explicit confirmation', async ({ page }) => {
    test.setTimeout(120000)
    await page.goto('/')
    await page.locator('#musicxml-tab-btn').click()
    const buffer = await readFile(fixture)
    await page.locator('#musicxml-file-input').setInputFiles({ name: 'A.musicxml', mimeType: 'application/xml', buffer })
    await page.locator('#musicxml-open-btn').click()
    await expect(page.locator('#xml-output')).toContainText('<score-partwise')
    await page.locator('#smoosic-tab-btn').click()
    await expect(page.locator('#smoosic-apply-btn')).toBeEnabled({ timeout: 60000 })
    await nativeOpen(page, 'B.musicxml')
    await expect(page.locator('#smoosic-apply-btn')).toBeDisabled()
    await page.locator('#musicxml-tab-btn').click()
    await page.locator('#musicxml-file-input').setInputFiles({ name: 'C.musicxml', mimeType: 'application/xml', buffer })
    await page.locator('#musicxml-open-btn').click()
    await expect(page.locator('#musicxml-progress-text')).toHaveText('MusicXML hazır.')
    await page.locator('#smoosic-tab-btn').click()
    const status = page.frameLocator('#smoosic-editor-frame').locator('#poc-status')
    await expect(status).toHaveAttribute('data-loaded-file-name', 'B.musicxml')
    page.once('dialog', dialog => dialog.dismiss())
    await page.locator('#smoosic-load-current-btn').click()
    await expect(status).toHaveAttribute('data-loaded-file-name', 'B.musicxml')
    page.once('dialog', dialog => dialog.accept())
    await page.locator('#smoosic-load-current-btn').click()
    await expect(status).toHaveAttribute('data-loaded-file-name', 'C.musicxml')
    await expect(page.locator('#smoosic-apply-btn')).toBeEnabled()
  })
})

test('SES-257 desktop empty editor uses the desktop workspace', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Desktop-specific contract; mobile flows have separate coverage')
  test.setTimeout(120000)
  await page.goto('/')
  await page.locator('#smoosic-tab-btn').click()
  const editor = page.frameLocator('#smoosic-editor-frame')
  await expect(editor.locator('#poc-status')).toContainText('Editör hazır', { timeout: 60000 })
  await expect(page.locator('#smoosic-editor-frame')).toBeVisible()
  // #smoo also contains the intentionally hidden piano SVG. Assert the score page.
  await expect(editor.locator('#smoosic-svg-div-0 > svg')).toBeVisible()
  await expect(editor.locator('#mobile-toolbar')).toBeHidden()
  await expect(page.locator('#smoosic-apply-btn')).toBeDisabled()
})
