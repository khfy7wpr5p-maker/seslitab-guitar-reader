import assert from 'node:assert/strict'
import test from 'node:test'

import {
  mountTeacherPoolPublishingUi,
} from '../src/teacherPoolPublishingUi.js'
import {
  createFakeDocument,
} from './support/fakeTeacherPoolDom.js'

function activeRecord(id = 'pool-a') {
  return Object.freeze({
    schemaVersion: 1,
    item: Object.freeze({
      schemaVersion: 1,
      poolItemId: id,
      title: 'Etüt duyurusu',
      shortDescription: 'Kısa',
      detailText: '',
      publishedAt: '2026-09-22T18:00:00Z',
      audienceMode: 'ALL',
      recipientStudentIds: Object.freeze([]),
      revokedAt: null,
    }),
    revokedAt: null,
  })
}

function controller({
  students = Object.freeze([
    Object.freeze({
      studentId: 'student-a',
      displayNameOrNickname: 'Aynı Ad',
    }),
    Object.freeze({
      studentId: 'student-b',
      displayNameOrNickname: 'Aynı Ad',
    }),
  ]),
  publications = Object.freeze([
    activeRecord(),
  ]),
  publishResult = Object.freeze({
    ok: true,
    record: activeRecord('pool-new'),
    message: 'Havuza gönderildi.',
  }),
} = {}) {
  const calls = {
    publish: [],
    revoke: [],
  }

  return {
    calls,
    api: {
      getViewModel() {
        return Object.freeze({
          students,
          publications,
        })
      },
      publish(input) {
        calls.publish.push(input)
        return publishResult
      },
      revoke(id) {
        calls.revoke.push(id)
        return Object.freeze({
          ok: true,
          record: Object.freeze({
            ...activeRecord(id),
            revokedAt: '2026-09-22T19:00:00Z',
          }),
          message: 'Havuz yayını geri çekildi.',
        })
      },
    },
  }
}

test('TD-03 UI mounts Havuza Gönder without auto-mounting elsewhere', () => {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const fake = controller()

  const handle = mountTeacherPoolPublishingUi({
    root,
    host,
    controller: fake.api,
  })

  assert.equal(host.children.length, 1)
  assert.equal(
    host.children[0].querySelector('h2').textContent,
    'Havuza Gönder',
  )
  assert.equal(typeof handle.refresh, 'function')
  assert.equal(typeof handle.destroy, 'function')
})

test('TD-03 UI keeps duplicate names distinct by stable checkbox ID/value', () => {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const fake = controller()

  mountTeacherPoolPublishingUi({
    root,
    host,
    controller: fake.api,
  })

  const checkboxes =
    host.querySelectorAll(
      'input[name="selectedStudentIds"]',
    )

  assert.deepEqual(
    checkboxes.map((node) => [node.id, node.value]),
    [
      [
        'teacher-pool-student-student-a',
        'student-a',
      ],
      [
        'teacher-pool-student-student-b',
        'student-b',
      ],
    ],
  )
})

test('TD-03 UI submits SELECTED stable IDs and shows acknowledged success', () => {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const fake = controller()

  mountTeacherPoolPublishingUi({
    root,
    host,
    controller: fake.api,
  })

  const title =
    host.querySelector('input[name="title"]')
  const shortDescription =
    host.querySelector(
      'input[name="shortDescription"]',
    )
  const detail =
    host.querySelector('textarea[name="detailText"]')
  const selected =
    host.querySelector(
      'input[value="SELECTED"]',
    )
  const checkboxes =
    host.querySelectorAll(
      'input[name="selectedStudentIds"]',
    )

  title.value = 'Yeni çalışma'
  shortDescription.value = 'Bu hafta'
  detail.value = 'Detay'
  selected.checked = true
  selected.dispatchEvent({ type: 'change' })
  checkboxes[1].checked = true

  host
    .querySelector('form')
    .dispatchEvent({
      type: 'submit',
      preventDefault() {},
    })

  assert.deepEqual(fake.calls.publish, [{
    title: 'Yeni çalışma',
    shortDescription: 'Bu hafta',
    detailText: 'Detay',
    audienceMode: 'SELECTED',
    selectedStudentIds: ['student-b'],
  }])

  assert.equal(
    host.querySelector(
      '.teacher-pool-publishing__status',
    ).textContent,
    'Havuza gönderildi.',
  )
})

test('TD-03 UI does not refresh success state for failed publish', () => {
  const root = createFakeDocument()
  const host = root.createElement('div')
  let viewCalls = 0
  const fake = controller({
    publishResult: Object.freeze({
      ok: false,
      record: null,
      message: 'Havuz işlemi doğrulanamadı.',
    }),
  })
  const originalGetViewModel =
    fake.api.getViewModel

  fake.api.getViewModel = () => {
    viewCalls += 1
    return originalGetViewModel()
  }

  mountTeacherPoolPublishingUi({
    root,
    host,
    controller: fake.api,
  })
  assert.equal(viewCalls, 1)

  host
    .querySelector('form')
    .dispatchEvent({
      type: 'submit',
      preventDefault() {},
    })

  assert.equal(viewCalls, 1)
  assert.equal(
    host.querySelector(
      '.teacher-pool-publishing__status',
    ).textContent,
    'Havuz işlemi doğrulanamadı.',
  )
})

test('TD-03 UI does not refresh history after failed revoke acknowledgement', () => {
  const root = createFakeDocument()
  const host = root.createElement('div')
  let viewCalls = 0
  const fake = controller()
  const originalGetViewModel =
    fake.api.getViewModel

  fake.api.getViewModel = () => {
    viewCalls += 1
    return originalGetViewModel()
  }
  fake.api.revoke = (id) => {
    fake.calls.revoke.push(id)
    return Object.freeze({
      ok: false,
      record: null,
      message: 'Havuz işlemi doğrulanamadı.',
    })
  }

  mountTeacherPoolPublishingUi({
    root,
    host,
    controller: fake.api,
  })
  assert.equal(viewCalls, 1)

  const revokeButton =
    host.querySelectorAll('button')
      .find((node) => node.textContent === 'Geri Çek')
  revokeButton.dispatchEvent({ type: 'click' })

  assert.equal(viewCalls, 1)
  assert.deepEqual(fake.calls.revoke, ['pool-a'])
  assert.equal(
    host.querySelector(
      '.teacher-pool-publishing__status',
    ).textContent,
    'Havuz işlemi doğrulanamadı.',
  )
})

test('TD-03 UI renders Geri Çek only for active history and destroy removes only its section', () => {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const sentinel = root.createElement('p')
  sentinel.textContent = 'koru'
  host.appendChild(sentinel)

  const revoked = Object.freeze({
    ...activeRecord('pool-old'),
    revokedAt: '2026-09-22T17:00:00Z',
  })
  const fake = controller({
    publications: Object.freeze([
      activeRecord('pool-a'),
      revoked,
    ]),
  })

  const handle = mountTeacherPoolPublishingUi({
    root,
    host,
    controller: fake.api,
  })

  assert.equal(
    host.querySelectorAll('button')
      .filter((node) => node.textContent === 'Geri Çek')
      .length,
    1,
  )

  handle.destroy()

  assert.equal(host.children.includes(sentinel), true)
  assert.equal(
    host.querySelector(
      '.teacher-pool-publishing',
    ),
    null,
  )
})
