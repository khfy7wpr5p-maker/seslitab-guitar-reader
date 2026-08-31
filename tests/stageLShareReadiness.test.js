import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Reuse the repository's established DOMParser test polyfill for Package 2C.
import '../scripts/runOmrQualityReport.js'

import {
  CANONICAL_NOTE_SCHEMA_VERSION,
  CANONICAL_VERIFICATION_STATUS,
} from '../noteTheory.js'
import { prepareMusicXmlQualityGate } from '../src/services/appQualityGate.js'
import {
  approveTeacherWorkspace,
  createTeacherWorkspace,
} from '../src/services/teacherWorkspaceModel.js'
import {
  STAGE_L_DELIVERY_STATE,
  STAGE_L_SHARE_READINESS_ROUTE,
  STAGE_L_SHARE_READINESS_STATUS,
  evaluateStageLShareReadiness,
} from '../src/services/stageLShareReadiness.js'

const VALID_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`

function verificationState() {
  return {
    schemaVersion: CANONICAL_NOTE_SCHEMA_VERSION,
    status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    pitch: { valid: true, status: CANONICAL_VERIFICATION_STATUS.VERIFIED },
    time: { valid: true, status: CANONICAL_VERIFICATION_STATUS.VERIFIED },
  }
}

function verifiedNotes() {
  return ['Do', 'Re', 'Mi', 'Fa'].map((noteName, index) => ({
    partId: 'P1',
    measureNumber: 1,
    measureKey: 'P1:0',
    measureIndex: 0,
    voice: 1,
    staff: 1,
    startBeat: index,
    beats: 1,
    noteName,
    sourceVerificationState: verificationState(),
  }))
}

function workspaceFor(notes) {
  return createTeacherWorkspace({
    content: notes,
    actorId: 'teacher-1',
    sourceId: 'score-1',
    automaticRevisionId: 'auto-1',
    historyId: 'history-1',
    createdAt: '2026-08-31T10:50:00Z',
  })
}

function approvedWorkspace(notes) {
  return approveTeacherWorkspace({
    workspace: workspaceFor(notes),
    approvalId: 'approval-1',
    createdAt: '2026-08-31T10:51:00Z',
  })
}

function evaluate(workspace, notes) {
  return evaluateStageLShareReadiness({
    workspace,
    sourceNotes: notes,
    recipientId: 'student-1',
    authorizationId: 'auth-1',
    rootQualityEvidenceId: 'quality-1',
    revalidationEvidenceId: 'revalidation-1',
    createdAt: '2026-08-31T10:52:00Z',
  })
}

test('Stage L requires exact-revision teacher approval before creating share readiness', () => {
  const notes = verifiedNotes()
  const result = evaluate(workspaceFor(notes), notes)

  assert.equal(result.status, STAGE_L_SHARE_READINESS_STATUS.APPROVAL_REQUIRED)
  assert.equal(result.eligible, false)
  assert.equal(result.route, STAGE_L_SHARE_READINESS_ROUTE.NONE)
  assert.equal(result.deliveryState, STAGE_L_DELIVERY_STATE)
  assert.equal(result.deliveryAllowed, false)
  assert.equal(result.authorizationId, null)
})

test('Stage L automatic exact revision becomes readiness-eligible only through live Package 12 T2 evidence', () => {
  const notes = verifiedNotes()
  prepareMusicXmlQualityGate(notes, VALID_XML)
  const workspace = approvedWorkspace(notes)

  const result = evaluate(workspace, notes)

  assert.equal(result.status, STAGE_L_SHARE_READINESS_STATUS.READY_EXACT_REVISION)
  assert.equal(result.eligible, true)
  assert.equal(result.route, STAGE_L_SHARE_READINESS_ROUTE.PACKAGE_12_T2)
  assert.equal(result.deliveryState, 'not_implemented')
  assert.equal(result.deliveryAllowed, false)
  assert.equal(result.revisionId, 'auto-1')
  assert.equal(result.recipientId, 'student-1')
  assert.equal(result.authorizationId, 'auth-1')
  assert.equal(result.qualityEvidenceId, 'quality-1')
  assert.equal(result.revalidationEvidenceId, null)

  for (const forbidden of [
    'content',
    'payload',
    'bytes',
    'token',
    'url',
    'link',
    'musicXml',
    'studentContent',
  ]) {
    assert.equal(Object.hasOwn(result, forbidden), false)
  }
})

test('Stage L fails closed when exact Package 12 source quality evidence is unavailable', () => {
  const notes = verifiedNotes()
  const result = evaluate(approvedWorkspace(notes), notes)

  assert.equal(result.status, STAGE_L_SHARE_READINESS_STATUS.SOURCE_QUALITY_NOT_ELIGIBLE)
  assert.equal(result.eligible, false)
  assert.equal(result.deliveryAllowed, false)
  assert.equal(result.route, STAGE_L_SHARE_READINESS_ROUTE.NONE)
  assert.equal(result.authorizationId, 'auth-1')
  assert.equal(result.qualityEvidenceId, null)
})

test('Stage L source remains metadata/readiness-only and main wires UI without delivery APIs', () => {
  const service = readFileSync(
    new URL('../src/services/stageLShareReadiness.js', import.meta.url),
    'utf8',
  )
  const ui = readFileSync(new URL('../src/stageLShareUi.js', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/stageLShareUi.css', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')

  assert.match(service, /createTeacherShareAuthorization/)
  assert.match(service, /createTeacherShareQualityEvidence/)
  assert.match(service, /createTeacherCorrectionRevalidationEvidence/)
  assert.match(service, /createTeacherStructuralCorrectionRevalidationEvidence/)
  assert.doesNotMatch(service, /fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage/)
  assert.doesNotMatch(ui, /fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage/)
  assert.doesNotMatch(ui, /\.href\s*=|createObjectURL|window\.open/)
  assert.match(ui, /eser gönderilmez; link, token veya öğrenci erişimi oluşturulmaz/)
  assert.match(css, /min-height:\s*44px/)
  assert.match(main, /stageLShareUi\.css/)
  assert.match(main, /initStageLShareUi/)
})
