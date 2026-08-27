import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CANONICAL_NOTE_FIELDS,
  CANONICAL_NOTE_SCHEMA_VERSION,
  CANONICAL_VERIFICATION_STATUS,
  resolveCanonicalConsumptionPolicy,
} from '../noteTheory.js'
import {
  cloneCanonicalNote,
  createCanonicalNote,
} from '../canonicalNoteModel.js'

function verifiedState() {
  return {
    schemaVersion: CANONICAL_NOTE_SCHEMA_VERSION,
    status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    pitch: {
      valid: true,
      status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
      authority: 'test',
      source: 'test',
      reason: null,
    },
    time: {
      valid: true,
      status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
      authority: 'test',
      source: 'test',
      reason: null,
    },
  }
}

describe('Package 2A canonical NoteObject preservation boundary', () => {
  test('new canonical notes expose every canonical field', () => {
    const note = createCanonicalNote({
      stringLetter: 'e',
      fret: 0,
      duration: 'quarter',
    })

    for (const field of CANONICAL_NOTE_FIELDS) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(note, field),
        true,
        `missing canonical field: ${field}`,
      )
    }
  })

  test('tuplet, beam and verification metadata survive canonical creation', () => {
    const sourceVerificationState = verifiedState()
    const tuplet = { actualNotes: 3, normalNotes: 2 }
    const beam = { number: 1, value: 'begin' }
    const input = {
      stringLetter: 'e',
      fret: 0,
      duration: 'eighth',
      tuplet,
      beam,
      sourceVerificationState,
    }
    const before = structuredClone(input)

    const note = createCanonicalNote(input)

    assert.deepEqual(note.tuplet, tuplet)
    assert.deepEqual(note.beam, beam)
    assert.deepEqual(
      note.sourceVerificationState,
      sourceVerificationState,
    )
    assert.deepEqual(input, before)
  })

  test('canonical clone preserves canonical-only metadata and applies explicit overrides', () => {
    const source = createCanonicalNote({
      stringLetter: 'B',
      fret: 1,
      duration: 'quarter',
      tuplet: { actualNotes: 5, normalNotes: 4 },
      beam: { number: 1, value: 'continue' },
      sourceVerificationState: verifiedState(),
    })

    const clone = cloneCanonicalNote(source, { fret: 3 })

    assert.equal(clone.fret, 3)
    assert.deepEqual(clone.tuplet, source.tuplet)
    assert.deepEqual(clone.beam, source.beam)
    assert.deepEqual(
      clone.sourceVerificationState,
      source.sourceVerificationState,
    )
    assert.notEqual(clone, source)
  })

  test('missing verification metadata stays unverified and non-definitive', () => {
    const note = createCanonicalNote({
      stringLetter: 'G',
      fret: 2,
      duration: 'quarter',
    })

    assert.equal(note.sourceVerificationState, null)

    const policy = resolveCanonicalConsumptionPolicy(note)

    assert.equal(policy.applicable, false)
    assert.equal(policy.status, 'unverified')
    assert.equal(policy.decision, 'legacy')
    assert.equal(policy.allowed, true)
    assert.equal(policy.definitive, false)
    assert.equal(policy.requiresReview, true)
  })

  test('invalid clone inputs fail closed', () => {
    for (const value of [null, [], 'note', 64]) {
      assert.throws(
        () => cloneCanonicalNote(value),
        /requires a note object/,
      )
    }
  })
})
