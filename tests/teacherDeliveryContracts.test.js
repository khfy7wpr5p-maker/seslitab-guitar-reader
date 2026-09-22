import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

import { createStudentRosterEntry } from '../src/services/studentRosterEntry.js'
import { createPoolItem, POOL_AUDIENCE_MODE } from '../src/services/poolItem.js'
import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  PRIVATE_ASSIGNMENT_STATE,
  isAllowedTeacherAssignmentTransition,
} from '../src/services/privateAssignment.js'

test('TD-01 contracts contain no persistence/network/browser-admin implementation', () => {
  for (const path of [
    '../src/services/studentRosterEntry.js',
    '../src/services/poolItem.js',
    '../src/services/scoreAssignmentSourceBinding.js',
    '../src/services/privateAssignment.js',
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    assert.doesNotMatch(
      source,
      /fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|firebase|adminCredential|bearer|inviteCode/i,
    )
  }
})

test('TD-01 does not wire a delivery UI into production main', () => {
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')
  assert.doesNotMatch(main, /teacherDeliveryUi|teacherPoolPublishingUi|teacherPrivateAssignmentUi/)
})

test('TD-01 Stage L remains readiness-only source authority', () => {
  const stageL = readFileSync(
    new URL('../src/services/stageLShareReadiness.js', import.meta.url),
    'utf8',
  )

  assert.match(stageL, /STAGE_L_DELIVERY_STATE = 'not_implemented'/)
  assert.match(stageL, /deliveryAllowed:\s*false/)
  assert.doesNotMatch(stageL, /delivered_to_student|deliveryAllowed:\s*true/)
})

test('TD-01 pool and roster identity domains remain distinct', () => {
  const roster = createStudentRosterEntry({
    studentId: 'student-1',
    displayNameOrNickname: 'Aynı Ad',
    active: true,
  })
  const pool = createPoolItem({
    poolItemId: 'pool-1',
    title: 'Duyuru',
    shortDescription: 'Kısa',
    detailText: '',
    publishedAt: '2026-09-22T16:30:00Z',
    audienceMode: POOL_AUDIENCE_MODE.SELECTED,
    recipientStudentIds: [roster.studentId],
  })

  assert.deepEqual(pool.recipientStudentIds, ['student-1'])
  assert.equal(Object.hasOwn(pool, 'displayNameOrNickname'), false)
})

test('TD-01 student lifecycle write surface is absent', () => {
  assert.equal(
    isAllowedTeacherAssignmentTransition(
      PRIVATE_ASSIGNMENT_STATE.ACTIVE,
      PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    ),
    true,
  )

  const source = readFileSync(
    new URL('../src/services/privateAssignment.js', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(source, /student.*complete|student.*repertoire|hazırım|readyButton/i)
  assert.match(source, /CHORD_BOARD/)
  assert.match(source, /chord-board-source-contract-deferred-to-td-07/)
  assert.equal(PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE, 'SCORE')
})
