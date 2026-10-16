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
const targetSelection = Object.freeze({ partId: 'P-GUITAR', partIndex: 1, staff: 1, voice: 3 })

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
    staff: 1,
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
    clefs: [{ part_id: 'P-GUITAR', onset_div: 0, staff: 1, sign: 'G', line: 2, octave_change: 0 }],
    diagnostics: [],
    ...overrides,
  }
}

function derivedSnapshot(notes, overrides = {}) {
  return snapshot(notes.map((entry) => ({ ...entry, part_id: 'P-GUITAR' })), {
    part_count: 2,
    time_signatures: [
      { part_id: 'P-GUITAR', onset_div: 0, beats: 4, beat_type: 4 },
      { part_id: 'P-GUITAR', onset_div: 4, beats: 3, beat_type: 4 },
    ],
    key_signatures: [{ part_id: 'P-GUITAR', onset_div: 0, fifths: 0, mode: 'major' }],
    clefs: [{ part_id: 'P-GUITAR', onset_div: 0, staff: 1, sign: 'G', line: 2, octave_change: 0 },
      { part_id: 'P-GUITAR', onset_div: 0, staff: 2, sign: 'TAB', line: 5, octave_change: 0 }],
    ...overrides,
  })
}

function standardTabProfile() {
  return { schema: 'gtab10c-derived-tab-profile-v1', parts: [{ partId: 'P-GUITAR', staffCounts: [{ measureIndex: 0, beforeEvents: true, values: ['2'] }], staffDetails: [{
    number: '2', measureIndex: 0, beforeEvents: true, staffLines: ['6'], capos: [],
    tunings: [['E', '2'], ['A', '2'], ['D', '3'], ['G', '3'], ['B', '3'], ['E', '4']].map(([step, octave], index) =>
      ({ line: String(index + 1), steps: [step], alters: [], octaves: [octave] })),
  }] }, { partId: 'P-FLUTE', staffCounts: [], staffDetails: [] }] }
}

function rawContext(number, payloadXml, order = 0) {
  return { measureIndex: 0, onsetDiv: 0, order, number, payloadXml }
}

function input(overrides = {}) {
  const sourceNotes = [
    note(),
    note({ source_id: 'n2', measure_index: 1, pitch_midi: 65, onset_div: 4 }),
  ]
  const postNotes = [
    note({ source_id: 'renamed-a', staff: 1 }),
    note({ source_id: 'renamed-b', measure_index: 1, pitch_midi: 65, onset_div: 4, staff: 1 }),
    note({ source_id: 'tab-a', staff: 2, voice: 5 }),
    note({ source_id: 'tab-b', measure_index: 1, pitch_midi: 65, onset_div: 4, staff: 2, voice: 5 }),
  ]
  const value = {
    fixtureId: 'f-sharp-natural-meter-change',
    sourceBytes,
    derivedBytes,
    expectedSesliTabCommit: '55512de2d9db5bbf97949b32a3be3438d9c51d5f',
    oracleEvidence: { derivedTabProfile: standardTabProfile(), sourceStaffProfile: { schema: 'gtab10c-source-staff-profile-v1', parts: [{ partId: 'P-FLUTE', staffCounts: [], staffDetails: [] }, { partId: 'P-GUITAR', staffCounts: [], staffDetails: [] }] }, sourceRestInventory: { schema: 'gtab10c-rest-inventory-v1', rows: [] }, derivedRestInventory: { schema: 'gtab10c-rest-inventory-v1', rows: [] }, partituraVersion: GTAB10C_PINNED_PARTITURA_VERSION, timeSignatureCoverage: { schema: 'gtab10c-time-staff-coverage-v1', source: [{ partId: 'P-GUITAR', staffSpecific: false, rawTimeContexts: [rawContext(null, '<time><beats>4</beats><beat-type>4</beat-type></time>')] }], derived: [{ partId: 'P-GUITAR', staffSpecific: false, rawTimeContexts: [rawContext(null, '<time><beats>4</beats><beat-type>4</beat-type></time>')] }] }, schema: 'gtab-10c-semantic-oracle-output-v1', keySignatureCoverage: { schema: 'gtab10c-key-staff-coverage-v1', source: [{ partId: 'P-GUITAR', staffSpecific: false, rawKeyContexts: [rawContext(null, '<key><fifths>0</fifths></key>')] }], derived: [{ partId: 'P-GUITAR', staffSpecific: false, rawKeyContexts: [rawContext(null, '<key><fifths>0</fifths></key>')] }] }, sourceSha256: sha256(sourceBytes), derivedSha256: sha256(derivedBytes), sourceParts: [{ partId: 'P-FLUTE', measureCount: 2 }, { partId: 'P-GUITAR', measureCount: 2 }], derivedParts: [{ partId: 'P-FLUTE', measureCount: 2 }, { partId: 'P-GUITAR', measureCount: 2 }] },
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
      { measure_index: 0, pitch_midi: 66, onset_div: 0, duration_div: 4, voice: 5, string: 1, fret: 2 },
      { measure_index: 1, pitch_midi: 65, onset_div: 4, duration_div: 4, voice: 5, string: 1, fret: 1 },
    ],
    ...overrides,
  }
  bindOracleFields(value)
  return value
}

