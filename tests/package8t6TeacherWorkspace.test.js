import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  TEACHER_EDITABLE_NOTE_FIELDS,
  TEACHER_WORKSPACE_STATE,
  applyTeacherWorkspaceCorrection,
  approveTeacherWorkspace,
  createTeacherWorkspace,
  getTeacherWorkspaceApplicableApproval,
  getTeacherWorkspaceCurrentRevision,
  isTeacherWorkspace,
  listTeacherEditableFields,
  parseTeacherEditableValue,
  refreshTeacherWorkspace,
  undoTeacherWorkspace,
  withTeacherWorkspaceAuthoritativeHistory,
} from '../src/services/teacherWorkspaceModel.js'

function notes() {
  return [
    {
      measure: 1,
      partId: 'P1',
      partIndex: 0,
      measureIndex: 0,
      measureKey: 'P1:0',
      step: 'C',
      alter: 0,
      octave: 4,
      string: 'B',
      fret: 1,
      noteName: 'Do',
      midi: 60,
      frequency: 261.63,
      duration: 'quarter',
      beats: 1,
      durationValue: 4,
      divisions: 4,
      dotCount: 0,
      startBeat: 0,
      voice: 1,
      staff: 1,
      tieStart: false,
      tieStop: false,
      tieContinue: false,
      confidence: 0.85,
      confidenceReason: 'source evidence',
      verification: { status: 'verified' },
    },
  ]
}

function workspace(overrides = {}) {
  return createTeacherWorkspace({
    content: notes(),
    actorId: 'teacher-audit-label',
    sourceId: 'source-1',
    automaticRevisionId: 'auto-1',
    historyId: 'history-1',
    createdAt: '2026-08-28T17:00:00.000Z',
    ...overrides,
  })
}

function correction(ws, {
  fieldKey = '0:step',
  value = 'D',
  revisionId = 'rev-1',
  eventId = 'event-1',
  operationId = 'op-1',
  createdAt = '2026-08-28T17:01:00.000Z',
} = {}) {
  return applyTeacherWorkspaceCorrection({
    workspace: ws,
    fieldKey,
    value,
    revisionId,
    eventId,
    operationId,
    createdAt,
  })
}

test('Package 8-T6 workspace starts from an immutable automatic source without mutating caller notes', () => {
  const source = notes()
  const before = structuredClone(source)
  const ws = createTeacherWorkspace({
    content: source,
    actorId: 'teacher-audit-label',
    sourceId: 'source-1',
    automaticRevisionId: 'auto-1',
    historyId: 'history-1',
    createdAt: '2026-08-28T17:00:00.000Z',
  })

  assert.equal(isTeacherWorkspace(ws), true)
  assert.equal(Object.isFrozen(ws), true)
  assert.equal(Object.isFrozen(ws.history), true)
  assert.equal(ws.state, TEACHER_WORKSPACE_STATE.ACTIVE)
  assert.deepEqual(source, before)
  assert.notEqual(getTeacherWorkspaceCurrentRevision(ws).content, source)
  assert.deepEqual(getTeacherWorkspaceCurrentRevision(ws).content, source)
})

test('Package 8-T6 editor exposes only bounded direct primitive musical fields, never identity or verification evidence', () => {
  const ws = workspace()
  const fields = listTeacherEditableFields(ws)
  const names = new Set(fields.map((field) => field.field))

  assert.ok(names.has('step'))
  assert.ok(names.has('beats'))
  assert.ok(names.has('tieStart'))
  for (const forbidden of [
    'measure',
    'partId',
    'partIndex',
    'measureIndex',
    'measureKey',
    'divisions',
    'startBeat',
    'confidence',
    'confidenceReason',
    'verification',
  ]) {
    assert.equal(names.has(forbidden), false, forbidden)
  }
  assert.deepEqual([...names].every((field) => TEACHER_EDITABLE_NOTE_FIELDS.includes(field)), true)
  assert.equal(Object.isFrozen(fields), true)
  assert.equal(fields.every((field) => Object.isFrozen(field) && Object.isFrozen(field.path)), true)
})

