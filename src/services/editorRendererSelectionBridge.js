// STI-06 — exact SesliTab host bridge between current renderer hit evidence and
// the revision-bound ST Score Editor Core selection manifest.
//
// ScoreNoteRef remains a renderer locator. This module first resolves it through
// SesliTab's exact Package 3 projection, then uses a pre-built canonical-index →
// Editor note-id association to select exactly one opaque token from the current
// Editor manifest. Only Editor Core resolves that token into SemanticAddress.
// No pitch, nearest-note, DOM/SVG, synthetic part-name or quality-marker fallback
// exists here.

import { inspectMusicXml } from '../../musicXmlSecurity.js'
import { createEditorCoreRevisionBinding, assertEditorCoreSessionInitialization } from './editorCoreIntegrationAuthority.js'
import { resolveCanonicalNoteFromScoreRef } from './scoreNoteIdentity.js'
import { isTeacherRevision } from './teacherRevisionModel.js'

export const SESLITAB_EDITOR_SELECTION_BRIDGE_VERSION = '1.0.0'
export const EDITOR_EXTERNAL_HIT_CONTRACT_VERSION = '1.0.0-draft'
export const EDITOR_RENDER_REQUEST_VERSION = '1.0.0'
export const EDITOR_RENDER_MANIFEST_VERSION = '1.0.0'
export const ST_RENDERING_LAYER_EDITOR_PROFILE = Object.freeze({
  family: 'osmd',
  packageName: 'opensheetmusicdisplay',
  packageVersion: '2.1.2',
  license: 'BSD-3-Clause',
})

export const EDITOR_SELECTION_DIAGNOSTIC = Object.freeze({
  RUNTIME_UNAVAILABLE: 'EDITOR_RUNTIME_UNAVAILABLE',
  CURRENT_REVISION_UNAVAILABLE: 'EDITOR_CURRENT_REVISION_UNAVAILABLE',
  UNSUPPORTED_PROJECTION: 'EDITOR_UNSUPPORTED_EXACT_PROJECTION',
  STALE_CONTEXT: 'EDITOR_STALE_SELECTION_CONTEXT',
  CANONICAL_MISS: 'EDITOR_CANONICAL_RESOLUTION_MISS',
  TOKEN_MISS: 'EDITOR_OPAQUE_TOKEN_MISS',
  TOKEN_AMBIGUOUS: 'EDITOR_OPAQUE_TOKEN_AMBIGUOUS',
  SELECTION_REJECTED: 'EDITOR_SELECTION_REJECTED',
})

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function requireSafeInteger(value, field, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`Exact Editor projection requires ${field} to be a safe integer >= ${minimum}.`)
  }
  return value
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new Error(`Exact Editor projection requires ${field} to be a non-empty trimmed string.`)
  }
  return value
}

function localName(node) {
  const value = node?.localName ?? node?.tagName ?? node?.tag ?? ''
  return String(value).replace(/^.*:/, '')
}

function directChildren(node, name) {
  return [...(node?.children ?? [])].filter((child) => localName(child) === name)
}

function nodesByLocalName(root, name) {
  if (typeof root?.getElementsByTagNameNS === 'function') return [...root.getElementsByTagNameNS('*', name)]
  if (typeof root?.getElementsByTagName === 'function') return [...root.getElementsByTagName(name)]
  return []
}

