// S06 — exact visual/canonical selection identity safety boundary.
//
// This module never infers musical truth from pitch labels, SVG proximity, or
// nearest-note heuristics. It accepts only the existing exact canonical note
// identity + renderer ScoreNoteRef contract and optional immutable teacher
// revision identity. Any ambiguous, stale, incomplete, or mismatched evidence
// fails closed.

import { deriveCanonicalNoteSelection } from './canonicalNoteSelection.js'
import { validateRendererScoreNoteRef } from './scoreNoteIdentity.js'

const REVISION_IDENTITY_FIELDS = Object.freeze([
  'sourceId',
  'sourceRevisionId',
  'revisionId',
  'contentFingerprint',
])

const STRUCTURAL_NOTE_FIELDS = Object.freeze([
  'measureKey',
  'partId',
  'partIndex',
  'measureIndex',
  'voice',
  'staff',
  'startBeat',
  'isRest',
  'isGrace',
  'isChordNote',
])

function requiredIdentityText(value) {
  return typeof value === 'string' && value.trim() && value.trim() === value
    ? value
    : null
}

export function createStageS06RevisionIdentity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const identity = {}
  for (const field of REVISION_IDENTITY_FIELDS) {
    const normalized = requiredIdentityText(value[field])
    if (!normalized) return null
    identity[field] = normalized
  }
  return Object.freeze(identity)
}

export function sameStageS06RevisionIdentity(left, right) {
  if (left === null || right === null) return left === right
  const a = createStageS06RevisionIdentity(left)
  const b = createStageS06RevisionIdentity(right)
  if (!a || !b) return false
  return REVISION_IDENTITY_FIELDS.every((field) => a[field] === b[field])
}

export function sameStageS06ScoreNoteRef(left, right) {
  const a = validateRendererScoreNoteRef(left)
  const b = validateRendererScoreNoteRef(right)
  if (!a || !b) return false
  return (
    a.partId === b.partId &&
    a.measureIndex === b.measureIndex &&
    a.noteIndex === b.noteIndex &&
    a.voice === b.voice
  )
}

export function buildStageS06SelectionIdentity({
  notes,
  measureKey,
  noteIndex,
  revisionIdentity = null,
  rendererTarget = null,
  interaction = 'canonical-control',
} = {}) {
  const selection = deriveCanonicalNoteSelection(notes, measureKey, noteIndex)
  if (!selection.selected || !selection.note || !selection.rendererTarget) return null

  if (rendererTarget !== null) {
    const provided = validateRendererScoreNoteRef(rendererTarget)
    if (!provided || !sameStageS06ScoreNoteRef(provided, selection.rendererTarget)) return null
  }

  const boundRevision = revisionIdentity === null
    ? null
    : createStageS06RevisionIdentity(revisionIdentity)
  if (revisionIdentity !== null && !boundRevision) return null

  const normalizedInteraction = typeof interaction === 'string' && interaction.trim()
    ? interaction.trim()
    : 'canonical-control'

  return Object.freeze({
    notes,
    note: selection.note,
    measureKey: selection.measureKey,
    noteIndex: selection.noteIndex,
    rendererTarget: selection.rendererTarget,
    revisionIdentity: boundRevision,
    interaction: normalizedInteraction,
  })
}

export function isStageS06SelectionCurrent(snapshot, { requireRevision = false } = {}) {
  if (!snapshot || !Array.isArray(snapshot.notes)) return false
  const identity = snapshot.selectedNoteIdentity
  if (!identity || identity.notes !== snapshot.notes) return false
  if (identity.noteIndex !== snapshot.selectedNoteIndex) return false
  if (identity.measureKey !== snapshot.selectedMeasureKey) return false
  if (snapshot.notes[identity.noteIndex] !== identity.note) return false
  if (!sameStageS06RevisionIdentity(identity.revisionIdentity, snapshot.revisionIdentity)) return false
  if (requireRevision && !identity.revisionIdentity) return false

  const rebuilt = buildStageS06SelectionIdentity({
    notes: snapshot.notes,
    measureKey: snapshot.selectedMeasureKey,
    noteIndex: snapshot.selectedNoteIndex,
    revisionIdentity: snapshot.revisionIdentity,
    rendererTarget: identity.rendererTarget,
    interaction: identity.interaction,
  })
  return Boolean(rebuilt && rebuilt.note === identity.note)
}

function sameStructuralNoteIdentity(sourceNote, revisionNote) {
  if (!sourceNote || !revisionNote || typeof sourceNote !== 'object' || typeof revisionNote !== 'object') {
    return false
  }
  return STRUCTURAL_NOTE_FIELDS.every((field) => Object.is(sourceNote[field], revisionNote[field]))
}

export function stageS06SelectionMatchesRevision(snapshot, revision) {
  if (!isStageS06SelectionCurrent(snapshot, { requireRevision: true })) return false
  const revisionIdentity = createStageS06RevisionIdentity(revision)
  if (!revisionIdentity || !sameStageS06RevisionIdentity(snapshot.revisionIdentity, revisionIdentity)) return false
  if (!Array.isArray(revision?.content)) return false

  const index = snapshot.selectedNoteIndex
  if (!Number.isSafeInteger(index) || index < 0 || index >= revision.content.length) return false
  return sameStructuralNoteIdentity(snapshot.notes[index], revision.content[index])
}
