import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const host = readFileSync(new URL('../src/smoosicEditorTabUi.js', import.meta.url), 'utf8')

test('CE bridge host loads the pinned browser runtime only for explicit structural Apply', () => {
  assert.match(host, /CE_STRUCT_RUNTIME_SRC\s*=\s*['"]\/st-omr-correction-engine-runtime\/ce-struct-browser-runtime\.js['"]/)
  assert.match(host, /async function loadCeStructRuntime\(root\)/)
  assert.match(host, /STOmrCorrectionCeStructRuntime/)
  assert.match(host, /structuralActionManifest/)
  assert.match(host, /validateTeacherStructuralActionManifest/)
  assert.match(host, /createSmoosicCeStructIdentityBridge/)
  assert.match(host, /ceStructRuntime/)
  assert.match(host, /structuralPatchSetId/)
})

test('CE bridge host keeps nonstructural S15 routing and never infers structural intent from candidate XML', () => {
  assert.match(host, /if \(candidate\.structuralActionManifest !== undefined\)/)
  assert.match(host, /applySmoosicProductWriteback\(\{[\s\S]*paddingRestProvenance: proof/)
  assert.doesNotMatch(host, /inferStructural|structural.*diff|diff.*structural/i)
})

test('CE bridge host accepts APPLIED_STRUCTURAL as a committed publication result', () => {
  assert.match(host, /SMOOSIC_WRITEBACK_STATUS\.APPLIED_STRUCTURAL/)
  assert.match(host, /state\.authority = result\.authority/)
  assert.match(host, /pendingPublication/)
})

test('CE bridge host exposes accessible typed fail-closed status without raw provenance payload', () => {
  assert.match(host, /role['"], kind === 'error' \? 'alert' : 'status'/)
  assert.match(host, /aria-live['"], kind === 'error' \? 'assertive' : 'polite'/)
  for (const status of [
    'INVALID_ACTION_PROVENANCE',
    'STALE_SOURCE',
    'CE_RUNTIME_UNAVAILABLE',
    'CE_CONTRACT_MISMATCH',
    'CE_PROJECTION_FAILED',
    'CE_REVALIDATION_FAILED',
    'CONFORMANCE_FAILED',
  ]) assert.match(host, new RegExp(status))
  assert.doesNotMatch(host, /JSON\.stringify\(candidate\.structuralActionManifest\)/)
})
