import assert from 'node:assert/strict'

import {
  SmoosicTestDOMParser,
  SmoosicTestXMLSerializer,
} from '../tests/support/smoosicXmlDom.js'
import {
  parseMusicXmlToNotes,
} from '../src/services/musicEngine.js'
import {
  createSmoosicProductAuthority,
} from '../src/services/smoosicProductWriteback.js'
import {
  approveTeacherWorkspace,
  getTeacherWorkspaceApplicableApproval,
  getTeacherWorkspaceCurrentRevision,
} from '../src/services/teacherWorkspaceModel.js'
import {
  createFinalMusicXmlIntake,
} from '../src/services/finalMusicXmlIntake.js'
import {
  createScorePracticePackageFromFinalMusicXml,
} from '../src/services/scorePracticePackageBuilder.js'
import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  createPrivateAssignment,
} from '../src/services/privateAssignment.js'
import {
  getChordBoardVoicings,
} from '../src/services/chordBoardCatalog.js'
import {
  createChordBoardAssignmentSourceBinding,
} from '../src/services/chordBoardAssignmentSourceBinding.js'
import {
  createStudentPrivateChordBoardPackageV1,
} from '../src/services/studentChordBoardPackageV1.js'
import {
  createPieceAssignment,
} from '../src/services/pieceAssignment.js'
import {
  createSecureDeliveryIdentityMapping,
} from '../src/services/secureDeliveryIdentity.js'
import {
  createTeacherStudentGrant,
} from '../src/services/teacherStudentGrant.js'
import {
  TEACHER_ASSIGNMENT_DELIVERY_PHASE,
  createTeacherAssignmentDeliveryOrchestrator,
} from '../src/services/teacherAssignmentDeliveryOrchestrator.js'
import {
  createSecureDeliveryAuthorization,
} from '../backend/delivery/authorization/secureDeliveryAuthorization.js'
import {
  createInMemorySecureDeliveryStore,
} from '../backend/delivery/repositories/inMemorySecureDeliveryStore.js'
import {
  createPreparedAssignmentService,
} from '../backend/delivery/services/preparedAssignmentService.js'
import {
  createTeacherSecureDeliveryService,
} from '../backend/delivery/services/teacherDeliveryService.js'
import {
  createStudentDeliveryReadService,
} from '../backend/delivery/services/studentDeliveryReadService.js'

globalThis.DOMParser =
  globalThis.DOMParser ?? SmoosicTestDOMParser
globalThis.XMLSerializer =
  globalThis.XMLSerializer ?? SmoosicTestXMLSerializer

export const TD_PROD_10_STUDENT_APP_SHA =
  'b59bcb6dc5525f035515ab358734ebbe5a277fbb'

const TEACHER_ID = 'td-prod-10-teacher-a'
const TEACHER_SUBJECT = 'td-prod-10-uid-teacher'
const STUDENT_A_ID = 'td-prod-10-student-a'
const STUDENT_A_SUBJECT = 'td-prod-10-uid-student-a'
const STUDENT_B_ID = 'td-prod-10-student-b'
const STUDENT_B_SUBJECT = 'td-prod-10-uid-student-b'
const ASSIGNED_AT = '2026-09-30T18:10:00Z'
const PREPARED_AT = '2026-09-30T18:11:00Z'
const DELIVERED_AT = '2026-09-30T18:12:00Z'

const FINAL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Guitar</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction placement="above"><direction-type><metronome>
        <beat-unit>quarter</beat-unit><per-minute>60</per-minute>
      </metronome></direction-type><sound tempo="60"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`

const TAB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Guitar TAB</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><attributes>
    <divisions>1</divisions><key><fifths>0</fifths></key>
    <time><beats>4</beats><beat-type>4</beat-type></time>
    <staves>2</staves>
    <clef number="1"><sign>G</sign><line>2</line></clef>
    <clef number="2"><sign>TAB</sign><line>5</line></clef>
    <staff-details number="2"><staff-lines>6</staff-lines>
      <staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
      <staff-tuning line="2"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
      <staff-tuning line="3"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
      <staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
      <staff-tuning line="5"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
      <staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>
    </staff-details>
  </attributes>
  <note><pitch><step>B</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
  <note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
  <backup><duration>4</duration></backup>
  <note><pitch><step>B</step><octave>4</octave></pitch><duration>2</duration><voice>5</voice><type>half</type><staff>2</staff>
    <notations><technical><string>1</string><fret>7</fret></technical></notations></note>
  <note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><voice>5</voice><type>half</type><staff>2</staff>
    <notations><technical><string>1</string><fret>12</fret></technical></notations></note>
  </measure></part>
</score-partwise>`