function bindOracleFields(value) {
  for (const field of ['sourceSnapshot', 'derivedSnapshot', 'tabPositions']) value.oracleEvidence[field] = value[field]
}

// Semantic mutation tests represent one internally bound, but semantically wrong artifact.
function qualifyBoundArtifact(value) {
  bindOracleFields(value)
  return qualifyGtab10cSemanticParity(value)
}

test('GTAB-10C passes immutable source parity, meter change, F sharp/natural, and TAB position mapping', () => {
  const report = qualifyBoundArtifact(input())

  assert.equal(report.status, 'PASS')
  assert.deepEqual(report.diagnostics, [])
  assert.equal(report.provenance.fixtureId, 'f-sharp-natural-meter-change')
  assert.equal(report.provenance.sourceSha256, sha256(sourceBytes))
  assert.equal(report.provenance.derivedSha256, sha256(derivedBytes))
  assert.deepEqual(report.unverifiedContexts, [])
})

test('GTAB-10C rejects a notation and TAB cross-staff voice collision', () => {
  const value = input()
  for (const entry of value.derivedSnapshot.notes.filter((candidate) => candidate.staff === 2)) {
    entry.voice = 3
  }
  for (const position of value.tabPositions) position.voice = 3
  const report = qualifyBoundArtifact(value)

  assert.equal(report.status, 'DIAGNOSTIC')
  assert.ok(report.diagnostics.some((item) => item.code === 'TAB_VOICE_NAMESPACE_COLLISION'))
})

test('GTAB-10C rejects a disjoint TAB voice outside the renderer second-staff range', () => {
  const value = input()
  for (const entry of value.derivedSnapshot.notes.filter((candidate) => candidate.staff === 2)) {
    entry.voice = 4
  }
  for (const position of value.tabPositions) position.voice = 4
  const report = qualifyBoundArtifact(value)

  assert.equal(report.status, 'DIAGNOSTIC')
  assert.ok(report.diagnostics.some((item) => item.code === 'TAB_VOICE_STAFF_RANGE_INVALID'))
})

test('GTAB-10C rejects a safe but noncanonical Editor voice remap', () => {
  const value = input()
  for (const entry of value.derivedSnapshot.notes.filter((candidate) => candidate.staff === 2)) {
    entry.voice = 6
  }
  for (const position of value.tabPositions) position.voice = 6
  const report = qualifyBoundArtifact(value)

  assert.equal(report.status, 'DIAGNOSTIC')
  assert.ok(report.diagnostics.some((item) => item.code === 'TAB_EVENT_MISMATCH'))
})

test('GTAB-10C rejects stale source bytes before semantic comparison', () => {
  const report = qualifyBoundArtifact(input({ sourceBytes: '<score-partwise>changed</score-partwise>' }))
  assert.equal(report.status, 'UNSUPPORTED')
  assert.equal(report.diagnostics[0].code, 'SOURCE_PROVENANCE_MISMATCH')
})

