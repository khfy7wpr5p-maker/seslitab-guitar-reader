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


test('host fails closed across malformed manifest and duration-operation edge cases', async () => {
  const { validateTeacherStructuralActionManifest } = await api()
  const context = (value) => ({
    sourceRevision: 7,
    baseMappingFingerprint: value?.baseMappingFingerprint ?? '0123456789abcdef',
  })

  assert.throws(
    () => validateTeacherStructuralActionManifest(null, context(null)),
    /shape is invalid/i,
  )

  const inherited = validManifest()
  Object.setPrototypeOf(inherited, { inherited: true })
  assert.throws(
    () => validateTeacherStructuralActionManifest(inherited, context(inherited)),
    /shape is invalid/i,
  )

  const wrongVersion = validManifest()
  wrongVersion.version = 2
  assert.throws(
    () => validateTeacherStructuralActionManifest(wrongVersion, context(wrongVersion)),
    /version is unsupported/i,
  )

  const emptySession = validManifest()
  emptySession.editorSessionId = ' '
  assert.throws(
    () => validateTeacherStructuralActionManifest(emptySession, context(emptySession)),
    /editorSessionId.*non-empty/i,
  )

  const badExpectedRevision = validManifest()
  assert.throws(
    () => validateTeacherStructuralActionManifest(badExpectedRevision, {
      sourceRevision: -1,
      baseMappingFingerprint: badExpectedRevision.baseMappingFingerprint,
    }),
    /expected source revision.*non-negative/i,
  )

  const badFingerprint = validManifest()
  badFingerprint.baseMappingFingerprint = 'xyz'
  assert.throws(
    () => validateTeacherStructuralActionManifest(badFingerprint, {
      sourceRevision: 7,
      baseMappingFingerprint: 'xyz',
    }),
    /fingerprint mismatch/i,
  )

  const noApply = validManifest()
  noApply.createdFromExplicitTeacherApply = false
  assert.throws(
    () => validateTeacherStructuralActionManifest(noApply, context(noApply)),
    /explicit teacher Apply provenance/i,
  )

  const emptyOperations = validManifest()
  emptyOperations.operations = []
  assert.throws(
    () => validateTeacherStructuralActionManifest(emptyOperations, context(emptyOperations)),
    /operations must be non-empty/i,
  )

  const symbolOperations = validManifest()
  symbolOperations.operations[Symbol('hidden')] = true
  assert.throws(
    () => validateTeacherStructuralActionManifest(symbolOperations, context(symbolOperations)),
    /operations contain symbol keys/i,
  )

  const tooManyOperations = validManifest()
  tooManyOperations.operations = Array.from({ length: 129 }, (_, order) => ({
    ...validManifest().operations[0],
    order,
    rawNoteOrdinal: order,
    noteIndex: order,
  }))
  assert.throws(
    () => validateTeacherStructuralActionManifest(tooManyOperations, context(tooManyOperations)),
    /operation limit exceeded/i,
  )

  const sparseOperations = validManifest()
  sparseOperations.operations = Array(1)
  assert.throws(
    () => validateTeacherStructuralActionManifest(sparseOperations, context(sparseOperations)),
    /operations must be dense/i,
  )

  const unknownOperation = validManifest()
  unknownOperation.operations[0].operation = 'UNKNOWN'
  assert.throws(
    () => validateTeacherStructuralActionManifest(unknownOperation, context(unknownOperation)),
    /Unsupported structural operation/i,
  )

  const wrongOrder = validManifest()
  wrongOrder.operations[0].order = 1
  assert.throws(
    () => validateTeacherStructuralActionManifest(wrongOrder, context(wrongOrder)),
    /operation order is invalid/i,
  )

  const negativeLocator = validManifest()
  negativeLocator.operations[0].measureIndex = -1
  assert.throws(
    () => validateTeacherStructuralActionManifest(negativeLocator, context(negativeLocator)),
    /measureIndex.*non-negative/i,
  )

  const emptyIdentity = validManifest()
  emptyIdentity.operations[0].noteIdentity = ''
  assert.throws(
    () => validateTeacherStructuralActionManifest(emptyIdentity, context(emptyIdentity)),
    /noteIdentity.*non-empty/i,
  )

  const zeroDuration = validManifest()
  zeroDuration.operations[0].before = 0
  assert.throws(
    () => validateTeacherStructuralActionManifest(zeroDuration, context(zeroDuration)),
    /before.*positive finite/i,
  )

  const unchangedDuration = validManifest()
  unchangedDuration.operations[0].after = unchangedDuration.operations[0].before
  assert.throws(
    () => validateTeacherStructuralActionManifest(unchangedDuration, context(unchangedDuration)),
    /must change duration/i,
  )
})
