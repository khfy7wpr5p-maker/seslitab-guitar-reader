import {
  PRIVATE_ASSIGNMENT_MAX_TEACHER_NOTE_LENGTH,
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  isPrivateAssignment,
} from './privateAssignment.js'
import {
  DELIVERY_MAX_DISPLAY_NAME_LENGTH,
  assertStrictInputObject,
  normalizeOptionalText,
  normalizeRequiredId,
  normalizeRequiredText,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'
import {
  isChordBoardVoicingSnapshot,
  normalizeChordBoardVoicingSnapshot,
} from './chordBoardVoicingCanonical.js'

export const STUDENT_CHORD_BOARD_PACKAGE_SCHEMA_VERSION =
  '1.0.0'
export const STUDENT_CHORD_BOARD_PACKAGE_TYPE =
  'CHORD_BOARD'

const INPUT_FIELDS = Object.freeze([
  'assignment',
  'practice',
])

const TOP_LEVEL_KEYS = Object.freeze([
  'schemaVersion',
  'packageType',
  'packageId',
  'title',
  'assignmentAuthority',
  'publication',
  'content',
  'practice',
])
const ASSIGNMENT_AUTHORITY_KEYS = Object.freeze([
  'assignmentId',
  'state',
  'assignedAt',
])
const PUBLICATION_KEYS = Object.freeze([
  'scope',
  'recipientStudentId',
])
const CONTENT_KEYS = Object.freeze([
  'chordBoard',
])

function isPlainRecord(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return (
    proto === Object.prototype ||
    proto === null
  )
}

function exactKeys(
  value,
  keys,
  label,
  errors,
) {
  if (!isPlainRecord(value)) {
    errors.push(`${label} must be an object`)
    return false
  }

  const allowed = new Set(keys)
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      errors.push(
        `unsupported ${label} field: ${key}`,
      )
    }
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) {
      errors.push(
        `${label}.${key} is required`,
      )
    }
  }
  return true
}

function cloneFrozenJson(
  value,
  ancestors = new Set(),
) {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        'CHORD_BOARD package JSON number must be finite.',
      )
    }
    return value
  }
  if (
    typeof value === 'undefined' ||
    typeof value === 'function' ||
    typeof value === 'symbol' ||
    typeof value === 'bigint'
  ) {
    throw new TypeError(
      'CHORD_BOARD package contains unsupported JSON value.',
    )
  }
  if (ancestors.has(value)) {
    throw new TypeError(
      'CHORD_BOARD package contains a cyclic JSON value.',
    )
  }

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return Object.freeze(
        value.map((child) =>
          cloneFrozenJson(child, ancestors),
        ),
      )
    }
    if (!isPlainRecord(value)) {
      throw new TypeError(
        'CHORD_BOARD package JSON object must be plain data.',
      )
    }

    const output = {}
    for (const [key, child] of Object.entries(
      value,
    )) {
      output[key] = cloneFrozenJson(
        child,
        ancestors,
      )
    }
    return Object.freeze(output)
  } finally {
    ancestors.delete(value)
  }
}

function validatePracticeJson(value) {
  if (!isPlainRecord(value)) {
    throw new TypeError(
      'practice must be a plain JSON object.',
    )
  }
  cloneFrozenJson(value)
}

export function validateStudentChordBoardPackageV1(
  value,
) {
  const errors = []

  if (
    !exactKeys(
      value,
      TOP_LEVEL_KEYS,
      'package',
      errors,
    )
  ) {
    return Object.freeze({
      ok: false,
      errors: Object.freeze(errors),
    })
  }

  if (
    value.schemaVersion !==
      STUDENT_CHORD_BOARD_PACKAGE_SCHEMA_VERSION
  ) {
    errors.push(
      'schemaVersion must be 1.0.0',
    )
  }
  if (
    value.packageType !==
      STUDENT_CHORD_BOARD_PACKAGE_TYPE
  ) {
    errors.push(
      'packageType must be CHORD_BOARD',
    )
  }

  try {
    normalizeRequiredId(
      value.packageId,
      'packageId',
    )
  } catch (error) {
    errors.push(error.message)
  }
  try {
    normalizeRequiredText(
      value.title,
      'title',
      DELIVERY_MAX_DISPLAY_NAME_LENGTH,
    )
  } catch (error) {
    errors.push(error.message)
  }

  if (
    exactKeys(
      value.assignmentAuthority,
      ASSIGNMENT_AUTHORITY_KEYS,
      'assignmentAuthority',
      errors,
    )
  ) {
    try {
      normalizeRequiredId(
        value.assignmentAuthority.assignmentId,
        'assignmentAuthority.assignmentId',
      )
    } catch (error) {
      errors.push(error.message)
    }
    if (
      value.assignmentAuthority.state !==
        'teacher_assigned'
    ) {
      errors.push(
        'assignmentAuthority.state must be teacher_assigned',
      )
    }
    try {
      normalizeRequiredTimestamp(
        value.assignmentAuthority.assignedAt,
        'assignmentAuthority.assignedAt',
      )
    } catch (error) {
      errors.push(error.message)
    }
    if (
      value.packageId !==
        value.assignmentAuthority.assignmentId
    ) {
      errors.push(
        'packageId must match assignmentAuthority.assignmentId',
      )
    }
  }

  if (
    exactKeys(
      value.publication,
      PUBLICATION_KEYS,
      'publication',
      errors,
    )
  ) {
    if (
      value.publication.scope !==
        'student_private'
    ) {
      errors.push(
        'publication.scope must be student_private',
      )
    }
    try {
      normalizeRequiredId(
        value.publication.recipientStudentId,
        'publication.recipientStudentId',
      )
    } catch (error) {
      errors.push(error.message)
    }
  }

  if (
    exactKeys(
      value.content,
      CONTENT_KEYS,
      'content',
      errors,
    )
  ) {
    try {
      normalizeChordBoardVoicingSnapshot(
        value.content.chordBoard,
      )
    } catch (error) {
      errors.push(
        `content.chordBoard exact snapshot is invalid: ${error.message}`,
      )
    }
  }

  try {
    validatePracticeJson(value.practice)
    if (
      typeof value.practice.teacherNote !==
        'string'
    ) {
      errors.push(
        'practice.teacherNote must be a string',
      )
    } else {
      normalizeOptionalText(
        value.practice.teacherNote,
        'practice.teacherNote',
        PRIVATE_ASSIGNMENT_MAX_TEACHER_NOTE_LENGTH,
      )
    }
  } catch (error) {
    errors.push(error.message)
  }

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
  })
}

