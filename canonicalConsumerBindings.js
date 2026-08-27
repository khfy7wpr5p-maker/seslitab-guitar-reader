// Package 2A canonical consumer boundary inventory for SesliTab.
//
// This module maps the shared canonical consumer vocabulary to the current
// production NoteObject boundaries without changing their runtime behavior.
// It intentionally records missing boundaries as pending instead of inventing
// adapters or silently promoting test-only projections into production code.

import {
  CANONICAL_CONSUMER_TYPE,
  CANONICAL_CONSUMER_TYPES,
} from './canonicalConsumerPolicy.js'

export const CANONICAL_CONSUMER_BOUNDARY_STATUS = Object.freeze({
  MAPPED: 'mapped',
  PENDING: 'pending',
})

function freezeBinding(binding) {
  return Object.freeze({ ...binding })
}

export const CANONICAL_CONSUMER_BOUNDARIES = Object.freeze({
  [CANONICAL_CONSUMER_TYPE.RHYTHMIC_TEXT]: freezeBinding({
    consumerType: CANONICAL_CONSUMER_TYPE.RHYTHMIC_TEXT,
    modulePath: 'rhythmicTextGenerator.js',
    exportName: 'formatNoteAsText',
    noteInput: 'single-note',
    status: CANONICAL_CONSUMER_BOUNDARY_STATUS.MAPPED,
    enforcementReady: false,
  }),
  [CANONICAL_CONSUMER_TYPE.RHYTHMIC_HTML]: freezeBinding({
    consumerType: CANONICAL_CONSUMER_TYPE.RHYTHMIC_HTML,
    modulePath: 'rhythmicTextGenerator.js',
    exportName: 'formatNoteAsHtmlText',
    noteInput: 'single-note',
    status: CANONICAL_CONSUMER_BOUNDARY_STATUS.MAPPED,
    enforcementReady: false,
  }),
  [CANONICAL_CONSUMER_TYPE.TTS]: freezeBinding({
    consumerType: CANONICAL_CONSUMER_TYPE.TTS,
    modulePath: 'rhythmicTextGenerator.js',
    exportName: 'generateTurkishRhythmicSpokenText',
    noteInput: 'note-array',
    status: CANONICAL_CONSUMER_BOUNDARY_STATUS.MAPPED,
    enforcementReady: false,
  }),
  [CANONICAL_CONSUMER_TYPE.PLAYBACK]: freezeBinding({
    consumerType: CANONICAL_CONSUMER_TYPE.PLAYBACK,
    modulePath: 'src/services/voiceService.js',
    exportName: 'buildRhythmSchedule',
    noteInput: 'note-array',
    status: CANONICAL_CONSUMER_BOUNDARY_STATUS.MAPPED,
    enforcementReady: false,
  }),
  [CANONICAL_CONSUMER_TYPE.GUITAR_TAB]: freezeBinding({
    consumerType: CANONICAL_CONSUMER_TYPE.GUITAR_TAB,
    modulePath: 'src/services/guitarTabConsumer.js',
    exportName: 'buildQualityGatedBasicGuitarTab',
    noteInput: 'note-array',
    status: CANONICAL_CONSUMER_BOUNDARY_STATUS.MAPPED,
    enforcementReady: true,
  }),
  [CANONICAL_CONSUMER_TYPE.VIOLIN]: freezeBinding({
    consumerType: CANONICAL_CONSUMER_TYPE.VIOLIN,
    modulePath: 'src/services/violinConsumer.js',
    exportName: 'buildQualityGatedBasicViolin',
    noteInput: 'note-array',
    status: CANONICAL_CONSUMER_BOUNDARY_STATUS.MAPPED,
    enforcementReady: true,
  }),
})

export const CANONICAL_CONSUMER_BOUNDARY_LIST = Object.freeze(
  CANONICAL_CONSUMER_TYPES.map((consumerType) =>
    CANONICAL_CONSUMER_BOUNDARIES[consumerType],
  ),
)

export function getCanonicalConsumerBoundary(consumerType) {
  if (!CANONICAL_CONSUMER_TYPES.includes(consumerType)) {
    throw new TypeError(
      `Unsupported canonical consumer type: ${String(consumerType)}`,
    )
  }

  const boundary = CANONICAL_CONSUMER_BOUNDARIES[consumerType]
  if (!boundary) {
    throw new Error(
      `Canonical consumer boundary is not registered: ${consumerType}`,
    )
  }

  return boundary
}

export function isCanonicalConsumerBoundaryMapped(consumerType) {
  return (
    getCanonicalConsumerBoundary(consumerType).status ===
    CANONICAL_CONSUMER_BOUNDARY_STATUS.MAPPED
  )
}
