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
  createInMemoryTeacherScoreAssignmentRepository,
} from './teacherScoreAssignmentRepository.js'
import {
  createTeacherScoreAssignmentService,
} from './teacherScoreAssignmentService.js'
import {
  createTeacherExportScoreAssignmentSourceBinding,
} from './scoreAssignmentSourceBinding.js'
import {
  createInMemoryTeacherChordBoardAssignmentRepository,
} from './teacherChordBoardAssignmentRepository.js'
import {
  createTeacherChordBoardAssignmentService,
} from './teacherChordBoardAssignmentService.js'
import {
  createScorePracticePackageFromFinalMusicXml,
} from './scorePracticePackageBuilder.js'
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
}) {
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
  })
}

export function createTeacherAssignmentComposerService({
  teacherId,
  secureDeliveryClient,
  verifyScoreSource,
  now,
} = {}) {
  const actorId =
    requiredText(teacherId, 'teacherId')
  const client =
    assertClient(secureDeliveryClient)

  if (typeof verifyScoreSource !== 'function') {
    throw new TypeError(
      'verifyScoreSource must be a function.',
    )
  }
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
    const currentSource =
      await verifyScoreSource(musicXml)
    if (currentSource !== true) {
      throw new Error(
        'assignment-composer-score-upload-stale-or-wrong-source',
      )
    }

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
        scoreUpload?.workspace === undefined ||
        !Array.isArray(
          scoreUpload?.sourceNotes,
        ) ||
        scoreUpload?.intake === undefined
      ) {
        throw new TypeError(
          'scoreUpload must be a prepared SES-141 score upload.',
        )
      }

      const repository =
        createInMemoryTeacherScoreAssignmentRepository()
      const scoreService =
        createTeacherScoreAssignmentService({
          repository,
          rosterService,
          createAssignmentId({
            studentId,
          }) {
            return deterministicId(
              normalizedDraftId,
              'score-assignment',
              studentId,
            )
          },
          createReadinessIds({
            studentId,
          }) {
            return Object.freeze({
              authorizationId:
                deterministicId(
                  normalizedDraftId,
                  'score-authorization',
                  studentId,
                ),
              rootQualityEvidenceId:
                deterministicId(
                  normalizedDraftId,
                  'score-quality',
                  studentId,
                ),
              revalidationEvidenceId:
                deterministicId(
                  normalizedDraftId,
                  'score-revalidation',
                  studentId,
                ),
            })
          },
          createSourceBinding({
            workspace,
            studentId,
            authorizationId,
            createdAt,
          }) {
            return createTeacherExportScoreAssignmentSourceBinding({
              workspace,
              intake:
                scoreUpload.intake,
              studentId,
              authorizationId,
              createdAt,
            })
          },
          now: draftNow,
        })

      const assignments =
        scoreService
          .prepareScoreAssignments({
            workspace:
              scoreUpload.workspace,
            sourceNotes:
              scoreUpload.sourceNotes,
            studentIds: selectedIds,
            commonTeacherNote:
              normalizedTeacherNote,
            teacherNoteOverrides: [],
          })

      for (
        let index = 0;
        index < assignments.length;
        index += 1
      ) {
        const assignment =
          assignments[index]
        const pkg =
          await createScorePracticePackageFromFinalMusicXml({
            workspace:
              scoreUpload.workspace,
            assignment,
            intake: scoreUpload.intake,
            packageId:
              deterministicId(
                normalizedDraftId,
                'score-package',
                assignment.studentId,
              ),
            title: normalizedTitle,
            practice: {},
            guitarTabMusicXml: null,
          })

        scoreByStudent.set(
          assignment.studentId,
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