test('GTAB-10C rejects a target tuple that differs from the bound GTAB-10B selection', () => {
  const report = qualifyBoundArtifact(input({
    targetSelection: { ...targetSelection, voice: 2 },
  }))
  assert.equal(report.status, 'UNSUPPORTED')
  assert.equal(report.diagnostics[0].code, 'TARGET_SELECTION_MISMATCH')
})

test('GTAB-10C rejects unsupported semantic oracle diagnostics instead of passing', () => {
  const value = input()
  value.sourceSnapshot.diagnostics = [{ code: 'UNSUPPORTED_STRUCTURE', severity: 'ERROR' }]
  const report = qualifyBoundArtifact(value)
  assert.equal(report.status, 'UNSUPPORTED')
  assert.equal(report.diagnostics[0].code, 'SEMANTIC_ORACLE_UNSUPPORTED')
})

test('GTAB-10C allows source-ID-only warnings when the required semantic fields are still available', () => {
  const value = input()
  value.sourceSnapshot.diagnostics = [{ code: 'MISSING_SOURCE_ID', severity: 'WARNING' }]
  value.derivedSnapshot.diagnostics = [{ code: 'MISSING_SOURCE_ID', severity: 'WARNING' }]
  assert.equal(qualifyBoundArtifact(value).status, 'PASS')
})

test('GTAB-10C reports a specific pitch mutation and never passes', () => {
  const value = input()
  value.derivedSnapshot.notes[0].pitch_midi = 67
  const report = qualifyBoundArtifact(value)
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
    const report = qualifyBoundArtifact(value)
    assert.notEqual(report.status, 'PASS', `${code} must fail closed`)
    assert.ok(report.diagnostics.some((item) => item.code === code), `${code} should be reported`)
  }
})

test('GTAB-10C detects dropped key signature and clef context instead of silently claiming parity', () => {
  const keyValue = input()
  keyValue.derivedSnapshot.key_signatures = []
  const keyReport = qualifyBoundArtifact(keyValue)
  assert.equal(keyReport.status, 'DIAGNOSTIC')
  assert.ok(keyReport.diagnostics.some((item) => item.code === 'KEY_SIGNATURE_MISMATCH'))

  const clefValue = input()
  clefValue.derivedSnapshot.clefs[0].sign = 'F'
  const clefReport = qualifyBoundArtifact(clefValue)
  assert.equal(clefReport.status, 'DIAGNOSTIC')
  assert.ok(clefReport.diagnostics.some((item) => item.code === 'CLEF_MISMATCH'))
})

test('GTAB-10C rejects notation events absent from the selected source staff', () => {
  const value = input()
  value.derivedSnapshot.notes.push(note({ source_id: 'leaked', part_id: 'P-GUITAR', staff: 1, voice: 2 }))
  const report = qualifyBoundArtifact(value)
  assert.equal(report.status, 'DIAGNOSTIC')
  assert.ok(report.diagnostics.some((item) => item.code === 'NOTE_EXTRA'))
})

test('GTAB-10C classifies missing notation events and measure-count changes', () => {
  const missing = input()
  missing.derivedSnapshot.notes = missing.derivedSnapshot.notes.filter((entry) => entry.staff !== 1 || entry.measure_index !== 1)
  const missingReport = qualifyBoundArtifact(missing)
  assert.ok(missingReport.diagnostics.some((item) => item.code === 'NOTE_MISSING'))

  const changedMeasureCount = input()
  changedMeasureCount.derivedSnapshot.measure_count = 3
  const measureReport = qualifyBoundArtifact(changedMeasureCount)
  assert.ok(measureReport.diagnostics.some((item) => item.code === 'MEASURE_COUNT_MISMATCH'))
})

