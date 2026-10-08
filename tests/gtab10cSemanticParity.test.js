import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  GTAB10C_PINNED_PARTITURA_VERSION,
  GTAB10C_PINNED_SEMANTIC_ENGINE_COMMIT,
  GTAB10C_PINNED_EDITOR_COMMIT,
  qualifyGtab10cSemanticParity,
} from '../src/qualification/gtab10cSemanticParity.js'
import { GUITAR_TAB_EDITOR_REVISION } from '../scripts/prepareGuitarTabEditorRuntime.js'

const sourceBytes = '<score-partwise>source</score-partwise>'
const derivedBytes = '<score-partwise>derived</score-partwise>'
const targetSelection = Object.freeze({ partId: 'P-GUITAR', partIndex: 1, staff: 2, voice: 3 })

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function note(overrides = {}) {
  return {
    source_id: 'n1',
    part_id: 'P-GUITAR',
    measure_index: 0,
    pitch_midi: 66,
    onset_div: 0,
    duration_div: 4,
    voice: 3,
    staff: 2,
    tie_prev: null,
    tie_next: null,
    is_grace: false,
    ...overrides,
  }
}

function snapshot(notes, overrides = {}) {
  return {
    schema_version: 'st-semantic-snapshot-v1',
    source_kind: 'musicxml',
    part_count: 2,
    measure_count: 2,
    notes,
    time_signatures: [
      { part_id: 'P-GUITAR', onset_div: 0, beats: 4, beat_type: 4 },
      { part_id: 'P-GUITAR', onset_div: 4, beats: 3, beat_type: 4 },
    ],
    key_signatures: [{ part_id: 'P-GUITAR', onset_div: 0, fifths: 0, mode: 'major' }],
    clefs: [{ part_id: 'P-GUITAR', onset_div: 0, staff: 2, sign: 'G', line: 2, octave_change: 0 }],
    diagnostics: [],
    ...overrides,
  }
}

function derivedSnapshot(notes, overrides = {}) {
  return snapshot(notes.map((entry) => ({ ...entry, part_id: 'P-DERIVED' })), {
    part_count: 1,
    time_signatures: [
      { part_id: 'P-DERIVED', onset_div: 0, beats: 4, beat_type: 4 },
      { part_id: 'P-DERIVED', onset_div: 4, beats: 3, beat_type: 4 },
    ],
    key_signatures: [{ part_id: 'P-DERIVED', onset_div: 0, fifths: 0, mode: 'major' }],
    clefs: [{ part_id: 'P-DERIVED', onset_div: 0, staff: 1, sign: 'G', line: 2, octave_change: 0 }],
    ...overrides,
  })
}

function input(overrides = {}) {
  const sourceNotes = [
    note(),
    note({ source_id: 'n2', measure_index: 1, pitch_midi: 65, onset_div: 4 }),
  ]
  const postNotes = [
    note({ source_id: 'renamed-a', staff: 1 }),
    note({ source_id: 'renamed-b', measure_index: 1, pitch_midi: 65, onset_div: 4, staff: 1 }),
    note({ source_id: 'tab-a', staff: 2 }),
    note({ source_id: 'tab-b', measure_index: 1, pitch_midi: 65, onset_div: 4, staff: 2 }),
  ]
  return {
    fixtureId: 'f-sharp-natural-meter-change',
    sourceBytes,
    derivedBytes,
    expectedSesliTabCommit: '55512de2d9db5bbf97949b32a3be3438d9c51d5f',
    oracleEvidence: { schema: 'gtab-10c-semantic-oracle-output-v1', sourceSha256: sha256(sourceBytes), derivedSha256: sha256(derivedBytes), sourceParts: [{ partId: 'P-FLUTE', measureCount: 2 }, { partId: 'P-GUITAR', measureCount: 2 }], derivedParts: [{ partId: 'P-DERIVED', measureCount: 2 }] },
    sourceSnapshot: snapshot(sourceNotes),
    derivedSnapshot: derivedSnapshot(postNotes),
    targetSelection,
    provenance: {
      sourceSha256: sha256(sourceBytes),
      derivedSha256: sha256(derivedBytes),
      sesliTabCommit: '55512de2d9db5bbf97949b32a3be3438d9c51d5f',
      editorCommit: GTAB10C_PINNED_EDITOR_COMMIT,
      semanticEngineCommit: GTAB10C_PINNED_SEMANTIC_ENGINE_COMMIT,
      referenceBundleSchemaVersion: 'gtab-10c-semantic-reference-bundle-v1',
      snapshotSchemaVersion: 'st-semantic-snapshot-v1',
      partituraVersion: GTAB10C_PINNED_PARTITURA_VERSION,
      targetSelection,
    },
    tabPositions: [
      { measure_index: 0, pitch_midi: 66, onset_div: 0, duration_div: 4, voice: 3, string: 1, fret: 2 },
      { measure_index: 1, pitch_midi: 65, onset_div: 4, duration_div: 4, voice: 3, string: 1, fret: 1 },
    ],
    ...overrides,
  }
}

