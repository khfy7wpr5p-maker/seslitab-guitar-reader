import {
  createTeacherAssignmentComposerService,
} from './services/teacherAssignmentComposerService.js'
import {
  mountTeacherAssignmentWorkspaceUi,
} from './teacherAssignmentWorkspaceUi.js'

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

function frozenPieceRows(value) {
  if (!Array.isArray(value)) {
    throw new TypeError(
      'teacher pieces must be an array.',
    )
  }
  return Object.freeze([...value])
}

function reconcilePieceRows(
  rows,
  actionKey,
  action,
) {
  const index = rows.findIndex(
    (row) => row?.actionKey === actionKey,
  )
  if (index < 0) return null

  if (action === 'REVOKE') {
    return Object.freeze(
      rows.filter(
        (_row, rowIndex) => rowIndex !== index,
      ),
    )
  }

  if (action === 'PLACE_IN_REPERTOIRE') {
    return Object.freeze(
      rows.map((row, rowIndex) =>
        rowIndex === index
          ? Object.freeze({
              ...row,
              state: 'REPERTOIRE',
              revoked: false,
            })
          : row,
      ),
    )
  }

  return null
}

function createPieceManagementClient(
  secureDeliveryClient,
) {
  let lastPieceRows = null
  let pendingPieceRows = null

  return Object.freeze({
    async listTeacherPieces() {
      if (pendingPieceRows !== null) {
        const rows = pendingPieceRows
        pendingPieceRows = null
        lastPieceRows = rows
        return rows
      }

      const rows = frozenPieceRows(
        await secureDeliveryClient
          .listTeacherPieces(),
      )
      lastPieceRows = rows
      return rows
    },

    listTeacherWorkRequests(...args) {
      return secureDeliveryClient
        .listTeacherWorkRequests(...args)
    },

    async applyPieceAction(
      actionKey,
      action,
    ) {
      const result =
        await secureDeliveryClient
          .applyPieceAction(
            actionKey,
            action,
          )

      pendingPieceRows =
        lastPieceRows === null
          ? null
          : reconcilePieceRows(
              lastPieceRows,
              actionKey,
              action,
            )
      if (pendingPieceRows !== null) {
        lastPieceRows = pendingPieceRows
      }
      return result
    },

    applyTeacherWorkRequestAction(...args) {
      return secureDeliveryClient
        .applyTeacherWorkRequestAction(...args)
    },

    async convertTeacherWorkRequest(...args) {
      const result =
        await secureDeliveryClient
          .convertTeacherWorkRequest(...args)
      lastPieceRows = null
      pendingPieceRows = null
      return result
    },
  })
}

export function createTeacherAssignmentProductionComposition({
  authenticatedTeacher,
  secureDeliveryClient,
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

      return mountTeacherAssignmentWorkspaceUi({
        root,
        host,
        composerService: service,
        managementClient:
          createPieceManagementClient(
            secureDeliveryClient,
          ),
        createDraftId,
      })
    },
  })
}
