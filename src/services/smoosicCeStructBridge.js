import { parseMusicXmlWithStructure } from '../../musicXmlParser.js'
import { parseMusicXmlToNotes } from './musicEngine.js'

export const CE_STRUCT_BRIDGE_STATUS = Object.freeze({
  CE_REVALIDATED: 'CE_REVALIDATED',
  NO_CHANGE: 'NO_CHANGE',
  UNSUPPORTED_STRUCTURE: 'UNSUPPORTED_STRUCTURE',
  INVALID_ACTION_PROVENANCE: 'INVALID_ACTION_PROVENANCE',
  STALE_SOURCE: 'STALE_SOURCE',
  AMBIGUOUS_IDENTITY: 'AMBIGUOUS_IDENTITY',
  CE_RUNTIME_UNAVAILABLE: 'CE_RUNTIME_UNAVAILABLE',
  CE_CONTRACT_MISMATCH: 'CE_CONTRACT_MISMATCH',
  CE_PROJECTION_FAILED: 'CE_PROJECTION_FAILED',
  CE_REVALIDATION_FAILED: 'CE_REVALIDATION_FAILED',
  CONFORMANCE_FAILED: 'CONFORMANCE_FAILED',
  CONFLICT: 'CONFLICT',
})

const CE_CONTRACT = 'ST_OMR_CORRECTION_ENGINE_CE_STRUCT_BROWSER'
const CE_CONTRACT_VERSION = '1.0.0'
const CE_RUNTIME_VERSION = '1.0.0'
const CE_PATCH_SCHEMA = 'teacher-structural-patch-set-v1'

const REQUIRED_RUNTIME_METHODS = Object.freeze([
  'createMeasure',
  'createScoreEvent',
  'createScoreGraph',
  'createTeacherEditAuthorization',
  'createTeacherStructuralPatch',
  'createTeacherStructuralPatchSet',
  'fingerprintScoreGraph',
  'processSesliTabTeacherStructuralEdit',
])

const ENGINE_FALSE_AUTHORITIES = Object.freeze([
  'automaticApplyAuthority',
  'finalTeacherApproval',
  'studentShareEligible',
  'musicXmlWriteBackAuthority',
  'learningAuthority',
])

function failure(status, detail = null) {
  return Object.freeze({ ok: false, status, detail })
}

function runtimeMatchesContract(runtime) {
  return Boolean(
    runtime
    && typeof runtime === 'object'
    && runtime.contract === CE_CONTRACT
    && runtime.contractVersion === CE_CONTRACT_VERSION
    && runtime.runtimeVersion === CE_RUNTIME_VERSION
    && runtime.patchSchemaVersion === CE_PATCH_SCHEMA
    && REQUIRED_RUNTIME_METHODS.every((name) => typeof runtime[name] === 'function')
  )
}

export function resolveCeStructRuntime(globalScope = globalThis) {
  const runtime = globalScope?.STOmrCorrectionCeStructRuntime
  return runtimeMatchesContract(runtime) ? runtime : null
}

function requireRuntime(runtime) {
  if (!runtimeMatchesContract(runtime)) throw new Error('CE-STRUCT runtime contract mismatch.')
  return runtime
}

function validFiniteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be finite and non-negative.`)
  return value
}

function validPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer.`)
  return value
}

function tieTypes(note) {
  const result = []
  if (note?.tieStart === true) result.push('start')
  if (note?.tieStop === true) result.push('stop')
  return result
}

function eventMetadata(note, sourceOrder) {
  const metadata = {
    sourceOrder,
    grace: note?.isGrace === true,
  }
  const ties = tieTypes(note)
  if (ties.length) metadata.tieTypes = Object.freeze(ties)
  if (note?.tuplet && typeof note.tuplet === 'object') {
    metadata.tuplet = Object.freeze({ ...note.tuplet })
  }
  return Object.freeze(metadata)
}

function activeMeters(structured, neededMeasureKeys) {
  if (!structured || structured.error
    || !Array.isArray(structured.measureMetadata)
    || !Array.isArray(structured.timeSignatures)) {
    throw new Error('Exact MusicXML structural meter context is unavailable.')
  }

  const explicit = new Map(
    structured.timeSignatures.map((meter) => [
      meter.measureKey,
      { beats: meter.beats, beatType: meter.beatType },
    ]),
  )
  const activeByPart = new Map()
  const result = new Map()
  const ordered = [...structured.measureMetadata].sort((left, right) =>
    (left.partIndex ?? 0) - (right.partIndex ?? 0)
    || (left.measureIndex ?? 0) - (right.measureIndex ?? 0)
  )

  for (const measure of ordered) {
    if (explicit.has(measure.measureKey)) {
      const value = explicit.get(measure.measureKey)
      if (!Number.isFinite(value.beats) || value.beats <= 0
        || !Number.isFinite(value.beatType) || value.beatType <= 0) {
        throw new Error('Exact MusicXML meter is invalid.')
      }
      activeByPart.set(measure.partId, value)
    }
    if (!neededMeasureKeys.has(measure.measureKey)) continue
    const meter = activeByPart.get(measure.partId)
    if (!meter) throw new Error(`Exact MusicXML meter is unavailable for ${measure.measureKey}.`)
    if (result.has(measure.measureKey)) throw new Error('Duplicate MusicXML measure identity.')
    result.set(measure.measureKey, Object.freeze({
      key: measure.measureKey,
      beats: meter.beats,
      beatType: meter.beatType,
      implicit: measure.implicit === true,
      pickup: false,
    }))
  }

  if (result.size !== neededMeasureKeys.size) {
    throw new Error('Current revision measure identity is not exactly represented by MusicXML.')
  }
  return result
}

