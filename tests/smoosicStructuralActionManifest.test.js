import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const moduleUrl = new URL('../src/services/smoosicStructuralActionManifest.js', import.meta.url)

async function api() {
  assert.equal(existsSync(fileURLToPath(moduleUrl)), true)
  return import(moduleUrl)
}

function validManifest() {
  return {
    version: 1,
    sourceRevision: 7,
    editorSessionId: 'session-1',
    actionId: 'apply-1',
    operations: [{
      order: 0,
      operation: 'CHANGE_EVENT_DURATION',
      rawNoteOrdinal: 0,
      staffIndex: 0,
      measureIndex: 0,
      voiceIndex: 0,
      noteIndex: 0,
      noteIdentity: 'rendered-a',
      before: 8,
      after: 16,
    }],
    baseMappingFingerprint: '0123456789abcdef',
    createdFromExplicitTeacherApply: true,
  }
}

test('host accepts only the exact structural action manifest shape and freezes a clone', async () => {
  const { validateTeacherStructuralActionManifest } = await api()
  const source = validManifest()
  const result = validateTeacherStructuralActionManifest(source, {
    sourceRevision: 7,
    baseMappingFingerprint: '0123456789abcdef',
  })
  assert.deepEqual(result, source)
  assert.notEqual(result, source)
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.operations))
  assert.ok(Object.isFrozen(result.operations[0]))
})

test('host rejects stale, malformed, oversized and authority-like manifest data', async () => {
  const { validateTeacherStructuralActionManifest } = await api()

  const stale = validManifest()
  assert.throws(
    () => validateTeacherStructuralActionManifest(stale, {
      sourceRevision: 8,
      baseMappingFingerprint: stale.baseMappingFingerprint,
    }),
    /stale|source revision/i,
  )

  const drift = validManifest()
  assert.throws(
    () => validateTeacherStructuralActionManifest(drift, {
      sourceRevision: 7,
      baseMappingFingerprint: 'fedcba9876543210',
    }),
    /fingerprint/i,
  )

  const extra = validManifest()
  extra.automaticApplyAuthority = true
  assert.throws(
    () => validateTeacherStructuralActionManifest(extra, {
      sourceRevision: 7,
      baseMappingFingerprint: extra.baseMappingFingerprint,
    }),
    /shape|unknown/i,
  )

  const accessor = validManifest()
  Object.defineProperty(accessor.operations[0], 'before', { enumerable: true, get() { return 8 } })
  assert.throws(
    () => validateTeacherStructuralActionManifest(accessor, {
      sourceRevision: 7,
      baseMappingFingerprint: accessor.baseMappingFingerprint,
    }),
    /accessor|shape/i,
  )

  const symbol = validManifest()
  symbol.operations[0][Symbol('hidden')] = true
  assert.throws(
    () => validateTeacherStructuralActionManifest(symbol, {
      sourceRevision: 7,
      baseMappingFingerprint: symbol.baseMappingFingerprint,
    }),
    /symbol|shape/i,
  )

  const oversized = validManifest()
  oversized.editorSessionId = 's'.repeat(70 * 1024)
  assert.throws(
    () => validateTeacherStructuralActionManifest(oversized, {
      sourceRevision: 7,
      baseMappingFingerprint: oversized.baseMappingFingerprint,
    }),
    /64 KiB|size|limit/i,
  )
})

test('host recognizes but does not admit non-duration CE operations in this milestone', async () => {
  const { validateTeacherStructuralActionManifest } = await api()
  for (const operation of [
    'INSERT_EVENT',
    'REMOVE_EVENT',
    'CHANGE_EVENT_VOICE',
    'CHANGE_EVENT_STAFF',
    'CHANGE_EVENT_TIE',
    'CHANGE_MEASURE_METER',
  ]) {
    const value = validManifest()
    value.operations[0].operation = operation
    assert.throws(
      () => validateTeacherStructuralActionManifest(value, {
        sourceRevision: 7,
        baseMappingFingerprint: value.baseMappingFingerprint,
      }),
      /unsupported structural operation/i,
    )
  }
})
