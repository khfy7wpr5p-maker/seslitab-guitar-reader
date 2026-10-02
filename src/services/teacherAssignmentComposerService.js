import {
  createInMemoryTeacherRosterRepository,
} from './teacherRosterRepository.js'
import {
  createTeacherRosterService,
} from './teacherRosterService.js'
import {
  restoreStudentRosterEntryV1,
} from './teacherDeliveryWireCodec.js'
import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  createPrivateAssignment,
} from './privateAssignment.js'
import {
  createTeacherSelectedMusicXmlScoreAssignmentSourceBinding,
} from './scoreAssignmentSourceBinding.js'
import {
  createStudentPrivatePracticePackageV1,
} from './studentPracticePackageV1.js'
import {
  createInMemoryTeacherChordBoardAssignmentRepository,
} from './teacherChordBoardAssignmentRepository.js'
import {
  createTeacherChordBoardAssignmentService,
} from './teacherChordBoardAssignmentService.js'
import {
  createStudentPrivateChordBoardPackageV1,
} from './studentChordBoardPackageV1.js'
import {
  TEACHER_ASSIGNMENT_DELIVERY_PHASE,
  createTeacherAssignmentDeliveryOrchestrator,
} from './teacherAssignmentDeliveryOrchestrator.js'
import {
  prepareTeacherAssignmentScoreUpload,
} from './teacherAssignmentComposerScoreUpload.js'

