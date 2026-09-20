import { test, expect } from '@playwright/test'

test.describe('SesliTab protected baseline', () => {
  test('app shell and input surfaces stay operational', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await page.goto('/')

    await expect(page).toHaveTitle('SesliTab')
    await expect(page.getByRole('heading', { name: 'SesliTab', level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Dosya Aç', level: 2 })).toBeVisible()

    const pdfTab = page.getByRole('tab', { name: 'PDF' })
    const musicXmlTab = page.getByRole('tab', { name: 'MusicXML' })
    const tabTab = page.getByRole('tab', { name: 'TAB', exact: true })

    await expect(pdfTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('#pdf-panel')).toBeVisible()

    await musicXmlTab.click()
    await expect(musicXmlTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('#musicxml-panel')).toBeVisible()
    await expect(page.locator('#pdf-panel')).toBeHidden()

    await tabTab.click()
    await expect(tabTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('#tab-panel')).toBeVisible()
    await expect(page.getByLabel('Gitar TAB metni giriş alanı')).toBeVisible()

    expect(pageErrors).toEqual([])
  })

  test('built-in TAB sample still converts and clears', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('tab', { name: 'TAB', exact: true }).click()
    const tabInput = page.getByLabel('Gitar TAB metni giriş alanı')

    await page.getByRole('button', { name: 'Örnek TAB yükle' }).click()
    await expect(tabInput).not.toHaveValue('')

    await page.getByRole('button', { name: 'TAB metnini çevir' }).click()
    await expect(page.locator('#results-section')).toBeVisible()
    await expect(page.locator('#rhythmic-output')).not.toBeEmpty()

    await page.getByRole('button', { name: 'TAB metnini temizle' }).click()
    await expect(tabInput).toHaveValue('')
  })
})
