import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const hostPath = new URL('../src/smoosicEditorTabUi.js', import.meta.url)
const host = readFileSync(hostPath, 'utf8')
const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
const browserScript = new URL('../scripts/verifyCeBridgeStructuralBrowser.js', import.meta.url)
const browserFixture = new URL('../tests/fixtures/ce-bridge-structural-browser-proof.html', import.meta.url)

test('Task 7 exposes a one-per-document exact CE-STRUCT runtime loader', () => {
  assert.match(host, /export async function loadCeStructRuntime\(root = document\)/)
  assert.match(host, /const CE_STRUCT_RUNTIME_SRC = '\/st-omr-correction-engine-runtime\/ce-struct-browser-runtime\.js'/)
  assert.match(host, /const ceRuntimeLoads = new WeakMap\(\)/)
  assert.match(host, /resolveCeStructRuntime/)
  assert.match(host, /data-seslitab-ce-struct-runtime/)
  assert.match(host, /if \(ceRuntimeLoads\.has\(root\)\) return ceRuntimeLoads\.get\(root\)/)
})

test('Task 7 preserves exact writeback message correlation before structural routing', () => {
  for (const pattern of [
    /event\.origin !== win\.location\.origin/,
    /event\.source !== state\.frame\?\.contentWindow/,
    /message\.requestId !== pending\.requestId/,
    /message\.sourceRevision !== pending\.sourceRevision/,
    /state\.sourceRevision !== pending\.sourceRevision/,
    /sourceTransitionPending\(root\)/,
  ]) assert.match(host, pattern)
})

test('Task 7 validates structural provenance before loading CE and never infers intent from XML', () => {
  assert.match(host, /candidate\.structuralActionManifest/)
  assert.match(host, /createSmoosicCeStructIdentityBridge/)
  assert.match(host, /validateTeacherStructuralActionManifest/)
  assert.match(host, /loadCeStructRuntime\(root\)/)
  assert.match(host, /structuralActionManifest: validatedStructuralManifest/)
  assert.match(host, /ceStructRuntime/)
  assert.match(host, /structuralPatchSetId:/)
  assert.doesNotMatch(host, /structuralActionManifest\s*:\s*candidate\.musicXml/)
  assert.doesNotMatch(host, /validatedStructuralManifest\s*=\s*candidate\.musicXml/)
})

test('Task 7 keeps nonstructural S15 path free of CE runtime loading', () => {
  const applyStart = host.indexOf('async function applyEditorWriteback(')
  const applyEnd = host.indexOf('\nfunction setTabActive(', applyStart)
  const applyCode = host.slice(applyStart, applyEnd)
  const manifestIndex = applyCode.indexOf('candidate.structuralActionManifest')
  const runtimeIndex = applyCode.indexOf('loadCeStructRuntime(root)')
  assert.ok(manifestIndex >= 0)
  assert.ok(runtimeIndex > manifestIndex)
  assert.match(applyCode, /structuralActionManifest === undefined/)
})

test('Task 7 publishes APPLIED_STRUCTURAL through the existing immutable publication path', () => {
  assert.match(host, /SMOOSIC_WRITEBACK_STATUS\.APPLIED_STRUCTURAL/)
  assert.match(host, /result\.status !== SMOOSIC_WRITEBACK_STATUS\.APPLIED[\s\S]*result\.status !== SMOOSIC_WRITEBACK_STATUS\.APPLIED_STRUCTURAL/)
  assert.match(host, /pendingPublication = Object\.freeze\([\s\S]*status: result\.status/)
  assert.match(host, /createSmoosicWritebackOutcome\(pendingPublication\.status/)
  assert.match(host, /applyRevalidatedMusicXmlRevision\(committed\.revision\.content, committed\.musicXml\)/)
})

test('Task 7 status messages are accessible, typed, short, and do not expose provenance payloads', () => {
  assert.match(host, /status\.setAttribute\('role', kind === 'error' \? 'alert' : 'status'\)/)
  assert.match(host, /status\.setAttribute\('aria-live', kind === 'error' \? 'assertive' : 'polite'\)/)

  for (const text of [
    'Bu yapısal düzenleme henüz desteklenmiyor',
    'Kaynak değişti',
    'Yapısal düzenleme kaynağı doğrulanamadı',
    'Yapısal doğrulama motoru kullanılamıyor',
    'Editör sonucu doğrulanan yapısal değişiklikle eşleşmiyor',
  ]) assert.ok(host.includes(text), text)

  assert.doesNotMatch(host, /textContent\s*=\s*JSON\.stringify\([^\n]*structuralActionManifest/)
  assert.doesNotMatch(host, /textContent\s*=\s*candidate\.structuralActionManifest/)
})

test('Task 7 protects a real-browser structural proof in CI immediately after S15 writeback', () => {
  assert.equal(existsSync(fileURLToPath(browserScript)), true)
  assert.equal(existsSync(fileURLToPath(browserFixture)), true)
  const s15 = ci.indexOf('Verify S15 Smoosic write-back in real browser')
  const ce = ci.indexOf('Verify CE-BRIDGE structural Smoosic write-back in real browser')
  const sti17 = ci.indexOf('Verify STI-17 cross-realm iframe renderer in real browser')
  assert.ok(s15 >= 0)
  assert.ok(ce > s15)
  assert.ok(sti17 > ce)
  assert.match(ci, /node scripts\/verifyCeBridgeStructuralBrowser\.js/)
})
