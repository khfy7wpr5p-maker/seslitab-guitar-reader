import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

export const GTAB10C_REPORT_SCHEMA = 'gtab-10c-semantic-parity-report-v1'
export const GTAB10C_REFERENCE_BUNDLE_SCHEMA = 'gtab-10c-semantic-reference-bundle-v1'
export const GTAB10C_PINNED_SEMANTIC_ENGINE_COMMIT = 'ef305f45ff90d940ac6c51a0c46c4fac006d7c5c'
export const GTAB10C_PINNED_SNAPSHOT_SCHEMA = 'st-semantic-snapshot-v1'
export const GTAB10C_PINNED_PARTITURA_VERSION = '1.9.0'
// This is the exact upstream revision used to build the editor runtime pinned by SesliTab.
export const GTAB10C_PINNED_EDITOR_COMMIT = '4eb479bc84b12c6deefb289d03c933ce9980bc9f'

const STANDARD_TUNING_MIDI = Object.freeze({ 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 })
const MAX_FRET = 20

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function bytes(value) {
  if (typeof value === 'string') return Buffer.from(value, 'utf8')
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  return null
}

function sha256(value) {
  const content = bytes(value)
  return content === null ? null : createHash('sha256').update(content).digest('hex')
}

function freezeReport(status, diagnostics, provenance, unverifiedContexts = []) {
  return Object.freeze({
    schema: GTAB10C_REPORT_SCHEMA,
    status,
    diagnostics: Object.freeze(diagnostics.map((item) => Object.freeze({ ...item }))),
    provenance: Object.freeze(provenance),
    unverifiedContexts: Object.freeze([...new Set(unverifiedContexts)].sort((left, right) => left.localeCompare(right, 'en'))),
  })
}

function rejected(status, code, details, provenance = {}, unverifiedContexts = []) {
  return freezeReport(status, [{ code, ...details }], provenance, unverifiedContexts)
}

function normalizeTargetSelection(value) {
  if (!isRecord(value) || Object.keys(value).length !== 4) return null
  const { partId, partIndex, staff, voice } = value
  if (typeof partId !== 'string' || partId.trim() === '' || partId !== partId.trim()
    || !Number.isSafeInteger(partIndex) || partIndex < 0
    || !Number.isSafeInteger(staff) || staff < 1
    || !Number.isSafeInteger(voice) || voice < 0) return null
  return Object.freeze({ partId, partIndex, staff, voice })
}

function semanticNote(note) {
  if (!isRecord(note)
    || typeof note.part_id !== 'string' || note.part_id.trim() === ''
    || !Number.isSafeInteger(note.measure_index) || note.measure_index < 0
    || !Number.isSafeInteger(note.pitch_midi) || note.pitch_midi < 0 || note.pitch_midi > 127
    || !Number.isSafeInteger(note.onset_div) || note.onset_div < 0
    || !Number.isSafeInteger(note.duration_div) || note.duration_div <= 0
    || !Number.isSafeInteger(note.voice) || note.voice < 0
    || !Number.isSafeInteger(note.staff) || note.staff < 1
    || (note.tie_prev !== null && typeof note.tie_prev !== 'string')
    || (note.tie_next !== null && typeof note.tie_next !== 'string')
    || typeof note.is_grace !== 'boolean') return null
  return note
}

function eventKey(note) {
  return [note.measure_index, note.onset_div, note.duration_div, note.voice, note.pitch_midi,
    note.tie_prev === null ? 0 : 1, note.tie_next === null ? 0 : 1].join(':')
}

function groupKey(note, omittedField) {
  const fields = ['measure_index', 'onset_div', 'duration_div', 'voice', 'pitch_midi', 'tie_prev', 'tie_next']
  return fields.filter((field) => field !== omittedField).map((field) => {
    const value = field === 'tie_prev' || field === 'tie_next' ? Number(note[field] !== null) : note[field]
    return `${field}=${value}`
  }).join('|')
}

