import assert from 'node:assert/strict'
import test from 'node:test'

import { MAX_MUSIC_XML_SIZE_BYTES } from '../musicXmlSecurity.js'
import { SmoosicTestDOMParser, SmoosicTestXMLSerializer } from './support/smoosicXmlDom.js'
import { parseMusicXmlToNotes } from '../src/services/musicEngine.js'
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
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  createPrivateAssignment,
} from '../src/services/privateAssignment.js'
import {
  validateStudentPracticePackageV1,
} from '../src/services/studentPracticePackageV1.js'
import {
  createScorePracticePackageFromFinalMusicXml,
} from '../src/services/scorePracticePackageBuilder.js'

globalThis.DOMParser = SmoosicTestDOMParser
globalThis.XMLSerializer = SmoosicTestXMLSerializer

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
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`

const TAB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Guitar TAB</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>TAB</sign><line>5</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`

function parsedNotes(xml = FINAL_XML) {
  const parsed = parseMusicXmlToNotes(xml)
  assert.equal(parsed.error, undefined)
  assert.ok(Array.isArray(parsed.notes))
  assert.ok(parsed.notes.length > 0)
  return parsed.notes
}

function baseAuthority({
  sourceId = 'ses-117-source',
  automaticRevisionId = 'ses-117-root',
  historyId = 'ses-117-history',
  approvalId = 'ses-117-approval',
  approvedAt = '2026-09-30T11:35:00Z',
  approve = true,
} = {}) {
  const authority = createSmoosicProductAuthority({
    notes: parsedNotes(),
    musicXml: FINAL_XML,
    sourceId,
    automaticRevisionId,
    historyId,
    actorId: 'teacher-ses-117',
    createdAt: '2026-09-30T11:30:00Z',
  })
  const workspace = approve
    ? approveTeacherWorkspace({
        workspace: authority.workspace,
        approvalId,
        createdAt: approvedAt,
      })
    : authority.workspace
  return {
    ...authority,
    workspace,
  }
}

function scoreSourceRef(workspace, {
  studentId = 'student-a',
  approvalId,
  sourceId,
} = {}) {
  const revision = getTeacherWorkspaceCurrentRevision(workspace)
  const approval = getTeacherWorkspaceApplicableApproval(workspace)
  return Object.freeze({
    schemaVersion: 1,
    sourceKind: 'score_exact_revision',
    studentId,
    sourceId: sourceId ?? revision.sourceId,
    sourceRevisionId: revision.sourceRevisionId,
    revisionId: revision.revisionId,
    revisionKind: revision.revisionKind,
    contentFingerprint: revision.contentFingerprint,
    lineageFingerprint: revision.lineageFingerprint,
    approvalId: approvalId ?? approval?.approvalId ?? 'missing-approval',
    authorizationId: 'authorization-student-a',
    qualityEvidenceId: 'quality-student-a',
    revalidationEvidenceId: 'revalidation-student-a',
    readinessRoute: 'package12_t2',
    package12Status: 'eligible_exact_revision',
    boundAt: '2026-09-30T11:36:00Z',
  })
}

function assignment(workspace, overrides = {}) {
  const studentId = overrides.studentId ?? 'student-a'
  return createPrivateAssignment({
    assignmentId: overrides.assignmentId ?? 'assignment-a',
    studentId,
    practiceType: PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE,
    teacherNote: 'Ölçüleri yavaş çalış.',
    assignedAt: '2026-09-30T11:36:00Z',
    sourceRef: scoreSourceRef(workspace, {
      studentId,
      approvalId: overrides.approvalId,
      sourceId: overrides.sourceId,
    }),
  })
}

async function fixture(options = {}) {
  const authority = baseAuthority(options)
  const revision = getTeacherWorkspaceCurrentRevision(authority.workspace)
  const intake = await createFinalMusicXmlIntake({
    workspace: authority.workspace,
    revision,
  })
  return {
    ...authority,
    revision,
    intake,
    assignment: assignment(authority.workspace),
  }
}

test('SES-117 builds frozen StudentPracticePackageV1 only from exact final MusicXML authority', async () => {
  const current = await fixture()
  const approval = getTeacherWorkspaceApplicableApproval(current.workspace)
  const parsed = parsedNotes()

  const pkg = await createScorePracticePackageFromFinalMusicXml({
    workspace: current.workspace,
    assignment: current.assignment,
    intake: current.intake,
    packageId: 'package-a',
    title: 'Final Etüt',
    practice: {
      tempoBpm: 72,
      allowTempoChange: true,
    },
    guitarTabMusicXml: TAB_XML,
  })

  assert.equal(validateStudentPracticePackageV1(pkg).ok, true)
  assert.equal(Object.isFrozen(pkg), true)
  assert.equal(pkg.packageId, 'package-a')
  assert.equal(pkg.workId, current.intake.sourceId)
  assert.equal(pkg.title, 'Final Etüt')
  assert.equal(pkg.publication.recipientStudentId, current.assignment.studentId)
  assert.equal(pkg.approvedRevision.revisionId, current.intake.revisionId)
  assert.equal(pkg.approvedRevision.approvedAt, approval.createdAt)
  assert.equal(pkg.content.score.data, FINAL_XML)
  assert.equal(pkg.content.guitarTab.data, TAB_XML)
  assert.equal(pkg.content.canonicalEvents.length, current.intake.semanticNoteCount)
  assert.deepEqual(pkg.content.canonicalEvents, parsed)
  assert.equal(Object.isFrozen(pkg.content.canonicalEvents), true)
})