const MALFORMED_XML = '<score-partwise version="4.0"><part-list>';

function parsedNotes(xml = FINAL_XML) {
  const parsed = parseMusicXmlToNotes(xml)
  if (
    parsed?.error ||
    !Array.isArray(parsed?.notes) ||
    parsed.notes.length === 0
  ) {
    throw new Error(
      'TD-PROD-10 final MusicXML must parse semantically.',
    )
  }
  return parsed.notes
}

function mapping({
  providerSubject,
  role,
  teacherId = null,
  studentId = null,
}) {
  return createSecureDeliveryIdentityMapping({
    providerSubject,
    role,
    teacherId,
    studentId,
    active: true,
    createdAt: '2026-09-30T18:00:00Z',
    disabledAt: null,
  })
}

function createDeliveryHarness({
  withGrant = true,
} = {}) {
  const store = createInMemorySecureDeliveryStore({
    identityMappings: [
      mapping({
        providerSubject: TEACHER_SUBJECT,
        role: 'TEACHER',
        teacherId: TEACHER_ID,
      }),
      mapping({
        providerSubject: STUDENT_A_SUBJECT,
        role: 'STUDENT',
        studentId: STUDENT_A_ID,
      }),
      mapping({
        providerSubject: STUDENT_B_SUBJECT,
        role: 'STUDENT',
        studentId: STUDENT_B_ID,
      }),
    ],
    grants: withGrant
      ? [
          createTeacherStudentGrant({
            teacherId: TEACHER_ID,
            studentId: STUDENT_A_ID,
            active: true,
            createdAt: '2026-09-30T18:00:00Z',
            revokedAt: null,
          }),
        ]
      : [],
  })

  const authorization =
    createSecureDeliveryAuthorization({
      store,
    })
  const prepared =
    createPreparedAssignmentService({
      authorization,
      store,
      now: () => PREPARED_AT,
    })
  let historyIndex = 0
  const teacher =
    createTeacherSecureDeliveryService({
      authorization,
      store,
      now: () => DELIVERED_AT,
      createHistoryEventId: () =>
        `td-prod-10-history-${++historyIndex}`,
    })
  const student =
    createStudentDeliveryReadService({
      authorization,
      store,
    })

  return {
    store,
    prepared,
    teacher,
    student,
  }
}

function createScoreSourceRef(workspace) {
  const revision =
    getTeacherWorkspaceCurrentRevision(
      workspace,
    )
  const approval =
    getTeacherWorkspaceApplicableApproval(
      workspace,
    )

  if (!approval) {
    throw new Error(
      'TD-PROD-10 teacher approval missing.',
    )
  }

  return Object.freeze({
    schemaVersion: 1,
    sourceKind: 'score_exact_revision',
    studentId: STUDENT_A_ID,
    sourceId: revision.sourceId,
    sourceRevisionId:
      revision.sourceRevisionId,
    revisionId: revision.revisionId,
    revisionKind: revision.revisionKind,
    contentFingerprint:
      revision.contentFingerprint,
    lineageFingerprint:
      revision.lineageFingerprint,
    approvalId: approval.approvalId,
    authorizationId:
      'td-prod-10-authorization-a',
    qualityEvidenceId:
      'td-prod-10-quality-a',
    revalidationEvidenceId:
      'td-prod-10-revalidation-a',
    readinessRoute: 'package12_t2',
    package12Status:
      'eligible_exact_revision',
    boundAt: ASSIGNED_AT,
  })
}

