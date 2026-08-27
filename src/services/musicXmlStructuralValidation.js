// Package 2B — MusicXML structural-validation adapter.
//
// Production parsing/output remains unchanged. Validation-only MusicXML
// evidence is attached to shallow clones, then passed to the read-only
// structural validator.

import { parseMusicXmlWithStructure } from '../../musicXmlParser.js'
import { extractMusicXmlStructuralEvidence } from './musicXmlStructuralEvidence.js'
import { validateStructuralRhythm } from './structuralRhythmValidator.js'

function identityKey(value) {
  return `${value?.partId ?? ''}:${value?.measureIndex ?? ''}`
}

function groupNoteEvidence(entries) {
  const groups = new Map()
  for (const entry of entries || []) {
    const key = identityKey(entry)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(entry)
  }
  return groups
}

function mapDivisionsEvidence(entries) {
  const map = new Map()
  for (const entry of entries || []) {
    map.set(identityKey(entry), entry)
  }
  return map
}

/**
 * Attach validation-only evidence without mutating the parser result.
 * Invalid explicit divisions declarations intentionally make only the
 * validation clone's effective divisions unknown. Production timing stays
 * untouched while Package 2B can fail closed on the malformed declaration.
 */
export function attachStructuralEvidence(structuredScore, evidence) {
  if (!structuredScore || typeof structuredScore !== 'object' || Array.isArray(structuredScore)) {
    throw new TypeError('structuredScore must be an object')
  }
  if (!evidence?.ok) {
    throw new TypeError('valid structural evidence is required')
  }

  const evidenceGroups = groupNoteEvidence(evidence.noteEvidence)
  const consumed = new Map()

  const notes = (structuredScore.notes || []).map((note) => {
    const key = identityKey(note)
    const noteIndex = consumed.get(key) || 0
    const group = evidenceGroups.get(key) || []
    const entry = group[noteIndex]

    if (!entry) {
      throw new Error(`structural-evidence-note-count-mismatch:${key}`)
    }

    consumed.set(key, noteIndex + 1)
    return {
      ...note,
      tuplet: entry.tuplet ?? note.tuplet ?? null,
      beam: entry.beam ?? note.beam ?? null,
    }
  })

  for (const [key, group] of evidenceGroups) {
    if ((consumed.get(key) || 0) !== group.length) {
      throw new Error(`structural-evidence-note-count-mismatch:${key}`)
    }
  }

  const divisionsEvidence = mapDivisionsEvidence(evidence.divisionsDeclarations)
  const divisionsByMeasure = (structuredScore.divisionsByMeasure || []).map((entry) => {
    const declaration = divisionsEvidence.get(identityKey(entry))
    if (!declaration) return { ...entry }

    return {
      ...entry,
      divisions: declaration.present && declaration.valid === false
        ? null
        : entry.divisions,
      divisionsDeclarationPresent: declaration.present,
      divisionsDeclarationRaw: declaration.raw,
      divisionsDeclarationValue: declaration.value,
      divisionsDeclarationValid: declaration.valid,
    }
  })

  return {
    ...structuredScore,
    notes,
    divisionsByMeasure,
  }
}

/**
 * Parse and validate MusicXML without wiring the result into any consumer.
 *
 * @param {string} musicXmlString
 * @param {Object} options
 * @returns {Object}
 */
export function validateMusicXmlStructuralRhythm(musicXmlString, options = {}) {
  const structuredScore = parseMusicXmlWithStructure(musicXmlString)
  if (structuredScore.error) {
    return Object.freeze({
      ok: false,
      error: structuredScore.error,
      findings: Object.freeze([]),
    })
  }

  const evidence = extractMusicXmlStructuralEvidence(musicXmlString)
  if (!evidence.ok) {
    return Object.freeze({
      ok: false,
      error: evidence.error,
      findings: Object.freeze([]),
    })
  }

  try {
    const validationScore = attachStructuralEvidence(structuredScore, evidence)
    const validation = validateStructuralRhythm(validationScore, options)

    return Object.freeze({
      ok: true,
      ...validation,
      evidence,
    })
  } catch {
    return Object.freeze({
      ok: false,
      error: 'MusicXML yapısal kanıtı güvenli biçimde eşleştirilemedi.',
      findings: Object.freeze([]),
    })
  }
}
