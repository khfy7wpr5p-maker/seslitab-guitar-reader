const EMPTY_ASSIGNMENTS = Object.freeze([])

function teacherMessage(error) {
  const text = String(error?.message || '')

  if (/student-inactive/i.test(text)) {
    return 'Seçilen öğrencilerden biri aktif değil.'
  }
  if (/student-not-found/i.test(text)) {
    return 'Seçilen öğrencilerden biri bulunamadı.'
  }
  if (
    /readiness-not-eligible|approval-required|approval.*required/i.test(
      text,
    )
  ) {
    return 'Eser bu öğrenci için ödeve hazır değil.'
  }
  if (
    /already-prepared|duplicate exact SCORE/i.test(
      text,
    )
  ) {
    return 'Bu öğrenci için aynı ödev zaten hazırlanmış.'
  }
  if (
    /acknowledgement|lookup mismatch/i.test(
      text,
    )
  ) {
    return 'Ödev işlemi doğrulanamadı.'
  }

  return 'Ödevler hazırlanamadı.'
}

export function createTeacherScoreAssignmentController({
  assignmentService,
  rosterService,
} = {}) {
  if (
    !assignmentService ||
    typeof assignmentService
      .prepareScoreAssignments !== 'function'
  ) {
    throw new TypeError(
      'assignmentService must provide prepareScoreAssignments().',
    )
  }
  if (
    !rosterService ||
    typeof rosterService.listStudents !==
      'function'
  ) {
    throw new TypeError(
      'rosterService must provide listStudents().',
    )
  }

  return Object.freeze({
    getViewModel() {
      const students =
        rosterService.listStudents({
          includeInactive: false,
        })

      return Object.freeze({
        students: Object.freeze(
          students.map((student) =>
            Object.freeze({
              studentId: student.studentId,
              displayNameOrNickname:
                student.displayNameOrNickname,
            }),
          ),
        ),
      })
    },

    prepare(input) {
      try {
        const assignments =
          assignmentService
            .prepareScoreAssignments(
              input,
            )

        return Object.freeze({
          ok: true,
          assignments,
          message:
            `${assignments.length} ödev hazırlandı.`,
        })
      } catch (error) {
        return Object.freeze({
          ok: false,
          assignments: EMPTY_ASSIGNMENTS,
          message: teacherMessage(error),
        })
      }
    },
  })
}
