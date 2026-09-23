import {
  CHORD_BOARD_SOURCE_KIND,
  isChordBoardVoicingSnapshot,
  normalizeChordBoardVoicingSnapshot,
} from './chordBoardVoicingCanonical.js'
import {
  assertStrictInputObject,
  isStrictFrozenRecord,
  normalizeRequiredId,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

export const CHORD_BOARD_ASSIGNMENT_SOURCE_SCHEMA_VERSION = 1

const INPUT_FIELDS = Object.freeze([
  'studentId',
  'snapshot',
  'boundAt',
])

const RECORD_FIELDS = Object.freeze([
  'schemaVersion',
  'sourceKind',
  'studentId',
  'snapshot',
  'voicingFingerprint',
  'boundAt',
])

const WIRE_FIELDS = RECORD_FIELDS

function normalizeFingerprint(value) {
  if (
    typeof value !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value)
  ) {
    throw new TypeError(
      'voicingFingerprint must be lowercase SHA-256 hex.',
    )
  }
  return value
}

export function createChordBoardAssignmentSourceBinding(
  input = {},
) {
  assertStrictInputObject(
    input,
    INPUT_FIELDS,
    'ChordBoardAssignmentSourceBinding',
  )

  if (!isChordBoardVoicingSnapshot(input.snapshot)) {
    throw new TypeError(
      'snapshot must be a valid immutable exact Chord Board voicing snapshot.',
    )
  }

  return Object.freeze({
    schemaVersion:
      CHORD_BOARD_ASSIGNMENT_SOURCE_SCHEMA_VERSION,
    sourceKind: CHORD_BOARD_SOURCE_KIND,
    studentId: normalizeRequiredId(
      input.studentId,
      'studentId',
    ),
    snapshot: input.snapshot,
    voicingFingerprint:
      input.snapshot.voicingFingerprint,
    boundAt: normalizeRequiredTimestamp(
      input.boundAt,
      'boundAt',
    ),
  })
}

export function isChordBoardAssignmentSourceBinding(
  value,
) {
  try {
    if (
      value?.schemaVersion !==
        CHORD_BOARD_ASSIGNMENT_SOURCE_SCHEMA_VERSION ||
      value?.sourceKind !==
        CHORD_BOARD_SOURCE_KIND ||
      !isStrictFrozenRecord(
        value,
        RECORD_FIELDS,
      ) ||
      !isChordBoardVoicingSnapshot(
        value.snapshot,
      )
    ) {
      return false
    }

    if (
      normalizeRequiredId(
        value.studentId,
        'studentId',
      ) !== value.studentId ||
      normalizeRequiredTimestamp(
        value.boundAt,
        'boundAt',
      ) !== value.boundAt ||
      normalizeFingerprint(
        value.voicingFingerprint,
      ) !== value.voicingFingerprint ||
      value.voicingFingerprint !==
        value.snapshot.voicingFingerprint
    ) {
      return false
    }

    return true
  } catch {
    return false
  }
}

export function restoreChordBoardAssignmentSourceBindingV1(
  raw,
) {
  assertStrictInputObject(
    raw,
    WIRE_FIELDS,
    'ChordBoardAssignmentSourceBinding wire',
  )
  if (
    raw.schemaVersion !==
      CHORD_BOARD_ASSIGNMENT_SOURCE_SCHEMA_VERSION ||
    raw.sourceKind !== CHORD_BOARD_SOURCE_KIND
  ) {
    throw new TypeError(
      'unsupported ChordBoardAssignmentSourceBinding schema.',
    )
  }

  const snapshot =
    normalizeChordBoardVoicingSnapshot(
      raw.snapshot,
    )
  const fingerprint =
    normalizeFingerprint(
      raw.voicingFingerprint,
    )
  if (
    fingerprint !== snapshot.voicingFingerprint
  ) {
    throw new Error(
      'ChordBoardAssignmentSourceBinding fingerprint mismatch.',
    )
  }

  return createChordBoardAssignmentSourceBinding({
    studentId: raw.studentId,
    snapshot,
    boundAt: raw.boundAt,
  })
}