test('GTAB-10C rejects duplicate structural events as ambiguous', () => {
  const value = input()
  value.sourceSnapshot.notes.push({ ...value.sourceSnapshot.notes[0], source_id: 'duplicate' })
  value.derivedSnapshot.notes.push({ ...value.derivedSnapshot.notes[0], source_id: 'duplicate-output' })
  value.derivedSnapshot.notes.push({ ...value.derivedSnapshot.notes[2], source_id: 'duplicate-tab' })
  const report = qualifyBoundArtifact(value)
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
    const report = qualifyBoundArtifact(value)
    assert.equal(report.status, 'DIAGNOSTIC')
    assert.ok(report.diagnostics.some((item) => item.code === 'TAB_POSITION_PITCH_MISMATCH'))
  }
})

test('GTAB-10C rejects malformed snapshots and provenance pins', () => {
  const badSchema = input()
  badSchema.sourceSnapshot.schema_version = 'future-schema'
  assert.equal(qualifyBoundArtifact(badSchema).status, 'UNSUPPORTED')

  const badPin = input()
  badPin.provenance.partituraVersion = '2.0.0'
  assert.equal(qualifyBoundArtifact(badPin).status, 'UNSUPPORTED')
})

test('GTAB-10C oracle pin matches the exact editor runtime revision used by SesliTab', () => {
  assert.equal(GTAB10C_PINNED_EDITOR_COMMIT, GUITAR_TAB_EDITOR_REVISION)
})

test('GTAB-10C unexpected derived staff returns controlled rejection, never TDZ throw', () => {
  const value = input()
  value.derivedSnapshot.notes[0].staff = 3
  assert.notEqual(qualifyBoundArtifact(value).status, 'PASS')
})

test('GTAB-10C missing or invalid context cannot claim complete oracle PASS', () => {
  for (const field of ['key_signatures', 'clefs']) {
    for (const invalid of [undefined, null, [{ part_id: 'P-GUITAR', onset_div: 0 }]]) {
      const value = input()
      value.sourceSnapshot[field] = invalid
      assert.equal(qualifyBoundArtifact(value).status, 'UNSUPPORTED')
    }
  }
})

test('GTAB-10C rejects a dangling tie even when its presence bits match on every staff', () => {
  const value = input()
  value.sourceSnapshot.notes[0].tie_next = 'dangling-source'
  value.derivedSnapshot.notes[0].tie_next = 'dangling-output'
  value.derivedSnapshot.notes[2].tie_next = 'dangling-tab'
  value.tabPositions[0].tie_next = 'dangling-tab'
  assert.notEqual(qualifyBoundArtifact(value).status, 'PASS')
})

test('GTAB-10C distinguishes valid absent keys from missing schema coverage', () => {
  const value = input()
  value.sourceSnapshot.key_signatures = []
  value.derivedSnapshot.key_signatures = []
  assert.equal(qualifyBoundArtifact(value).status, 'PASS')
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
    assert.notEqual(qualifyBoundArtifact(value).status, 'PASS')
  }
})

test('GTAB-10C compares selected part measure count rather than another part maximum', () => {
  const value = input()
  value.sourceSnapshot.measure_count = 5
  value.derivedSnapshot.measure_count = 5
  value.oracleEvidence.sourceParts[0].measureCount = 5
  value.oracleEvidence.derivedParts[0].measureCount = 5
  assert.equal(qualifyBoundArtifact(value).status, 'PASS')
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
  assert.equal(qualifyBoundArtifact(make()).status, 'PASS')
  for (const mutate of [
    value => { value.derivedSnapshot.notes[1].tie_prev = null },
    value => { value.derivedSnapshot.notes[0].tie_next = 'tab-b' },
    value => { value.derivedSnapshot.notes[0].tie_next = 'renamed-a' },
    value => { value.derivedSnapshot.notes[0].tie_next = null; value.derivedSnapshot.notes[1].tie_prev = null },
  ]) {
    const value = make()
    mutate(value)
    assert.notEqual(qualifyBoundArtifact(value).status, 'PASS')
  }
})