test('GTAB-10C passes immutable source parity, meter change, F sharp/natural, and TAB position mapping', () => {
  const report = qualifyGtab10cSemanticParity(input())

  assert.equal(report.status, 'PASS')
  assert.deepEqual(report.diagnostics, [])
  assert.equal(report.provenance.fixtureId, 'f-sharp-natural-meter-change')
  assert.equal(report.provenance.sourceSha256, sha256(sourceBytes))
  assert.equal(report.provenance.derivedSha256, sha256(derivedBytes))
  assert.deepEqual(report.unverifiedContexts, [])
})

test('GTAB-10C rejects stale source bytes before semantic comparison', () => {
  const report = qualifyGtab10cSemanticParity(input({ sourceBytes: '<score-partwise>changed</score-partwise>' }))
  assert.equal(report.status, 'UNSUPPORTED')
  assert.equal(report.diagnostics[0].code, 'SOURCE_PROVENANCE_MISMATCH')
})

test('GTAB-10C rejects a target tuple that differs from the bound GTAB-10B selection', () => {
  const report = qualifyGtab10cSemanticParity(input({
    targetSelection: { ...targetSelection, voice: 2 },
  }))
  assert.equal(report.status, 'UNSUPPORTED')
  assert.equal(report.diagnostics[0].code, 'TARGET_SELECTION_MISMATCH')
})

test('GTAB-10C rejects unsupported semantic oracle diagnostics instead of passing', () => {
  const value = input()
  value.sourceSnapshot.diagnostics = [{ code: 'UNSUPPORTED_STRUCTURE', severity: 'ERROR' }]
  const report = qualifyGtab10cSemanticParity(value)
  assert.equal(report.status, 'UNSUPPORTED')
  assert.equal(report.diagnostics[0].code, 'SEMANTIC_ORACLE_UNSUPPORTED')
})

test('GTAB-10C allows source-ID-only warnings when the required semantic fields are still available', () => {
  const value = input()
  value.sourceSnapshot.diagnostics = [{ code: 'MISSING_SOURCE_ID', severity: 'WARNING' }]
  value.derivedSnapshot.diagnostics = [{ code: 'MISSING_SOURCE_ID', severity: 'WARNING' }]
  assert.equal(qualifyGtab10cSemanticParity(value).status, 'PASS')
})

test('GTAB-10C reports a specific pitch mutation and never passes', () => {
  const value = input()
  value.derivedSnapshot.notes[0].pitch_midi = 67
  const report = qualifyGtab10cSemanticParity(value)
  assert.equal(report.status, 'DIAGNOSTIC')
  assert.ok(report.diagnostics.some((item) => item.code === 'PITCH_MISMATCH'))
})

test('GTAB-10C reports duration, onset, voice, measure, tie, and meter mutations', () => {
  const cases = [
    ['DURATION_MISMATCH', (value) => { value.derivedSnapshot.notes[0].duration_div += 1 }],
    ['ONSET_MISMATCH', (value) => { value.derivedSnapshot.notes[0].onset_div += 1 }],
    ['VOICE_MISMATCH', (value) => { value.derivedSnapshot.notes[0].voice += 1 }],
    ['MEASURE_MEMBERSHIP_MISMATCH', (value) => { value.derivedSnapshot.notes[0].measure_index += 1 }],
    ['TIE_MISMATCH', (value) => { value.derivedSnapshot.notes[0].tie_next = 'renamed-b' }],
    ['METER_MISMATCH', (value) => { value.derivedSnapshot.time_signatures[1].beats = 6 }],
  ]
  for (const [code, mutate] of cases) {
    const value = input()
    mutate(value)
    const report = qualifyGtab10cSemanticParity(value)
    assert.notEqual(report.status, 'PASS', `${code} must fail closed`)
    assert.ok(report.diagnostics.some((item) => item.code === code), `${code} should be reported`)
  }
})

