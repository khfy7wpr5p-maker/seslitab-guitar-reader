import { parseMusicXml, parseMusicXmlWithStructure } from '../../musicXmlParser.js'
import { extractMusicXmlStructuralEvidence } from './musicXmlStructuralEvidence.js'
import { attachStructuralEvidence } from './musicXmlStructuralValidation.js'
import { validateStructuralRhythm } from './structuralRhythmValidator.js'
import {
  MUSICXML_SOURCE_PROVENANCE,
  resolveMusicXmlSourceForNotes,
} from './musicXmlSourceRegistry.js'
import {
  createAutomaticRevision,
  isTeacherRevision,
} from './teacherRevisionModel.js'
import {
  getCurrentTeacherRevision,
  isTeacherRevisionHistory,
} from './teacherRevisionHistory.js'
import { isStageFCanonicalizationEvidence } from './stageFCanonicalization.js'

export const STAGE_F_CORRECTED_MUSICXML_SCHEMA_VERSION = 1
export const STAGE_F_CORRECTED_MUSICXML_STATE = 'stage_f_corrected_musicxml_revalidated'

export const STAGE_F_CORRECTED_MUSICXML_STATUS = Object.freeze({
  MATERIALIZED: 'materialized',
  INVALID_INPUT: 'invalid_input',
  SOURCE_EVIDENCE_MISSING: 'source_evidence_missing',
  CANONICALIZATION_NOT_APPLICABLE: 'canonicalization_not_applicable',
  DOM_RUNTIME_UNAVAILABLE: 'dom_runtime_unavailable',
  MATERIALIZATION_FAILED: 'materialization_failed',
  REPARSE_MISMATCH: 'reparse_mismatch',
  STRUCTURAL_VALIDATION_FAILED: 'structural_validation_failed',
})

const FNV_1A_64_OFFSET = 0xcbf29ce484222325n
const FNV_1A_64_PRIME = 0x100000001b3n
const UINT64_MASK = 0xffffffffffffffffn
const EPSILON = 1e-9

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function fnv1a64(text) {
  let hash = FNV_1A_64_OFFSET
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte)
    hash = (hash * FNV_1A_64_PRIME) & UINT64_MASK
  }
  return hash.toString(16).padStart(16, '0')
}

function fingerprint(label, text) {
  return `${label}-fnv1a64-v1:${fnv1a64(text)}:${text.length}`
}

function result(status, reason, extras = {}) {
  return Object.freeze({
    status,
    ok: status === STAGE_F_CORRECTED_MUSICXML_STATUS.MATERIALIZED,
    reason,
    musicXml: extras.musicXml ?? null,
    evidence: extras.evidence ?? null,
  })
}

function sourceNotesMatchRoot(root, sourceNotes) {
  if (!isTeacherRevision(root) || !Array.isArray(sourceNotes)) return false
  try {
    const replay = createAutomaticRevision({
      revisionId: root.revisionId,
      sourceId: root.sourceId,
      createdAt: root.createdAt,
      content: sourceNotes,
    })
    return (
      replay.sourceRevisionId === root.sourceRevisionId &&
      replay.contentFingerprint === root.contentFingerprint &&
      replay.lineageFingerprint === root.lineageFingerprint
    )
  } catch {
    return false
  }
}

function directChildren(element, name) {
  return [...(element?.children ?? [])].filter(
    (child) => (child.localName ?? child.tagName ?? child.tag) === name,
  )
}

function child(element, name) {
  return directChildren(element, name)[0] ?? null
}

function setText(element, value) {
  element.textContent = String(value)
}

function createElementLike(doc, parent, name) {
  const namespace = parent?.namespaceURI ?? doc.documentElement?.namespaceURI ?? null
  return namespace && typeof doc.createElementNS === 'function'
    ? doc.createElementNS(namespace, name)
    : doc.createElement(name)
}

