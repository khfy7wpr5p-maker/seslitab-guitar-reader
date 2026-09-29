import { parseMusicXmlWithStructure } from '../../musicXmlParser.js'
import { parseMusicXmlToNotes } from './musicEngine.js'

const CE_CONTRACT = 'ST_OMR_CORRECTION_ENGINE_CE_STRUCT_BROWSER'
const CE_CONTRACT_VERSION = '1.0.0'
const CE_RUNTIME_VERSION = '1.0.0'
const CE_PATCH_SCHEMA = 'teacher-structural-patch-set-v1'

function runtimeOk(runtime) {
  return Boolean(
    runtime
    && runtime.contract === CE_CONTRACT
    && runtime.contractVersion === CE_CONTRACT_VERSION
    && runtime.runtimeVersion === CE_RUNTIME_VERSION
    && runtime.patchSchemaVersion === CE_PATCH_SCHEMA
    && typeof runtime.createMeasure === 'function'
    && typeof runtime.createScoreEvent === 'function'
    && typeof runtime.createScoreGraph === 'function'
  )
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  }
  return value
}

function stable(value) {
  return JSON.stringify(canonical(value))
}

function fail(message) {
  throw new Error(`CE candidate conformance failed: ${message}`)
}

function noteTieTypes(note) {
  const ties = []
  if (note?.tieStart === true) ties.push('start')
  if (note?.tieStop === true) ties.push('stop')
  return ties
}

function semanticMetadata(note, sourceOrder) {
  const metadata = {
    sourceOrder,
    grace: note?.isGrace === true,
  }
  const tieTypes = noteTieTypes(note)
  if (tieTypes.length) metadata.tieTypes = Object.freeze(tieTypes)
  if (note?.tuplet && typeof note.tuplet === 'object') {
    metadata.tuplet = Object.freeze({ ...note.tuplet })
  }
  return Object.freeze(metadata)
}

function exactMeasureContexts(structured) {
  if (structured?.error
    || !Array.isArray(structured?.measureMetadata)
    || !Array.isArray(structured?.timeSignatures)) {
    fail('candidate MusicXML structural parse is unavailable')
  }

  const explicitMeters = new Map()
  for (const meter of structured.timeSignatures) {
    if (explicitMeters.has(meter.measureKey)) fail('candidate contains duplicate meter identity')
    if (!Number.isFinite(meter.beats) || meter.beats <= 0
      || !Number.isFinite(meter.beatType) || meter.beatType <= 0) {
      fail('candidate contains invalid meter')
    }
    explicitMeters.set(meter.measureKey, { beats: meter.beats, beatType: meter.beatType })
  }

  const activeByPart = new Map()
  const result = []
  const seen = new Set()
  const ordered = [...structured.measureMetadata].sort((left, right) =>
    (left.partIndex ?? 0) - (right.partIndex ?? 0)
    || (left.measureIndex ?? 0) - (right.measureIndex ?? 0)
  )

  for (const measure of ordered) {
    if (explicitMeters.has(measure.measureKey)) {
      activeByPart.set(measure.partId, explicitMeters.get(measure.measureKey))
    }
    const meter = activeByPart.get(measure.partId)
    if (!meter) fail(`candidate meter is unavailable for ${measure.measureKey}`)
    if (seen.has(measure.measureKey)) fail('candidate contains duplicate measure identity')
    seen.add(measure.measureKey)
    result.push(Object.freeze({
      key: measure.measureKey,
      beats: meter.beats,
      beatType: meter.beatType,
      implicit: measure.implicit === true,
      pickup: false,
    }))
  }
  return result
}

function sameStableIdentity(note, baseEvent) {
  return note?.measureKey === baseEvent?.measureKey
    && Number(note?.voice) === Number(baseEvent?.voice)
    && Number(note?.staff) === Number(baseEvent?.staff)
    && (note?.isRest === true) === (baseEvent?.isRest === true)
    && (note?.isChordNote === true) === (baseEvent?.isChordTone === true)
}

