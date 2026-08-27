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

  test('tuplet and beam survive fresh creation while verification is invalidated', () => {
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
    assert.equal(note.sourceVerificationState, null)
    assert.deepEqual(input, before)

    const policy = resolveCanonicalConsumptionPolicy(note)
    assert.equal(policy.definitive, false)
    assert.equal(policy.status, 'unverified')
  })

  test('rebuilding edited verified data invalidates stale verification', () => {
    const original = createCanonicalNote({
      stringLetter: 'B',
      fret: 1,
      duration: 'quarter',
    })
    const verifiedNote = {
      ...original,
      sourceVerificationState: verifiedState(),
    }

    const rebuilt = createCanonicalNote({
      ...verifiedNote,
      fret: 3,
    })

    assert.equal(rebuilt.fret, 3)
    assert.equal(rebuilt.sourceVerificationState, null)

    const policy = resolveCanonicalConsumptionPolicy(rebuilt)
    assert.equal(policy.definitive, false)
    assert.equal(policy.status, 'unverified')
    assert.equal(policy.requiresReview, true)
  })

  test('lossless canonical clone preserves canonical-only metadata', () => {
    const source = {
      ...createCanonicalNote({
        stringLetter: 'B',
        fret: 1,
        duration: 'quarter',
        tuplet: { actualNotes: 5, normalNotes: 4 },
        beam: { number: 1, value: 'continue' },
      }),
      sourceVerificationState: verifiedState(),
    }

    const clone = cloneCanonicalNote(source)

    assert.equal(clone.fret, source.fret)
    assert.equal(clone.midi, source.midi)
    assert.deepEqual(clone.tuplet, source.tuplet)
    assert.deepEqual(clone.beam, source.beam)
    assert.deepEqual(
      clone.sourceVerificationState,
      source.sourceVerificationState,
    )
    assert.notEqual(clone, source)
  })

  test('canonical clone rejects overrides until validated edit semantics exist', () => {
    const source = {
      ...createCanonicalNote({
        stringLetter: 'B',
        fret: 1,
        duration: 'quarter',
      }),
      sourceVerificationState: verifiedState(),
    }

    assert.throws(
      () => cloneCanonicalNote(source, { fret: 3 }),
      /require validated edit semantics/,
    )

    assert.equal(source.fret, 1)
    assert.deepEqual(
      source.sourceVerificationState,
      verifiedState(),
    )
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

    const source = createCanonicalNote({
      stringLetter: 'e',
      fret: 0,
      duration: 'quarter',
    })

    for (const overrides of [null, [], 'edit', 1]) {
      assert.throws(
        () => cloneCanonicalNote(source, overrides),
        /overrides must be an object/,
      )
    }
  })
})