test('GTAB-10C detects dropped key signature and clef context instead of silently claiming parity', () => {
  const keyValue = input()
  keyValue.derivedSnapshot.key_signatures = []
  const keyReport = qualifyGtab10cSemanticParity(keyValue)
  assert.equal(keyReport.status, 'DIAGNOSTIC')
  assert.ok(keyReport.diagnostics.some((item) => item.code === 'KEY_SIGNATURE_MISMATCH'))

  const clefValue = input()
  clefValue.derivedSnapshot.clefs[0].sign = 'F'
  const clefReport = qualifyGtab10cSemanticParity(clefValue)
  assert.equal(clefReport.status, 'DIAGNOSTIC')
  assert.ok(clefReport.diagnostics.some((item) => item.code === 'CLEF_MISMATCH'))
})

test('GTAB-10C rejects events from unselected source voices leaking into notation or TAB', () => {
  const value = input()
  value.derivedSnapshot.notes.push(note({ source_id: 'leaked', part_id: 'P-DERIVED', staff: 1, voice: 2 }))
  const report = qualifyGtab10cSemanticParity(value)
  assert.equal(report.status, 'DIAGNOSTIC')
  assert.ok(report.diagnostics.some((item) => item.code === 'NOTE_EXTRA'))
})

test('GTAB-10C classifies missing notation events and measure-count changes', () => {
  const missing = input()
  missing.derivedSnapshot.notes = missing.derivedSnapshot.notes.filter((entry) => entry.staff !== 1 || entry.measure_index !== 1)
  const missingReport = qualifyGtab10cSemanticParity(missing)
  assert.ok(missingReport.diagnostics.some((item) => item.code === 'NOTE_MISSING'))

  const changedMeasureCount = input()
  changedMeasureCount.derivedSnapshot.measure_count = 3
  const measureReport = qualifyGtab10cSemanticParity(changedMeasureCount)
  assert.ok(measureReport.diagnostics.some((item) => item.code === 'MEASURE_COUNT_MISMATCH'))
})

test('GTAB-10C rejects duplicate structural events as ambiguous', () => {
  const value = input()
  value.sourceSnapshot.notes.push({ ...value.sourceSnapshot.notes[0], source_id: 'duplicate' })
  value.derivedSnapshot.notes.push({ ...value.derivedSnapshot.notes[0], source_id: 'duplicate-output' })
  value.derivedSnapshot.notes.push({ ...value.derivedSnapshot.notes[2], source_id: 'duplicate-tab' })
  const report = qualifyGtab10cSemanticParity(value)
  assert.ok(report.diagnostics.some((item) => item.code === 'AMBIGUOUS_STRUCTURAL_MATCH'))
})

test('GTAB-10C rejects invalid TAB strings, frets, and pitch mappings', () => {
  for (const position of [
    { string: 0, fret: 1 },
    { string: 1, fret: -1 },
    { string: 1, fret: 3 },
  ]) {
    const value = input()
    Object.assign(value.tabPositions[0], position)
    const report = qualifyGtab10cSemanticParity(value)
    assert.equal(report.status, 'DIAGNOSTIC')
    assert.ok(report.diagnostics.some((item) => item.code === 'TAB_POSITION_PITCH_MISMATCH'))
  }
})

test('GTAB-10C rejects malformed snapshots and provenance pins', () => {
  const badSchema = input()
  badSchema.sourceSnapshot.schema_version = 'future-schema'
  assert.equal(qualifyGtab10cSemanticParity(badSchema).status, 'UNSUPPORTED')

  const badPin = input()
  badPin.provenance.partituraVersion = '2.0.0'
  assert.equal(qualifyGtab10cSemanticParity(badPin).status, 'UNSUPPORTED')
})

