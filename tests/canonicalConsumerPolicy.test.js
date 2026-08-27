import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CANONICAL_CONSUMPTION_DECISION,
  CANONICAL_NOTE_SCHEMA_VERSION,
  CANONICAL_VERIFICATION_STATUS,
} from '../noteTheory.js'
import {
  CANONICAL_CONSUMER_TYPE,
  CANONICAL_CONSUMER_TYPES,
  classifyCanonicalNotesForConsumer,
  resolveCanonicalConsumerPolicy,
} from '../canonicalConsumerPolicy.js'

function verificationState(status) {
  if (status === CANONICAL_VERIFICATION_STATUS.VERIFIED) {
    return {
      schemaVersion: CANONICAL_NOTE_SCHEMA_VERSION,
      status,
      pitch: {
        valid: true,
        status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
      },
      time: {
        valid: true,
        status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
      },
    }
  }

  if (status === CANONICAL_VERIFICATION_STATUS.PARTIAL) {
    return {
      schemaVersion: CANONICAL_NOTE_SCHEMA_VERSION,
      status,
      pitch: {
        valid: true,
        status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
      },
      time: {
        valid: true,
        status: CANONICAL_VERIFICATION_STATUS.PARTIAL,
      },
    }
  }

  return {
    schemaVersion: CANONICAL_NOTE_SCHEMA_VERSION,
    status: CANONICAL_VERIFICATION_STATUS.INVALID,
    pitch: {
      valid: false,
      status: CANONICAL_VERIFICATION_STATUS.INVALID,
    },
    time: {
      valid: true,
      status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    },
  }
}

function canonicalNote(status) {
  return {
    noteName: 'Mi',
    sourceVerificationState: verificationState(status),
  }
}

function withoutConsumer(policy) {
  const { consumerType, ...shared } = policy
  return shared
}

describe('Package 2A canonical consumer policy contract', () => {
  test('consumer vocabulary is immutable and covers the required boundaries', () => {
    assert.deepEqual(CANONICAL_CONSUMER_TYPES, [
      'rhythmic-text',
      'rhythmic-html',
      'tts',
      'playback',
      'guitar-tab',
    ])
    assert.equal(Object.isFrozen(CANONICAL_CONSUMER_TYPE), true)
    assert.equal(Object.isFrozen(CANONICAL_CONSUMER_TYPES), true)
  })

  test('verified notes receive the same definitive accept decision everywhere', () => {
    const note = canonicalNote(CANONICAL_VERIFICATION_STATUS.VERIFIED)
    const policies = CANONICAL_CONSUMER_TYPES.map((consumerType) =>
      resolveCanonicalConsumerPolicy(note, consumerType),
    )

    const baseline = withoutConsumer(policies[0])
    for (const policy of policies) {
      assert.deepEqual(withoutConsumer(policy), baseline)
      assert.equal(policy.decision, CANONICAL_CONSUMPTION_DECISION.ACCEPT)
      assert.equal(policy.allowed, true)
      assert.equal(policy.definitive, true)
      assert.equal(policy.requiresReview, false)
    }
  })

  test('partial notes remain review-required for every consumer', () => {
    const note = canonicalNote(CANONICAL_VERIFICATION_STATUS.PARTIAL)

    for (const consumerType of CANONICAL_CONSUMER_TYPES) {
      const policy = resolveCanonicalConsumerPolicy(note, consumerType)
      assert.equal(policy.decision, CANONICAL_CONSUMPTION_DECISION.REVIEW)
      assert.equal(policy.allowed, true)
      assert.equal(policy.definitive, false)
      assert.equal(policy.requiresReview, true)
    }
  })

  test('invalid notes are blocked for every consumer', () => {
    const note = canonicalNote(CANONICAL_VERIFICATION_STATUS.INVALID)

    for (const consumerType of CANONICAL_CONSUMER_TYPES) {
      const policy = resolveCanonicalConsumerPolicy(note, consumerType)
      assert.equal(policy.decision, CANONICAL_CONSUMPTION_DECISION.BLOCK)
      assert.equal(policy.allowed, false)
      assert.equal(policy.definitive, false)
      assert.equal(policy.requiresReview, true)
    }
  })

  test('legacy notes stay usable but never become definitive', () => {
    const legacy = { noteName: 'Mi' }

    for (const consumerType of CANONICAL_CONSUMER_TYPES) {
      const policy = resolveCanonicalConsumerPolicy(legacy, consumerType)
      assert.equal(policy.decision, CANONICAL_CONSUMPTION_DECISION.LEGACY)
      assert.equal(policy.allowed, true)
      assert.equal(policy.definitive, false)
      assert.equal(policy.requiresReview, true)
    }
  })

  test('classification preserves order and separates definitive, review and blocked notes', () => {
    const verified = canonicalNote(CANONICAL_VERIFICATION_STATUS.VERIFIED)
    const partial = canonicalNote(CANONICAL_VERIFICATION_STATUS.PARTIAL)
    const legacy = { noteName: 'Sol' }
    const invalid = canonicalNote(CANONICAL_VERIFICATION_STATUS.INVALID)
    const notes = [verified, partial, legacy, invalid]
    const before = structuredClone(notes)

    const result = classifyCanonicalNotesForConsumer(
      notes,
      CANONICAL_CONSUMER_TYPE.TTS,
    )

    assert.deepEqual(notes, before)
    assert.deepEqual(
      result.decisions.map((entry) => entry.note),
      notes,
    )
    assert.deepEqual(
      result.definitive.map((entry) => entry.note),
      [verified],
    )
    assert.deepEqual(
      result.review.map((entry) => entry.note),
      [partial, legacy],
    )
    assert.deepEqual(
      result.blocked.map((entry) => entry.note),
      [invalid],
    )
  })

  test('unsupported consumer types fail closed', () => {
    const note = canonicalNote(CANONICAL_VERIFICATION_STATUS.VERIFIED)

    for (const consumerType of [undefined, null, '', 'unknown', 1]) {
      assert.throws(
        () => resolveCanonicalConsumerPolicy(note, consumerType),
        /Unsupported canonical consumer type/,
      )
    }
  })

  test('classification rejects non-array inputs without touching consumer code', () => {
    for (const notes of [undefined, null, {}, 'notes', 1]) {
      assert.throws(
        () => classifyCanonicalNotesForConsumer(
          notes,
          CANONICAL_CONSUMER_TYPE.PLAYBACK,
        ),
        /requires a note array/,
      )
    }
  })
})