function parseExactCurrentNotes(currentRevision, currentMusicXml) {
  if (!currentRevision || typeof currentRevision !== 'object'
    || typeof currentRevision.revisionId !== 'string' || !currentRevision.revisionId.trim()
    || typeof currentRevision.sourceId !== 'string' || !currentRevision.sourceId.trim()
    || !Array.isArray(currentRevision.content) || currentRevision.content.length === 0) {
    throw new Error('Current immutable revision is required.')
  }
  const parsed = parseMusicXmlToNotes(currentMusicXml)
  if (parsed?.error || !Array.isArray(parsed?.notes)
    || parsed.notes.length !== currentRevision.content.length) {
    throw new Error('Current MusicXML/revision note identity is stale.')
  }
  return parsed.notes
}

export function buildCeStructBaseGraph({
  currentRevision,
  currentMusicXml,
  identityBridge,
  runtime,
} = {}) {
  const ce = requireRuntime(runtime)
  if (!identityBridge || typeof identityBridge !== 'object'
    || !Array.isArray(identityBridge.records)) {
    throw new Error('Exact structural identity bridge is required.')
  }

  const notes = parseExactCurrentNotes(currentRevision, currentMusicXml)
  const neededMeasureKeys = new Set(currentRevision.content.map((note) => note?.measureKey))
  if (neededMeasureKeys.has(undefined) || neededMeasureKeys.has(null)) {
    throw new Error('Current revision contains an ambiguous measure identity.')
  }
  const structured = parseMusicXmlWithStructure(currentMusicXml)
  const meterByKey = activeMeters(structured, neededMeasureKeys)

  for (const record of identityBridge.records) {
    const expectedId = `seslitab:${currentRevision.revisionId}:event:${record.revisionIndex}`
    if (record.eventId !== expectedId) throw new Error('Structural identity bridge event id drift.')
  }

  const measures = [...neededMeasureKeys].map((measureKey) => {
    const meter = meterByKey.get(measureKey)
    return ce.createMeasure(meter)
  })

  const events = notes.map((note, index) => {
    const revisionNote = currentRevision.content[index]
    const measureKey = revisionNote?.measureKey
    if (!meterByKey.has(measureKey)) throw new Error('Event references an unknown current measure.')
    const onset = validFiniteNonNegative(note.startBeat, 'event onset')
    const duration = validFiniteNonNegative(note.beats, 'event duration')
    const voice = validPositiveInteger(note.voice, 'event voice')
    const staff = validPositiveInteger(note.staff, 'event staff')
    const pitch = note.isRest === true ? null : (Number.isInteger(note.midi) ? note.midi : null)

    return ce.createScoreEvent({
      id: `seslitab:${currentRevision.revisionId}:event:${index}`,
      measureKey,
      onset,
      duration,
      voice,
      staff,
      pitch,
      isRest: note.isRest === true,
      isChordTone: note.isChordNote === true,
      metadata: eventMetadata(note, index),
    })
  })

  return ce.createScoreGraph({
    sourceId: currentRevision.sourceId,
    measures,
    events,
  })
}

function falseAuthorities(result) {
  return ENGINE_FALSE_AUTHORITIES.every((field) => result?.[field] === false)
}

function requiredPatchSetId(ids) {
  const value = ids?.patchSetId
  if (typeof value !== 'string' || !value.trim()) throw new Error('patchSetId is required.')
  return value
}

