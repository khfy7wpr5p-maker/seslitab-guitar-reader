import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createFakeDocument,
} from './support/fakeTeacherPoolDom.js'

async function loadMount() {
  const module = await import(
    '../src/teacherStudentManagementUi.js'
  ).catch(() => null)
  assert.equal(
    typeof module?.mountTeacherStudentManagementUi,
    'function',
    'teacher student management UI mount must exist',
  )
  return module.mountTeacherStudentManagementUi
}

function visibleText(node) {
  if (!node) return ''
  return [
    node.textContent,
    ...node.children.map(visibleText),
  ].join(' ')
}

function findButton(host, label) {
  return host
    .querySelectorAll('button')
    .find((button) => button.textContent === label)
}

function row(overrides = {}) {
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

test('student management UI creates invitations without rendering the raw one-time link and preserves UNKNOWN presence', async () => {
  const mount = await loadMount()
  const root = createFakeDocument()
  const host = root.createElement('div')
  const calls = []
  let vm = Object.freeze({
    rows: Object.freeze([row()]),
    loading: false,
    errorCode: null,
    invitationLinkReady: false,
  })

  const controller = {
    getViewModel() {
      return vm
    },
    async refresh() {
      calls.push(['refresh'])
      return vm
    },
    async createInvitation(input) {
      calls.push(['create', input])
      vm = Object.freeze({
        ...vm,
        invitationLinkReady: true,
      })
      return vm
    },
    async copyInvitationLink() {
      calls.push(['copy'])
      vm = Object.freeze({
        ...vm,
        invitationLinkReady: false,
      })
      return vm
    },
    async revokeInvitation(id) {
      calls.push(['revoke', id])
      vm = Object.freeze({
        ...vm,
        rows: Object.freeze([
          row({
            state: 'INACTIVE',
            invitationStatus: 'REVOKED',
          }),
        ]),
      })
      return vm
    },
  }

  const handle = mount({ root, host, controller })
  assert.equal(host.querySelector('h2').textContent, 'Öğrenci Yönetimi')
  assert.match(visibleText(host), /Ayşe/)
  assert.match(visibleText(host), /INVITED/)
  assert.match(visibleText(host), /UNKNOWN/)
  assert.match(visibleText(host), /0 oturum/)

  const form = host.querySelector('form')
  const email = host.querySelector('input[name="email"]')
  const name = host.querySelector('input[name="displayNameOrNickname"]')
  email.value = 'ayse@example.test'
  name.value = 'Ayşe'

  await form.dispatchEventAsync({
    type: 'submit',
    preventDefault() {},
  })

  assert.deepEqual(calls.at(-1), [
    'create',
    {
      email: 'ayse@example.test',
      displayNameOrNickname: 'Ayşe',
    },
  ])
  assert.match(visibleText(host), /Davet bağlantısı hazır/)
  assert.ok(findButton(host, 'Bağlantıyı Kopyala'))
  assert.doesNotMatch(
    visibleText(host),
    /RAW_SECRET_TOKEN|#\/invite\//,
  )

  await findButton(host, 'Bağlantıyı Kopyala').dispatchEventAsync({
    type: 'click',
  })
  assert.deepEqual(calls.at(-1), ['copy'])
  assert.doesNotMatch(visibleText(host), /Davet bağlantısı hazır/)

  await findButton(host, 'Daveti İptal Et').dispatchEventAsync({
    type: 'click',
  })
  assert.deepEqual(calls.at(-1), ['revoke', 'invite-a'])
  assert.match(visibleText(host), /REVOKED/)

  handle.destroy()
  assert.equal(host.children.length, 0)
})

test('student management UI shows informational active metadata without creating assignment authority controls', async () => {
  const mount = await loadMount()
  const root = createFakeDocument()
  const host = root.createElement('div')
  const vm = Object.freeze({
    rows: Object.freeze([
      row({
        managementId: 'relationship-a',
        studentId: 'student-a',
        state: 'ACTIVE',
        invitationStatus: 'ACCEPTED',
        presenceState: 'ONLINE',
        lastOnlineAt: '2026-10-08T08:00:00.000Z',
        lastSessionAt: '2026-10-08T07:30:00.000Z',
        totalSessions: 7,
      }),
    ]),
    loading: false,
    errorCode: null,
    invitationLinkReady: false,
  })

  mount({
    root,
    host,
    controller: {
      getViewModel() { return vm },
      async refresh() { return vm },
      async createInvitation() { throw new Error('unused') },
      async copyInvitationLink() { throw new Error('unused') },
      async revokeInvitation() { throw new Error('unused') },
    },
  })

  const text = visibleText(host)
  assert.match(text, /ACTIVE/)
  assert.match(text, /ONLINE/)
  assert.match(text, /7 oturum/)
  assert.match(text, /2026-10-08T08:00:00.000Z/)
  assert.match(text, /2026-10-08T07:30:00.000Z/)
  assert.equal(findButton(host, 'Daveti İptal Et'), undefined)
  assert.equal(findButton(host, 'Ödev Gönder'), undefined)
})
