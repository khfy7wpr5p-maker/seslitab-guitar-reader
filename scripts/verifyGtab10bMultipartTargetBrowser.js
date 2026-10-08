import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { runBrowserFixture } from '../tests/support/browserFixture.js'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixturePath = path.join(repoRoot, 'tests/fixtures/gtab10b-multipart-target-browser-proof.html')
const candidates = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)
let chrome = null
for (const candidate of candidates) {
  if (spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0) {
    chrome = candidate
    break
  }
}

if (!chrome) {
  console.error('GTAB-10B browser proof failed closed: Chrome/Chromium not found.')
  process.exit(1)
}

let dom
try {
  dom = await runBrowserFixture(chrome, fixturePath, '1280,800')
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
}

for (const marker of [
  'data-multipart-visible-pass="true"',
  'data-target-switch-pass="true"',
  'data-legacy-single-part-pass="true"',
]) {
  if (!dom.includes(marker)) {
    console.error(`GTAB-10B browser proof missing ${marker}`)
    console.error(dom.slice(-8000))
    process.exit(1)
  }
}

console.log(`GTAB-10B multipart target browser proof PASS using ${chrome}`)
