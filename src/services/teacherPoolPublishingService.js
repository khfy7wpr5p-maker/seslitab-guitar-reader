import {
  POOL_AUDIENCE_MODE,
  createPoolItem,
} from './poolItem.js'
import {
  createActivePoolPublicationRecord,
  isPoolPublicationRecord,
} from './poolPublicationRecord.js'
import {
  assertTeacherPoolRepository,
} from './teacherPoolRepository.js'
import {
  assertStrictInputObject,
  normalizeRequiredId,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

const PUBLISH_FIELDS = Object.freeze([
  'title',
  'shortDescription',
  'detailText',
  'audienceMode',
  'selectedStudentIds',
])

function assertStrictPublishInput(input) {
  assertStrictInputObject(
    input,
    PUBLISH_FIELDS,
    'Pool publication',
  )

  if (
    PUBLISH_FIELDS.some(
      (field) => !Object.hasOwn(input, field),
    )
  ) {
    throw new TypeError(
      'Pool publication input contains unsupported or missing fields.',
    )
  }
}

function sameRecipients(a, b) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((id, index) => id === b[index])
  )
}

function sameItem(a, b) {
  return (
    a === b ||
    (
      a?.schemaVersion === b?.schemaVersion &&
      a?.poolItemId === b?.poolItemId &&
      a?.title === b?.title &&
      a?.shortDescription === b?.shortDescription &&
      a?.detailText === b?.detailText &&
      a?.publishedAt === b?.publishedAt &&
      a?.audienceMode === b?.audienceMode &&
      sameRecipients(
        a?.recipientStudentIds,
        b?.recipientStudentIds,
      ) &&
      a?.revokedAt === b?.revokedAt
    )
  )
}

function assertPublicationAcknowledgement(
  acknowledgement,
  expectedRecord,
  expectedRevokedAt,
) {
  if (!isPoolPublicationRecord(acknowledgement)) {
    throw new Error(
      'teacher Pool repository acknowledgement is invalid.',
    )
  }

  if (
    acknowledgement.item.poolItemId !==
      expectedRecord.item.poolItemId ||
    !sameItem(
      acknowledgement.item,
      expectedRecord.item,
    ) ||
    acknowledgement.revokedAt !== expectedRevokedAt
  ) {
    throw new Error(
      'teacher Pool repository acknowledgement mismatch.',
    )
  }

  return acknowledgement
}

export function createTeacherPoolPublishingService({
  repository,
  rosterService,
  createPoolItemId,
  now,
} = {}) {
  const trustedRepository =
    assertTeacherPoolRepository(repository)

  if (
    !rosterService ||
    typeof rosterService.preflightActiveStudentIds !== 'function'
  ) {
    throw new TypeError(
      'rosterService must provide preflightActiveStudentIds().',
    )
  }
  if (typeof createPoolItemId !== 'function') {
    throw new TypeError(
      'createPoolItemId must be a function.',
    )
  }
  if (typeof now !== 'function') {
    throw new TypeError('now must be a function.')
  }

  function listPoolPublications() {
    const rows = trustedRepository.list()
    if (!Array.isArray(rows)) {
      throw new TypeError(
        'teacher Pool repository list() must return an array.',
      )
    }

    const seen = new Set()
    const validated = rows.map((row) => {
      if (!isPoolPublicationRecord(row)) {
        throw new TypeError(
          'teacher Pool repository row must be a valid immutable PoolPublicationRecord.',
        )
      }

      const id = row.item.poolItemId
      if (seen.has(id)) {
        throw new Error(
          `duplicate poolItemId returned by teacher Pool repository: ${id}`,
        )
      }
      seen.add(id)
      return row
    })

    return Object.freeze(validated)
  }

  function publishPoolItem(input = {}) {
    assertStrictPublishInput(input)

    if (!Array.isArray(input.selectedStudentIds)) {
      throw new TypeError(
        'selectedStudentIds must be an array.',
      )
    }

    let recipients = []

    if (input.audienceMode === POOL_AUDIENCE_MODE.ALL) {
      if (input.selectedStudentIds.length !== 0) {
        throw new Error(
          'ALL Pool publication must not contain selected students.',
        )
      }
    } else if (
      input.audienceMode === POOL_AUDIENCE_MODE.SELECTED
    ) {
      if (input.selectedStudentIds.length === 0) {
        throw new Error(
          'SELECTED Pool publication requires at least one selected student.',
        )
      }

      const activeStudents =
        rosterService.preflightActiveStudentIds(
          input.selectedStudentIds,
        )
      recipients = activeStudents.map(
        (student) => student.studentId,
      )
    } else {
      throw new TypeError(
        'audienceMode must be ALL or SELECTED.',
      )
    }

    const poolItemId = normalizeRequiredId(
      createPoolItemId(),
      'poolItemId',
    )
    const publishedAt = normalizeRequiredTimestamp(
      now(),
      'publishedAt',
    )

    const item = createPoolItem({
      poolItemId,
      title: input.title,
      shortDescription: input.shortDescription,
      detailText: input.detailText,
      publishedAt,
      audienceMode: input.audienceMode,
      recipientStudentIds: recipients,
    })
    const expected =
      createActivePoolPublicationRecord(item)

    const acknowledgement =
      trustedRepository.publish(expected)

    return assertPublicationAcknowledgement(
      acknowledgement,
      expected,
      null,
    )
  }

  function revokePoolPublication(poolItemId) {
    const id = normalizeRequiredId(
      poolItemId,
      'poolItemId',
    )
    const current =
      trustedRepository.getByPoolItemId(id)

    if (current === null || current === undefined) {
      throw new Error(
        `teacher-pool-publication-not-found:${id}`,
      )
    }
    if (!isPoolPublicationRecord(current)) {
      throw new TypeError(
        'teacher Pool repository lookup result must be a valid immutable PoolPublicationRecord.',
      )
    }
    if (current.item.poolItemId !== id) {
      throw new Error(
        `teacher-pool-identity-mismatch:${id}`,
      )
    }
    if (current.revokedAt !== null) {
      throw new Error(
        `teacher-pool-publication-already-revoked:${id}`,
      )
    }

    const revokedAt = normalizeRequiredTimestamp(
      now(),
      'revokedAt',
    )
    const acknowledgement =
      trustedRepository.revoke({
        poolItemId: id,
        revokedAt,
      })

    return assertPublicationAcknowledgement(
      acknowledgement,
      current,
      revokedAt,
    )
  }

  return Object.freeze({
    publishPoolItem,
    listPoolPublications,
    revokePoolPublication,
  })
}