function requiredText(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName} must be non-empty text.`)
  }
  return value.trim()
}

function optionalText(value, fieldName) {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') {
    throw new TypeError(`${fieldName} must be text.`)
  }
  return value.trim()
}

function assertClient(client) {
  for (const method of [
    'listTeacherRoster',
    'prepareAssignments',
    'deliverAssignments',
    'createTeacherPiece',
  ]) {
    if (typeof client?.[method] !== 'function') {
      throw new TypeError(
        `secureDeliveryClient must provide ${method}().`,
      )
    }
  }
  return client
}

function deterministicId(
  draftId,
  kind,
  studentId = null,
  index = null,
) {
  const parts = [
    'ses141',
    requiredText(draftId, 'draftId'),
    requiredText(kind, 'kind'),
  ]
  if (studentId !== null) {
    parts.push(requiredText(studentId, 'studentId'))
  }
  if (index !== null) {
    parts.push(String(index))
  }
  return parts.join(':')
}

function exactPieceAcknowledgement(
  value,
  expected,
) {
  return Boolean(
    value &&
    value.pieceAssignmentId ===
      expected.pieceAssignmentId &&
    value.studentId === expected.studentId &&
    value.pieceId === expected.pieceId &&
    value.arrangementId ===
      expected.arrangementId &&
    value.contentRefs?.scoreAssignmentId ===
      expected.scoreAssignmentId &&
    Array.isArray(
      value.contentRefs?.chordAssignmentIds,
    ) &&
    JSON.stringify(
      value.contentRefs.chordAssignmentIds,
    ) ===
      JSON.stringify(
        expected.chordAssignmentIds,
      ),
  )
}

function boundedRecipient({
  studentId,
  delivery,
  pieceLinked,
  deliveredContentTypes,
}) {
  const actualTypes =
    delivery.ok === true &&
    delivery.phase ===
      TEACHER_ASSIGNMENT_DELIVERY_PHASE
        .DELIVERED_TO_STUDENT
      ? Object.freeze([
          ...deliveredContentTypes,
        ])
      : Object.freeze([])

  return Object.freeze({
    studentId,
    ok:
      delivery.ok === true &&
      delivery.phase ===
        TEACHER_ASSIGNMENT_DELIVERY_PHASE
          .DELIVERED_TO_STUDENT &&
      pieceLinked === true,
    phase: delivery.phase,
    pieceLinked,
    deliveredContentTypes:
      actualTypes,
  })
}

export function createTeacherAssignmentComposerService({
  teacherId,
  secureDeliveryClient,
  now,
} = {}) {
  const actorId =
    requiredText(teacherId, 'teacherId')
  const client =
    assertClient(secureDeliveryClient)

  if (typeof now !== 'function') {
    throw new TypeError('now must be a function.')
  }

  const assignedAtByDraft = new Map()
  let authorizedRosterCache = null

  function stableDraftNow(draftId) {
    if (!assignedAtByDraft.has(draftId)) {
      assignedAtByDraft.set(
        draftId,
        requiredText(now(), 'assignedAt'),
      )
    }
    const assignedAt =
      assignedAtByDraft.get(draftId)
    return () => assignedAt
  }

  async function liveRosterService() {
    const raw =
      await client.listTeacherRoster()
    if (!Array.isArray(raw)) {
      throw new Error(
        'assignment-composer-roster-invalid',
      )
    }

    const entries = raw.map(
      restoreStudentRosterEntryV1,
    )
    const repository =
      createInMemoryTeacherRosterRepository(
        entries,
      )

    return createTeacherRosterService({
      repository,
    })
  }

  async function loadRoster() {
    if (authorizedRosterCache !== null) {
      return authorizedRosterCache
    }

    const service =
      await liveRosterService()
    authorizedRosterCache =
      Object.freeze([
        ...service.listStudents({
          includeInactive: false,
        }),
      ])
    return authorizedRosterCache
  }

  async function prepareScoreUpload({
    musicXml,
    draftId,
  } = {}) {
    return prepareTeacherAssignmentScoreUpload({
      musicXml,
      teacherId: actorId,
      draftId,
      now,
    })
  }

  async function send({
    draftId,
    studentIds,
    title,
    teacherNote = '',
    scoreUpload = null,
    chordSnapshots = [],
  } = {}) {
    const normalizedDraftId =
      requiredText(draftId, 'draftId')
    const normalizedTitle =
      requiredText(title, 'title')
    const normalizedTeacherNote =
      optionalText(
        teacherNote,
        'teacherNote',
      )

    if (!Array.isArray(studentIds)) {
      throw new TypeError(
        'studentIds must be an array.',
      )
    }
    if (!Array.isArray(chordSnapshots)) {
      throw new TypeError(
        'chordSnapshots must be an array.',
      )
    }

    const chordFingerprints =
      chordSnapshots.map(
        (snapshot) =>
          snapshot?.voicingFingerprint,
      )
    if (
      new Set(chordFingerprints).size !==
      chordFingerprints.length
    ) {
      throw new Error(
        'assignment-composer-duplicate-chord-snapshot',
      )
    }

    if (
      scoreUpload === null &&
      chordSnapshots.length === 0
    ) {
      throw new Error(
        'assignment-composer-content-required',
      )
    }

    const itemCount =
      (scoreUpload ? 1 : 0) +
      chordSnapshots.length
    if (itemCount > 40) {
      throw new Error(
        'assignment-composer-content-batch-too-large',
      )
    }

    const rosterService =
      await liveRosterService()
    const draftNow =
      stableDraftNow(normalizedDraftId)
    const selected =
      rosterService.preflightActiveStudentIds(
        studentIds,
      )
    const selectedIds =
      selected.map((row) => row.studentId)

    const scoreByStudent = new Map()
    if (scoreUpload !== null) {
      if (
        typeof scoreUpload?.musicXml !==
          'string' ||
        scoreUpload.musicXml.length === 0 ||
        typeof scoreUpload
          ?.musicXmlFingerprint !==
          'string' ||
        !/^[0-9a-f]{64}$/u.test(
          scoreUpload.musicXmlFingerprint,
        ) ||
        scoreUpload?.draftId !==
          normalizedDraftId
      ) {
        throw new TypeError(
          'scoreUpload must be a prepared SES-153 teacher-selected SCORE upload.',
        )
      }

      const assignedAt = draftNow()
      const verifiedScoreUpload =
        await prepareTeacherAssignmentScoreUpload({
          musicXml: scoreUpload.musicXml,
          teacherId: actorId,
          draftId: normalizedDraftId,
          now: draftNow,
        })

      if (
        verifiedScoreUpload
          .musicXmlFingerprint !==
        scoreUpload.musicXmlFingerprint
      ) {
        throw new Error(
          'assignment-composer-score-upload-integrity-mismatch',
        )
      }

      for (const studentId of selectedIds) {
        const authorizationId =
          deterministicId(
            normalizedDraftId,
            'score-authorization',
            studentId,
          )
        const sourceRef =
          createTeacherSelectedMusicXmlScoreAssignmentSourceBinding({
            scoreUpload,
            studentId,
            authorizationId,
            createdAt: assignedAt,
          })

        const assignment =
          createPrivateAssignment({
            assignmentId:
              deterministicId(
                normalizedDraftId,
                'score-assignment',
                studentId,
              ),
            studentId,
            practiceType:
              PRIVATE_ASSIGNMENT_PRACTICE_TYPE
                .SCORE,
            teacherNote:
              normalizedTeacherNote,
            assignedAt,
            sourceRef,
          })

        const pkg =
          createStudentPrivatePracticePackageV1({
            packageId:
              deterministicId(
                normalizedDraftId,
                'score-package',
                studentId,
              ),
            workId: sourceRef.sourceId,
            title: normalizedTitle,
            revisionId:
              sourceRef.revisionId,
            approvedAt: assignedAt,
            studentId,
            musicXml:
              verifiedScoreUpload.musicXml,
            guitarTabMusicXml: null,
            canonicalEvents:
              verifiedScoreUpload.canonicalEvents,
            practice: {},
          })

        scoreByStudent.set(
          studentId,
          Object.freeze({
            assignment,
            package: pkg,
          }),
        )
      }
    }

    const chordsByStudent = new Map(
      selectedIds.map(
        (studentId) => [
          studentId,
          [],
        ],
      ),
    )

    if (chordSnapshots.length > 0) {
      const repository =
        createInMemoryTeacherChordBoardAssignmentRepository()

      for (
        let chordIndex = 0;
        chordIndex < chordSnapshots.length;
        chordIndex += 1
      ) {
        const chordService =
          createTeacherChordBoardAssignmentService({
            repository,
            rosterService,
            createAssignmentId({
              studentId,
            }) {
              return deterministicId(
                normalizedDraftId,
                'chord-assignment',
                studentId,
                chordIndex,
              )
            },
            now: draftNow,
          })

        const assignments =
          chordService
            .prepareChordBoardAssignments({
              snapshot:
                chordSnapshots[chordIndex],
              studentIds: selectedIds,
              commonTeacherNote:
                normalizedTeacherNote,
              teacherNoteOverrides: [],
            })

        for (const assignment of assignments) {
          chordsByStudent
            .get(assignment.studentId)
            .push(
              Object.freeze({
                assignment,
                package:
                  createStudentPrivateChordBoardPackageV1({
                    assignment,
                    practice: {},
                  }),
              }),
            )
        }
      }
    }

    const deliveryOrchestrator =
      createTeacherAssignmentDeliveryOrchestrator({
        secureDeliveryClient: client,
      })

    const recipients = []

    for (const studentId of selectedIds) {
      const items = []
      const scoreItem =
        scoreByStudent.get(studentId)
      if (scoreItem) items.push(scoreItem)
      items.push(
        ...(chordsByStudent.get(studentId) ?? []),
      )

      const deliveredContentTypes =
        Object.freeze([
          ...(scoreItem
            ? ['SCORE']
            : []),
          ...((chordsByStudent
            .get(studentId) ?? [])
            .length > 0
            ? ['CHORD_BOARD']
            : []),
        ])

      const delivery =
        await deliveryOrchestrator
          .deliver(items)

      if (
        delivery.ok !== true ||
        delivery.phase !==
          TEACHER_ASSIGNMENT_DELIVERY_PHASE
            .DELIVERED_TO_STUDENT
      ) {
        recipients.push(
          boundedRecipient({
            studentId,
            delivery,
            pieceLinked: false,
            deliveredContentTypes:
              Object.freeze([]),
          }),
        )
        continue
      }

      const scoreAssignmentId =
        scoreItem?.assignment
          .assignmentId ?? null
      const chordAssignmentIds =
        (chordsByStudent.get(studentId) ?? [])
          .map(
            (item) =>
              item.assignment.assignmentId,
          )

      const pieceInput = Object.freeze({
        pieceAssignmentId:
          deterministicId(
            normalizedDraftId,
            'piece-assignment',
            studentId,
          ),
        pieceId:
          deterministicId(
            normalizedDraftId,
            'work',
          ),
        arrangementId:
          deterministicId(
            normalizedDraftId,
            'arrangement',
          ),
        studentId,
        title: normalizedTitle,
        teacherNote:
          normalizedTeacherNote,
        scoreAssignmentId,
        chordAssignmentIds:
          Object.freeze(
            [...chordAssignmentIds],
          ),
      })

      let pieceLinked = false
      try {
        const acknowledgement =
          await client
            .createTeacherPiece(
              pieceInput,
            )
        pieceLinked =
          exactPieceAcknowledgement(
            acknowledgement,
            pieceInput,
          )
      } catch {
        pieceLinked = false
      }

      recipients.push(
        boundedRecipient({
          studentId,
          delivery,
          pieceLinked,
          deliveredContentTypes,
        }),
      )
    }

    const frozenRecipients =
      Object.freeze(recipients)

    return Object.freeze({
      ok:
        frozenRecipients.length > 0 &&
        frozenRecipients.every(
          (row) => row.ok,
        ),
      recipients:
        frozenRecipients,
    })
  }

  return Object.freeze({
    loadRoster,
    prepareScoreUpload,
    send,
  })
}