function countBy(values, keyOf) {
  const counts = new Map()
  for (const value of values) {
    const key = keyOf(value)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function hasDuplicateEvents(notes) {
  const counts = countBy(notes, eventKey)
  return [...counts.values()].some((count) => count > 1)
}

function fieldMismatch(source, derived, field) {
  const sourceGroups = new Map()
  const derivedGroups = new Map()
  for (const note of source) {
    const key = groupKey(note, field)
    const group = sourceGroups.get(key) ?? []
    group.push(note[field])
    sourceGroups.set(key, group)
  }
  for (const note of derived) {
    const key = groupKey(note, field)
    const group = derivedGroups.get(key) ?? []
    group.push(note[field])
    derivedGroups.set(key, group)
  }
  for (const [key, sourceValues] of sourceGroups) {
    const derivedValues = derivedGroups.get(key)
    if (!derivedValues || derivedValues.length !== sourceValues.length) continue
    const normalize = (value) => field === 'tie_prev' || field === 'tie_next' ? value !== null : value
    const left = sourceValues.map(normalize).sort((left, right) => Number(left) - Number(right))
    const right = derivedValues.map(normalize).sort((left, right) => Number(left) - Number(right))
    if (left.some((value, index) => value !== right[index])) return true
  }
  return false
}

function validTieGraph(notes) {
  const byId = new Map()
  for (const note of notes) {
    if (note.source_id == null) {
      if (note.tie_prev !== null || note.tie_next !== null) return false
      continue
    }
    if (typeof note.source_id !== 'string' || !note.source_id || byId.has(note.source_id)) return false
    byId.set(note.source_id, note)
  }
  for (const note of notes) {
    for (const [field, reverse] of [['tie_next', 'tie_prev'], ['tie_prev', 'tie_next']]) {
      if (note[field] === null) continue
      const linked = byId.get(note[field])
      if (!linked || linked === note || linked[reverse] !== note.source_id ||
          linked.part_id !== note.part_id || linked.staff !== note.staff || linked.voice !== note.voice ||
          linked.pitch_midi !== note.pitch_midi) return false
      const first = field === 'tie_next' ? note : linked
      const second = field === 'tie_next' ? linked : note
      if (first.onset_div + first.duration_div !== second.onset_div) return false
    }
  }
  return true
}

function tieEdges(notes) {
  const byId = new Map(notes.map((note) => [note.source_id, note]))
  return notes.filter((note) => note.tie_next !== null).map((note) =>
    `${eventKey(note)}>${byId.has(note.tie_next) ? eventKey(byId.get(note.tie_next)) : 'UNRESOLVED'}`
  ).sort((left, right) => left.localeCompare(right, 'en'))
}

function contextRows(snapshot, field, partId, normalizeStaff = false, staffFilter = null) {
  const values = snapshot[field]
  if (!Array.isArray(values)) return null
  const result = []
  for (const value of values) {
    if (!isRecord(value) || typeof value.part_id !== 'string'
      || !Number.isSafeInteger(value.onset_div) || value.onset_div < 0) return null
    if (value.part_id !== partId) continue
    if (field === 'time_signatures') {
      if (!Number.isSafeInteger(value.beats) || value.beats <= 0
        || !Number.isSafeInteger(value.beat_type) || value.beat_type <= 0) return null
      result.push([value.onset_div, value.beats, value.beat_type])
    } else if (field === 'key_signatures') {
      if (!Number.isSafeInteger(value.fifths)
        || (value.mode !== null && typeof value.mode !== 'string')) return null
      result.push([value.onset_div, value.fifths, value.mode])
    } else {
      if (!Number.isSafeInteger(value.staff) || value.staff < 1
        || typeof value.sign !== 'string' || value.sign.trim() === ''
        || (value.line !== null && !Number.isSafeInteger(value.line))
        || !Number.isSafeInteger(value.octave_change)) return null
      if (staffFilter !== null && value.staff !== staffFilter) continue
      result.push([value.onset_div, normalizeStaff ? 1 : value.staff, value.sign, value.line, value.octave_change])
    }
  }
  return result.map((row) => JSON.stringify(row)).sort((left, right) => left.localeCompare(right, 'en'))
}

function hasGlobalContextCoverage(rows, partId, numberField) {
  if (!Array.isArray(rows)) return false
  const identities = new Set()
  for (const row of rows) {
    if (!isRecord(row) || typeof row.partId !== 'string' || !row.partId || identities.has(row.partId)
      || !Array.isArray(row[numberField])
      || !row[numberField].every(number => number === null || typeof number === 'string')
      || row.staffSpecific !== row[numberField].some(number => number !== null)) return false
    identities.add(row.partId)
  }
  return rows.some(row => row.partId === partId && row.staffSpecific === false)
}

function hasBoundOracleFields(input, evidence) {
  if (!isRecord(evidence.sourceSnapshot) || !isRecord(evidence.derivedSnapshot)
    || !Array.isArray(evidence.tabPositions)) return false
  try {
    return ['sourceSnapshot', 'derivedSnapshot', 'tabPositions'].every(field =>
      Object.hasOwn(evidence, field) && isDeepStrictEqual(input[field], evidence[field]))
  } catch {
    return false
  }
}

function hasStandardTabProfile(profile, partId) {
  if (profile?.schema !== 'gtab10c-derived-tab-profile-v1' || !Array.isArray(profile.parts)
    || profile.parts.length !== 1 || profile.parts[0]?.partId !== partId
    || !Array.isArray(profile.parts[0].staffDetails)) return false
  const counts = profile.parts[0].staffCounts
  if (!Array.isArray(counts) || counts.length === 0
    || counts[0]?.measureIndex !== 0 || counts.some(row => !isRecord(row)
      || !Number.isSafeInteger(row.measureIndex) || row.measureIndex < 0
      || row.beforeEvents !== true || !isDeepStrictEqual(row.values, ['2']))) return false
  const declarations = profile.parts[0].staffDetails
  if (declarations.some(row => !isRecord(row) || !['1', '2'].includes(row.number))) return false
  const tab = declarations.filter(row => row.number === '2')
  const tuning = [['E', '2'], ['A', '2'], ['D', '3'], ['G', '3'], ['B', '3'], ['E', '4']]
  return tab.length > 0 && tab[0].measureIndex === 0 && tab[0].beforeEvents === true
    && tab.every(row => Number.isSafeInteger(row.measureIndex) && row.measureIndex >= 0
      && row.beforeEvents === true && isDeepStrictEqual(row.staffLines, ['6'])
      && (isDeepStrictEqual(row.capos, []) || isDeepStrictEqual(row.capos, ['0']))
      && Array.isArray(row.tunings) && row.tunings.length === 6
      && row.tunings.every((entry, index) => isRecord(entry) && entry.line === String(index + 1)
        && isDeepStrictEqual(entry.steps, [tuning[index][0]])
        && isDeepStrictEqual(entry.octaves, [tuning[index][1]])
        && (isDeepStrictEqual(entry.alters, []) || isDeepStrictEqual(entry.alters, ['0']))))
}

function sameRows(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function baseProvenance(input, sourceHash, derivedHash, target) {
  return {
    fixtureId: typeof input.fixtureId === 'string' ? input.fixtureId : null,
    sourceSha256: sourceHash,
    derivedSha256: derivedHash,
    targetSelection: target,
    sesliTabCommit: input.provenance?.sesliTabCommit ?? null,
    editorCommit: input.provenance?.editorCommit ?? null,
    semanticEngineCommit: input.provenance?.semanticEngineCommit ?? null,
    referenceBundleSchemaVersion: input.provenance?.referenceBundleSchemaVersion ?? null,
    snapshotSchemaVersion: input.provenance?.snapshotSchemaVersion ?? null,
    partituraVersion: input.provenance?.partituraVersion ?? null,
  }
}

export function qualifyGtab10cSemanticParity(input = {}) {
  const sourceHash = sha256(input.sourceBytes)
  const derivedHash = sha256(input.derivedBytes)
  const target = normalizeTargetSelection(input.targetSelection)
  const provenance = baseProvenance(input, sourceHash, derivedHash, target)

  if (typeof input.fixtureId !== 'string' || input.fixtureId.trim() === ''
    || sourceHash === null || derivedHash === null
    || !isRecord(input.provenance)) {
    return rejected('UNSUPPORTED', 'MALFORMED_REFERENCE_BUNDLE', {}, provenance)
  }
  if (!target) return rejected('UNSUPPORTED', 'TARGET_SELECTION_MISMATCH', {}, provenance)
  const suppliedTarget = normalizeTargetSelection(input.provenance.targetSelection)
  if (!suppliedTarget || Object.keys(target).some((key) => target[key] !== suppliedTarget[key])) {
    return rejected('UNSUPPORTED', 'TARGET_SELECTION_MISMATCH', {}, provenance)
  }
  if (input.provenance.sourceSha256 !== sourceHash || input.provenance.derivedSha256 !== derivedHash) {
    return rejected('UNSUPPORTED', 'SOURCE_PROVENANCE_MISMATCH', {}, provenance)
  }
  if (!/^[0-9a-f]{40}$/u.test(input.expectedSesliTabCommit ?? '') ||
      input.expectedSesliTabCommit !== input.provenance.sesliTabCommit) {
    return rejected('UNSUPPORTED', 'SOURCE_PROVENANCE_MISMATCH', { cause: 'CHECKOUT_COMMIT' }, provenance)
  }
  const evidence = input.oracleEvidence
  if (!isRecord(evidence) || evidence.schema !== 'gtab-10c-semantic-oracle-output-v1' ||
      evidence.sourceSha256 !== sourceHash || evidence.derivedSha256 !== derivedHash ||
      !Array.isArray(evidence.sourceParts) || !Array.isArray(evidence.derivedParts)) {
    return rejected('UNSUPPORTED', 'SOURCE_PROVENANCE_MISMATCH', { cause: 'ORACLE_BUNDLE' }, provenance)
  }
  if (evidence.partituraVersion !== GTAB10C_PINNED_PARTITURA_VERSION
    || evidence.partituraVersion !== input.provenance.partituraVersion) {
    return rejected('UNSUPPORTED', 'SOURCE_PROVENANCE_MISMATCH', { cause: 'ORACLE_VERSION' }, provenance)
  }
  if (!hasBoundOracleFields(input, evidence)) {
    return rejected('UNSUPPORTED', 'SOURCE_PROVENANCE_MISMATCH', { cause: 'ORACLE_FIELDS' }, provenance)
  }
  const validParts = (parts) => parts.length > 0 && new Set(parts.map((part) => part?.partId)).size === parts.length &&
    parts.every((part) => isRecord(part) && typeof part.partId === 'string' && part.partId.trim() &&
      Number.isSafeInteger(part.measureCount) && part.measureCount > 0)
  if (!validParts(evidence.sourceParts) || !validParts(evidence.derivedParts) ||
      evidence.sourceParts[target.partIndex]?.partId !== target.partId || evidence.derivedParts.length !== 1) {
    return rejected('UNSUPPORTED', 'TARGET_SELECTION_MISMATCH', { cause: 'PART_INVENTORY' }, provenance)
  }
  if (!/^[0-9a-f]{40}$/u.test(input.provenance.sesliTabCommit ?? '')
    || input.provenance.editorCommit !== GTAB10C_PINNED_EDITOR_COMMIT
    || input.provenance.semanticEngineCommit !== GTAB10C_PINNED_SEMANTIC_ENGINE_COMMIT
    || input.provenance.referenceBundleSchemaVersion !== GTAB10C_REFERENCE_BUNDLE_SCHEMA
    || input.provenance.snapshotSchemaVersion !== GTAB10C_PINNED_SNAPSHOT_SCHEMA
    || input.provenance.partituraVersion !== GTAB10C_PINNED_PARTITURA_VERSION) {
    return rejected('UNSUPPORTED', 'SEMANTIC_ORACLE_UNSUPPORTED', { cause: 'PIN_MISMATCH' }, provenance)
  }

  const source = input.sourceSnapshot
  const derived = input.derivedSnapshot
  if (!isRecord(source) || !isRecord(derived)
    || source.schema_version !== GTAB10C_PINNED_SNAPSHOT_SCHEMA
    || derived.schema_version !== GTAB10C_PINNED_SNAPSHOT_SCHEMA
    || source.source_kind !== 'musicxml' || derived.source_kind !== 'musicxml'
    || !Number.isSafeInteger(source.measure_count) || source.measure_count < 0
    || !Number.isSafeInteger(derived.measure_count) || derived.measure_count < 0
    || !Number.isSafeInteger(source.part_count) || source.part_count < 1
    || derived.part_count !== 1
    || !Array.isArray(source.notes) || !Array.isArray(derived.notes)
    || !Array.isArray(source.diagnostics) || !Array.isArray(derived.diagnostics)) {
    return rejected('UNSUPPORTED', 'SEMANTIC_ORACLE_UNSUPPORTED', { cause: 'SNAPSHOT_SCHEMA_OR_SHAPE' }, provenance)
  }
  const diagnostics = [...source.diagnostics, ...derived.diagnostics]
  const blockingDiagnostics = diagnostics.filter((diagnostic) => !isRecord(diagnostic)
    || diagnostic.code !== 'MISSING_SOURCE_ID'
    || diagnostic.severity !== 'WARNING')
  if (blockingDiagnostics.length > 0) {
    return rejected('UNSUPPORTED', 'SEMANTIC_ORACLE_UNSUPPORTED', { cause: 'SNAPSHOT_DIAGNOSTICS' }, provenance)
  }

  const sourceAll = source.notes.map(semanticNote)
  const derivedAll = derived.notes.map(semanticNote)
  if (sourceAll.includes(null) || derivedAll.includes(null)) {
    return rejected('UNSUPPORTED', 'SEMANTIC_ORACLE_UNSUPPORTED', { cause: 'MALFORMED_NOTE' }, provenance)
  }
  const sourceNotes = sourceAll.filter((note) => note.part_id === target.partId
    && note.staff === target.staff && note.voice === target.voice)
  const derivedPartIds = [...new Set(derivedAll.map((note) => note.part_id))]
  if (derivedPartIds.length !== 1) {
    return rejected('UNSUPPORTED', 'AMBIGUOUS_STRUCTURAL_MATCH', { cause: 'DERIVED_PART_IDENTITY' }, provenance)
  }
  const derivedPartId = derivedPartIds[0]
  const unverifiedContexts = []
  if (derivedAll.some((note) => note.staff !== 1 && note.staff !== 2)) {
    return rejected('DIAGNOSTIC', 'NOTE_EXTRA', { side: 'DERIVED_UNEXPECTED_STAFF' }, provenance, unverifiedContexts)
  }
  const notationNotes = derivedAll.filter((note) => note.part_id === derivedPartId && note.staff === 1)
  const tabNotes = derivedAll.filter((note) => note.part_id === derivedPartId && note.staff === 2)
  if (!Array.isArray(source.key_signatures) || !Array.isArray(derived.key_signatures)) unverifiedContexts.push('keySignatures')
  if (!Array.isArray(source.clefs) || !Array.isArray(derived.clefs)) unverifiedContexts.push('clefs')
  if (sourceNotes.length === 0) {
    return rejected('UNSUPPORTED', 'SEMANTIC_ORACLE_UNSUPPORTED', { cause: 'EMPTY_TARGET_PROJECTION' }, provenance, unverifiedContexts)
  }
  if (sourceNotes.some((note) => note.is_grace) || notationNotes.some((note) => note.is_grace)
    || tabNotes.some((note) => note.is_grace)) {
    return rejected('UNSUPPORTED', 'SEMANTIC_ORACLE_UNSUPPORTED', { cause: 'GRACE_NOTE' }, provenance, unverifiedContexts)
  }
  const selectedMeasureCount = evidence.sourceParts[target.partIndex].measureCount
  if (evidence.sourceParts.length !== source.part_count || evidence.derivedParts[0].partId !== derivedPartId) return rejected('UNSUPPORTED', 'TARGET_SELECTION_MISMATCH', { cause: 'SNAPSHOT_INVENTORY' }, provenance)
  if (selectedMeasureCount !== derived.measure_count || evidence.derivedParts[0].measureCount !== derived.measure_count) {
    return rejected('DIAGNOSTIC', 'MEASURE_COUNT_MISMATCH', {
      source: selectedMeasureCount, derived: derived.measure_count,
    }, provenance, unverifiedContexts)
  }

  const output = []
  if (hasDuplicateEvents(sourceNotes) || hasDuplicateEvents(notationNotes) || hasDuplicateEvents(tabNotes)) {
    output.push({ code: 'AMBIGUOUS_STRUCTURAL_MATCH' })
  }
  if (sourceNotes.length !== notationNotes.length) {
    output.push({ code: sourceNotes.length > notationNotes.length ? 'NOTE_MISSING' : 'NOTE_EXTRA' })
  } else if (sourceNotes.some((note) => !notationNotes.some((candidate) => eventKey(candidate) === eventKey(note)))) {
    const mismatchFields = [
      ['measure_index', 'MEASURE_MEMBERSHIP_MISMATCH'],
      ['onset_div', 'ONSET_MISMATCH'],
      ['duration_div', 'DURATION_MISMATCH'],
      ['voice', 'VOICE_MISMATCH'],
      ['pitch_midi', 'PITCH_MISMATCH'],
      ['tie_prev', 'TIE_MISMATCH'],
      ['tie_next', 'TIE_MISMATCH'],
    ]
    for (const [field, code] of mismatchFields) {
      if (fieldMismatch(sourceNotes, notationNotes, field)
        && !output.some((item) => item.code === code)) output.push({ code })
    }
    if (output.length === 0) output.push({ code: 'NOTE_MISSING' })
  }

  const timeCoverage = evidence.timeSignatureCoverage
  if (timeCoverage?.schema !== 'gtab10c-time-staff-coverage-v1'
    || !hasGlobalContextCoverage(timeCoverage.source, target.partId, 'rawTimeStaffNumbers')
    || !hasGlobalContextCoverage(timeCoverage.derived, derivedPartId, 'rawTimeStaffNumbers')) {
    return rejected('UNSUPPORTED', 'SEMANTIC_ORACLE_UNSUPPORTED',
      { cause: 'TIME_SIGNATURE_STAFF_CONTEXT' }, provenance, ['timeSignatures'])
  }
  const sourceMeters = contextRows(source, 'time_signatures', target.partId)
  const derivedMeters = contextRows(derived, 'time_signatures', derivedPartId)
  if (sourceMeters === null || derivedMeters === null) {
    return rejected('UNSUPPORTED', 'SEMANTIC_ORACLE_UNSUPPORTED', { cause: 'TIME_SIGNATURE_CONTEXT' }, provenance, unverifiedContexts)
  }
  if (!sameRows(sourceMeters, derivedMeters)) output.push({ code: 'METER_MISMATCH' })

  // st-semantic-snapshot-v1 drops MusicXML key/@number. Raw hash-bound XML
  // coverage can establish global context, but cannot recover scoped oracle rows.
  const keyCoverage = evidence.keySignatureCoverage
  if (keyCoverage?.schema !== 'gtab10c-key-staff-coverage-v1'
    || !hasGlobalContextCoverage(keyCoverage.source, target.partId, 'rawKeyStaffNumbers')
    || !hasGlobalContextCoverage(keyCoverage.derived, derivedPartId, 'rawKeyStaffNumbers')) {
    return rejected('UNSUPPORTED', 'SEMANTIC_ORACLE_UNSUPPORTED',
      { cause: 'KEY_SIGNATURE_STAFF_CONTEXT' }, provenance, ['keySignatures'])
  }
  if (!unverifiedContexts.includes('keySignatures')) {
    const sourceKeys = contextRows(source, 'key_signatures', target.partId)
    const derivedKeys = contextRows(derived, 'key_signatures', derivedPartId)
    if (sourceKeys === null || derivedKeys === null) unverifiedContexts.push('keySignatures')
    else if (!sameRows(sourceKeys, derivedKeys)) output.push({ code: 'KEY_SIGNATURE_MISMATCH' })
  }
  if (!unverifiedContexts.includes('clefs')) {
    const sourceClefs = contextRows(source, 'clefs', target.partId, true, target.staff)
    const derivedClefs = contextRows(derived, 'clefs', derivedPartId, false, 1)
    if (sourceClefs === null || derivedClefs === null) unverifiedContexts.push('clefs')
    else if (!sameRows(sourceClefs, derivedClefs)) output.push({ code: 'CLEF_MISMATCH' })
  }

  const tabClefs = Array.isArray(derived.clefs)
    ? derived.clefs.filter(row => isRecord(row) && row.part_id === derivedPartId && row.staff === 2) : []
  if (tabClefs.length === 0 || !tabClefs.some(row => row.onset_div === 0)
    || tabClefs.some(row => row.sign !== 'TAB' || row.line !== 5 || row.octave_change !== 0)) {
    output.push({ code: 'TAB_CLEF_MISMATCH' })
  }
  if (!hasStandardTabProfile(evidence.derivedTabProfile, derivedPartId)) {
    output.push({ code: 'TAB_PROFILE_MISMATCH' })
  }

  if (tabNotes.length !== notationNotes.length) {
    output.push({ code: tabNotes.length < notationNotes.length ? 'NOTE_MISSING' : 'NOTE_EXTRA', side: 'TAB' })
  } else if (notationNotes.some((note) => !tabNotes.some((candidate) => eventKey(candidate) === eventKey(note)))) {
    output.push({ code: 'TAB_EVENT_MISMATCH' })
  }
  const positions = input.tabPositions
  if (!Array.isArray(positions) || positions.length !== tabNotes.length) {
    output.push({ code: 'TAB_POSITION_PITCH_MISMATCH', cause: 'POSITION_COUNT' })
  } else {
    const actualKeys = countBy(positions, (position) => {
      if (!isRecord(position)) return 'INVALID'
      return [position.measure_index, position.onset_div, position.duration_div, position.voice, position.pitch_midi].join(':')
        + `:${Number(position.tie_prev != null)}:${Number(position.tie_next != null)}`
    })
    const tabKeys = countBy(tabNotes, (note) => eventKey(note))
    let invalidPosition = false
    for (const position of positions) {
      const openMidi = STANDARD_TUNING_MIDI[position?.string]
      if (!Number.isInteger(position?.string) || openMidi === undefined
        || !Number.isSafeInteger(position?.fret) || position.fret < 0 || position.fret > MAX_FRET
        || openMidi + position.fret !== position?.pitch_midi) invalidPosition = true
    }
    if (invalidPosition || actualKeys.size !== tabKeys.size
      || [...tabKeys].some(([key, count]) => actualKeys.get(key) !== count)) {
      output.push({ code: 'TAB_POSITION_PITCH_MISMATCH' })
    }
  }

  if (unverifiedContexts.length) return rejected('UNSUPPORTED', 'SEMANTIC_ORACLE_UNSUPPORTED', { cause: 'UNVERIFIED_CONTEXT' }, provenance, unverifiedContexts)
  if (!validTieGraph(sourceNotes) || !validTieGraph(notationNotes) || !validTieGraph(tabNotes) ||
      !sameRows(tieEdges(sourceNotes), tieEdges(notationNotes)) || !sameRows(tieEdges(notationNotes), tieEdges(tabNotes))) output.push({ code: 'TIE_MISMATCH' })
  return freezeReport(output.length === 0 ? 'PASS' : 'DIAGNOSTIC', output, provenance, unverifiedContexts)
}