async function createScoreItem() {
  const authority =
    createSmoosicProductAuthority({
      notes: parsedNotes(),
      musicXml: FINAL_XML,
      sourceId: 'td-prod-10-source-a',
      automaticRevisionId:
        'td-prod-10-root-a',
      historyId: 'td-prod-10-history-a',
      actorId: TEACHER_ID,
      createdAt:
        '2026-09-30T18:05:00Z',
    })
  const workspace =
    approveTeacherWorkspace({
      workspace: authority.workspace,
      approvalId:
        'td-prod-10-approval-a',
      createdAt:
        '2026-09-30T18:06:00Z',
    })
  const revision =
    getTeacherWorkspaceCurrentRevision(
      workspace,
    )
  const intake =
    await createFinalMusicXmlIntake({
      workspace,
      revision,
    })
  const assignment =
    createPrivateAssignment({
      assignmentId:
        'td-prod-10-score-a',
      studentId: STUDENT_A_ID,
      practiceType:
        PRIVATE_ASSIGNMENT_PRACTICE_TYPE
          .SCORE,
      teacherNote:
        'Nota, TAB ve akoru birlikte çalış.',
      assignedAt: ASSIGNED_AT,
      sourceRef:
        createScoreSourceRef(workspace),
    })
  const pkg =
    await createScorePracticePackageFromFinalMusicXml({
      workspace,
      assignment,
      intake,
      packageId:
        'td-prod-10-score-package-a',
      title: 'TD-PROD-10 E2E Etüdü',
      practice: {
        tempoBpm: 60,
        allowTempoChange: true,
        allowMeasureRepeat: true,
      },
      guitarTabMusicXml: TAB_XML,
    })

  return Object.freeze({
    assignment,
    package: pkg,
  })
}

function createChordItem() {
  const snapshot =
    getChordBoardVoicings('C')[0]
  if (!snapshot) {
    throw new Error(
      'TD-PROD-10 C chord snapshot unavailable.',
    )
  }
  const assignment =
    createPrivateAssignment({
      assignmentId:
        'td-prod-10-chord-a',
      studentId: STUDENT_A_ID,
      practiceType:
        PRIVATE_ASSIGNMENT_PRACTICE_TYPE
          .CHORD_BOARD,
      teacherNote:
        'C majör açık pozisyonu temiz çal.',
      assignedAt: ASSIGNED_AT,
      sourceRef:
        createChordBoardAssignmentSourceBinding({
          studentId: STUDENT_A_ID,
          snapshot,
          boundAt: ASSIGNED_AT,
        }),
    })
  const pkg =
    createStudentPrivateChordBoardPackageV1({
      assignment,
      practice: {
        repeatCount: 4,
      },
    })

  return Object.freeze({
    assignment,
    package: pkg,
  })
}

function createPiece(score, chord) {
  return createPieceAssignment({
    pieceAssignmentId:
      'td-prod-10-piece-a',
    pieceId: 'td-prod-10-work-a',
    arrangementId:
      'td-prod-10-guitar-standard',
    studentId: STUDENT_A_ID,
    title: 'TD-PROD-10 E2E Etüdü',
    teacherNote:
      'Nota, TAB ve akor görünümünü birlikte çalış.',
    assignedAt: ASSIGNED_AT,
    contentRefs: {
      scoreAssignmentId:
        score.assignment.assignmentId,
      chordAssignmentIds: [
        chord.assignment.assignmentId,
      ],
    },
  })
}

async function rejected(action) {
  try {
    await action()
    return false
  } catch {
    return true
  }
}

function browserItem(view, studentId) {
  return Object.freeze({
    accessRef: Object.freeze({
      kind: 'SECURE_DELIVERY',
      deliveryId: view.deliveryId,
    }),
    practiceType: view.practiceType,
    package: view.package,
    studentId,
  })
}

async function revokedDeliveryFailsClosed(score) {
  const harness =
    createDeliveryHarness()

  await harness.prepared.prepareBatch({
    providerSubject: TEACHER_SUBJECT,
    items: [score],
  })
  await harness.teacher.deliverBatch({
    providerSubject: TEACHER_SUBJECT,
    assignmentIds: [
      score.assignment.assignmentId,
    ],
  })

  const before =
    await harness.student.getAssignment({
      providerSubject: STUDENT_A_SUBJECT,
      deliveryId:
        score.assignment.assignmentId,
    })

  await harness.teacher.applyAssignmentAction({
    providerSubject: TEACHER_SUBJECT,
    assignmentId:
      score.assignment.assignmentId,
    action: 'REVOKE',
  })

  const exactReadRejected =
    await rejected(() =>
      harness.student.getAssignment({
        providerSubject: STUDENT_A_SUBJECT,
        deliveryId:
          score.assignment.assignmentId,
      }),
    )
  const listed =
    await harness.student.listAssignments({
      providerSubject: STUDENT_A_SUBJECT,
    })

  return (
    before?.assignmentId ===
      score.assignment.assignmentId &&
    exactReadRejected &&
    listed.every(
      (item) =>
        item.assignmentId !==
        score.assignment.assignmentId,
    )
  )
}

