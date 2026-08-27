import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CANONICAL_CONSUMER_TYPE,
  CANONICAL_CONSUMER_TYPES,
} from '../canonicalConsumerPolicy.js'
import {
  CANONICAL_CONSUMER_BOUNDARIES,
  CANONICAL_CONSUMER_BOUNDARY_LIST,
  CANONICAL_CONSUMER_BOUNDARY_STATUS,
  getCanonicalConsumerBoundary,
  isCanonicalConsumerBoundaryMapped,
} from '../canonicalConsumerBindings.js'
import {
  formatNoteAsHtmlText,
  formatNoteAsText,
  generateTurkishRhythmicSpokenText,
} from '../rhythmicTextGenerator.js'
import { buildRhythmSchedule } from '../src/services/voiceService.js'

describe('Package 2A canonical consumer boundary bindings', () => {
  test('inventory is immutable and covers every canonical consumer type exactly once', () => {
    assert.equal(Object.isFrozen(CANONICAL_CONSUMER_BOUNDARIES), true)
    assert.equal(Object.isFrozen(CANONICAL_CONSUMER_BOUNDARY_LIST), true)
    assert.equal(CANONICAL_CONSUMER_BOUNDARY_LIST.length, CANONICAL_CONSUMER_TYPES.length)
    assert.deepEqual(
      CANONICAL_CONSUMER_BOUNDARY_LIST.map((entry) => entry.consumerType),
      CANONICAL_CONSUMER_TYPES,
    )

    for (const entry of CANONICAL_CONSUMER_BOUNDARY_LIST) {
      assert.equal(Object.isFrozen(entry), true)
    }
  })

  test('rhythmic text boundary maps to the existing production export', () => {
    const boundary = getCanonicalConsumerBoundary(
      CANONICAL_CONSUMER_TYPE.RHYTHMIC_TEXT,
    )

    assert.equal(boundary.modulePath, 'rhythmicTextGenerator.js')
    assert.equal(boundary.exportName, 'formatNoteAsText')
    assert.equal(boundary.status, CANONICAL_CONSUMER_BOUNDARY_STATUS.MAPPED)
    assert.equal(typeof formatNoteAsText, 'function')
  })

  test('rhythmic HTML boundary maps to the existing production export', () => {
    const boundary = getCanonicalConsumerBoundary(
      CANONICAL_CONSUMER_TYPE.RHYTHMIC_HTML,
    )

    assert.equal(boundary.modulePath, 'rhythmicTextGenerator.js')
    assert.equal(boundary.exportName, 'formatNoteAsHtmlText')
    assert.equal(boundary.status, CANONICAL_CONSUMER_BOUNDARY_STATUS.MAPPED)
    assert.equal(typeof formatNoteAsHtmlText, 'function')
  })

  test('TTS boundary maps to the existing NoteObject-to-spoken-text export', () => {
    const boundary = getCanonicalConsumerBoundary(CANONICAL_CONSUMER_TYPE.TTS)

    assert.equal(boundary.modulePath, 'rhythmicTextGenerator.js')
    assert.equal(boundary.exportName, 'generateTurkishRhythmicSpokenText')
    assert.equal(boundary.status, CANONICAL_CONSUMER_BOUNDARY_STATUS.MAPPED)
    assert.equal(typeof generateTurkishRhythmicSpokenText, 'function')
  })

  test('playback boundary maps to the pure production schedule builder', () => {
    const boundary = getCanonicalConsumerBoundary(
      CANONICAL_CONSUMER_TYPE.PLAYBACK,
    )

    assert.equal(boundary.modulePath, 'src/services/voiceService.js')
    assert.equal(boundary.exportName, 'buildRhythmSchedule')
    assert.equal(boundary.status, CANONICAL_CONSUMER_BOUNDARY_STATUS.MAPPED)
    assert.equal(typeof buildRhythmSchedule, 'function')
  })

  test('Guitar TAB canonical consumer gap is explicit and fail-closed', () => {
    const boundary = getCanonicalConsumerBoundary(
      CANONICAL_CONSUMER_TYPE.GUITAR_TAB,
    )

    assert.equal(boundary.status, CANONICAL_CONSUMER_BOUNDARY_STATUS.PENDING)
    assert.equal(boundary.modulePath, null)
    assert.equal(boundary.exportName, null)
    assert.equal(boundary.enforcementReady, false)
    assert.match(boundary.reason, /No production canonical NoteObject to Guitar TAB consumer/)
    assert.equal(isCanonicalConsumerBoundaryMapped(CANONICAL_CONSUMER_TYPE.GUITAR_TAB), false)
  })

  test('mapped boundaries remain inventory-only and do not claim enforcement readiness', () => {
    for (const consumerType of [
      CANONICAL_CONSUMER_TYPE.RHYTHMIC_TEXT,
      CANONICAL_CONSUMER_TYPE.RHYTHMIC_HTML,
      CANONICAL_CONSUMER_TYPE.TTS,
      CANONICAL_CONSUMER_TYPE.PLAYBACK,
    ]) {
      const boundary = getCanonicalConsumerBoundary(consumerType)
      assert.equal(isCanonicalConsumerBoundaryMapped(consumerType), true)
      assert.equal(boundary.enforcementReady, false)
    }
  })

  test('unsupported consumer types fail closed', () => {
    assert.throws(
      () => getCanonicalConsumerBoundary('unknown-consumer'),
      /Unsupported canonical consumer type/,
    )
    assert.throws(
      () => isCanonicalConsumerBoundaryMapped('unknown-consumer'),
      /Unsupported canonical consumer type/,
    )
  })
})