function assertIdentityBridgeCompatible({ identityBridge, manifest, baseGraph }) {
  if (!identityBridge || !Array.isArray(identityBridge.records)
    || typeof identityBridge.resolveManifestOperation !== 'function') {
    fail('exact structural identity bridge is unavailable')
  }
  if (!manifest || !Array.isArray(manifest.operations) || manifest.operations.length === 0
    || manifest.baseMappingFingerprint !== identityBridge.baseMappingFingerprint) {
    fail('structural action identity proof is stale')
  }
  for (const operation of manifest.operations) {
    let resolved
    try {
      resolved = identityBridge.resolveManifestOperation(operation)
    } catch {
      fail('structural action target identity is ambiguous')
    }
    if (!baseGraph.events.some((event) => event.id === resolved.eventId)) {
      fail('structural action target is absent from the base graph')
    }
  }
}

function candidatePitch(note) {
  if (note?.isRest === true) return null
  return Number.isInteger(note?.midi) ? note.midi : null
}

export function buildCandidateCeStructGraph({
  candidateMusicXml,
  baseGraph,
  identityBridge,
  manifest,
  runtime,
} = {}) {
  if (!runtimeOk(runtime)) fail('CE runtime contract mismatch')
  if (!baseGraph || typeof baseGraph !== 'object'
    || !Array.isArray(baseGraph.events) || !Array.isArray(baseGraph.measures)) {
    fail('base graph is unavailable')
  }
  if (typeof candidateMusicXml !== 'string' || !candidateMusicXml.trim()) {
    fail('candidate MusicXML is unavailable')
  }

  assertIdentityBridgeCompatible({ identityBridge, manifest, baseGraph })

  const parsed = parseMusicXmlToNotes(candidateMusicXml)
  const structured = parseMusicXmlWithStructure(candidateMusicXml)
  if (parsed?.error || !Array.isArray(parsed?.notes) || structured?.error) {
    fail('candidate MusicXML cannot be parsed')
  }
  if (parsed.notes.length !== baseGraph.events.length) {
    fail('candidate event identity cardinality changed')
  }

  const measureInputs = exactMeasureContexts(structured)
  if (measureInputs.length !== baseGraph.measures.length) {
    fail('candidate measure structure changed')
  }
  for (let index = 0; index < measureInputs.length; index += 1) {
    if (measureInputs[index].key !== baseGraph.measures[index].key) {
      fail('candidate measure identity or order changed')
    }
  }

  const measures = measureInputs.map((value) => runtime.createMeasure(value))
  const events = parsed.notes.map((note, index) => {
    const baseEvent = baseGraph.events[index]
    if (!baseEvent || !sameStableIdentity(note, baseEvent)) {
      fail(`candidate event identity changed at source index ${index}`)
    }
    const onset = Number(note.startBeat)
    const duration = Number(note.beats)
    if (!Number.isFinite(onset) || onset < 0 || !Number.isFinite(duration) || duration < 0) {
      fail(`candidate timing is invalid at source index ${index}`)
    }
    return runtime.createScoreEvent({
      id: baseEvent.id,
      measureKey: baseEvent.measureKey,
      onset,
      duration,
      voice: Number(note.voice),
      staff: Number(note.staff),
      pitch: candidatePitch(note),
      isRest: note.isRest === true,
      isChordTone: note.isChordNote === true,
      metadata: semanticMetadata(note, index),
    })
  })

  return runtime.createScoreGraph({
    sourceId: baseGraph.sourceId,
    measures,
    events,
  })
}

export function verifyCeStructCandidateConformance({
  projectedGraph,
  candidateGraph,
} = {}) {
  if (!projectedGraph || !candidateGraph) fail('projected and candidate graphs are required')
  if (stable(projectedGraph) !== stable(candidateGraph)) {
    fail('candidate semantic graph does not exactly equal CE projection')
  }
  return true
}