test('Package 8-T6 typed value parser fails closed for invalid number/boolean values', () => {
  const ws = workspace()
  const fields = listTeacherEditableFields(ws)
  const beats = fields.find((field) => field.field === 'beats')
  const tie = fields.find((field) => field.field === 'tieStart')
  const step = fields.find((field) => field.field === 'step')

  assert.equal(parseTeacherEditableValue(beats, '1.5'), 1.5)
  assert.throws(() => parseTeacherEditableValue(beats, 'NaN'), /finite number/)
  assert.equal(parseTeacherEditableValue(tie, 'true'), true)
  assert.throws(() => parseTeacherEditableValue(tie, 'yes'), /true or false/)
  assert.equal(parseTeacherEditableValue(step, 'D'), 'D')
})

test('Package 8-T6 correction creates a new immutable revision and preserves the automatic root', () => {
  const ws0 = workspace()
  const auto = ws0.history.revisions[0]
  const ws1 = correction(ws0)

  assert.equal(ws1.state, TEACHER_WORKSPACE_STATE.ACTIVE)
  assert.equal(ws1.history.revisions.length, 2)
  assert.equal(ws1.history.revisions[0], auto)
  assert.equal(auto.content[0].step, 'C')
  assert.equal(getTeacherWorkspaceCurrentRevision(ws1).content[0].step, 'D')
  assert.equal(ws1.history.correctionAuditEvents.length, 1)
  assert.equal(ws1.history.correctionAuditEvents[0].operations[0].path[0], 0)
  assert.equal(ws1.history.correctionAuditEvents[0].operations[0].path[1], 'step')
})

test('Package 8-T6 correction rejects no-op and unsupported field selection instead of fabricating history', () => {
  const ws = workspace()
  assert.throws(() => correction(ws, { value: 'C' }), /no-op/i)
  assert.throws(
    () => correction(ws, { fieldKey: '0:measureKey', value: 'P1:99' }),
    /not available/,
  )
  assert.equal(ws.history.revisions.length, 1)
  assert.equal(ws.history.correctionAuditEvents.length, 0)
})

test('Package 8-T6 approval applies only to the exact current revision and does not survive a later correction', () => {
  const ws1 = correction(workspace())
  const ws2 = approveTeacherWorkspace({
    workspace: ws1,
    approvalId: 'approval-1',
    createdAt: '2026-08-28T17:02:00.000Z',
  })
  assert.equal(getTeacherWorkspaceApplicableApproval(ws2)?.approvalId, 'approval-1')
  assert.throws(
    () => approveTeacherWorkspace({
      workspace: ws2,
      approvalId: 'approval-duplicate',
      createdAt: '2026-08-28T17:02:30.000Z',
    }),
    /already teacher-approved/,
  )

  const ws3 = correction(ws2, {
    fieldKey: '0:octave',
    value: 5,
    revisionId: 'rev-2',
    eventId: 'event-2',
    operationId: 'op-2',
    createdAt: '2026-08-28T17:03:00.000Z',
  })
  assert.equal(getTeacherWorkspaceApplicableApproval(ws3), null)
  assert.equal(ws3.history.approvalRecords.length, 1)
})

test('Package 8-T6 undo restores historical content as a new revision and never resurrects old approval', () => {
  const ws1 = correction(workspace())
  const ws2 = correction(ws1, {
    fieldKey: '0:octave',
    value: 5,
    revisionId: 'rev-2',
    eventId: 'event-2',
    operationId: 'op-2',
    createdAt: '2026-08-28T17:02:00.000Z',
  })
  const ws3 = approveTeacherWorkspace({
    workspace: ws2,
    approvalId: 'approval-2',
    createdAt: '2026-08-28T17:03:00.000Z',
  })
  const target = ws1.history.revisions.at(-1)
  const ws4 = undoTeacherWorkspace({
    workspace: ws3,
    targetRevisionId: target.revisionId,
    revisionId: 'rev-undo',
    eventId: 'undo-1',
    createdAt: '2026-08-28T17:04:00.000Z',
  })

  assert.equal(ws4.history.revisions.length, 4)
  assert.equal(ws4.history.undoAuditEvents.length, 1)
  assert.deepEqual(getTeacherWorkspaceCurrentRevision(ws4).content, target.content)
  assert.notEqual(
    getTeacherWorkspaceCurrentRevision(ws4).lineageFingerprint,
    target.lineageFingerprint,
  )
  assert.equal(getTeacherWorkspaceApplicableApproval(ws4), null)
  assert.equal(ws4.history.approvalRecords.length, 1)
})