test('GTAB-10C cannot qualify staff-scoped keys when pinned snapshot loses their staff identity', () => {
  for (const exportedKeys of [[0, 3], [0], [3]]) {
    const value = input()
    value.oracleEvidence.keySignatureCoverage = { schema: 'gtab10c-key-staff-coverage-v1',
      source: [{ partId: 'P-GUITAR', staffSpecific: true, rawKeyContexts: [rawContext('1', '<key number="1"/>'), rawContext('2', '<key number="2"/>', 1)] }], derived: [{ partId: 'P-GUITAR', staffSpecific: false, rawKeyContexts: [rawContext(null, '<key/>')] }] }
    value.sourceSnapshot.key_signatures.push({ part_id: 'P-GUITAR', onset_div: 0, fifths: 3, mode: 'major' })
    value.derivedSnapshot.key_signatures = exportedKeys.map(fifths => ({ part_id: 'P-GUITAR', onset_div: 0, fifths, mode: 'major' }))
    const report = qualifyBoundArtifact(value)
    assert.equal(report.status, 'UNSUPPORTED')
    assert.equal(report.diagnostics[0].cause, 'KEY_SIGNATURE_STAFF_CONTEXT')
  }
})

test('GTAB-10C rejects absent or inconsistent raw key scope binding', () => {
  for (const mutate of [
    value => { delete value.oracleEvidence.keySignatureCoverage },
    value => { delete value.oracleEvidence.keySignatureCoverage.source[0].rawKeyContexts },
    value => { value.oracleEvidence.keySignatureCoverage.source[0].rawKeyContexts[0].number = '2' },
    value => { value.oracleEvidence.keySignatureCoverage.derived[0].partId = 'foreign' },
    value => { value.oracleEvidence.keySignatureCoverage.source.push({ ...value.oracleEvidence.keySignatureCoverage.source[0] }) },
  ]) {
    const value = input()
    mutate(value)
    const report = qualifyBoundArtifact(value)
    assert.equal(report.status, 'UNSUPPORTED')
    assert.equal(report.diagnostics[0].cause, 'KEY_SIGNATURE_STAFF_CONTEXT')
  }
})

test('GTAB-10C rejects key scope drift in an unselected part', () => {
  const value = input()
  value.oracleEvidence.keySignatureCoverage.source.push({ partId: 'P-FLUTE', rawKeyContexts: [rawContext('2', '<key number="2"/>')], staffSpecific: true })
  const report = qualifyBoundArtifact(value)
  assert.equal(report.status, 'DIAGNOSTIC')
  assert.ok(report.diagnostics.some((entry) => entry.code === 'FULL_SCORE_KEY_SCOPE_MISMATCH'))
})

test('GTAB-10C binds key payloads to their staff scope', () => {
  const value = input()
  const contexts = [rawContext('1', '<key number="1"><fifths>3</fifths></key>'),
    rawContext('2', '<key number="2"><fifths>0</fifths></key>', 1)]
  value.oracleEvidence.keySignatureCoverage.source[0] = { partId: 'P-GUITAR', staffSpecific: true, rawKeyContexts: contexts }
  value.oracleEvidence.keySignatureCoverage.derived[0] = { partId: 'P-GUITAR', staffSpecific: true,
    rawKeyContexts: [{ ...contexts[0], number: '2' }, { ...contexts[1], number: '1' }] }
  assert.notEqual(qualifyBoundArtifact(value).status, 'PASS')
})


test('GTAB-10C rejects staff-scoped meters rather than accepting leaked context', () => {
  for (const exportedMeters of [[4, 3], [4], [3]]) {
    const value = input()
    value.oracleEvidence.timeSignatureCoverage = { schema: 'gtab10c-time-staff-coverage-v1', source: [{ partId: 'P-GUITAR', staffSpecific: true, rawTimeContexts: [rawContext('1', '<time number="1"/>'), rawContext('2', '<time number="2"/>', 1)] }], derived: [{ partId: 'P-GUITAR', staffSpecific: false, rawTimeContexts: [rawContext(null, '<time/>')] }] }
    value.sourceSnapshot.time_signatures = [4, 3].map(beats => ({ part_id: 'P-GUITAR', onset_div: 0, beats, beat_type: 4 }))
    value.derivedSnapshot.time_signatures = exportedMeters.map(beats => ({ part_id: 'P-GUITAR', onset_div: 0, beats, beat_type: 4 }))
    const report = qualifyBoundArtifact(value)
    assert.equal(report.status, 'UNSUPPORTED')
    assert.equal(report.diagnostics[0].cause, 'TIME_SIGNATURE_STAFF_CONTEXT')
  }
})