async function malformedMusicXmlRejectedBeforePrepare() {
  const authority =
    createSmoosicProductAuthority({
      notes: parsedNotes(),
      musicXml: MALFORMED_XML,
      sourceId:
        'td-prod-28-malformed-source',
      automaticRevisionId:
        'td-prod-28-malformed-root',
      historyId:
        'td-prod-28-malformed-history',
      actorId: TEACHER_ID,
      createdAt:
        '2026-10-01T10:00:00Z',
    })
  const revision =
    getTeacherWorkspaceCurrentRevision(
      authority.workspace,
    )

  const rejectedAtIntake =
    await rejected(() =>
      createFinalMusicXmlIntake({
        workspace: authority.workspace,
        revision,
      }),
    )

  return rejectedAtIntake
}

async function negativeEvidence({
  score,
  chord,
}) {
  const positive =
    createDeliveryHarness()
  const items = [score, chord]
  await positive.prepared.prepareBatch({
    providerSubject: TEACHER_SUBJECT,
    items,
  })
  await positive.teacher.deliverBatch({
    providerSubject: TEACHER_SUBJECT,
    assignmentIds: items.map(
      (item) =>
        item.assignment.assignmentId,
    ),
  })

  const wrongStudentRejected =
    await rejected(() =>
      positive.student.getAssignment({
        providerSubject:
          STUDENT_B_SUBJECT,
        deliveryId:
          score.assignment.assignmentId,
      }),
    )

  const noGrant =
    createDeliveryHarness({
      withGrant: false,
    })
  const missingGrantRejected =
    await rejected(() =>
      noGrant.prepared.prepareBatch({
        providerSubject:
          TEACHER_SUBJECT,
        items: [score],
      }),
    )

  const staleScore =
    structuredClone(score)
  staleScore.assignment.sourceRef
    .revisionId =
      'td-prod-10-stale-revision'
  const staleHarness =
    createDeliveryHarness()
  const staleScoreAuthorityRejected =
    await rejected(() =>
      staleHarness.prepared.prepareBatch({
        providerSubject:
          TEACHER_SUBJECT,
        items: [staleScore],
      }),
    )

  const tamperedChord =
    structuredClone(chord)
  tamperedChord.assignment.sourceRef
    .snapshot.voicing.frets =
      [-1, 3, 2, 0, 1, 3]
  tamperedChord.package.content
    .chordBoard.voicing.frets =
      [-1, 3, 2, 0, 1, 3]
  const tamperedHarness =
    createDeliveryHarness()
  const tamperedChordFingerprintRejected =
    await rejected(() =>
      tamperedHarness.prepared.prepareBatch({
        providerSubject:
          TEACHER_SUBJECT,
        items: [tamperedChord],
      }),
    )

  let oversizedPrepareCalls = 0
  const oversized =
    createTeacherAssignmentDeliveryOrchestrator({
      maxPrepareBatchBytes: 1,
      secureDeliveryClient: {
        async prepareAssignments() {
          oversizedPrepareCalls += 1
          return []
        },
        async deliverAssignments() {
          throw new Error('must-not-run')
        },
      },
    })
  const oversizedResult =
    await oversized.deliver([score])
  const oversizedPrepareRejectedBeforeNetwork =
    !oversizedResult.ok &&
    oversizedResult.phase ===
      TEACHER_ASSIGNMENT_DELIVERY_PHASE
        .LOCAL_ASSIGNMENT_ONLY &&
    oversizedPrepareCalls === 0

  const replayPrepared =
    await positive.prepared.prepareBatch({
      providerSubject: TEACHER_SUBJECT,
      items,
    })
  const replayDelivered =
    await positive.teacher.deliverBatch({
      providerSubject: TEACHER_SUBJECT,
      assignmentIds: items.map(
        (item) =>
          item.assignment.assignmentId,
      ),
    })
  const exactReplayIdempotent =
    replayPrepared.length === 2 &&
    replayDelivered.length === 2

  const retryHarness =
    createDeliveryHarness()
  let failDelivery = true
  const retryClient = {
    prepareAssignments(batch) {
      return retryHarness.prepared
        .prepareBatch({
          providerSubject:
            TEACHER_SUBJECT,
          items: batch,
        })
    },
    deliverAssignments(ids) {
      if (failDelivery) {
        failDelivery = false
        throw new Error(
          'TD-PROD-10 injected delivery failure',
        )
      }
      return retryHarness.teacher
        .deliverBatch({
          providerSubject:
            TEACHER_SUBJECT,
          assignmentIds: ids,
        })
    },
  }
  const retryOrchestrator =
    createTeacherAssignmentDeliveryOrchestrator({
      secureDeliveryClient:
        retryClient,
    })
  const first =
    await retryOrchestrator.deliver(
      items,
    )
  const durablePrepareRetainedAfterDeliveryFailure =
    !first.ok &&
    first.phase ===
      TEACHER_ASSIGNMENT_DELIVERY_PHASE
        .DURABLY_PREPARED &&
    await retryHarness.store
      .getPreparedAssignment(
        score.assignment.assignmentId,
      ) !== null &&
    await retryHarness.store
      .getDelivery(
        score.assignment.assignmentId,
      ) === null

  const retried =
    await retryOrchestrator.deliver(
      items,
    )
  const retryReachedDelivered =
    retried.ok &&
    retried.phase ===
      TEACHER_ASSIGNMENT_DELIVERY_PHASE
        .DELIVERED_TO_STUDENT

  return Object.freeze({
    wrongStudentRejected,
    missingGrantRejected,
    staleScoreAuthorityRejected,
    tamperedChordFingerprintRejected,
    oversizedPrepareRejectedBeforeNetwork,
    exactReplayIdempotent,
    durablePrepareRetainedAfterDeliveryFailure,
    retryReachedDelivered,
  })
}

