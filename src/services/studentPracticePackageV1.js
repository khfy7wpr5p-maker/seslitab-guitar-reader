import {
  DELIVERY_MAX_DISPLAY_NAME_LENGTH,
  assertStrictInputObject,
  normalizeRequiredId,
  normalizeRequiredText,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

export const STUDENT_PRACTICE_PACKAGE_SCHEMA_VERSION = '1.0.0'
export const STUDENT_PRACTICE_PACKAGE_SCOPE = Object.freeze({
  PUBLIC_POOL: 'public_pool',
  STUDENT_PRIVATE: 'student_private',
})

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  'schemaVersion',
  'packageId',
  'workId',
  'title',
  'approvedRevision',
  'publication',
  'content',
  'practice',
])

const INPUT_FIELDS = Object.freeze([
  'packageId',
  'workId',
  'title',
  'revisionId',
  'approvedAt',
  'studentId',
  'musicXml',
  'canonicalEvents',
  'practice',
])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function cloneFrozenJson(value, ancestors = new Set()) {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('JSON number must be finite.')
    }
    return value
  }
  if (
    typeof value === 'undefined' ||
    typeof value === 'function' ||
    typeof value === 'symbol' ||
    typeof value === 'bigint'
  ) {
    throw new TypeError('PracticePackage contains unsupported JSON value.')
  }
  if (ancestors.has(value)) {
    throw new TypeError('PracticePackage contains a cyclic value.')
  }

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return Object.freeze(
        value.map((child) => cloneFrozenJson(child, ancestors)),
      )
    }
    if (!isRecord(value)) {
      throw new TypeError('PracticePackage JSON object must be plain data.')
    }
    const output = {}
    for (const [key, child] of Object.entries(value)) {
      output[key] = cloneFrozenJson(child, ancestors)
    }
    return Object.freeze(output)
  } finally {
    ancestors.delete(value)
  }
}

export function validateStudentPracticePackageV1(value) {
  const errors = []

  if (!isRecord(value)) {
    return Object.freeze({
      ok: false,
      errors: Object.freeze(['package must be an object']),
    })
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      errors.push(`unsupported top-level field: ${key}`)
    }
  }

  if (value.schemaVersion !== STUDENT_PRACTICE_PACKAGE_SCHEMA_VERSION) {
    errors.push('schemaVersion must be 1.0.0')
  }

  for (const field of ['packageId', 'workId', 'title']) {
    if (!hasText(value[field])) {
      errors.push(`${field} must be a non-empty string`)
    }
  }

  const revision = value.approvedRevision
  if (!isRecord(revision)) {
    errors.push('approvedRevision must be an object')
  } else {
    if (!hasText(revision.revisionId)) {
      errors.push('approvedRevision.revisionId must be a non-empty string')
    }
    if (revision.state !== 'teacher_approved') {
      errors.push('approvedRevision.state must be teacher_approved')
    }
    if (!hasText(revision.approvedAt)) {
      errors.push('approvedRevision.approvedAt must be a non-empty string')
    }
  }

  const publication = value.publication
  if (!isRecord(publication)) {
    errors.push('publication must be an object')
  } else {
    const validScope = Object.values(
      STUDENT_PRACTICE_PACKAGE_SCOPE,
    ).includes(publication.scope)
    if (!validScope) {
      errors.push(
        'publication.scope must be public_pool or student_private',
      )
    }

    if (
      publication.scope ===
        STUDENT_PRACTICE_PACKAGE_SCOPE.STUDENT_PRIVATE &&
      !hasText(publication.recipientStudentId)
    ) {
      errors.push(
        'publication.recipientStudentId is required for student_private',
      )
    }

    if (
      publication.scope ===
        STUDENT_PRACTICE_PACKAGE_SCOPE.PUBLIC_POOL &&
      'recipientStudentId' in publication
    ) {
      errors.push(
        'publication.recipientStudentId is not allowed for public_pool',
      )
    }
  }

  const content = value.content
  if (!isRecord(content)) {
    errors.push('content must be an object')
  } else {
    if (!isRecord(content.score)) {
      errors.push('content.score must be an object')
    } else {
      if (content.score.format !== 'musicxml') {
        errors.push('content.score.format must be musicxml')
      }
      if (!hasText(content.score.data)) {
        errors.push(
          'content.score.data must be a non-empty string',
        )
      }
    }

    if (!Array.isArray(content.canonicalEvents)) {
      errors.push('content.canonicalEvents must be an array')
    }
  }

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
  })
}

export function createStudentPrivatePracticePackageV1(input = {}) {
  assertStrictInputObject(
    input,
    INPUT_FIELDS,
    'StudentPrivatePracticePackage',
  )

  if (!Array.isArray(input.canonicalEvents)) {
    throw new TypeError('canonicalEvents must be an array.')
  }
  if (!hasText(input.musicXml)) {
    throw new TypeError('musicXml must be non-empty text.')
  }

  const pkg = Object.freeze({
    schemaVersion: STUDENT_PRACTICE_PACKAGE_SCHEMA_VERSION,
    packageId: normalizeRequiredId(input.packageId, 'packageId'),
    workId: normalizeRequiredId(input.workId, 'workId'),
    title: normalizeRequiredText(
      input.title,
      'title',
      DELIVERY_MAX_DISPLAY_NAME_LENGTH,
    ),
    approvedRevision: Object.freeze({
      revisionId: normalizeRequiredId(
        input.revisionId,
        'revisionId',
      ),
      state: 'teacher_approved',
      approvedAt: normalizeRequiredTimestamp(
        input.approvedAt,
        'approvedAt',
      ),
    }),
    publication: Object.freeze({
      scope: STUDENT_PRACTICE_PACKAGE_SCOPE.STUDENT_PRIVATE,
      recipientStudentId: normalizeRequiredId(
        input.studentId,
        'studentId',
      ),
    }),
    content: Object.freeze({
      score: Object.freeze({
        format: 'musicxml',
        data: input.musicXml,
      }),
      canonicalEvents: cloneFrozenJson(
        input.canonicalEvents,
      ),
    }),
    practice: cloneFrozenJson(input.practice ?? {}),
  })

  const validation = validateStudentPracticePackageV1(pkg)
  if (!validation.ok) {
    throw new TypeError(
      `invalid Student PracticePackage v1: ${validation.errors.join('; ')}`,
    )
  }
  return pkg
}
