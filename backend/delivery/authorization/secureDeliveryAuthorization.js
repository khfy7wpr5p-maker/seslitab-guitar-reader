import {
  SECURE_DELIVERY_ROLE,
  createSecureDeliveryPrincipal,
  isSecureDeliveryIdentityMapping,
} from '../../../src/services/secureDeliveryIdentity.js'
import {
  isTeacherStudentGrant,
} from '../../../src/services/teacherStudentGrant.js'
import {
  normalizeRequiredId,
} from '../../../src/services/teacherDeliveryContractValidation.js'

export function createSecureDeliveryAuthorization({ store } = {}) {
  if (
    !store ||
    typeof store !== 'object' ||
    typeof store.getIdentityMapping !== 'function' ||
    typeof store.getTeacherStudentGrant !== 'function'
  ) {
    throw new TypeError(
      'authorization store must provide identity and grant lookups.',
    )
  }

  async function resolvePrincipal(
    providerSubject,
    expectedRole,
  ) {
    const subject = normalizeRequiredId(
      providerSubject,
      'providerSubject',
    )
    if (!Object.values(SECURE_DELIVERY_ROLE).includes(expectedRole)) {
      throw new TypeError(
        'expectedRole must be TEACHER or STUDENT.',
      )
    }

    const mapping = await store.getIdentityMapping(subject)
    if (mapping === null || mapping === undefined) {
      throw new Error(
        'secure-delivery-identity-mapping-missing',
      )
    }
    if (
      !isSecureDeliveryIdentityMapping(mapping) ||
      mapping.providerSubject !== subject
    ) {
      throw new Error(
        'secure-delivery-identity-mapping-mismatch',
      )
    }

    let principal
    try {
      principal = createSecureDeliveryPrincipal(mapping)
    } catch {
      throw new Error(
        'secure-delivery-identity-mapping-disabled',
      )
    }

    if (principal.role !== expectedRole) {
      throw new Error('secure-delivery-wrong-role')
    }
    return principal
  }

  async function requireTeacherStudent(
    teacherId,
    studentId,
  ) {
    const teacher = normalizeRequiredId(
      teacherId,
      'teacherId',
    )
    const student = normalizeRequiredId(
      studentId,
      'studentId',
    )
    const grant = await store.getTeacherStudentGrant(
      teacher,
      student,
    )
    if (grant === null || grant === undefined) {
      throw new Error('secure-delivery-grant-missing')
    }
    if (
      !isTeacherStudentGrant(grant) ||
      grant.teacherId !== teacher ||
      grant.studentId !== student
    ) {
      throw new Error('secure-delivery-grant-mismatch')
    }
    if (!grant.active || grant.revokedAt !== null) {
      throw new Error('secure-delivery-grant-inactive')
    }
    return grant
  }

  return Object.freeze({
    resolvePrincipal,
    requireTeacherStudent,
  })
}