test('GTAB-10C rejects missing or inconsistent time scope evidence', () => {
  for (const mutate of [
    v => { delete v.oracleEvidence.timeSignatureCoverage },
    v => { v.oracleEvidence.timeSignatureCoverage.schema = 'foreign' },
    v => { v.oracleEvidence.timeSignatureCoverage.derived[0].rawTimeContexts[0].number = '1'; v.oracleEvidence.timeSignatureCoverage.derived[0].staffSpecific = true },
    v => { delete v.oracleEvidence.timeSignatureCoverage.source[0].rawTimeContexts },
    v => { v.oracleEvidence.timeSignatureCoverage.source[0].rawTimeContexts[0].number = '2' },
    v => { v.oracleEvidence.timeSignatureCoverage.derived[0].partId = 'foreign' },
    v => { v.oracleEvidence.timeSignatureCoverage.source.push({ ...v.oracleEvidence.timeSignatureCoverage.source[0] }) },
  ]) {
    const value = input()
    mutate(value)
    const report = qualifyBoundArtifact(value)
    assert.equal(report.status, 'UNSUPPORTED')
    assert.equal(report.diagnostics[0].cause, 'TIME_SIGNATURE_STAFF_CONTEXT')
  }
  const value = input()
  value.oracleEvidence.timeSignatureCoverage.source.push({ partId: 'P-FLUTE', rawTimeContexts: [rawContext('2', '<time number="2"/>')], staffSpecific: true })
  const report = qualifyBoundArtifact(value)
  assert.equal(report.status, 'DIAGNOSTIC')
  assert.ok(report.diagnostics.some((entry) => entry.code === 'FULL_SCORE_METER_SCOPE_MISMATCH'))
})

test('GTAB-10C binds meter payloads to their staff scope', () => {
  const value = input()
  const contexts = [rawContext('1', '<time number="1"><beats>3</beats></time>'),
    rawContext('2', '<time number="2"><beats>4</beats></time>', 1)]
  value.oracleEvidence.timeSignatureCoverage.source[0] = { partId: 'P-GUITAR', staffSpecific: true, rawTimeContexts: contexts }
  value.oracleEvidence.timeSignatureCoverage.derived[0] = { partId: 'P-GUITAR', staffSpecific: true,
    rawTimeContexts: [{ ...contexts[0], number: '2' }, { ...contexts[1], number: '1' }] }
  assert.notEqual(qualifyBoundArtifact(value).status, 'PASS')
})


test('GTAB-10C rejects mixed or missing oracle snapshot and TAB envelope fields', () => {
  for (const field of ['sourceSnapshot', 'derivedSnapshot', 'tabPositions']) {
    for (const missing of [false, true]) {
      const value = input()
      value.oracleEvidence[field] = structuredClone(value[field])
      if (missing) delete value.oracleEvidence[field]
      else if (field === 'tabPositions') value.oracleEvidence[field][0].fret = 0
      else value.oracleEvidence[field].notes[0].pitch_midi = 64
      const report = qualifyGtab10cSemanticParity(value)
      assert.equal(report.status, 'UNSUPPORTED', field)
      assert.equal(report.diagnostics[0].cause, 'ORACLE_FIELDS', field)
    }
  }
})


test('GTAB-10C envelope equality is structural, independent of JSON property order', () => {
  const value = input()
  for (const field of ['sourceSnapshot', 'derivedSnapshot', 'tabPositions']) {
    value.oracleEvidence[field] = structuredClone(value[field])
  }
  value.oracleEvidence.sourceSnapshot = Object.fromEntries(Object.entries(value.oracleEvidence.sourceSnapshot).reverse())
  assert.equal(qualifyGtab10cSemanticParity(value).status, 'PASS')
  value.oracleEvidence.sourceSnapshot.circular = value.oracleEvidence.sourceSnapshot
  assert.equal(qualifyGtab10cSemanticParity(value).diagnostics[0].cause, 'ORACLE_FIELDS')
})