export async function buildTdProd10QualificationFixture() {
  const score =
    await createScoreItem()
  const chord =
    createChordItem()
  const piece =
    createPiece(score, chord)
  const harness =
    createDeliveryHarness()
  const items = [score, chord]

  await harness.prepared.prepareBatch({
    providerSubject: TEACHER_SUBJECT,
    items,
  })
  await harness.teacher.deliverBatch({
    providerSubject: TEACHER_SUBJECT,
    assignmentIds: items.map(
      (item) =>
        item.assignment.assignmentId,
    ),
  })
  await harness.store
    .putPieceAssignment(piece)

  const scoreView =
    await harness.student.getAssignment({
      providerSubject: STUDENT_A_SUBJECT,
      deliveryId:
        score.assignment.assignmentId,
    })
  const chordView =
    await harness.student.getAssignment({
      providerSubject: STUDENT_A_SUBJECT,
      deliveryId:
        chord.assignment.assignmentId,
    })
  const pieceView =
    await harness.student.getPiece({
      providerSubject: STUDENT_A_SUBJECT,
      pieceAssignmentId:
        piece.pieceAssignmentId,
    })

  assert.equal(
    scoreView.package.content.score.data,
    FINAL_XML,
  )
  assert.equal(
    scoreView.package.content.guitarTab.data,
    TAB_XML,
  )
  assert.deepEqual(
    chordView.package.content.chordBoard
      .voicing.frets,
    chord.package.content.chordBoard
      .voicing.frets,
  )

  return Object.freeze({
    schemaVersion: 1,
    teacherSourceRevision:
      '32c3a8f3704ea936c1b87569280b74ac226da20c',
    studentAppSourceRevision:
      TD_PROD_10_STUDENT_APP_SHA,
    student: Object.freeze({
      studentId: STUDENT_A_ID,
      email:
        'td-prod-10-student-a@example.test',
      password:
        'td-prod-10-password',
      displayName:
        'TD-PROD-10 Student A',
    }),
    score: Object.freeze({
      assignmentId:
        scoreView.assignmentId,
      practiceType:
        scoreView.practiceType,
      package: scoreView.package,
      item: browserItem(
        scoreView,
        STUDENT_A_ID,
      ),
    }),
    chord: Object.freeze({
      assignmentId:
        chordView.assignmentId,
      practiceType:
        chordView.practiceType,
      package: chordView.package,
      item: browserItem(
        chordView,
        STUDENT_A_ID,
      ),
    }),
    piece: pieceView,
    evidence:
      await negativeEvidence({
        score,
        chord,
      }),
  })
}
