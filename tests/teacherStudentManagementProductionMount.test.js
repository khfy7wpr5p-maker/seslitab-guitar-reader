import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createFakeDocument,
} from './support/fakeTeacherPoolDom.js'

async function loadMount() {
  const module = await import(
    '../src/teacherStudentManagementProductionMount.js'
  ).catch(() => null)
  assert.equal(
    typeof module?.mountTeacherStudentManagementProduction,
    'function',
    'student management production mount must exist',
  )
  return module.mountTeacherStudentManagementProduction
}

function visibleText(node) {
  if (!node) return ''
  return [
    node.textContent,
    ...node.children.map(visibleText),
  ].join(' ')
}

function jsonResponse(status, body) {
  return Object.freeze({
    ok: status >= 200 && status < 300,
    status,
    async json() { return body },
  })
}

test('production mount fails closed without Account Service configuration and performs no network call', async () => {
  const mount = await loadMount()
  const root = createFakeDocument()
  const host = root.createElement('div')
  let fetchCalls = 0

  const handle = mount({
    root,
    host,
    baseUrl: '',
    async getIdToken() {
      throw new Error('must not request token')
    },
    async fetchImpl() {
      fetchCalls += 1
      throw new Error('must not fetch')
    },
    clipboard: { async writeText() {} },
  })

  assert.equal(handle.ok, false)
  assert.equal(
    handle.reason,
    'account-service-config-unavailable',
  )
  assert.equal(fetchCalls, 0)
  assert.match(
    visibleText(host),
    /Öğrenci yönetimi servisi yapılandırılmadı/,
  )

  handle.destroy()
  assert.equal(host.children.length, 0)
})

test('production mount loads teacher student-management rows with a fresh Firebase bearer token and no client authority IDs', async () => {
  const mount = await loadMount()
  const root = createFakeDocument()
  const host = root.createElement('div')
  const calls = []
  let tokenCalls = 0

  const handle = mount({
    root,
    host,
    baseUrl:
      'https://accounts.example.test/api/student-accounts/v1',
    async getIdToken() {
      tokenCalls += 1
      return `teacher-token-${tokenCalls}`
    },
    async fetchImpl(url, init) {
      calls.push({ url, init })
      return jsonResponse(200, {
        students: [{
          managementId: 'relationship-a',
          studentId: 'student-a',
          displayNameOrNickname: 'Ayşe',
          state: 'ACTIVE',
          invitationStatus: 'ACCEPTED',
          presenceState: 'ONLINE',
          lastOnlineAt: '2026-10-08T08:00:00.000Z',
          lastSessionAt: '2026-10-08T07:30:00.000Z',
          totalSessions: 7,
        }],
      })
    },
    clipboard: { async writeText() {} },
  })

  assert.equal(handle.ok, true)
  await handle.ready

  assert.equal(calls.length, 1)
  assert.equal(calls[0].init.method, 'GET')
  assert.equal(
    calls[0].init.headers.Authorization,
    'Bearer teacher-token-1',
  )
  assert.equal(calls[0].init.body, undefined)
  assert.doesNotMatch(
    JSON.stringify(calls[0]),
    /teacherId|studentId/i,
  )
  assert.match(visibleText(host), /Ayşe/)
  assert.match(visibleText(host), /ACTIVE/)
  assert.match(visibleText(host), /ONLINE/)

  handle.destroy()
  assert.equal(host.children.length, 0)
})
