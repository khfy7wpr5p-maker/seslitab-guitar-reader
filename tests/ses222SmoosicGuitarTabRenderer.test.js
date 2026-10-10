import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const ci = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
const browserProof = await readFile(
  new URL('../scripts/verifySes222SmoosicGuitarTabRendererBrowser.js', import.meta.url),
  'utf8',
)
const browserFixture = await readFile(
  new URL('./fixtures/ses-222-smoosic-gtab-renderer-browser-proof.html', import.meta.url),
  'utf8',
)
const browserFixtureServer = await readFile(
  new URL('./support/browserFixture.js', import.meta.url),
  'utf8',
)

test('SES-222 real-browser proof runs only after pinned runtime preparation', () => {
  const build = ci.indexOf('run: npm run build')
  const runtime = ci.indexOf('run: node scripts/verifySes222SmoosicGuitarTabRendererBrowser.js')

  assert.notEqual(build, -1)
  assert.notEqual(runtime, -1)
  assert.equal(build < runtime, true)
})

test('SES-222 browser gate requires root-cause, renderer, authoring, and pitch evidence', () => {
  for (const marker of [
    'data-raw-osmd-rejection-pass="true"',
    'data-accepted-revision-pass="true"',
    'data-renderer-compatibility-pass="true"',
    'data-canonical-pitch-pass="true"',
  ]) {
    assert.match(browserProof, new RegExp(marker))
  }
})

test('real-browser fixture server serves pinned runtime modules as JavaScript', () => {
  assert.match(browserFixtureServer, /'\.mjs': 'text\/javascript'/u)
})

test('SES-222 proof keeps its preloaded runtime outside prior-render cleanup', () => {
  assert.doesNotMatch(browserFixture, /frame\.id\s*=\s*['"]guitar-tab-score-runtime-frame/u)
  assert.match(browserFixture, /frame\.isConnected/u)
})
