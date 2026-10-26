import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { runBrowserFixture } from '../tests/support/browserFixture.js'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixturePath = path.join(repoRoot, 'tests/fixtures/ses-222-smoosic-gtab-renderer-browser-proof.html')
const candidates = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)
let chrome = null
for (const candidate of candidates) {
  if (spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0) {
    chrome = candidate
    break
  }
}

if (!chrome) {
  console.error('SES-222 browser proof failed closed: Chrome/Chromium not found.')
  process.exit(1)
}

let dom
try {
  dom = await runBrowserFixture(chrome, fixturePath, '1280,900')
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
}

for (const marker of [
  'data-raw-osmd-rejection-pass="true"',
  'data-accepted-revision-pass="true"',
  'data-renderer-compatibility-pass="true"',
  'data-canonical-pitch-pass="true"',
]) {
  if (!dom.includes(marker)) {
    console.error(`SES-222 browser proof missing ${marker}`)
    console.error(dom.slice(-10000))
    process.exit(1)
  }
}

console.log(`SES-222 Smoosic Guitar TAB renderer browser proof PASS using ${chrome}`)
