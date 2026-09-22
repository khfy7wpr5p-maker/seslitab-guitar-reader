import assert from 'node:assert/strict'
import test from 'node:test'

import {
  mountTeacherScoreAssignmentUi,
} from '../src/teacherScoreAssignmentUi.js'
import {
  createFakeDocument,
} from './support/fakeTeacherPoolDom.js'

function controllerFixture({
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
  prepareResult = Object.freeze({
    ok: true,
    assignments: Object.freeze([
      Object.freeze({
        assignmentId: 'assignment-a',
        studentId: 'student-a',
      }),
    ]),
    message: '1 ödev hazırlandı.',
  }),
} = {}) {
  const calls = []

  return {
    calls,
    api: {
      getViewModel() {
        return Object.freeze({ students })
      },
      prepare(input) {
        calls.push(input)
        return prepareResult
      },
    },
  }
}

function mount({
  prepareResult,
  students,
} = {}) {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const fake = controllerFixture({
    prepareResult,
    students,
  })
  const workspace = Object.freeze({
    marker: 'workspace',
  })
  const sourceNotes = Object.freeze([])

  const handle = mountTeacherScoreAssignmentUi({
    root,
    host,
    controller: fake.api,
    workspace,
    sourceNotes,
  })

  return {
    root,
    host,
    fake,
    handle,
    workspace,
    sourceNotes,
  }
}

function selectionCheckboxes(host) {
  return host.querySelectorAll(
    'input[name="selectedStudentIds"]',
  )
}

function overrideEnabledCheckboxes(host) {
  return host.querySelectorAll(
    'input[name="teacherNoteOverrideEnabled"]',
  )
}

function overrideTextareas(host) {
  return host.querySelectorAll(
    'textarea[name="teacherNoteOverride"]',
  )
}