test('Package 8-T6 stale authoritative history produces explicit conflict with zero partial teacher mutation', () => {
  const base = workspace()
  const external = approveTeacherWorkspace({
    workspace: base,
    approvalId: 'external-approval',
    createdAt: '2026-08-28T17:01:00.000Z',
  })
  const stale = withTeacherWorkspaceAuthoritativeHistory({
    workspace: base,
    history: external.history,
  })
  const result = correction(stale, {
    revisionId: 'stale-rev',
    eventId: 'stale-event',
    operationId: 'stale-op',
  })

  assert.equal(result.state, TEACHER_WORKSPACE_STATE.CONFLICT)
  assert.equal(result.conflictReason, 'stale_history')
  assert.equal(result.history, external.history)
  assert.equal(result.history.revisions.length, 1)
  assert.equal(result.history.correctionAuditEvents.length, 0)
  assert.equal(result.history.approvalRecords.length, 1)
})

test('Package 8-T6 conflict cannot silently retry; explicit refresh is required before a new action', () => {
  const base = workspace()
  const external = approveTeacherWorkspace({
    workspace: base,
    approvalId: 'external-approval',
    createdAt: '2026-08-28T17:01:00.000Z',
  })
  const stale = withTeacherWorkspaceAuthoritativeHistory({ workspace: base, history: external.history })
  const conflict = correction(stale, {
    revisionId: 'stale-rev',
    eventId: 'stale-event',
    operationId: 'stale-op',
  })

  assert.throws(
    () => correction(conflict, {
      revisionId: 'silent-retry',
      eventId: 'silent-event',
      operationId: 'silent-op',
    }),
    /explicit refresh/,
  )

  const refreshed = refreshTeacherWorkspace(conflict)
  assert.equal(refreshed.state, TEACHER_WORKSPACE_STATE.ACTIVE)
  const applied = correction(refreshed, {
    revisionId: 'after-refresh',
    eventId: 'after-refresh-event',
    operationId: 'after-refresh-op',
  })
  assert.equal(applied.state, TEACHER_WORKSPACE_STATE.ACTIVE)
  assert.equal(applied.history.revisions.length, 2)
})

test('Package 8-T6 model invents no actor, revision, history, event, approval, or time identity', () => {
  assert.throws(
    () => createTeacherWorkspace({
      content: notes(),
      sourceId: 'source-1',
      automaticRevisionId: 'auto-1',
      historyId: 'history-1',
    }),
    /actorId/,
  )

  const ws = workspace()
  assert.throws(
    () => applyTeacherWorkspaceCorrection({
      workspace: ws,
      fieldKey: '0:step',
      value: 'D',
      revisionId: 'rev-1',
      eventId: 'event-1',
      createdAt: '2026-08-28T17:01:00.000Z',
    }),
    /operationId/,
  )
  assert.throws(
    () => approveTeacherWorkspace({ workspace: ws, createdAt: '2026-08-28T17:01:00.000Z' }),
    /approvalId/,
  )
})

test('Package 8-T6 workspace source stays isolated from OMR/Audiveris, persistence, deployment, and sharing wiring', () => {
  const source = readFileSync(new URL('../src/services/teacherWorkspaceModel.js', import.meta.url), 'utf8')
  assert.match(source, /teacherRevisionModel\.js/)
  assert.match(source, /teacherRevisionConcurrency\.js/)
  assert.doesNotMatch(source, /(?:from\s+['\"](?:\.\.\/)*backend\/|from\s+['\"][^'\"]*(?:audiveris|omrService|gatewayProvider)|\bfetch\s*\(|\blocalStorage\b|\bindexedDB\b|render\.yaml|Dockerfile)/i)
  assert.doesNotMatch(source, /(?:shareAllowed|authorization\s*=|studentSharing)/i)
})