export function extractEditorPartNameEvidence(musicXml, { DOMParserCtor = globalThis.DOMParser } = {}) {
  const security = inspectMusicXml(musicXml)
  if (!security.ok) throw new Error('Exact Editor projection requires safe current MusicXML part-name evidence.')
  if (typeof DOMParserCtor !== 'function') {
    throw new Error('Exact Editor projection requires a browser XML parser for part-name evidence.')
  }

  let documentNode
  try {
    documentNode = new DOMParserCtor().parseFromString(security.xmlForParsing, 'application/xml')
  } catch {
    throw new Error('Exact Editor projection could not parse current MusicXML part-name evidence.')
  }
  if (!documentNode || nodesByLocalName(documentNode, 'parsererror').length > 0) {
    throw new Error('Exact Editor projection could not parse current MusicXML part-name evidence.')
  }

  const partLists = nodesByLocalName(documentNode, 'part-list')
  if (partLists.length !== 1) throw new Error('Exact Editor projection requires exactly one MusicXML part-list.')
  const scoreParts = directChildren(partLists[0], 'score-part')
  if (scoreParts.length === 0) throw new Error('Exact Editor projection requires MusicXML score-part evidence.')

  const seen = new Set()
  const evidence = []
  for (let index = 0; index < scoreParts.length; index++) {
    const scorePart = scoreParts[index]
    const partId = requireText(scorePart.getAttribute?.('id'), `MusicXML score-part ${index} id`)
    if (seen.has(partId)) throw new Error(`Exact Editor projection found duplicate MusicXML score-part id ${partId}.`)
    const names = directChildren(scorePart, 'part-name')
    if (names.length !== 1) throw new Error(`Exact Editor projection requires one explicit part-name for ${partId}.`)
    const name = String(names[0]?.textContent ?? '').trim()
    requireText(name, `MusicXML score-part ${partId} part-name`)
    seen.add(partId)
    evidence.push(Object.freeze({ partId, name }))
  }
  return Object.freeze(evidence)
}

function partNameMapFromEvidence(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    throw new Error('Exact Editor projection requires explicit MusicXML part-name evidence; synthetic fallback is forbidden.')
  }
  const names = new Map()
  for (let index = 0; index < evidence.length; index++) {
    const item = evidence[index]
    if (!isPlainObject(item) || Object.keys(item).length !== 2 || !Object.hasOwn(item, 'partId') || !Object.hasOwn(item, 'name')) {
      throw new Error(`Exact Editor projection part-name evidence ${index} is malformed.`)
    }
    const partId = requireText(item.partId, `part-name evidence ${index} partId`)
    const name = requireText(item.name, `part-name evidence ${index} name`)
    if (names.has(partId)) throw new Error(`Exact Editor projection part-name evidence duplicates ${partId}.`)
    names.set(partId, name)
  }
  return names
}

function gcd(left, right) {
  let a = Math.abs(left)
  let b = Math.abs(right)
  while (b !== 0) {
    const next = a % b
    a = b
    b = next
  }
  return a
}

function reducedRational(numerator, denominator, label, { allowZero = false } = {}) {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error(`Exact Editor projection cannot represent ${label} as a safe rational.`)
  }
  if (allowZero ? numerator < 0 : numerator <= 0) {
    throw new Error(`Exact Editor projection requires ${label} to be ${allowZero ? 'non-negative' : 'positive'}.`)
  }
  const divisor = gcd(numerator, denominator)
  return Object.freeze({ numerator: numerator / divisor, denominator: denominator / divisor })
}

function decimalRational(value, label, { allowZero = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new Error(`Exact Editor projection requires finite ${label}.`)
  }
  if (Number.isSafeInteger(value)) return reducedRational(value, 1, label, { allowZero })

  const text = String(value)
  const match = text.match(/^([0-9]+)(?:\.([0-9]+))?(?:e([+-]?[0-9]+))?$/i)
  if (!match) throw new Error(`Exact Editor projection cannot encode ${label} without approximation.`)
  const whole = match[1]
  const fraction = match[2] ?? ''
  const exponent = Number(match[3] ?? 0)
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 15) {
    throw new Error(`Exact Editor projection cannot encode ${label} within safe integer bounds.`)
  }
  const digits = `${whole}${fraction}`
  let numerator = Number(digits)
  let denominator = 10 ** fraction.length
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new Error(`Exact Editor projection cannot encode ${label} within safe integer bounds.`)
  }
  if (exponent > 0) numerator *= 10 ** exponent
  if (exponent < 0) denominator *= 10 ** (-exponent)
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new Error(`Exact Editor projection cannot encode ${label} within safe integer bounds.`)
  }
  return reducedRational(numerator, denominator, label, { allowZero })
}

function onsetRational(note, globalIndex) {
  const divisions = note.divisions
  const startBeat = note.startBeat
  if (Number.isSafeInteger(divisions) && divisions > 0 && typeof startBeat === 'number' && Number.isFinite(startBeat)) {
    const scaled = startBeat * divisions
    if (Number.isSafeInteger(scaled)) return reducedRational(scaled, divisions, `note ${globalIndex} onset`, { allowZero: true })
  }
  return decimalRational(startBeat, `note ${globalIndex} onset`, { allowZero: true })
}