function operationPatch({
  operation,
  identityBridge,
  notes,
  graph,
  runtime,
}) {
  if (!operation || operation.operation !== 'CHANGE_EVENT_DURATION') {
    return { failure: CE_STRUCT_BRIDGE_STATUS.UNSUPPORTED_STRUCTURE }
  }

  let target
  try {
    target = identityBridge.resolveManifestOperation(operation)
  } catch (error) {
    return { failure: CE_STRUCT_BRIDGE_STATUS.AMBIGUOUS_IDENTITY, detail: error.message }
  }
  if (target?.record?.rawSpan !== 1) {
    return { failure: CE_STRUCT_BRIDGE_STATUS.UNSUPPORTED_STRUCTURE, detail: 'Chord/group duration editing is not admitted in CE-BRIDGE-01.' }
  }

  const sourceNote = notes[target.revisionIndex]
  const graphEvent = graph.events.find((event) => event.id === target.eventId)
  if (!sourceNote || !graphEvent) {
    return { failure: CE_STRUCT_BRIDGE_STATUS.AMBIGUOUS_IDENTITY }
  }
  if (!Number.isFinite(sourceNote.durationValue)
    || !Number.isFinite(sourceNote.divisions)
    || sourceNote.divisions <= 0
    || Number(operation.before) !== Number(sourceNote.durationValue)) {
    return { failure: CE_STRUCT_BRIDGE_STATUS.STALE_SOURCE }
  }

  const afterQuarterBeats = Number(operation.after) / Number(sourceNote.divisions)
  if (!Number.isFinite(afterQuarterBeats) || afterQuarterBeats <= 0) {
    return { failure: CE_STRUCT_BRIDGE_STATUS.INVALID_ACTION_PROVENANCE }
  }
  if (Math.abs(graphEvent.duration - (Number(operation.before) / Number(sourceNote.divisions))) > 1e-9) {
    return { failure: CE_STRUCT_BRIDGE_STATUS.STALE_SOURCE }
  }

  try {
    return {
      patch: runtime.createTeacherStructuralPatch({
        operation: 'CHANGE_EVENT_DURATION',
        measureKey: target.record.measureKey,
        eventId: target.eventId,
        before: graphEvent.duration,
        after: afterQuarterBeats,
      }),
    }
  } catch (error) {
    return { failure: CE_STRUCT_BRIDGE_STATUS.CE_CONTRACT_MISMATCH, detail: error.message }
  }
}

export function processSmoosicStructuralEdit({
  runtime,
  currentRevision,
  currentMusicXml,
  manifest,
  identityBridge,
  ids,
} = {}) {
  if (!runtime || typeof runtime !== 'object') {
    return failure(CE_STRUCT_BRIDGE_STATUS.CE_RUNTIME_UNAVAILABLE)
  }
  if (!runtimeMatchesContract(runtime)) {
    return failure(CE_STRUCT_BRIDGE_STATUS.CE_CONTRACT_MISMATCH)
  }
  if (!manifest || typeof manifest !== 'object'
    || !Array.isArray(manifest.operations) || manifest.operations.length === 0) {
    return failure(CE_STRUCT_BRIDGE_STATUS.INVALID_ACTION_PROVENANCE)
  }
  if (!identityBridge || manifest.baseMappingFingerprint !== identityBridge.baseMappingFingerprint) {
    return failure(CE_STRUCT_BRIDGE_STATUS.AMBIGUOUS_IDENTITY)
  }

  let graph
  let notes
  try {
    graph = buildCeStructBaseGraph({
      currentRevision,
      currentMusicXml,
      identityBridge,
      runtime,
    })
    notes = parseExactCurrentNotes(currentRevision, currentMusicXml)
  } catch (error) {
    return failure(CE_STRUCT_BRIDGE_STATUS.STALE_SOURCE, error.message)
  }

  const patches = []
  for (const operation of manifest.operations) {
    const built = operationPatch({
      operation,
      identityBridge,
      notes,
      graph,
      runtime,
    })
    if (built.failure) return failure(built.failure, built.detail ?? null)
    patches.push(built.patch)
  }

  let patchSet
  try {
    const authorization = runtime.createTeacherEditAuthorization({ actionId: manifest.actionId })
    const baseGraphFingerprint = runtime.fingerprintScoreGraph(graph)
    if (typeof baseGraphFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(baseGraphFingerprint)) {
      return failure(CE_STRUCT_BRIDGE_STATUS.CE_CONTRACT_MISMATCH)
    }
    patchSet = runtime.createTeacherStructuralPatchSet({
      patchSetId: requiredPatchSetId(ids),
      baseSourceId: graph.sourceId,
      baseGraphFingerprint,
      authorization,
      patches,
    })
  } catch (error) {
    return failure(CE_STRUCT_BRIDGE_STATUS.CE_CONTRACT_MISMATCH, error.message)
  }

  let engineResult
  try {
    engineResult = runtime.processSesliTabTeacherStructuralEdit({
      scoreGraph: graph,
      patchSet,
    })
  } catch (error) {
    return failure(CE_STRUCT_BRIDGE_STATUS.CE_PROJECTION_FAILED, error.message)
  }

  if (!engineResult || typeof engineResult !== 'object' || !falseAuthorities(engineResult)) {
    return failure(CE_STRUCT_BRIDGE_STATUS.CE_CONTRACT_MISMATCH)
  }
  if (engineResult.projection?.ok !== true || !engineResult.projection?.graph) {
    return failure(
      CE_STRUCT_BRIDGE_STATUS.CE_PROJECTION_FAILED,
      engineResult.projection?.code ?? null,
    )
  }
  if (engineResult.revalidation?.integrityDecision !== 'PASS'
    || engineResult.teacherCorrectedRevisionEligible !== true) {
    return failure(CE_STRUCT_BRIDGE_STATUS.CE_REVALIDATION_FAILED)
  }

  return Object.freeze({
    ok: true,
    status: CE_STRUCT_BRIDGE_STATUS.CE_REVALIDATED,
    baseGraph: graph,
    patchSet,
    engineResult,
    projectedGraph: engineResult.projection.graph,
  })
}