test('GTAB-10C oracle pin matches the exact editor runtime revision used by SesliTab', () => {
  assert.equal(GTAB10C_PINNED_EDITOR_COMMIT, GUITAR_TAB_EDITOR_REVISION)
})

test('GTAB-10C unexpected derived staff returns controlled rejection, never TDZ throw', () => {
  const value = input()
  value.derivedSnapshot.notes[0].staff = 3
  assert.notEqual(qualifyGtab10cSemanticParity(value).status, 'PASS')
})

test('GTAB-10C missing or invalid context cannot claim complete oracle PASS', () => {
  for (const field of ['key_signatures', 'clefs']) {
    for (const invalid of [undefined, null, [{ part_id: 'P-GUITAR', onset_div: 0 }]]) {
      const value = input()
      value.sourceSnapshot[field] = invalid
      assert.equal(qualifyGtab10cSemanticParity(value).status, 'UNSUPPORTED')
    }
  }
})

test('GTAB-10C rejects a dangling tie even when its presence bits match on every staff', () => {
  const value = input()
  value.sourceSnapshot.notes[0].tie_next = 'dangling-source'
  value.derivedSnapshot.notes[0].tie_next = 'dangling-output'
  value.derivedSnapshot.notes[2].tie_next = 'dangling-tab'
  value.tabPositions[0].tie_next = 'dangling-tab'
  assert.notEqual(qualifyGtab10cSemanticParity(value).status, 'PASS')
})

test('GTAB-10C distinguishes valid absent keys from missing schema coverage', () => {
  const value = input()
  value.sourceSnapshot.key_signatures = []
  value.derivedSnapshot.key_signatures = []
  assert.equal(qualifyGtab10cSemanticParity(value).status, 'PASS')
})

test('GTAB-10C rejects stale checkout, foreign oracle bytes, and wrong selected part ordinal', () => {
  for (const mutate of [
    value => { value.expectedSesliTabCommit = 'a'.repeat(40) },
    value => { value.oracleEvidence.sourceSha256 = 'b'.repeat(64) },
    value => { value.oracleEvidence.derivedSha256 = 'b'.repeat(64) },
    value => { value.oracleEvidence.sourceParts.reverse() },
  ]) {
    const value = input()
    mutate(value)
    assert.notEqual(qualifyGtab10cSemanticParity(value).status, 'PASS')
  }
})

test('GTAB-10C compares selected part measure count rather than another part maximum', () => {
  const value = input()
  value.sourceSnapshot.measure_count = 5
  value.oracleEvidence.sourceParts[0].measureCount = 5
  assert.equal(qualifyGtab10cSemanticParity(value).status, 'PASS')
})

test('GTAB-10C renamed tie endpoints preserve topology; corrupted edges fail closed', () => {
  const make = () => {
    const value = input()
    value.sourceSnapshot.notes[1].pitch_midi = 66
    value.sourceSnapshot.notes[0].tie_next = 'n2'
    value.sourceSnapshot.notes[1].tie_prev = 'n1'
    for (const [first, second] of [[0, 1], [2, 3]]) {
      const a = value.derivedSnapshot.notes[first]
      const b = value.derivedSnapshot.notes[second]
      b.pitch_midi = 66
      a.tie_next = b.source_id
      b.tie_prev = a.source_id
    }
    value.tabPositions[0].tie_next = 'tab-b'
    value.tabPositions[1].tie_prev = 'tab-a'
    value.tabPositions[1].pitch_midi = 66
    value.tabPositions[1].fret = 2
    return value
  }
  assert.equal(qualifyGtab10cSemanticParity(make()).status, 'PASS')
  for (const mutate of [
    value => { value.derivedSnapshot.notes[1].tie_prev = null },
    value => { value.derivedSnapshot.notes[0].tie_next = 'tab-b' },
    value => { value.derivedSnapshot.notes[0].tie_next = 'renamed-a' },
    value => { value.derivedSnapshot.notes[0].tie_next = null; value.derivedSnapshot.notes[1].tie_prev = null },
  ]) {
    const value = make()
    mutate(value)
    assert.notEqual(qualifyGtab10cSemanticParity(value).status, 'PASS')
  }
})
