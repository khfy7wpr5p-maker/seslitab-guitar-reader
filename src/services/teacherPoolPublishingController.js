function teacherMessage(error) {
  const text = String(error?.message || '')
  if (/student-inactive/i.test(text)) {
    return 'Seçilen öğrencilerden biri aktif değil.'
  }
  if (/student-not-found/i.test(text)) {
    return 'Seçilen öğrencilerden biri bulunamadı.'
  }
  if (/acknowledgement/i.test(text)) {
    return 'Havuz işlemi doğrulanamadı.'
  }
  if (/already.*revoked/i.test(text)) {
    return 'Bu Havuz yayını zaten geri çekilmiş.'
  }
  return 'Havuz işlemi tamamlanamadı.'
}

export function createTeacherPoolPublishingController({
  publishingService,
  rosterService,
} = {}) {
  if (
    !publishingService ||
    typeof publishingService.publishPoolItem !== 'function' ||
    typeof publishingService.listPoolPublications !== 'function' ||
    typeof publishingService.revokePoolPublication !== 'function'
  ) {
    throw new TypeError(
      'publishingService must provide Pool publish/list/revoke operations.',
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
    const students = rosterService.listStudents({
      includeInactive: false,
    })
    const publications =
      publishingService.listPoolPublications()

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
      publications,
    })
  }

  function publish(input) {
    try {
      const record =
        publishingService.publishPoolItem(input)
      return Object.freeze({
        ok: true,
        record,
        message: 'Havuza gönderildi.',
      })
    } catch (error) {
      return Object.freeze({
        ok: false,
        record: null,
        message: teacherMessage(error),
      })
    }
  }

  function revoke(poolItemId) {
    try {
      const record =
        publishingService.revokePoolPublication(
          poolItemId,
        )
      return Object.freeze({
        ok: true,
        record,
        message: 'Havuz yayını geri çekildi.',
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
    publish,
    revoke,
  })
}
