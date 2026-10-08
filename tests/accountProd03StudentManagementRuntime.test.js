import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  createTeacherStudentManagementRuntime,
} from '../src/teacherStudentManagementRuntime.js'

const html = await readFile(
  new URL('../index.html', import.meta.url),
  'utf8',
)
const envExample = await readFile(
  new URL('../.env.example', import.meta.url),
  'utf8',
)

function connection(label) {
  let tokenCalls = 0
  const value = Object.freeze({
    async getIdToken() {
      tokenCalls += 1
      return `${label}-token-${tokenCalls}`
    },
  })
  return {
    value,
    tokenCalls() {
      return tokenCalls
    },
  }
}

function runtimeHarness({
  host = Object.freeze({ marker: 'student-host' }),
  accountServiceUrl =
    '  https://accounts.example.test/api/student-accounts/v1  ',
} = {}) {
  const calls = []
  const handles = []
  const root = Object.freeze({
    getElementById(id) {
      assert.equal(
        id,
        'teacher-student-management-host',
      )
      return host
    },
  })

  const runtime =
    createTeacherStudentManagementRuntime({
      root,
      env: {
        VITE_SESLITAB_ACCOUNT_SERVICE_API_URL:
          accountServiceUrl,
      },
      mount(args) {
        calls.push(args)
        const record = {
          destroyCalls: 0,
        }
        handles.push(record)
        return Object.freeze({
          destroy() {
            record.destroyCalls += 1
          },
        })
      },
    })

  return {
    calls,
    handles,
    host,
    root,
    runtime,
  }
}

test('Gate 6 production page exposes a dedicated Student Management host', () => {
  assert.match(
    html,
    /id="teacher-student-management-host"/,
  )
})

test('SesliTab environment contract names the Account Service production endpoint without embedding credentials', () => {
  assert.match(
    envExample,
    /^VITE_SESLITAB_ACCOUNT_SERVICE_API_URL=$/m,
  )
})

test('Gate 6 READY mounts Student Management with the approved endpoint and request-time token seam', async () => {
  const h = runtimeHarness()
  const teacher = connection('teacher-a')

  const handle =
    h.runtime.onReady(teacher.value)

  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].root, h.root)
  assert.equal(h.calls[0].host, h.host)
  assert.equal(
    h.calls[0].baseUrl,
    'https://accounts.example.test/api/student-accounts/v1',
  )
  assert.equal(
    h.calls[0].getIdToken,
    teacher.value.getIdToken,
  )
  assert.equal(handle, h.calls.length ? handle : null)
  assert.equal(
    await h.calls[0].getIdToken(),
    'teacher-a-token-1',
  )
  assert.equal(
    await h.calls[0].getIdToken(),
    'teacher-a-token-2',
  )
  assert.equal(teacher.tokenCalls(), 2)
})

test('Gate 6 reconnect destroys the previous Student Management handle before remounting with new authority', () => {
  const h = runtimeHarness()
  const first = connection('teacher-a')
  const second = connection('teacher-b')

  h.runtime.onReady(first.value)
  h.runtime.onReady(second.value)

  assert.equal(h.calls.length, 2)
  assert.equal(h.handles.length, 2)
  assert.equal(h.handles[0].destroyCalls, 1)
  assert.equal(h.handles[1].destroyCalls, 0)
  assert.equal(
    h.calls[1].getIdToken,
    second.value.getIdToken,
  )
})

test('Gate 6 authority revocation destroys the active Student Management handle exactly once', () => {
  const h = runtimeHarness()

  h.runtime.onReady(connection('teacher-a').value)
  h.runtime.onAuthorityRevoked()
  h.runtime.onAuthorityRevoked()

  assert.equal(h.handles.length, 1)
  assert.equal(h.handles[0].destroyCalls, 1)
})

test('Gate 6 no-host path performs no mount, token request, or network-capable work', () => {
  let mountCalls = 0
  const teacher = connection('teacher-a')
  const runtime =
    createTeacherStudentManagementRuntime({
      root: {
        getElementById() {
          return null
        },
      },
      env: {
        VITE_SESLITAB_ACCOUNT_SERVICE_API_URL:
          'https://accounts.example.test/api/student-accounts/v1',
      },
      mount() {
        mountCalls += 1
        throw new Error('must not mount')
      },
    })

  const result = runtime.onReady(teacher.value)

  assert.equal(result, null)
  assert.equal(mountCalls, 0)
  assert.equal(teacher.tokenCalls(), 0)
})