test('GTAB-10C rejects stale or missing actual envelope Partitura version', () => {
  for (const version of [undefined, '1.8.0']) {
    const value = input()
    if (version === undefined) delete value.oracleEvidence.partituraVersion
    else value.oracleEvidence.partituraVersion = version
    const result = qualifyGtab10cSemanticParity(value)
    assert.equal(result.status, 'UNSUPPORTED')
    assert.equal(result.diagnostics[0].cause, 'ORACLE_VERSION')
  }
})


test('GTAB-10C requires authoritative standard TAB clef and raw staff profile', () => {
  for (const mutate of [
    v => { v.derivedSnapshot.clefs = v.derivedSnapshot.clefs.filter(c => c.staff !== 2) },
    v => { v.derivedSnapshot.clefs[1].sign = 'G' },
    v => { v.derivedSnapshot.clefs[1].line = 2 },
    v => { v.derivedSnapshot.clefs[1].octave_change = 1 },
    v => { v.derivedSnapshot.clefs[1].onset_div = 4 },
    v => { v.derivedSnapshot.clefs.push({ ...v.derivedSnapshot.clefs[1], onset_div: 4, sign: 'G' }) },
    v => { delete v.oracleEvidence.derivedTabProfile },
    v => { v.oracleEvidence.derivedTabProfile.parts[0].partId = 'foreign' },
    v => { v.oracleEvidence.derivedTabProfile.parts[0].staffDetails = [] },
    v => { v.oracleEvidence.derivedTabProfile.parts[0].staffCounts = [] },
    v => { v.oracleEvidence.derivedTabProfile.parts[0].staffCounts[0].values = ['3'] },
    v => { v.oracleEvidence.derivedTabProfile.parts[0].staffCounts[0].values = ['2', '2'] },
    v => { v.oracleEvidence.derivedTabProfile.parts[0].staffDetails[0].staffLines = ['5'] },
    v => { v.oracleEvidence.derivedTabProfile.parts[0].staffDetails[0].capos = ['2'] },
    v => { v.oracleEvidence.derivedTabProfile.parts[0].staffDetails[0].capos = ['0', '2'] },
    v => { v.oracleEvidence.derivedTabProfile.parts[0].staffDetails[0].tunings.pop() },
    v => { v.oracleEvidence.derivedTabProfile.parts[0].staffDetails[0].tunings[0].steps = ['F'] },
    v => { v.oracleEvidence.derivedTabProfile.parts[0].staffDetails[0].number = null },
    v => { v.oracleEvidence.derivedTabProfile.parts[0].staffDetails[0].beforeEvents = false },
    v => { v.oracleEvidence.derivedTabProfile.parts[0].staffDetails[0].measureIndex = 1 },
    v => { v.oracleEvidence.derivedTabProfile.parts[0].staffDetails.push({ ...v.oracleEvidence.derivedTabProfile.parts[0].staffDetails[0], staffLines: ['5'], measureIndex: 1 }) },
  ]) {
    const value = input()
    mutate(value)
    const report = qualifyBoundArtifact(value)
    assert.equal(report.status, 'DIAGNOSTIC')
    assert.ok(report.diagnostics.some(row => ['TAB_CLEF_MISMATCH', 'TAB_PROFILE_MISMATCH'].includes(row.code)))
  }
})


test('GTAB-10C accepts explicit zero capo and zero tuning alters without changing guitar intent', () => {
  const value = input()
  const row = value.oracleEvidence.derivedTabProfile.parts[0].staffDetails[0]
  row.capos = ['0']
  for (const tuning of row.tunings) tuning.alters = ['0']
  assert.equal(qualifyBoundArtifact(value).status, 'PASS')
})

