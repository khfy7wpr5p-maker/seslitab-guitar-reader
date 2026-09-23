import {
  fingerprintChordBoardVoicing,
} from './chordBoardVoicingFingerprint.js'

export const TEACHER_CHORD_DELIVERY_PHASE =
  Object.freeze({
    LOCAL_ASSIGNMENT_ONLY:
      'LOCAL_ASSIGNMENT_ONLY',
    DURABLY_PREPARED:
      'DURABLY_PREPARED',
    DELIVERED_TO_STUDENT:
      'DELIVERED_TO_STUDENT',
  })

const EMPTY_ASSIGNMENTS = Object.freeze([])

function localFailureMessage(error) {
  const message = String(error?.message ?? '')

  if (/student-inactive/i.test(message)) {
    return 'Seçilen öğrencilerden biri aktif değil.'
  }
  if (/student-not-found/i.test(message)) {
    return 'Seçilen öğrencilerden biri bulunamadı.'
  }
  if (/maximum|batch.*40/i.test(message)) {
    return 'En fazla 40 öğrenci seçilebilir.'
  }
  if (/override/i.test(message)) {
    return 'Öğrenciye özel notlar doğrulanamadı.'
  }
  if (/pinned|catalog|voicing/i.test(message)) {
    return 'Akor şeması doğrulanamadı.'
  }
  if (/conflict|already|duplicate/i.test(message)) {
    return 'Bu öğrenci için aynı akor ödevi zaten hazırlanmış.'
  }

  return 'Akor ödevi oluşturulamadı.'
}

function safeStudents(rosterService) {
  const rows =
    rosterService.listStudents({
      includeInactive: false,
    })

  if (!Array.isArray(rows)) {
    throw new TypeError(
      'rosterService.listStudents() must return an array.',
    )
  }

  return Object.freeze(
    rows.map((row) =>
      Object.freeze({
        studentId: row.studentId,
        displayNameOrNickname:
          row.displayNameOrNickname,
      }),
    ),
  )
}

function assertPreparedAcknowledgement(
  acknowledgement,
  assignments,
) {
  if (
    !Array.isArray(acknowledgement) ||
    acknowledgement.length !==
      assignments.length
  ) {
    throw new Error(
      'secure preparation acknowledgement mismatch.',
    )
  }

  for (
    let index = 0;
    index < assignments.length;
    index += 1
  ) {
    const expected = assignments[index]
    const actual = acknowledgement[index]

    if (
      actual?.assignment?.assignmentId !==
        expected.assignmentId ||
      actual?.assignment?.studentId !==
        expected.studentId ||
      actual?.assignment?.practiceType !==
        'CHORD_BOARD' ||
      actual?.packageId !==
        expected.assignmentId
    ) {
      throw new Error(
        'secure preparation acknowledgement mismatch.',
      )
    }
  }

  return acknowledgement
}

function assertDeliveryAcknowledgement(
  acknowledgement,
  assignments,
) {
  if (
    !Array.isArray(acknowledgement) ||
    acknowledgement.length !==
      assignments.length
  ) {
    throw new Error(
      'secure delivery acknowledgement mismatch.',
    )
  }

  for (
    let index = 0;
    index < assignments.length;
    index += 1
  ) {
    const expected = assignments[index]
    const actual = acknowledgement[index]

    if (
      actual?.deliveryId !==
        expected.assignmentId ||
      actual?.assignmentId !==
        expected.assignmentId ||
      actual?.studentId !==
        expected.studentId ||
      actual?.packageId !==
        expected.assignmentId ||
      actual?.revokedAt !== null
    ) {
      throw new Error(
        'secure delivery acknowledgement mismatch.',
      )
    }
  }

  return acknowledgement
}

