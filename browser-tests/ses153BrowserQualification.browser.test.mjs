import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { runSes153BrowserProof } from '../scripts/ses153BrowserProofSession.js'

const fixtureUrl = new URL('../tests/fixtures/ses153-teacher-authority-browser-proof.html', import.meta.url)
const source = readFileSync(fixtureUrl, 'utf8')

async function runFixture(html, timeoutMs = 15000) {
  const url = new URL(`../tests/fixtures/ses153-negative-${randomUUID()}.html`, import.meta.url)
  writeFileSync(url, html)
  try { return await runSes153BrowserProof({ url: url.href, timeoutMs }) }
  finally { rmSync(url) }
}

test('SES-153 clean browser runs independently prove exact SCORE and combined payloads three times', async () => {
  for (let run = 0; run < 3; run += 1) {
    const result = await runSes153BrowserProof({ url: fixtureUrl.href })
    assert.equal(result.outcome, 'PASS', JSON.stringify(result))
    for (const name of ['scoreOnlyDiagnostics', 'combinedDiagnostics']) {
      assert.ok(Object.values(JSON.parse(result.snapshot.dataset[name])).every(Boolean))
    }
    for (const kind of ['file_text_resolved', 'hash_resolved']) {
      assert.ok(result.events.some(event => event.detail?.kind === kind))
    }
  }
})

test('SES-153 a rejected SCORE-only input cannot hide a valid combined result', async () => {
  const result = await runFixture(source.replace('musicXml: PIANO_TWO_STAFF_XML, filename:', 'musicXml: "<not-musicxml/>", filename:'))
  assert.equal(result.outcome, 'FAIL')
  assert.equal(result.snapshot.dataset.scoreOnlyPass, 'false')
  assert.equal(result.snapshot.dataset.combinedPass, 'true')
  assert.match(result.snapshot.dataset.scoreOnlyDiagnostics, /SCORE rejected/)
})

test('SES-153 a stalled SCORE-only upload cannot stop combined qualification or hide its result', async () => {
  const result = await runFixture(source.replace('upload = await harness.service.prepareScoreUpload(input)',
    'if (input.draftId.endsWith("score-only")) await new Promise(() => {}); upload = await harness.service.prepareScoreUpload(input)'), 1000)
  assert.equal(result.outcome, 'FAIL')
  assert.match(result.reason, /TIMEOUT/)
  assert.equal(result.snapshot.dataset.combinedPass, 'true')
  assert.equal(result.snapshot.dataset.scoreOnlyStage, 'score-only:upload_started')
})

test('SES-153 delivery acknowledgement corruption fails the browser acceptance', async () => {
  const result = await runFixture(source.replace('deliveryId:\n          item.assignment.assignmentId,', "deliveryId: 'wrong-delivery-id',"))
  assert.equal(result.outcome, 'FAIL')
  assert.equal(result.snapshot.dataset.scoreOnlyPass, 'false')
  assert.equal(result.snapshot.dataset.combinedPass, 'false')
})

test('SES-153 records an early module exception with its source before any PASS marker', async () => {
  const result = await runFixture('<script type="module">throw new Error("ses153-first-module-error")</script>')
  assert.equal(result.outcome, 'FAIL')
  assert.match(JSON.stringify(result.events), /ses153-first-module-error/)
  assert.ok(result.events.some(event => event.kind === 'Runtime.exceptionThrown'))
  assert.match(result.reason, /before fixture entry/)
})

test('SES-153 records console error and unhandled rejection independently', async () => {
  for (const script of ['console.error("ses153-console-error")', 'Promise.reject(new Error("ses153-rejection"))']) {
    const result = await runFixture(`<script>${script}</script>`)
    assert.equal(result.outcome, 'FAIL')
    assert.match(JSON.stringify(result.events), /ses153-console-error|ses153-rejection/)
  }
})

test('SES-153 a stalled fixture reports host deadline and last stage; script source markers cannot pass', async () => {
  const result = await runFixture(`<body data-stage="upload_started"><script>
    const decoy = 'data-score-only-pass="true" data-combined-pass="true"';
  </script></body>`, 1000)
  assert.equal(result.outcome, 'FAIL')
  assert.match(result.reason, /TIMEOUT: stage=upload_started/)
  assert.equal(result.snapshot.dataset.scoreOnlyPass, undefined)
})
