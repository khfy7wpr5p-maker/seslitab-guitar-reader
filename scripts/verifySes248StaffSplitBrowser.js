import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { runBrowserFixture } from '../tests/support/browserFixture.js'
const chrome = [process.env.CHROME_BIN, 'google-chrome', 'chromium'].filter(Boolean)
  .find(candidate => spawnSync(candidate, ['--version']).status === 0)
if (!chrome) throw new Error('SES-248 requires Chromium')
for (const viewport of ['390,680', '844,390']) {
  const html = await runBrowserFixture(chrome, fileURLToPath(new URL('../tests/fixtures/ses248-staff-split-browser.html', import.meta.url)), viewport)
  if (!html.includes('data-split-pass="true"') || !html.includes('data-undo-pass="true"')) throw new Error(html.slice(-5000))
  console.log('SES-248 real DOM preview/apply/undo PASS ' + viewport)
}