test('SES-117 never accepts stale or forged intake bytes/fingerprints', async () => {
  const current = await fixture()
  const forged = structuredClone(current.intake)
  forged.musicXml = FINAL_XML.replace(
    '<step>D</step>',
    '<step>E</step>',
  )

  await assert.rejects(
    () => createScorePracticePackageFromFinalMusicXml({
      workspace: current.workspace,
      assignment: current.assignment,
      intake: forged,
      packageId: 'package-a',
      title: 'Final Etüt',
      practice: {},
    }),
    /intake|authority|fingerprint|mismatch|stale/i,
  )

  const staleBinding = structuredClone(current.intake)
  staleBinding.revisionId = 'other-revision'

  await assert.rejects(
    () => createScorePracticePackageFromFinalMusicXml({
      workspace: current.workspace,
      assignment: current.assignment,
      intake: staleBinding,
      packageId: 'package-a',
      title: 'Final Etüt',
      practice: {},
    }),
    /intake|revision|mismatch|stale/i,
  )
})

test('SES-117 requires exact assignment source binding to final intake', async () => {
  const current = await fixture()
  const wrongAssignment = assignment(current.workspace, {
    assignmentId: 'assignment-wrong',
    sourceId: 'other-source',
  })

  await assert.rejects(
    () => createScorePracticePackageFromFinalMusicXml({
      workspace: current.workspace,
      assignment: wrongAssignment,
      intake: current.intake,
      packageId: 'package-wrong',
      title: 'Final Etüt',
      practice: {},
    }),
    /assignment|source|binding|mismatch/i,
  )
})

test('SES-117 requires exact current teacher approval and real approval timestamp', async () => {
  const current = await fixture()
  const wrongApprovalAssignment = assignment(current.workspace, {
    assignmentId: 'assignment-wrong-approval',
    approvalId: 'approval-other',
  })

  await assert.rejects(
    () => createScorePracticePackageFromFinalMusicXml({
      workspace: current.workspace,
      assignment: wrongApprovalAssignment,
      intake: current.intake,
      packageId: 'package-wrong-approval',
      title: 'Final Etüt',
      practice: {},
    }),
    /approval|mismatch/i,
  )

  const unapproved = baseAuthority({ approve: false })
  const revision = getTeacherWorkspaceCurrentRevision(unapproved.workspace)
  const intake = await createFinalMusicXmlIntake({
    workspace: unapproved.workspace,
    revision,
  })
  const unapprovedAssignment = assignment(unapproved.workspace, {
    assignmentId: 'assignment-unapproved',
    approvalId: 'approval-missing',
  })

  await assert.rejects(
    () => createScorePracticePackageFromFinalMusicXml({
      workspace: unapproved.workspace,
      assignment: unapprovedAssignment,
      intake,
      packageId: 'package-unapproved',
      title: 'Final Etüt',
      practice: {},
    }),
    /approval|required|missing/i,
  )

  const nullTime = await fixture({
    historyId: 'null-time-history',
    automaticRevisionId: 'null-time-root',
    approvalId: 'null-time-approval',
    approvedAt: null,
  })

  await assert.rejects(
    () => createScorePracticePackageFromFinalMusicXml({
      workspace: nullTime.workspace,
      assignment: nullTime.assignment,
      intake: nullTime.intake,
      packageId: 'package-null-time',
      title: 'Final Etüt',
      practice: {},
    }),
    /approval|timestamp|approvedAt/i,
  )
})

test('SES-117 optional Guitar TAB stays optional and unsafe/oversized TAB fails closed', async () => {
  const current = await fixture()

  const withoutTab = await createScorePracticePackageFromFinalMusicXml({
    workspace: current.workspace,
    assignment: current.assignment,
    intake: current.intake,
    packageId: 'package-no-tab',
    title: 'Final Etüt',
    practice: {},
  })
  assert.equal(withoutTab.content.guitarTab, null)

  for (const badTab of [
    '<html><body>not MusicXML</body></html>',
    '<!DOCTYPE score-partwise [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><score-partwise>&xxe;</score-partwise>',
  ]) {
    await assert.rejects(
      () => createScorePracticePackageFromFinalMusicXml({
        workspace: current.workspace,
        assignment: current.assignment,
        intake: current.intake,
        packageId: 'package-bad-tab',
        title: 'Final Etüt',
        practice: {},
        guitarTabMusicXml: badTab,
      }),
      /tab|musicxml|unsafe|invalid/i,
    )
  }

  const oversizedTab =
    '<score-partwise>' +
    ' '.repeat(Math.min(MAX_MUSIC_XML_SIZE_BYTES, 5_000_001)) +
    '</score-partwise>'

  await assert.rejects(
    () => createScorePracticePackageFromFinalMusicXml({
      workspace: current.workspace,
      assignment: current.assignment,
      intake: current.intake,
      packageId: 'package-oversized-tab',
      title: 'Final Etüt',
      practice: {},
      guitarTabMusicXml: oversizedTab,
    }),
    /tab|large|size|musicxml/i,
  )
})
