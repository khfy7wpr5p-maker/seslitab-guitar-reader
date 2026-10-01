import {
  createTeacherAssignmentComposerService,
} from './services/teacherAssignmentComposerService.js'
import {
  mountTeacherAssignmentComposerUi,
} from './teacherAssignmentComposerUi.js'

function requiredTeacherId(value) {
  if (
    typeof value !== 'string' ||
    value.trim() === ''
  ) {
    throw new TypeError(
      'authenticated teacherId is required.',
    )
  }
  return value.trim()
}

export function createTeacherAssignmentProductionComposition({
  authenticatedTeacher,
  secureDeliveryClient,
  verifyScoreSource,
  now,
  createDraftId,
} = {}) {
  const teacherId =
    requiredTeacherId(
      authenticatedTeacher?.teacherId,
    )

  const service =
    createTeacherAssignmentComposerService({
      teacherId,
      secureDeliveryClient,
      verifyScoreSource,
      now,
    })

  return Object.freeze({
    authenticatedTeacher:
      Object.freeze({ teacherId }),

    async prepareAssignmentAuthority() {
      return service.loadRoster()
    },

    mountAssignmentSurface({
      root,
      teacherId: mountedTeacherId,
    } = {}) {
      if (
        requiredTeacherId(
          mountedTeacherId,
        ) !== teacherId
      ) {
        throw new Error(
          'assignment-composer-teacher-identity-mismatch',
        )
      }

      const host =
        root?.getElementById?.(
          'teacher-assignment-composer-host',
        )
      if (!host) {
        throw new Error(
          'assignment-composer-host-missing',
        )
      }

      const results =
        root.getElementById?.(
          'results-section',
        )
      if (results) results.hidden = false

      return mountTeacherAssignmentComposerUi({
        root,
        host,
        service,
        createDraftId,
      })
    },
  })
}
