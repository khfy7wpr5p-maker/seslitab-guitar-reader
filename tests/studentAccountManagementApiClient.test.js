import assert from 'node:assert/strict'
import test from 'node:test'

async function loadFactory() {
  const module = await import(
    '../src/services/studentAccountManagementApiClient.js'
  ).catch(() => null)
  assert.equal(
    typeof module?.createStudentAccountManagementApiClient,
    'function',
    'student account management API client factory must exist',
  )
  return module.createStudentAccountManagementApiClient
}

function jsonResponse(status, body) {
  return Object.freeze({
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body
    },
  })
}

test('Human Gate 3 teacher account client uses a fresh Firebase bearer token and never sends client authority IDs', async () => {
  const createClient = await loadFactory()
  const calls = []
  const tokens = ['token-create', 'token-list', 'token-revoke']

  const client = createClient({
    baseUrl: 'https://accounts.example.test/api/student-accounts/v1',
    async getIdToken() {
      return tokens.shift()
    },
    async fetchImpl(url, init = {}) {
      calls.push({ url, init })
      if (url.endsWith('/teacher/invitations') && init.method === 'POST') {
        return jsonResponse(201, {
          inviteId: 'invite-a',
          displayNameOrNickname: 'Ayşe',
          email: 'ayse@example.test',
          expiresAt: '2026-10-15T00:00:00.000Z',
          state: 'INVITED',
          invitationLink: 'https://student.example.test/#/invite/raw-secret',
        })
      }
      if (url.endsWith('/teacher/students') && init.method === 'GET') {
        return jsonResponse(200, {
          students: [{
            managementId: 'invite-a',
            studentId: null,
            displayNameOrNickname: 'Ayşe',
            state: 'INVITED',
            invitationStatus: 'PENDING',
            presenceState: 'UNKNOWN',
            lastOnlineAt: null,
            lastSessionAt: null,
            totalSessions: 0,
          }],
        })
      }
      if (url.endsWith('/teacher/invitations/invite-a/revoke')) {
        return jsonResponse(200, {
          inviteId: 'invite-a',
          status: 'REVOKED',
        })
      }
      throw new Error(`unexpected request: ${url}`)
    },
  })

  const invitation = await client.createInvitation({
    email: 'ayse@example.test',
    displayNameOrNickname: 'Ayşe',
  })
  const students = await client.listStudents()
  const revoked = await client.revokeInvitation('invite-a')

  assert.equal(invitation.inviteId, 'invite-a')
  assert.equal(students.length, 1)
  assert.equal(revoked.status, 'REVOKED')
  assert.equal(calls.length, 3)
  assert.deepEqual(
    calls.map((call) => call.init.headers.Authorization),
    [
      'Bearer token-create',
      'Bearer token-list',
      'Bearer token-revoke',
    ],
  )
  assert.deepEqual(
    calls.map((call) => call.init.method),
    ['POST', 'GET', 'POST'],
  )

  const createBody = JSON.parse(calls[0].init.body)
  assert.deepEqual(createBody, {
    email: 'ayse@example.test',
    displayNameOrNickname: 'Ayşe',
  })
  assert.equal(calls[1].init.body, undefined)
  assert.equal(calls[2].init.body, undefined)

  const serialized = JSON.stringify(calls)
  assert.doesNotMatch(serialized, /teacherId|studentId/i)
})
