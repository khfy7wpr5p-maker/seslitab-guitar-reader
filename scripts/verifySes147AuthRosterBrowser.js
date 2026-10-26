import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { runBrowserFixture } from '../tests/support/browserFixture.js'

const repoRoot = path.resolve(
  fileURLToPath(new URL('..', import.meta.url)),
)
const fixturePath = path.join(
  repoRoot,
  'tests',
  'fixtures',
  'ses147-auth-roster-browser-proof.html',
)

const candidates = [
  process.env.CHROME_BIN,
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
].filter(Boolean)

let chrome = null
for (const candidate of candidates) {
  const probe = spawnSync(
    candidate,
    ['--version'],
    { encoding: 'utf8' },
  )
  if (probe.status === 0) {
    chrome = candidate
    break
  }
}

if (!chrome) {
  console.error(
    'SES-147 browser proof failed closed: Chrome/Chromium not found.',
  )
  process.exit(1)
}

let dom
try {
  dom = await runBrowserFixture(
    chrome,
    fixturePath,
    '1280,800',
  )
} catch (error) {
  console.error(
    error instanceof Error ? error.message : String(error),
  )
  process.exit(1)
}

if (!/id="proof"[^>]*>PASS/.test(dom)) {
  console.error('SES-147 browser proof did not complete successfully.')
  console.error(dom.slice(-8000))
  process.exit(1)
}

for (const marker of [
  'data-config-unavailable-pass="true"',
  'data-signed-out-pass="true"',
  'data-roster-failure-pass="true"',
  'data-session-expired-pass="true"',
  'data-success-mount-pass="true"',
]) {
  if (!dom.includes(marker)) {
    console.error(
      `SES-147 browser proof missing ${marker}`,
    )
    console.error(dom.slice(-8000))
    process.exit(1)
  }
}

console.log(
  `SES-147 authenticated roster browser proof PASS using ${chrome}`,
)