export function createTeacherChordBoardAssignmentController({
  catalog,
  rosterService,
  assignmentService,
  secureDeliveryClient,
  createChordPackage,
} = {}) {
  if (
    !catalog ||
    typeof catalog.listSymbols !==
      'function' ||
    typeof catalog.getVoicings !==
      'function'
  ) {
    throw new TypeError(
      'catalog must provide listSymbols() and getVoicings().',
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
  if (
    !assignmentService ||
    typeof assignmentService
      .prepareChordBoardAssignments !==
      'function'
  ) {
    throw new TypeError(
      'assignmentService must provide prepareChordBoardAssignments().',
    )
  }
  if (
    !secureDeliveryClient ||
    typeof secureDeliveryClient
      .prepareAssignments !== 'function' ||
    typeof secureDeliveryClient
      .deliverAssignments !== 'function'
  ) {
    throw new TypeError(
      'secureDeliveryClient must provide prepareAssignments() and deliverAssignments().',
    )
  }
  if (
    typeof createChordPackage !==
      'function'
  ) {
    throw new TypeError(
      'createChordPackage must be a function.',
    )
  }

  const symbols = catalog.listSymbols()
  if (
    !Array.isArray(symbols) ||
    symbols.length === 0
  ) {
    throw new TypeError(
      'catalog.listSymbols() must return a non-empty array.',
    )
  }

  const frozenSymbols =
    Object.freeze([...symbols])
  let selectedSymbol =
    frozenSymbols[0]

  function viewModel() {
    const voicings =
      catalog.getVoicings(
        selectedSymbol,
      )
    if (!Array.isArray(voicings)) {
      throw new TypeError(
        'catalog.getVoicings() must return an array.',
      )
    }

    return Object.freeze({
      students:
        safeStudents(rosterService),
      symbols: frozenSymbols,
      selectedSymbol,
      voicings:
        Object.freeze([...voicings]),
    })
  }

  async function assignAndDeliver(
    input = {},
  ) {
    let computed
    try {
      computed =
        await fingerprintChordBoardVoicing(
          input.snapshot,
        )
    } catch {
      return Object.freeze({
        ok: false,
        phase:
          TEACHER_CHORD_DELIVERY_PHASE
            .LOCAL_ASSIGNMENT_ONLY,
        assignments:
          EMPTY_ASSIGNMENTS,
        message:
          'Akor şeması doğrulanamadı.',
      })
    }

    if (
      computed !==
        input.snapshot?.voicingFingerprint
    ) {
      return Object.freeze({
        ok: false,
        phase:
          TEACHER_CHORD_DELIVERY_PHASE
            .LOCAL_ASSIGNMENT_ONLY,
        assignments:
          EMPTY_ASSIGNMENTS,
        message:
          'Akor şeması doğrulanamadı.',
      })
    }

    let assignments
    try {
      assignments =
        assignmentService
          .prepareChordBoardAssignments(
            input,
          )
    } catch (error) {
      return Object.freeze({
        ok: false,
        phase:
          TEACHER_CHORD_DELIVERY_PHASE
            .LOCAL_ASSIGNMENT_ONLY,
        assignments:
          EMPTY_ASSIGNMENTS,
        message:
          localFailureMessage(error),
      })
    }

    let items
    try {
      items = assignments.map(
        (assignment) =>
          Object.freeze({
            assignment,
            package:
              createChordPackage({
                assignment,
                practice: {},
              }),
          }),
      )
    } catch {
      return Object.freeze({
        ok: false,
        phase:
          TEACHER_CHORD_DELIVERY_PHASE
            .LOCAL_ASSIGNMENT_ONLY,
        assignments,
        message:
          `${assignments.length} akor ödevi oluşturuldu ancak güvenli teslimata hazırlanamadı.`,
      })
    }

    try {
      const acknowledgement =
        await secureDeliveryClient
          .prepareAssignments(items)
      assertPreparedAcknowledgement(
        acknowledgement,
        assignments,
      )
    } catch {
      return Object.freeze({
        ok: false,
        phase:
          TEACHER_CHORD_DELIVERY_PHASE
            .LOCAL_ASSIGNMENT_ONLY,
        assignments,
        message:
          `${assignments.length} akor ödevi oluşturuldu ancak güvenli teslimata hazırlanamadı.`,
      })
    }

    try {
      const acknowledgement =
        await secureDeliveryClient
          .deliverAssignments(
            assignments.map(
              (assignment) =>
                assignment.assignmentId,
            ),
          )
      assertDeliveryAcknowledgement(
        acknowledgement,
        assignments,
      )
    } catch {
      return Object.freeze({
        ok: false,
        phase:
          TEACHER_CHORD_DELIVERY_PHASE
            .DURABLY_PREPARED,
        assignments,
        message:
          `${assignments.length} akor ödevi hazırlandı ancak gönderilemedi.`,
      })
    }

    return Object.freeze({
      ok: true,
      phase:
        TEACHER_CHORD_DELIVERY_PHASE
          .DELIVERED_TO_STUDENT,
      assignments,
      message:
        `${assignments.length} akor ödevi gönderildi.`,
    })
  }

  return Object.freeze({
    getViewModel: viewModel,

    selectChord(symbol) {
      if (
        typeof symbol !== 'string' ||
        !frozenSymbols.includes(symbol)
      ) {
        throw new Error(
          'teacher-chord-board-symbol-not-found',
        )
      }
      selectedSymbol = symbol
      return viewModel()
    },

    assignAndDeliver,
  })
}