function ensurePitchAlter(doc, pitch, step, alter) {
  let alterElement = child(pitch, 'alter')
  if (alter === 0) {
    alterElement?.remove?.()
    return
  }
  if (!alterElement) {
    alterElement = createElementLike(doc, pitch, 'alter')
    const octave = child(pitch, 'octave')
    pitch.insertBefore(alterElement, octave ?? null)
  }
  setText(alterElement, alter)
}

function accidentalValue(alter) {
  if (alter === -2) return 'double-flat'
  if (alter === -1) return 'flat'
  if (alter === 0) return 'natural'
  if (alter === 1) return 'sharp'
  if (alter === 2) return 'double-sharp'
  return null
}

function musicXmlType(duration) {
  const base = typeof duration === 'string' && duration.startsWith('dotted-')
    ? duration.slice('dotted-'.length)
    : duration
  return ({
    whole: 'whole',
    half: 'half',
    quarter: 'quarter',
    eighth: 'eighth',
    sixteenth: '16th',
    thirtySecond: '32nd',
  })[base] ?? null
}

function patchDots(doc, noteElement, dotCount, typeElement) {
  for (const dot of directChildren(noteElement, 'dot')) dot.remove?.()
  if (dotCount === 0) return true
  if (dotCount !== 1 || !typeElement) return false
  const dot = createElementLike(doc, noteElement, 'dot')
  const children = [...(noteElement.children ?? [])]
  const typeIndex = children.indexOf(typeElement)
  const next = typeIndex >= 0 ? children[typeIndex + 1] ?? null : null
  noteElement.insertBefore(dot, next)
  return true
}

function patchNoteElement(doc, element, rootNote, targetNote) {
  const xmlRest = child(element, 'rest') !== null
  if (xmlRest !== Boolean(targetNote.isRest) || xmlRest !== Boolean(rootNote.isRest)) return false

  if (!xmlRest) {
    const pitch = child(element, 'pitch')
    const step = pitch ? child(pitch, 'step') : null
    const octave = pitch ? child(pitch, 'octave') : null
    if (!pitch || !step || !octave) return false
    setText(step, targetNote.step)
    ensurePitchAlter(doc, pitch, step, targetNote.alter ?? 0)
    setText(octave, targetNote.octave)

    const accidental = child(element, 'accidental')
    if (accidental) {
      const display = accidentalValue(targetNote.alter ?? 0)
      if (!display) return false
      setText(accidental, display)
    }
  }

  if (targetNote.durationValue !== null && targetNote.durationValue !== undefined) {
    const durationElement = child(element, 'duration')
    if (!durationElement) return false
    setText(durationElement, targetNote.durationValue)
  }

  if (typeof targetNote.duration === 'string') {
    const typeElement = child(element, 'type')
    const type = musicXmlType(targetNote.duration)
    if (!typeElement || !type) return false
    setText(typeElement, type)
    if (!patchDots(doc, element, targetNote.dotCount ?? 0, typeElement)) return false
  }

  if (
    Number.isInteger(targetNote.fret) &&
    Number.isInteger(rootNote.fret) &&
    targetNote.fret !== rootNote.fret
  ) {
    const notations = child(element, 'notations')
    const technical = notations ? child(notations, 'technical') : null
    const fret = technical ? child(technical, 'fret') : null
    if (!fret) return false
    setText(fret, targetNote.fret)
  }

  return true
}

function groupNotes(notes) {
  const groups = new Map()
  for (const note of notes) {
    const key = `${note.partId ?? ''}:${note.measureIndex ?? ''}`
    const list = groups.get(key) ?? []
    list.push(note)
    groups.set(key, list)
  }
  return groups
}