export function createStudentPrivateChordBoardPackageV1(
  input = {},
) {
  assertStrictInputObject(
    input,
    INPUT_FIELDS,
    'StudentPrivateChordBoardPackage',
  )

  const assignment = input.assignment
  if (
    !isPrivateAssignment(assignment) ||
    assignment.practiceType !==
      PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD ||
    !isChordBoardVoicingSnapshot(
      assignment.sourceRef?.snapshot,
    )
  ) {
    throw new TypeError(
      'assignment must be a valid immutable CHORD_BOARD PrivateAssignment.',
    )
  }

  const rawPractice = input.practice ?? {}
  if (!isPlainRecord(rawPractice)) {
    throw new TypeError(
      'practice must be a plain JSON object.',
    )
  }
  if (
    Object.hasOwn(
      rawPractice,
      'teacherNote',
    )
  ) {
    throw new Error(
      'practice.teacherNote is assignment authority and cannot be overridden.',
    )
  }

  const practiceData =
    cloneFrozenJson(rawPractice)
  const snapshot =
    assignment.sourceRef.snapshot
  const displaySymbol =
    normalizeRequiredText(
      snapshot.chord.displaySymbol,
      'displaySymbol',
      DELIVERY_MAX_DISPLAY_NAME_LENGTH,
    )
  const title = normalizeRequiredText(
    `${displaySymbol} akor çalışması`,
    'title',
    DELIVERY_MAX_DISPLAY_NAME_LENGTH,
  )

  const pkg = Object.freeze({
    schemaVersion:
      STUDENT_CHORD_BOARD_PACKAGE_SCHEMA_VERSION,
    packageType:
      STUDENT_CHORD_BOARD_PACKAGE_TYPE,
    packageId: assignment.assignmentId,
    title,
    assignmentAuthority: Object.freeze({
      assignmentId:
        assignment.assignmentId,
      state: 'teacher_assigned',
      assignedAt: assignment.assignedAt,
    }),
    publication: Object.freeze({
      scope: 'student_private',
      recipientStudentId:
        assignment.studentId,
    }),
    content: Object.freeze({
      chordBoard: snapshot,
    }),
    practice: Object.freeze({
      ...practiceData,
      teacherNote: assignment.teacherNote,
    }),
  })

  const validation =
    validateStudentChordBoardPackageV1(pkg)
  if (!validation.ok) {
    throw new TypeError(
      `invalid StudentChordBoardPackageV1: ${validation.errors.join('; ')}`,
    )
  }

  return pkg
}

export function restoreStudentChordBoardPackageV1(
  raw,
) {
  const validation =
    validateStudentChordBoardPackageV1(raw)
  if (!validation.ok) {
    throw new TypeError(
      `invalid StudentChordBoardPackageV1: ${validation.errors.join('; ')}`,
    )
  }

  const snapshot =
    normalizeChordBoardVoicingSnapshot(
      raw.content.chordBoard,
    )

  return Object.freeze({
    schemaVersion:
      STUDENT_CHORD_BOARD_PACKAGE_SCHEMA_VERSION,
    packageType:
      STUDENT_CHORD_BOARD_PACKAGE_TYPE,
    packageId: normalizeRequiredId(
      raw.packageId,
      'packageId',
    ),
    title: normalizeRequiredText(
      raw.title,
      'title',
      DELIVERY_MAX_DISPLAY_NAME_LENGTH,
    ),
    assignmentAuthority: Object.freeze({
      assignmentId: normalizeRequiredId(
        raw.assignmentAuthority.assignmentId,
        'assignmentAuthority.assignmentId',
      ),
      state: 'teacher_assigned',
      assignedAt: normalizeRequiredTimestamp(
        raw.assignmentAuthority.assignedAt,
        'assignmentAuthority.assignedAt',
      ),
    }),
    publication: Object.freeze({
      scope: 'student_private',
      recipientStudentId:
        normalizeRequiredId(
          raw.publication.recipientStudentId,
          'publication.recipientStudentId',
        ),
    }),
    content: Object.freeze({
      chordBoard: snapshot,
    }),
    practice: cloneFrozenJson(
      raw.practice,
    ),
  })
}
