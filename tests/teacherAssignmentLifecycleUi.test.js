import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PRIVATE_ASSIGNMENT_STATE,
} from '../src/services/privateAssignment.js'
import {
  mountTeacherAssignmentLifecycleUi,
} from '../src/teacherAssignmentLifecycleUi.js'
import {
  createFakeDocument,
} from './support/fakeTeacherPoolDom.js'

function row({
  assignmentId = 'assignment-a',
  displayNameOrNickname = 'Ada',
  teacherNote = 'Yavaş çalış.',
  state = PRIVATE_ASSIGNMENT_STATE.ACTIVE,
  revoked = false,
} = {}) {
  return Object.freeze({
    assignmentId,
    displayNameOrNickname,
    teacherNote,
    state,
    revoked,
  })
}

function controllerFixture({
  assignments = Object.freeze([row()]),
  actionResult = Object.freeze({
    ok: true,
    record: Object.freeze({}),
    message: 'İşlem tamamlandı.',
  }),
} = {}) {
  const calls = []
  let viewCalls = 0

  return {
    calls,
    get viewCalls() {
      return viewCalls
    },
    api: {
      getViewModel() {
        viewCalls += 1
        return Object.freeze({
          assignments,
        })
      },
      markCompleted(id) {
        calls.push(['complete', id])
        return actionResult
      },
      moveToRepertoire(id) {
        calls.push(['repertoire', id])
        return actionResult
      },
      revoke(id) {
        calls.push(['revoke', id])
        return actionResult
      },
    },
  }
}

function mount({
  assignments,
  actionResult,
} = {}) {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const fixture = controllerFixture({
    assignments,
    actionResult,
  })

  const handle =
    mountTeacherAssignmentLifecycleUi({
      root,
      host,
      controller: fixture.api,
    })

  return {
    root,
    host,
    fixture,
    handle,
  }
}

function article(host, assignmentId) {
  return host
    .querySelectorAll(
      '.teacher-assignment-lifecycle__item',
    )
    .find(
      (node) =>
        node.dataset.assignmentId ===
        assignmentId,
    ) ?? null
}

function button(node, label) {
  return node
    .querySelectorAll('button')
    .find(
      (candidate) =>
        candidate.textContent === label,
    ) ?? null
}

function visibleText(node) {
  return [
    node.textContent || '',
    ...node.children.map(visibleText),
  ].join(' ')
}

test('TD-05 UI mounts Ödev Yönetimi and never claims delivery', () => {
  const { host, handle } = mount()

  assert.equal(
    host.querySelector('h2').textContent,
    'Ödev Yönetimi',
  )
  assert.doesNotMatch(
    visibleText(host),
    /Gönderildi|Teslim edildi|Öğrenciye gönder/i,
  )
  assert.equal(
    typeof handle.refresh,
    'function',
  )
  assert.equal(
    typeof handle.destroy,
    'function',
  )
})

test('TD-05 UI renders only valid actions for ACTIVE COMPLETED and REPERTOIRE rows', () => {
  const { host } = mount({
    assignments: Object.freeze([
      row({
        assignmentId: 'assignment-active',
        state: PRIVATE_ASSIGNMENT_STATE.ACTIVE,
      }),
      row({
        assignmentId: 'assignment-completed',
        state: PRIVATE_ASSIGNMENT_STATE.COMPLETED,
      }),
      row({
        assignmentId: 'assignment-repertoire',
        state: PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
      }),
    ]),
  })

  const active =
    article(host, 'assignment-active')
  assert.notEqual(
    button(active, 'Tamamlandı'),
    null,
  )
  assert.equal(
    button(active, 'Repertuara Ekle'),
    null,
  )
  assert.notEqual(
    button(active, 'Geri Çek'),
    null,
  )

  const completed =
    article(host, 'assignment-completed')
  assert.equal(
    button(completed, 'Tamamlandı'),
    null,
  )
  assert.notEqual(
    button(completed, 'Repertuara Ekle'),
    null,
  )
  assert.notEqual(
    button(completed, 'Geri Çek'),
    null,
  )

  const repertoire =
    article(host, 'assignment-repertoire')
  assert.equal(
    button(repertoire, 'Tamamlandı'),
    null,
  )
  assert.equal(
    button(repertoire, 'Repertuara Ekle'),
    null,
  )
  assert.notEqual(
    button(repertoire, 'Geri Çek'),
    null,
  )
})