function materialize(sourceXml, rootNotes, targetNotes) {
  if (typeof DOMParser !== 'function' || typeof XMLSerializer !== 'function') return null
  const parser = new DOMParser()
  const doc = parser.parseFromString(sourceXml, 'application/xml')
  if (!doc || doc.querySelector?.('parsererror')) return null

  const rootGroups = groupNotes(rootNotes)
  const targetGroups = groupNotes(targetNotes)
  const parts = [...doc.querySelectorAll('part')]

  for (let partIndex = 0; partIndex < parts.length; partIndex++) {
    const part = parts[partIndex]
    const partId = part.getAttribute('id') || `P${partIndex + 1}`
    const measures = directChildren(part, 'measure')
    for (let measureIndex = 0; measureIndex < measures.length; measureIndex++) {
      const key = `${partId}:${measureIndex}`
      const rootMeasureNotes = rootGroups.get(key) ?? []
      const targetMeasureNotes = targetGroups.get(key) ?? []
      const xmlNotes = directChildren(measures[measureIndex], 'note')
      if (
        rootMeasureNotes.length !== xmlNotes.length ||
        targetMeasureNotes.length !== xmlNotes.length
      ) {
        return null
      }
      for (let noteIndex = 0; noteIndex < xmlNotes.length; noteIndex++) {
        if (!patchNoteElement(
          doc,
          xmlNotes[noteIndex],
          rootMeasureNotes[noteIndex],
          targetMeasureNotes[noteIndex],
        )) return null
      }
    }
  }

  return new XMLSerializer().serializeToString(doc)
}

function approximatelyEqual(left, right) {
  return typeof left === 'number' && typeof right === 'number' &&
    Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= EPSILON
}

function sameField(left, right, field) {
  if (field === 'beats' || field === 'startBeat' || field === 'frequency') {
    return approximatelyEqual(Number(left[field]), Number(right[field]))
  }
  return (left[field] ?? null) === (right[field] ?? null)
}

function parsedMatchesTarget(parsedNotes, targetNotes) {
  if (!Array.isArray(parsedNotes) || parsedNotes.length !== targetNotes.length) return false
  const commonFields = [
    'partId', 'partIndex', 'measureIndex', 'measureKey',
    'isRest', 'isGrace', 'isChordNote', 'voice', 'staff',
    'startBeat', 'durationValue', 'duration', 'beats', 'dotCount',
    'tieStart', 'tieStop', 'tieContinue',
  ]
  const pitchFields = ['step', 'alter', 'octave']

  for (let index = 0; index < targetNotes.length; index++) {
    const parsed = parsedNotes[index]
    const target = targetNotes[index]
    if (!isPlainObject(parsed) || !isPlainObject(target)) return false
    if (commonFields.some((field) => !sameField(parsed, target, field))) return false
    if (!target.isRest && pitchFields.some((field) => !sameField(parsed, target, field))) return false
  }
  return true
}

function selectPrimaryNotes(parsed) {
  if (!Array.isArray(parsed?.notes)) return []
  return parsed.primaryPartId
    ? parsed.notes.filter((note) => note.partId === parsed.primaryPartId)
    : parsed.notes
}

function buildEvidence({ history, sourceXml, target, canonicalizationEvidence, materializedXml }) {
  return Object.freeze({
    schemaVersion: STAGE_F_CORRECTED_MUSICXML_SCHEMA_VERSION,
    state: STAGE_F_CORRECTED_MUSICXML_STATE,
    historyId: history.historyId,
    sourceId: history.sourceId,
    sourceRevisionId: history.sourceRevisionId,
    targetRevisionId: target.revisionId,
    targetContentFingerprint: target.contentFingerprint,
    canonicalizationResultRevisionId: canonicalizationEvidence.resultRevisionId,
    sourceMusicXmlFingerprint: fingerprint('source-musicxml', sourceXml),
    correctedMusicXmlFingerprint: fingerprint('corrected-musicxml', materializedXml),
  })
}