function durationRational(note, globalIndex) {
  if (note.isGrace === true) {
    throw new Error(`Exact Editor projection does not represent grace-note timing at note ${globalIndex}; selection abstains.`)
  }
  if (Number.isSafeInteger(note.durationValue) && note.durationValue > 0 && Number.isSafeInteger(note.divisions) && note.divisions > 0) {
    return reducedRational(note.durationValue, note.divisions, `note ${globalIndex} duration`)
  }
  return decimalRational(note.beats, `note ${globalIndex} duration`)
}

function sameRational(left, right) {
  return left?.numerator === right?.numerator && left?.denominator === right?.denominator
}

function pitchFor(note, globalIndex) {
  const step = note.step
  const alter = note.alter ?? 0
  const octave = note.octave
  if (typeof step !== 'string' || !['A', 'B', 'C', 'D', 'E', 'F', 'G'].includes(step)) {
    throw new Error(`Exact Editor projection requires a canonical pitch step at note ${globalIndex}.`)
  }
  if (!Number.isInteger(alter) || alter < -2 || alter > 2 || !Number.isInteger(octave) || octave < -1 || octave > 9) {
    throw new Error(`Exact Editor projection requires a supported canonical pitch at note ${globalIndex}.`)
  }
  return Object.freeze({ step, alter, octave })
}

function safeEntityPrefix(sourceSha256) {
  return `stse.${sourceSha256.slice(0, 16)}`
}

function entityId(prefix, kind, ...ordinals) {
  return `${prefix}.${kind}.${ordinals.join('.')}`
}

function keyForPart(note) {
  return `${note.partIndex}\u0000${note.partId}`
}

function keyForStaff(note) {
  return `${keyForPart(note)}\u0000${note.staff}`
}

function keyForMeasure(note) {
  return `${keyForStaff(note)}\u0000${note.measureIndex}`
}

function keyForVoice(note) {
  return `${keyForMeasure(note)}\u0000${note.voice}`
}

function compareRational(left, right) {
  const lhs = BigInt(left.numerator) * BigInt(right.denominator)
  const rhs = BigInt(right.numerator) * BigInt(left.denominator)
  return lhs < rhs ? -1 : lhs > rhs ? 1 : 0
}