test('TD-05 UI renders revoked REPERTOIRE history with no mutation buttons', () => {
  const { host } = mount({
    assignments: Object.freeze([
      row({
        assignmentId: 'assignment-r',
        state: PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
        revoked: true,
      }),
    ]),
  })

  const item =
    article(host, 'assignment-r')

  assert.match(
    visibleText(item),
    /Geri çekildi/,
  )
  assert.equal(
    item.querySelectorAll('button').length,
    0,
  )
})

test('TD-05 UI shows teacher presentation but not raw assignment identity as visible text', () => {
  const { host } = mount({
    assignments: Object.freeze([
      row({
        assignmentId: 'assignment-secret-id',
        displayNameOrNickname: 'Ada',
        teacherNote: 'Metronom 60 BPM.',
      }),
    ]),
  })

  const text = visibleText(host)

  assert.match(text, /Ada/)
  assert.match(text, /Metronom 60 BPM/)
  assert.doesNotMatch(
    text,
    /assignment-secret-id/,
  )
  assert.equal(
    article(host, 'assignment-secret-id')
      .dataset.assignmentId,
    'assignment-secret-id',
  )
})

test('TD-05 UI dispatches exact lifecycle actions and refreshes only on success', () => {
  for (const scenario of [
    {
      state: PRIVATE_ASSIGNMENT_STATE.ACTIVE,
      label: 'Tamamlandı',
      call: ['complete', 'assignment-a'],
    },
    {
      state: PRIVATE_ASSIGNMENT_STATE.COMPLETED,
      label: 'Repertuara Ekle',
      call: ['repertoire', 'assignment-a'],
    },
    {
      state: PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
      label: 'Geri Çek',
      call: ['revoke', 'assignment-a'],
    },
  ]) {
    const { host, fixture } = mount({
      assignments: Object.freeze([
        row({ state: scenario.state }),
      ]),
    })

    const before = fixture.viewCalls
    button(
      article(host, 'assignment-a'),
      scenario.label,
    ).dispatchEvent({
      type: 'click',
    })

    assert.deepEqual(
      fixture.calls,
      [scenario.call],
    )
    assert.equal(
      fixture.viewCalls,
      before + 1,
    )
  }
})

test('TD-05 UI failed action shows bounded message and does not refresh', () => {
  const { host, fixture } = mount({
    actionResult: Object.freeze({
      ok: false,
      record: null,
      message: 'Ödev işlemi doğrulanamadı.',
    }),
  })

  const before = fixture.viewCalls
  button(
    article(host, 'assignment-a'),
    'Tamamlandı',
  ).dispatchEvent({
    type: 'click',
  })

  assert.equal(
    host.querySelector(
      '.teacher-assignment-lifecycle__status',
    ).textContent,
    'Ödev işlemi doğrulanamadı.',
  )
  assert.equal(
    fixture.viewCalls,
    before,
  )
})

test('TD-05 UI revoke action remains available from COMPLETED and uses exact ID', () => {
  const { host, fixture } = mount({
    assignments: Object.freeze([
      row({
        assignmentId: 'assignment-completed',
        state: PRIVATE_ASSIGNMENT_STATE.COMPLETED,
      }),
    ]),
  })

  button(
    article(
      host,
      'assignment-completed',
    ),
    'Geri Çek',
  ).dispatchEvent({
    type: 'click',
  })

  assert.deepEqual(
    fixture.calls,
    [['revoke', 'assignment-completed']],
  )
})

test('TD-05 UI destroy removes only its own mounted section', () => {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const sentinel = root.createElement('p')
  sentinel.textContent = 'koru'
  host.appendChild(sentinel)
  const fixture = controllerFixture()

  const handle =
    mountTeacherAssignmentLifecycleUi({
      root,
      host,
      controller: fixture.api,
    })

  handle.destroy()

  assert.equal(
    host.children.includes(sentinel),
    true,
  )
  assert.equal(
    host.querySelector(
      '.teacher-assignment-lifecycle',
    ),
    null,
  )
})