export function materializeAndRevalidateStageFCorrectedMusicXml({
  history,
  sourceNotes,
  canonicalizationEvidence,
} = {}) {
  if (!isTeacherRevisionHistory(history) || !Array.isArray(sourceNotes)) {
    return result(STAGE_F_CORRECTED_MUSICXML_STATUS.INVALID_INPUT, 'history-and-source-notes-required')
  }
  if (!isStageFCanonicalizationEvidence(canonicalizationEvidence)) {
    return result(
      STAGE_F_CORRECTED_MUSICXML_STATUS.CANONICALIZATION_NOT_APPLICABLE,
      'canonicalization-evidence-invalid',
    )
  }

  const root = history.revisions[0]
  const target = getCurrentTeacherRevision(history)
  if (!sourceNotesMatchRoot(root, sourceNotes)) {
    return result(STAGE_F_CORRECTED_MUSICXML_STATUS.SOURCE_EVIDENCE_MISSING, 'source-notes-root-mismatch')
  }
  if (
    canonicalizationEvidence.resultRevisionId !== target.revisionId ||
    canonicalizationEvidence.resultContentFingerprint !== target.contentFingerprint
  ) {
    return result(
      STAGE_F_CORRECTED_MUSICXML_STATUS.CANONICALIZATION_NOT_APPLICABLE,
      'canonicalization-evidence-not-current',
    )
  }

  const source = resolveMusicXmlSourceForNotes(sourceNotes)
  if (
    !source ||
    source.notes !== sourceNotes ||
    source.provenance !== MUSICXML_SOURCE_PROVENANCE ||
    typeof source.musicXml !== 'string' ||
    source.musicXml.trim() === ''
  ) {
    return result(STAGE_F_CORRECTED_MUSICXML_STATUS.SOURCE_EVIDENCE_MISSING, 'exact-root-musicxml-source-required')
  }

  if (typeof DOMParser !== 'function' || typeof XMLSerializer !== 'function') {
    return result(STAGE_F_CORRECTED_MUSICXML_STATUS.DOM_RUNTIME_UNAVAILABLE, 'browser-xml-runtime-required')
  }

  const materializedXml = materialize(source.musicXml, root.content, target.content)
  if (!materializedXml) {
    return result(STAGE_F_CORRECTED_MUSICXML_STATUS.MATERIALIZATION_FAILED, 'bounded-musicxml-patch-failed')
  }

  const semanticParsed = parseMusicXml(materializedXml)
  const semanticNotes = selectPrimaryNotes(semanticParsed)
  if (semanticParsed?.error || !parsedMatchesTarget(semanticNotes, target.content)) {
    return result(STAGE_F_CORRECTED_MUSICXML_STATUS.REPARSE_MISMATCH, 'materialized-musicxml-does-not-represent-target')
  }

  const structuralParsed = parseMusicXmlWithStructure(materializedXml)
  if (structuralParsed?.error) {
    return result(STAGE_F_CORRECTED_MUSICXML_STATUS.STRUCTURAL_VALIDATION_FAILED, 'corrected-structural-parse-failed')
  }
  const structuralEvidence = extractMusicXmlStructuralEvidence(materializedXml)
  if (!structuralEvidence?.ok) {
    return result(STAGE_F_CORRECTED_MUSICXML_STATUS.STRUCTURAL_VALIDATION_FAILED, 'structural-evidence-failed')
  }

  let validationScore
  try {
    validationScore = attachStructuralEvidence(structuralParsed, structuralEvidence)
  } catch {
    return result(STAGE_F_CORRECTED_MUSICXML_STATUS.STRUCTURAL_VALIDATION_FAILED, 'structural-evidence-attachment-failed')
  }
  const validation = validateStructuralRhythm(validationScore)
  if (
    validation?.valid !== true ||
    validation.summary?.totalFindings !== 0 ||
    validation.summary?.errors !== 0 ||
    validation.summary?.warnings !== 0
  ) {
    return result(STAGE_F_CORRECTED_MUSICXML_STATUS.STRUCTURAL_VALIDATION_FAILED, 'corrected-structural-validation-failed')
  }

  const evidence = buildEvidence({
    history,
    sourceXml: source.musicXml,
    target,
    canonicalizationEvidence,
    materializedXml,
  })
  return result(STAGE_F_CORRECTED_MUSICXML_STATUS.MATERIALIZED, null, {
    musicXml: materializedXml,
    evidence,
  })
}
