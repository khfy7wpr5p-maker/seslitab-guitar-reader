import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { framePayloadScript } from '../scripts/ceBridgeFixtureTransport.js'

test('iframe script delivers exact XML and metadata through postMessage serialization', () => {
  const payload = { musicXml: '<score>\"quoted\" & \u2028</score>', requestId: 'fixture-request', sourceRevision: 3,
    structuralActionManifest: { malformed: true } }
  let delivered
  vm.runInNewContext(framePayloadScript(payload), { parent: { postMessage(value, origin) { delivered = { value, origin } } },
    location: { origin: 'https://fixture.example' } })
  assert.equal(delivered.origin, 'https://fixture.example')
  assert.equal(JSON.stringify(delivered.value), JSON.stringify(payload))
})

import { runBrowserFixture } from './support/browserFixture.js'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test('real iframe preserves source, origin and exact payload through queued postMessage', async () => {
  const chrome = [process.env.CHROME_BIN, 'google-chrome', 'chromium'].filter(Boolean)
    .find((candidate) => spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0)
  assert.ok(chrome, 'Chromium is required for the transport regression')
  const html = await runBrowserFixture(chrome,
    fileURLToPath(new URL('./fixtures/ce-bridge-payload-transport.html', import.meta.url)),
    '800,600')
  assert.match(html, /id="proof"[^>]*>PASS/)
})

import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('failed browser proof removes stale success evidence before checking prerequisites', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ce-proof-failure-'))
  try {
    mkdirSync(join(directory, 'artifacts'))
    const artifact = join(directory, 'artifacts/ce-bridge-structural-browser.json')
    writeFileSync(artifact, '{"staleSuccess":true}')
    const result = spawnSync(process.execPath,
      [fileURLToPath(new URL('../scripts/verifyCeBridgeStructuralBrowser.js', import.meta.url))],
      { cwd: directory, encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Missing build artifact/)
    assert.equal(existsSync(artifact), false)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