test('TD-04 UI explicitly mounts Ödevi Hazırla and uses preparation wording only', () => {
  const { host, handle } = mount()

  assert.equal(
    host.querySelector('h2').textContent,
    'Ödevi Hazırla',
  )

  const buttons =
    host.querySelectorAll('button')
  assert.equal(
    buttons.some(
      (node) =>
        node.textContent === 'Ödevi Hazırla',
    ),
    true,
  )
  assert.equal(
    buttons.some(
      (node) =>
        /gönderildi|teslim edildi/i.test(
          node.textContent,
        ),
    ),
    false,
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

test('TD-04 UI keeps duplicate display names separate by stable studentId', () => {
  const { host } = mount()
  const boxes =
    selectionCheckboxes(host)

  assert.deepEqual(
    boxes.map(
      (node) => [node.id, node.value],
    ),
    [
      [
        'teacher-score-assignment-student-a',
        'student-a',
      ],
      [
        'teacher-score-assignment-student-b',
        'student-b',
      ],
    ],
  )
})

test('TD-04 UI submits common note plus selected-student text override', () => {
  const {
    host,
    fake,
    workspace,
    sourceNotes,
  } = mount()

  const selected =
    selectionCheckboxes(host)
  selected[0].checked = true
  selected[0].dispatchEvent({
    type: 'change',
  })
  selected[1].checked = true
  selected[1].dispatchEvent({
    type: 'change',
  })

  const common =
    host.querySelector(
      'textarea[name="commonTeacherNote"]',
    )
  common.value = 'Ortak not'

  const enabled =
    overrideEnabledCheckboxes(host)
  enabled[1].checked = true
  enabled[1].dispatchEvent({
    type: 'change',
  })

  const overrides =
    overrideTextareas(host)
  overrides[1].value =
    'Metronom 60 BPM.'

  host.querySelector('form').dispatchEvent({
    type: 'submit',
    preventDefault() {},
  })

  assert.deepEqual(fake.calls, [{
    workspace,
    sourceNotes,
    studentIds: [
      'student-a',
      'student-b',
    ],
    commonTeacherNote: 'Ortak not',
    teacherNoteOverrides: [{
      studentId: 'student-b',
      teacherNote: 'Metronom 60 BPM.',
    }],
  }])
})

test('TD-04 UI submits explicitly enabled empty override', () => {
  const { host, fake } = mount()

  const selected =
    selectionCheckboxes(host)
  selected[0].checked = true
  selected[0].dispatchEvent({
    type: 'change',
  })

  const common =
    host.querySelector(
      'textarea[name="commonTeacherNote"]',
    )
  common.value = 'Ortak not'

  const enabled =
    overrideEnabledCheckboxes(host)
  enabled[0].checked = true
  enabled[0].dispatchEvent({
    type: 'change',
  })

  overrideTextareas(host)[0].value = ''

  host.querySelector('form').dispatchEvent({
    type: 'submit',
    preventDefault() {},
  })

  assert.deepEqual(
    fake.calls[0].teacherNoteOverrides,
    [{
      studentId: 'student-a',
      teacherNote: '',
    }],
  )
})

test('TD-04 UI excludes stale override after student is deselected', () => {
  const { host, fake } = mount()

  const selected =
    selectionCheckboxes(host)
  selected[0].checked = true
  selected[0].dispatchEvent({
    type: 'change',
  })
  selected[1].checked = true
  selected[1].dispatchEvent({
    type: 'change',
  })

  const enabled =
    overrideEnabledCheckboxes(host)
  enabled[1].checked = true
  enabled[1].dispatchEvent({
    type: 'change',
  })
  overrideTextareas(host)[1].value =
    'Bu not gitmemeli.'

  selected[1].checked = false
  selected[1].dispatchEvent({
    type: 'change',
  })

  host.querySelector('form').dispatchEvent({
    type: 'submit',
    preventDefault() {},
  })

  assert.deepEqual(
    fake.calls[0].studentIds,
    ['student-a'],
  )
  assert.deepEqual(
    fake.calls[0].teacherNoteOverrides,
    [],
  )
})

test('TD-04 UI shows bounded failure without clearing teacher input', () => {
  const { host } = mount({
    prepareResult: Object.freeze({
      ok: false,
      assignments: Object.freeze([]),
      message:
        'Ödev işlemi doğrulanamadı.',
    }),
  })

  const selected =
    selectionCheckboxes(host)
  selected[0].checked = true
  selected[0].dispatchEvent({
    type: 'change',
  })

  const common =
    host.querySelector(
      'textarea[name="commonTeacherNote"]',
    )
  common.value =
    'Korunacak ortak not'

  const enabled =
    overrideEnabledCheckboxes(host)
  enabled[0].checked = true
  enabled[0].dispatchEvent({
    type: 'change',
  })

  const override =
    overrideTextareas(host)[0]
  override.value =
    'Korunacak özel not'

  host.querySelector('form').dispatchEvent({
    type: 'submit',
    preventDefault() {},
  })

  assert.equal(
    host.querySelector(
      '.teacher-score-assignment__status',
    ).textContent,
    'Ödev işlemi doğrulanamadı.',
  )
  assert.equal(
    selected[0].checked,
    true,
  )
  assert.equal(
    common.value,
    'Korunacak ortak not',
  )
  assert.equal(
    enabled[0].checked,
    true,
  )
  assert.equal(
    override.value,
    'Korunacak özel not',
  )
})

test('TD-04 UI destroy removes only its own mounted section', () => {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const sentinel =
    root.createElement('p')
  sentinel.textContent = 'koru'
  host.appendChild(sentinel)
  const fake = controllerFixture()

  const handle =
    mountTeacherScoreAssignmentUi({
      root,
      host,
      controller: fake.api,
      workspace: Object.freeze({
        marker: 'workspace',
      }),
      sourceNotes: Object.freeze([]),
    })

  handle.destroy()

  assert.equal(
    host.children.includes(sentinel),
    true,
  )
  assert.equal(
    host.querySelector(
      '.teacher-score-assignment',
    ),
    null,
  )
})
