// Package 2A canonical consumer contract for SesliTab.
//
// This module does not change any existing TTS, playback, TAB, HTML, or OMR
// behavior. It gives those consumers one shared, fail-closed way to interpret
// the canonical NoteObject verification policy before later integration work.

import {
  CANONICAL_CONSUMPTION_DECISION,
  resolveCanonicalConsumptionPolicy,
} from './noteTheory.js'

export const CANONICAL_CONSUMER_TYPE = Object.freeze({
  RHYTHMIC_TEXT: 'rhythmic-text',
  RHYTHMIC_HTML: 'rhythmic-html',
  TTS: 'tts',
  PLAYBACK: 'playback',
  GUITAR_TAB: 'guitar-tab',
})

export const CANONICAL_CONSUMER_TYPES = Object.freeze(
  Object.values(CANONICAL_CONSUMER_TYPE),
)

function assertCanonicalConsumerType(consumerType) {
  if (!CANONICAL_CONSUMER_TYPES.includes(consumerType)) {
    throw new TypeError(
      `Unsupported canonical consumer type: ${String(consumerType)}`,
    )
  }
}

/**
 * Resolve the shared NoteObject policy for one named consumer boundary.
 *
 * The consumer name is intentionally informational only in Package 2A:
 * every consumer must receive exactly the same underlying canonical policy.
 * Consumer-specific enforcement belongs to later quality-gate integration.
 *
 * @param {Object} note
 * @param {string} consumerType
 * @returns {Object}
 */
export function resolveCanonicalConsumerPolicy(
  note,
  consumerType,
) {
  assertCanonicalConsumerType(consumerType)

  const policy = resolveCanonicalConsumptionPolicy(note)

  return Object.freeze({
    consumerType,
    ...policy,
  })
}

/**
 * Produce a non-mutating inventory of notes for one consumer boundary.
 *
 * - definitive: verified canonical data only
 * - review: allowed but non-definitive data (partial or legacy)
 * - blocked: invalid/malformed canonical data
 *
 * No note is silently repaired, promoted, removed, or reordered.
 *
 * @param {Object[]} notes
 * @param {string} consumerType
 * @returns {Object}
 */
export function classifyCanonicalNotesForConsumer(
  notes,
  consumerType,
) {
  assertCanonicalConsumerType(consumerType)

  if (!Array.isArray(notes)) {
    throw new TypeError(
      'Canonical consumer classification requires a note array.',
    )
  }

  const definitive = []
  const review = []
  const blocked = []
  const decisions = []

  for (const note of notes) {
    const policy = resolveCanonicalConsumerPolicy(
      note,
      consumerType,
    )

    const entry = Object.freeze({
      note,
      policy,
    })

    decisions.push(entry)

    if (
      policy.decision ===
        CANONICAL_CONSUMPTION_DECISION.BLOCK ||
      policy.allowed !== true
    ) {
      blocked.push(entry)
    } else if (policy.definitive === true) {
      definitive.push(entry)
    } else {
      review.push(entry)
    }
  }

  return Object.freeze({
    consumerType,
    decisions: Object.freeze(decisions),
    definitive: Object.freeze(definitive),
    review: Object.freeze(review),
    blocked: Object.freeze(blocked),
  })
}