test('GTAB-10C derives TAB staff after a declared empty source staff', () => {
  const value = input()
  const sourcePart = value.oracleEvidence.sourceStaffProfile.parts.find((part) => part.partId === 'P-GUITAR')
  sourcePart.staffCounts = [{ measureIndex: 0, beforeEvents: true, values: ['2'] }]
  for (const entry of value.derivedSnapshot.notes) if (entry.staff === 2) entry.staff = 3
  value.derivedSnapshot.clefs.find((entry) => entry.sign === 'TAB').staff = 3
  for (const position of value.tabPositions) position.staff = 3
  const tabPart = value.oracleEvidence.derivedTabProfile.parts.find((part) => part.partId === 'P-GUITAR')
  tabPart.staffCounts[0].values = ['3']
  tabPart.staffDetails[0].number = '3'
  assert.equal(qualifyBoundArtifact(value).status, 'PASS')
})

test('GTAB-10C rejects semantic loss outside the selected part and staff', () => {
  for (const extra of [
    note({ source_id: 'flute-note', part_id: 'P-FLUTE', staff: 1, voice: 1, pitch_midi: 72 }),
    note({ source_id: 'other-staff', part_id: 'P-GUITAR', staff: 2, voice: 1, pitch_midi: 55 }),
  ]) {
    const value = input()
    value.sourceSnapshot.notes.push(extra)
    value.derivedSnapshot.notes.push({ ...extra })
    if (extra.part_id === 'P-GUITAR') {
      const sourcePart = value.oracleEvidence.sourceStaffProfile.parts.find((part) => part.partId === 'P-GUITAR')
      sourcePart.staffCounts = [{ measureIndex: 0, beforeEvents: true, values: ['2'] }]
      for (const entry of value.derivedSnapshot.notes) if (entry.staff === 2 && entry.source_id.startsWith('tab-')) entry.staff = 3
      value.derivedSnapshot.clefs.find((entry) => entry.sign === 'TAB').staff = 3
      const tabPart = value.oracleEvidence.derivedTabProfile.parts.find((part) => part.partId === 'P-GUITAR')
      tabPart.staffCounts[0].values = ['3']
      tabPart.staffDetails[0].number = '3'
    }
    value.derivedSnapshot.notes = value.derivedSnapshot.notes.filter((entry) => entry.source_id !== extra.source_id)
    const report = qualifyBoundArtifact(value)
    assert.equal(report.status, 'DIAGNOSTIC')
    assert.ok(report.diagnostics.some((entry) => entry.code === 'FULL_SCORE_NOTE_MISMATCH'))
  }
})

test('GTAB-10C rejects rest loss outside the selected part and staff', () => {
  const value = input()
  value.oracleEvidence.sourceRestInventory.rows.push({
    partId: 'P-FLUTE', measureIndex: 0, restIndex: 0, onsetDiv: 0,
    noteXml: '<note><rest /><duration>4</duration><voice>1</voice><staff>1</staff></note>',
  })
  const report = qualifyBoundArtifact(value)
  assert.equal(report.status, 'DIAGNOSTIC')
  assert.ok(report.diagnostics.some((entry) => entry.code === 'FULL_SCORE_REST_MISMATCH'))
})

test('GTAB-10C binds rest notation and timeline semantics', () => {
  for (const mutate of [
    row => { row.noteXml = row.noteXml.replace('<dot />', '') },
    row => { row.noteXml = row.noteXml.replace('<type>quarter</type>', '<type>eighth</type>') },
    row => { row.onsetDiv = 2 },
  ]) {
    const value = input()
    const row = { partId: 'P-FLUTE', measureIndex: 0, restIndex: 0, onsetDiv: 0,
      noteXml: '<note><rest /><duration>4</duration><voice>1</voice><type>quarter</type><dot /><staff>1</staff></note>' }
    value.oracleEvidence.sourceRestInventory.rows.push({ ...row })
    value.oracleEvidence.derivedRestInventory.rows.push({ ...row })
    mutate(value.oracleEvidence.derivedRestInventory.rows[0])
    const report = qualifyBoundArtifact(value)
    assert.ok(report.diagnostics.some((entry) => entry.code === 'FULL_SCORE_REST_MISMATCH'))
  }
})
