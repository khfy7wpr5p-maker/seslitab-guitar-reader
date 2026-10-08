import assert from 'node:assert/strict'
import test from 'node:test'

async function loadFactory() {
  const module = await import(
    '../src/services/teacherStudentManagementController.js'
  ).catch(() => null)
  assert.equal(
    typeof module?.createTeacherStudentManagementController,
    'function',
    'teacher student management controller factory must exist',
  )
  return module.createTeacherStudentManagementController
}

function invitedRow(overrides = {}) {
  return Object.freeze({
    managementId: 'invite-a',
    studentId: null,
    displayNameOrNickname: 'Ayşe',
    state: 'INVITED',
    invitationStatus: 'PENDING',
    presenceState: 'UNKNOWN',
    lastOnlineAt: null,
    lastSessionAt: null,
    totalSessions: 0,
    ...overrides,
  })
}

test('controller keeps the one-time invitation link out of its view model and clears it after copy', async () => {
  const createController = await loadFactory()
  const copied = []
  const calls = []
  let rows = []

  const controller = createController({
    apiClient: {
      async createInvitation(input) {
        calls.push(['create', input])
        rows = [invitedRow()]
        return Object.freeze({
          inviteId: 'invite-a',
          displayNameOrNickname: 'Ayşe',
          email: 'ayse@example.test',
          expiresAt: '2026-10-15T00:00:00.000Z',
          state: 'INVITED',
          invitationLink:
            'https://student.example.test/#/invite/RAW_SECRET_TOKEN',
        })
      },
      async listStudents() {
        calls.push(['list'])
        return rows
      },
      async revokeInvitation() {
        throw new Error('unused')
      },
    },
    clipboard: {
      async writeText(value) {
        copied.push(value)
      },
    },
  })

  await controller.createInvitation({
    email: 'ayse@example.test',
    displayNameOrNickname: 'Ayşe',
  })

  const ready = controller.getViewModel()
  assert.equal(ready.invitationLinkReady, true)
  assert.equal(ready.rows.length, 1)
  assert.equal(ready.rows[0].presenceState, 'UNKNOWN')
  assert.doesNotMatch(
    JSON.stringify(ready),
    /RAW_SECRET_TOKEN|student\.example\.test/,
  )

  await controller.copyInvitationLink()
  assert.deepEqual(copied, [
    'https://student.example.test/#/invite/RAW_SECRET_TOKEN',
  ])
  assert.equal(
    controller.getViewModel().invitationLinkReady,
    false,
  )

  assert.deepEqual(calls[0], [
    'create',
    {
      email: 'ayse@example.test',
      displayNameOrNickname: 'Ayşe',
    },
  ])
  assert.deepEqual(calls[1], ['list'])
})

test('failed clipboard copy keeps the one-time invitation link available for retry without exposing it', async () => {
  const createController = await loadFactory()
  let copyAttempts = 0

  const controller = createController({
    apiClient: {
      async createInvitation() {
        return {
          inviteId: 'invite-a',
          invitationLink: 'https://student.example.test/#/invite/RAW_SECRET_TOKEN',
        }
      },
      async listStudents() {
        return []
      },
      async revokeInvitation() {
        throw new Error('unused')
      },
    },
    clipboard: {
      async writeText() {
        copyAttempts += 1
        throw new Error('clipboard denied')
      },
    },
  })

  await controller.createInvitation({
    email: 'ayse@example.test',
    displayNameOrNickname: 'Ayşe',
  })

  await assert.rejects(
    controller.copyInvitationLink(),
    /copy unavailable/i,
  )
  assert.equal(copyAttempts, 1)
  assert.equal(
    controller.getViewModel().invitationLinkReady,
    true,
  )
  assert.doesNotMatch(
    JSON.stringify(controller.getViewModel()),
    /RAW_SECRET_TOKEN/,
  )
})

test('controller revokes only a known pending invitation then refreshes the management rows', async () => {
  const createController = await loadFactory()
  const revoked = []
  let rows = [invitedRow()]

  const controller = createController({
    apiClient: {
      async createInvitation() {
        throw new Error('unused')
      },
      async listStudents() {
        return rows
      },
      async revokeInvitation(inviteId) {
        revoked.push(inviteId)
        rows = [
          invitedRow({
            state: 'INACTIVE',
            invitationStatus: 'REVOKED',
          }),
        ]
        return { inviteId, status: 'REVOKED' }
      },
    },
    clipboard: { async writeText() {} },
  })

  await controller.refresh()
  await controller.revokeInvitation('invite-a')
  assert.deepEqual(revoked, ['invite-a'])
  assert.equal(
    controller.getViewModel().rows[0].invitationStatus,
    'REVOKED',
  )

  await assert.rejects(
    controller.revokeInvitation('invite-a'),
    /pending invitation/i,
  )
})
