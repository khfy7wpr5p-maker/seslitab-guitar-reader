function teacherMessage(error) {
  const text = String(error?.message || '')

  if (/teacher-assignment-not-found/i.test(text)) {
    return 'Ödev bulunamadı.'
  }
  if (/lifecycle-revoked/i.test(text)) {
    return 'Geri çekilmiş ödev değiştirilemez.'
  }
  if (/transition-not-allowed/i.test(text)) {
    return 'Bu işlem mevcut ödev durumunda yapılamaz.'
  }
  if (
    /acknowledgement|lookup mismatch|identity-mismatch|identity mismatch/i.test(
      text,
    )
  ) {
    return 'Ödev işlemi doğrulanamadı.'
  }

  return 'Ödev güncellenemedi.'
}

export function createTeacherAssignmentLifecycleController({
  lifecycleService,
  rosterService,
} = {}) {
  if (
    !lifecycleService ||
    typeof lifecycleService.listAssignments !== 'function' ||
    typeof lifecycleService.markCompleted !== 'function' ||
    typeof lifecycleService.moveToRepertoire !== 'function' ||
    typeof lifecycleService.revokeAssignment !== 'function'
  ) {
    throw new TypeError(
      'lifecycleService must provide listAssignments(), markCompleted(), moveToRepertoire() and revokeAssignment().',
    )
  }

  if (
    !rosterService ||
    typeof rosterService.listStudents !== 'function'
  ) {
    throw new TypeError(
      'rosterService must provide listStudents().',
    )
  }

  function getViewModel() {
    const records =
      lifecycleService.listAssignments()
    const students =
      rosterService.listStudents({
        includeInactive: true,
      })

    if (!Array.isArray(records)) {
      throw new TypeError(
        'lifecycleService listAssignments() must return an array.',
      )
    }
    if (!Array.isArray(students)) {
      throw new TypeError(
        'rosterService listStudents() must return an array.',
      )
    }

    const names = new Map(
      students.map((student) => [
        student.studentId,
        student.displayNameOrNickname,
      ]),
    )

    return Object.freeze({
      assignments: Object.freeze(
        records.map((record) =>
          Object.freeze({
            assignmentId:
              record.assignment.assignmentId,
            displayNameOrNickname:
              names.get(
                record.assignment.studentId,
              ) || 'Öğrenci',
            teacherNote:
              record.assignment.teacherNote,
            state: record.state,
            revoked:
              record.revokedAt !== null,
          }),
        ),
      ),
    })
  }

  function perform(
    operation,
    successMessage,
  ) {
    try {
      const record = operation()
      return Object.freeze({
        ok: true,
        record,
        message: successMessage,
      })
    } catch (error) {
      return Object.freeze({
        ok: false,
        record: null,
        message: teacherMessage(error),
      })
    }
  }

  return Object.freeze({
    getViewModel,

    markCompleted(assignmentId) {
      return perform(
        () =>
          lifecycleService.markCompleted(
            assignmentId,
          ),
        'Ödev tamamlandı.',
      )
    },

    moveToRepertoire(assignmentId) {
      return perform(
        () =>
          lifecycleService.moveToRepertoire(
            assignmentId,
          ),
        'Ödev repertuara eklendi.',
      )
    },

    revoke(assignmentId) {
      return perform(
        () =>
          lifecycleService.revokeAssignment(
            assignmentId,
          ),
        'Ödev geri çekildi.',
      )
    },
  })
}