async function sha256Hex(bytes, cryptoScope = globalThis.crypto) {
  if (!cryptoScope?.subtle || typeof cryptoScope.subtle.digest !== 'function') {
    throw new Error('WebCrypto SHA-256 is unavailable for exact Editor source provenance.')
  }
  const digest = await cryptoScope.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function resolveEditorCoreRuntime(globalScope = globalThis) {
  const runtime = globalScope?.STScoreEditorCoreRuntime
  if (!runtime || typeof runtime !== 'object') return null
  for (const method of ['createScoreDocument', 'emptyNotationDocument', 'createEditorSessionWithRendererProfile', 'selectRendererHit']) {
    if (typeof runtime[method] !== 'function') return null
  }
  return runtime
}

export async function projectTeacherRevisionToEditorScore(teacherRevision, {
  cryptoScope = globalThis.crypto,
  partNameEvidence,
} = {}) {
  if (!isTeacherRevision(teacherRevision) || !Array.isArray(teacherRevision.content) || teacherRevision.content.length === 0) {
    throw new Error('A current immutable Package 8 note revision is required for exact Editor projection.')
  }
  const partNames = partNameMapFromEvidence(partNameEvidence)

  const canonicalJson = JSON.stringify(teacherRevision.content)
  const canonicalBytes = new TextEncoder().encode(canonicalJson)
  const sourceSha256 = await sha256Hex(canonicalBytes, cryptoScope)
  const prefix = safeEntityPrefix(sourceSha256)
  const noteIds = Array(teacherRevision.content.length).fill(null)
  const partIdByIndex = new Map()
  const partIndexById = new Map()
  const parts = new Map()
  const lastEventByVoice = new Map()

  for (let globalIndex = 0; globalIndex < teacherRevision.content.length; globalIndex++) {
    const note = teacherRevision.content[globalIndex]
    if (!isPlainObject(note)) throw new Error(`Exact Editor projection requires plain note data at index ${globalIndex}.`)

    const partId = requireText(note.partId, `note ${globalIndex} partId`)
    const partIndex = requireSafeInteger(note.partIndex, `note ${globalIndex} partIndex`)
    const measureIndex = requireSafeInteger(note.measureIndex, `note ${globalIndex} measureIndex`)
    const staffOrdinal = requireSafeInteger(note.staff, `note ${globalIndex} staff`, 1)
    const voiceOrdinal = requireSafeInteger(note.voice, `note ${globalIndex} voice`, 1)
    requireText(note.measureKey, `note ${globalIndex} measureKey`)

    if (partIdByIndex.has(partIndex) && partIdByIndex.get(partIndex) !== partId) {
      throw new Error('Exact Editor projection found conflicting partId for one partIndex.')
    }
    if (partIndexById.has(partId) && partIndexById.get(partId) !== partIndex) {
      throw new Error('Exact Editor projection found conflicting partIndex for one partId.')
    }
    partIdByIndex.set(partIndex, partId)
    partIndexById.set(partId, partIndex)

    const partKey = keyForPart(note)
    let part = parts.get(partKey)
    if (!part) {
      const partName = partNames.get(partId)
      if (!partName) {
        throw new Error(`Exact Editor projection has no explicit MusicXML part-name evidence for ${partId}; synthetic fallback is forbidden.`)
      }
      part = { id: entityId(prefix, 'part', partIndex + 1), name: partName, partIndex, partId, staves: new Map() }
      parts.set(partKey, part)
    }

    const staffKey = keyForStaff(note)
    let staff = part.staves.get(staffKey)
    if (!staff) {
      staff = { id: entityId(prefix, 'staff', partIndex + 1, staffOrdinal), ordinal: staffOrdinal, measures: new Map() }
      part.staves.set(staffKey, staff)
    }

    const measureKey = keyForMeasure(note)
    let measure = staff.measures.get(measureKey)
    if (!measure) {
      const displayNumber = note.measure === undefined || note.measure === null ? String(measureIndex + 1) : String(note.measure)
      measure = {
        id: entityId(prefix, 'measure', partIndex + 1, staffOrdinal, measureIndex + 1),
        ordinal: measureIndex + 1,
        displayNumber,
        voices: new Map(),
      }
      staff.measures.set(measureKey, measure)
    }

    const voiceKey = keyForVoice(note)
    let voice = measure.voices.get(voiceKey)
    if (!voice) {
      voice = {
        id: entityId(prefix, 'voice', partIndex + 1, staffOrdinal, measureIndex + 1, voiceOrdinal),
        ordinal: voiceOrdinal,
        events: [],
      }
      measure.voices.set(voiceKey, voice)
    }

    const onset = onsetRational(note, globalIndex)
    const duration = durationRational(note, globalIndex)
    const eventId = entityId(prefix, 'event', globalIndex + 1)

    if (note.isRest === true) {
      if (note.isChordNote === true) throw new Error(`Exact Editor projection rejects a rest marked as chord continuation at note ${globalIndex}.`)
      const event = { kind: 'rest', id: eventId, onset, duration, sourceIndex: globalIndex }
      voice.events.push(event)
      lastEventByVoice.set(voiceKey, event)
      continue
    }

    const noteId = entityId(prefix, 'note', globalIndex + 1)
    const atom = { id: noteId, pitch: pitchFor(note, globalIndex) }
    noteIds[globalIndex] = noteId

    if (note.isChordNote === true) {
      const previous = lastEventByVoice.get(voiceKey)
      if (!previous || !['note', 'chord'].includes(previous.kind) || !sameRational(previous.onset, onset) || !sameRational(previous.duration, duration)) {
        throw new Error(`Exact Editor projection cannot prove chord ownership at note ${globalIndex}.`)
      }
      if (previous.kind === 'note') {
        previous.kind = 'chord'
        previous.notes = [previous.note, atom]
        delete previous.note
      } else {
        previous.notes.push(atom)
      }
      continue
    }

    const event = { kind: 'note', id: eventId, onset, duration, note: atom, sourceIndex: globalIndex }
    voice.events.push(event)
    lastEventByVoice.set(voiceKey, event)
  }

  const scoreParts = [...parts.values()]
    .sort((left, right) => left.partIndex - right.partIndex)
    .map((part) => ({
      id: part.id,
      name: part.name,
      staves: [...part.staves.values()]
        .sort((left, right) => left.ordinal - right.ordinal)
        .map((staff) => ({
          id: staff.id,
          ordinal: staff.ordinal,
          measures: [...staff.measures.values()]
            .sort((left, right) => left.ordinal - right.ordinal)
            .map((measure) => ({
              id: measure.id,
              ordinal: measure.ordinal,
              displayNumber: measure.displayNumber,
              voices: [...measure.voices.values()]
                .sort((left, right) => left.ordinal - right.ordinal)
                .map((voice) => ({
                  id: voice.id,
                  ordinal: voice.ordinal,
                  events: voice.events
                    .sort((left, right) => compareRational(left.onset, right.onset) || left.sourceIndex - right.sourceIndex)
                    .map((event) => {
                      const { sourceIndex: _sourceIndex, ...clean } = event
                      return clean
                    }),
                })),
            })),
        })),
    }))

  return Object.freeze({
    scoreInput: Object.freeze({
      schemaVersion: '1.0.0',
      id: `stse-${sourceSha256.slice(0, 24)}`,
      revision: Object.freeze({ id: teacherRevision.revisionId, parentId: teacherRevision.parentRevisionId }),
      source: Object.freeze({ sha256: sourceSha256, format: 'canonical', byteLength: canonicalBytes.byteLength }),
      parts: scoreParts,
    }),
    noteIds: Object.freeze(noteIds),
    sourceSha256,
  })
}

function sameRendererProfile(observed) {
  return isPlainObject(observed) && Object.keys(ST_RENDERING_LAYER_EDITOR_PROFILE).every(
    (key) => observed[key] === ST_RENDERING_LAYER_EDITOR_PROFILE[key],
  )
}

function freezeContext(context, session) {
  return Object.freeze({
    contractVersion: SESLITAB_EDITOR_SELECTION_BRIDGE_VERSION,
    binding: context.binding,
    noteIds: context.noteIds,
    session,
  })
}

export async function createEditorSelectionContext({
  package3Snapshot,
  teacherRevision,
  editorRuntime,
  cryptoScope = globalThis.crypto,
  musicXml,
  partNameEvidence,
  DOMParserCtor = globalThis.DOMParser,
} = {}) {
  const runtime = editorRuntime ?? resolveEditorCoreRuntime()
  if (!runtime) throw new Error(EDITOR_SELECTION_DIAGNOSTIC.RUNTIME_UNAVAILABLE)
  const names = partNameEvidence ?? extractEditorPartNameEvidence(musicXml, { DOMParserCtor })
  const projection = await projectTeacherRevisionToEditorScore(teacherRevision, { cryptoScope, partNameEvidence: names })
  const score = runtime.createScoreDocument(projection.scoreInput)
  const notation = runtime.emptyNotationDocument(score)
  const session = runtime.createEditorSessionWithRendererProfile(score, notation, ST_RENDERING_LAYER_EDITOR_PROFILE)
  if (!session?.renderRequest || !sameRendererProfile(session.renderRequest.renderer)) {
    throw new Error('Editor Core session did not preserve the exact ST Rendering Layer renderer profile.')
  }
  if (session.renderRequest.contractVersion !== EDITOR_RENDER_REQUEST_VERSION || session.renderRequest.manifest?.contractVersion !== EDITOR_RENDER_MANIFEST_VERSION) {
    throw new Error('Editor Core session render contracts do not match the frozen SesliTab bridge.')
  }

  const binding = createEditorCoreRevisionBinding({
    package3Snapshot,
    teacherRevision,
    editorDocumentId: score.id,
  })
  assertEditorCoreSessionInitialization(binding, session)
  return freezeContext({ binding, noteIds: projection.noteIds }, session)
}

function assertCurrentContext(context, package3Snapshot, teacherRevision) {
  if (!context || context.contractVersion !== SESLITAB_EDITOR_SELECTION_BRIDGE_VERSION) {
    throw new Error(EDITOR_SELECTION_DIAGNOSTIC.STALE_CONTEXT)
  }
  const rebound = createEditorCoreRevisionBinding({
    package3Snapshot,
    teacherRevision,
    editorDocumentId: context.binding.editorDocumentId,
  })
  if (
    rebound.editorRevisionId !== context.binding.editorRevisionId ||
    rebound.contentFingerprint !== context.binding.contentFingerprint ||
    rebound.sourceId !== context.binding.sourceId ||
    rebound.sourceRevisionId !== context.binding.sourceRevisionId
  ) {
    throw new Error(EDITOR_SELECTION_DIAGNOSTIC.STALE_CONTEXT)
  }
  assertEditorCoreSessionInitialization(context.binding, context.session)
}

export function selectDetailedRendererHitWithEditor({
  context,
  package3Snapshot,
  teacherRevision,
  detailedHit,
  editorRuntime,
} = {}) {
  const runtime = editorRuntime ?? resolveEditorCoreRuntime()
  if (!runtime) return Object.freeze({ kind: 'FAIL', diagnosticCode: EDITOR_SELECTION_DIAGNOSTIC.RUNTIME_UNAVAILABLE })
  if (!detailedHit || detailedHit.kind !== 'HIT') {
    return Object.freeze({ kind: 'FAIL', diagnosticCode: EDITOR_SELECTION_DIAGNOSTIC.CANONICAL_MISS })
  }

  try {
    assertCurrentContext(context, package3Snapshot, teacherRevision)
  } catch {
    return Object.freeze({ kind: 'FAIL', diagnosticCode: EDITOR_SELECTION_DIAGNOSTIC.STALE_CONTEXT })
  }

  const projectedNotes = Array.isArray(package3Snapshot?.selectionNotes) ? package3Snapshot.selectionNotes : null
  const resolved = projectedNotes ? resolveCanonicalNoteFromScoreRef(projectedNotes, detailedHit.target) : null
  if (!resolved) return Object.freeze({ kind: 'FAIL', diagnosticCode: EDITOR_SELECTION_DIAGNOSTIC.CANONICAL_MISS })

  const noteId = context.noteIds[resolved.noteIndex]
  if (typeof noteId !== 'string' || noteId.length === 0) {
    return Object.freeze({ kind: 'FAIL', diagnosticCode: EDITOR_SELECTION_DIAGNOSTIC.CANONICAL_MISS })
  }

  const manifestEntries = context.session?.renderRequest?.manifest?.entries
  if (!Array.isArray(manifestEntries)) {
    return Object.freeze({ kind: 'FAIL', diagnosticCode: EDITOR_SELECTION_DIAGNOSTIC.TOKEN_MISS })
  }
  const matches = manifestEntries.filter((entry) => entry?.address?.kind === 'note' && entry.address.noteId === noteId)
  if (matches.length === 0) return Object.freeze({ kind: 'FAIL', diagnosticCode: EDITOR_SELECTION_DIAGNOSTIC.TOKEN_MISS })
  if (matches.length !== 1) return Object.freeze({ kind: 'FAIL', diagnosticCode: EDITOR_SELECTION_DIAGNOSTIC.TOKEN_AMBIGUOUS })

  const request = context.session.renderRequest
  const externalHit = Object.freeze({
    contractVersion: EDITOR_EXTERNAL_HIT_CONTRACT_VERSION,
    documentId: request.documentId,
    revisionId: request.revisionId,
    rendererFamily: request.renderer.family,
    renderRequestVersion: request.contractVersion,
    renderManifestVersion: request.manifest.contractVersion,
    opaqueHitToken: matches[0].token,
  })

  let nextSession
  try {
    nextSession = runtime.selectRendererHit(context.session, externalHit)
  } catch {
    return Object.freeze({ kind: 'FAIL', diagnosticCode: EDITOR_SELECTION_DIAGNOSTIC.SELECTION_REJECTED })
  }
  const selected = nextSession?.selection?.primary
  if (selected?.kind !== 'note' || selected.noteId !== noteId || selected.revisionId !== request.revisionId) {
    return Object.freeze({ kind: 'FAIL', diagnosticCode: EDITOR_SELECTION_DIAGNOSTIC.SELECTION_REJECTED })
  }

  return Object.freeze({
    kind: 'SELECTED',
    context: freezeContext(context, nextSession),
    resolved,
    rendererTarget: detailedHit.target,
    opaqueTokenMatched: true,
  })
}
