import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(
  fileURLToPath(new URL('..', import.meta.url)),
)
const fixturePath = path.join(
  repoRoot,
  'tests',
  'fixtures',
  'ses153-teacher-authority-browser-proof.html',
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
    'SES-153 browser proof failed closed: Chrome/Chromium not found.',
  )
  process.exit(1)
}

const result = spawnSync(
  chrome,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--allow-file-access-from-files',
    '--virtual-time-budget=15000',
    '--dump-dom',
    pathToFileURL(fixturePath).href,
  ],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 45000,
    maxBuffer: 16 * 1024 * 1024,
  },
)

if (result.error || result.status !== 0) {
  console.error(
    result.error?.message ||
      result.stderr?.slice(-4000) ||
      `Chrome exit ${result.status}`,
  )
  process.exit(1)
}

const dom = result.stdout || ''
for (const marker of [
  'data-score-only-pass="true"',
  'data-combined-pass="true"',
]) {
  if (!dom.includes(marker)) {
    console.error(
      `SES-153 browser proof missing ${marker}`,
    )
    const diagnostics =
      dom.match(
        /data-combined-diagnostics="([^"]*)"/u,
      )?.[1]
    if (diagnostics) {
      console.error(
        `SES-153 combined diagnostics: ${diagnostics}`,
      )
    }
    console.error(dom.slice(-10000))
    process.exit(1)
  }
}

console.log(
  `SES-153 teacher-authority SCORE browser proof PASS using ${chrome}`,
)
