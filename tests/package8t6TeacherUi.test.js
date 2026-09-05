import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  clearPackage3Notes,
  publishPackage3Notes,
} from '../package3MeasureBridge.js'
import { approveTeacherWorkspace } from '../src/services/teacherWorkspaceModel.js'
import {
  activateTeacherResultTab,
  applyTeacherUiCorrection,
  approveTeacherUiCurrentRevision,
  ensureTeacherPanel,
  getTeacherUiWorkspace,
  initPackage8TeacherUi,
  refreshTeacherUiAfterConflict,
  setTeacherUiAuthoritativeHistory,
  startTeacherWorkspace,
  undoTeacherUiRevision,
} from '../src/package8TeacherUi.js'

class FakeClassList {
  constructor(element) { this.element = element }
  values() { return String(this.element.className || '').split(/\s+/).filter(Boolean) }
  contains(name) { return this.values().includes(name) }
  toggle(name, force) {
    const values = new Set(this.values())
    const shouldAdd = force === undefined ? !values.has(name) : Boolean(force)
    if (shouldAdd) values.add(name)
    else values.delete(name)
    this.element.className = [...values].join(' ')
    return shouldAdd
  }
}

class FakeElement {
  constructor(root, tagName) {
    this.root = root
    this.tagName = tagName
    this.children = []
    this.attributes = new Map()
    this.listeners = new Map()
    this.dataset = {}
    this.hidden = false
    this.disabled = false
    this.className = ''
    this.classList = new FakeClassList(this)
    this.textContent = ''
    this.value = ''
    this.type = ''
    this.parentElement = null
    this.focused = false
    this._id = ''
  }
  set id(value) {
    if (this._id) this.root.nodes.delete(this._id)
    this._id = value
    if (value) this.root.nodes.set(value, this)
  }
  get id() { return this._id }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child }
  insertBefore(child, before) {
    child.parentElement = this
    const index = this.children.indexOf(before)
    if (index < 0) this.children.push(child)
    else this.children.splice(index, 0, child)
    return child
  }
  removeChild(child) {
    const index = this.children.indexOf(child)
    if (index >= 0) this.children.splice(index, 1)
    child.parentElement = null
    if (child.id) this.root.nodes.delete(child.id)
    return child
  }
  remove() { this.parentElement?.removeChild(this) }
  addEventListener(name, listener, options = false) {
    const list = this.listeners.get(name) ?? []
    list.push({ listener, capture: options === true || options?.capture === true })
    this.listeners.set(name, list)
  }
  dispatch(name) {
    const event = { type: name, currentTarget: this, target: this }
    const list = this.listeners.get(name) ?? []
    for (const entry of list.filter((item) => item.capture)) entry.listener(event)
    for (const entry of list.filter((item) => !item.capture)) entry.listener(event)
  }
  click() { this.dispatch('click') }
  focus() { this.focused = true }
}

function fakeDocument() {
  const root = {
    nodes: new Map(),
    elements: [],
    createElement(tagName) {
      const el = new FakeElement(root, tagName)
      root.elements.push(el)
      return el
    },
    getElementById(id) { return root.nodes.get(id) ?? null },
    querySelector(selector) {
      if (selector.startsWith('.')) {
        const className = selector.slice(1)
        return root.elements.find((el) => el.classList.contains(className)) ?? null
      }
      return null
    },
    querySelectorAll(selector) {
      if (selector.startsWith('.')) {
        const className = selector.slice(1)
        return root.elements.filter((el) => el.classList.contains(className))
      }
      return []
    },
  }

  const results = root.createElement('section'); results.id = 'results-section'
  const body = root.createElement('div'); body.className = 'card-body'; results.appendChild(body)
  const tabs = root.createElement('div'); tabs.className = 'result-tabs'; body.appendChild(tabs)
  for (const name of ['rhythmic', 'html', 'notes', 'xml']) {
    const button = root.createElement('button')
    button.className = name === 'rhythmic' ? 'tab-btn active' : 'tab-btn'
    button.dataset.tab = name
    button.setAttribute('aria-selected', name === 'rhythmic' ? 'true' : 'false')
    tabs.appendChild(button)
    const panel = root.createElement('div'); panel.id = `tab-${name}`; panel.hidden = name !== 'rhythmic'; body.appendChild(panel)
  }
  const live = root.createElement('div'); live.id = 'aria-live-region'; body.appendChild(live)
  const reset = root.createElement('button'); reset.id = 'reset-btn'; body.appendChild(reset)
  return root
}

function sourceNotes(step = 'C') {
  return [
    {
      measure: 1,
      partId: 'P1',
      partIndex: 0,
      measureIndex: 0,
      measureKey: 'P1:0',
      step,
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
    },
  ]
}

function deterministicAdapters() {
  let counter = 0
  return {
    id(prefix) { counter += 1; return `${prefix}-${counter}` },
    now() { counter += 1; return `2026-08-28T17:${String(counter).padStart(2, '0')}:00.000Z` },
  }
}

function setup(notes = sourceNotes()) {
  clearPackage3Notes()
  const root = fakeDocument()
  const unsubscribe = initPackage8TeacherUi(root, deterministicAdapters())
  publishPackage3Notes(notes)
  return { root, unsubscribe }
}

function start(root) {
  root.getElementById('teacher-actor-id').value = 'teacher-audit-label'
  return startTeacherWorkspace(root)
}

test('Package 8-T6 builds a native accessible teacher tab, labelled controls, live status and focusable read-only revision view', () => {
  const { root, unsubscribe } = setup()
  try {
    const panel = ensureTeacherPanel(root)
    const tab = root.getElementById('teacher-tab-btn')
    assert.equal(tab.tagName, 'button')
    assert.equal(tab.getAttribute('role'), 'tab')
    assert.equal(tab.getAttribute('aria-controls'), 'tab-teacher')
    assert.equal(panel.getAttribute('role'), 'tabpanel')
    assert.equal(panel.getAttribute('aria-labelledby'), 'teacher-tab-btn')
    assert.equal(root.getElementById('teacher-status').getAttribute('role'), 'status')
    assert.equal(root.getElementById('teacher-status').getAttribute('aria-live'), 'polite')
    assert.equal(root.getElementById('teacher-current-content').getAttribute('tabindex'), '0')
    assert.equal(root.elements.some((el) => el.tagName === 'label' && el.getAttribute('for') === 'teacher-actor-id'), true)
    assert.equal(root.elements.some((el) => el.tagName === 'label' && el.getAttribute('for') === 'teacher-field-select'), true)
    assert.match(root.getElementById('teacher-safety-note').textContent, /kalite kapısı.*paylaşım izni değildir/i)
  } finally {
    unsubscribe()
    clearPackage3Notes()
  }
})

test('Package 8-T6 teacher tab activates without deleting existing result panels', () => {
  const { root, unsubscribe } = setup()
  try {
    assert.equal(activateTeacherResultTab(root), true)
    assert.equal(root.getElementById('tab-teacher').hidden, false)
    assert.equal(root.getElementById('teacher-tab-btn').getAttribute('aria-selected'), 'true')
    for (const id of ['tab-rhythmic', 'tab-html', 'tab-notes', 'tab-xml']) {
      assert.ok(root.getElementById(id))
      assert.equal(root.getElementById(id).hidden, true)
    }
  } finally {
    unsubscribe()
    clearPackage3Notes()
  }
})

test('Package 8-T6 requires an explicit audit actor label and clearly says it is not authentication', () => {
  const { root, unsubscribe } = setup()
  try {
    assert.equal(startTeacherWorkspace(root), null)
    assert.match(root.getElementById('teacher-status').textContent, /kayıt etiketi gereklidir/i)
    assert.equal(root.getElementById('teacher-status').getAttribute('role'), 'alert')
    assert.match(root.getElementById('teacher-actor-help').textContent, /kimlik doğrulama değildir/i)
    assert.equal(getTeacherUiWorkspace(root), null)
  } finally {
    unsubscribe()
    clearPackage3Notes()
  }
})

test('Package 8-T6 starts from exact published notes and a correction creates a new revision without changing source notes', () => {
  const source = sourceNotes()
  const before = structuredClone(source)
  const { root, unsubscribe } = setup(source)
  try {
    const ws0 = start(root)
    assert.ok(ws0)
    assert.equal(root.getElementById('teacher-active-workspace').hidden, false)
    assert.equal(root.getElementById('teacher-field-select').value, '0:step')
    root.getElementById('teacher-field-value').value = 'D'
    const ws1 = applyTeacherUiCorrection(root)
    assert.ok(ws1)
    assert.equal(ws1.history.revisions.length, 2)
    assert.equal(ws1.history.revisions[0].content[0].step, 'C')
    assert.equal(ws1.history.revisions[1].content[0].step, 'D')
    assert.deepEqual(source, before)
    assert.match(root.getElementById('teacher-status').textContent, /yeni immutable sürüm/i)
    assert.match(root.getElementById('teacher-correction-help').textContent, /türetilmiş alanlar otomatik hesaplanmaz/i)
  } finally {
    unsubscribe()
    clearPackage3Notes()
  }
})

test('Package 8-T6 exact approval is visible, non-sharing, and duplicate current approval is disabled', () => {
  const { root, unsubscribe } = setup()
  try {
    start(root)
    const approved = approveTeacherUiCurrentRevision(root)
    assert.ok(approved)
    assert.equal(approved.history.approvalRecords.length, 1)
    assert.match(root.getElementById('teacher-approval-summary').textContent, /öğretmen tarafından onaylandı/i)
    assert.match(root.getElementById('teacher-approval-summary').textContent, /paylaşım izni değildir/i)
    assert.equal(root.getElementById('teacher-approve-btn').disabled, true)
    const beforeCount = approved.history.approvalRecords.length
    assert.equal(approveTeacherUiCurrentRevision(root), null)
    assert.equal(getTeacherUiWorkspace(root).history.approvalRecords.length, beforeCount)
  } finally {
    unsubscribe()
    clearPackage3Notes()
  }
})

test('Package 8-T6 undo selector is deterministic and undo creates a new revision instead of moving a pointer backward', () => {
  const { root, unsubscribe } = setup()
  try {
    const ws0 = start(root)
    root.getElementById('teacher-field-value').value = 'D'
    const ws1 = applyTeacherUiCorrection(root)
    assert.equal(ws1.history.revisions.length, 2)
    assert.equal(root.getElementById('teacher-undo-select').value, ws0.history.revisions[0].revisionId)
    assert.equal(root.getElementById('teacher-undo-btn').disabled, false)

    const ws2 = undoTeacherUiRevision(root)
    assert.equal(ws2.history.revisions.length, 3)
    assert.equal(ws2.history.undoAuditEvents.length, 1)
    assert.equal(ws2.history.revisions.at(-1).content[0].step, 'C')
    assert.notEqual(ws2.history.revisions.at(-1).revisionId, ws0.history.revisions[0].revisionId)
    assert.match(root.getElementById('teacher-status').textContent, /geçmiş silinmedi/i)
  } finally {
    unsubscribe()
    clearPackage3Notes()
  }
})

test('Package 8-T6 stale authoritative history produces explicit alert conflict, disables mutations, and requires refresh', () => {
  const { root, unsubscribe } = setup()
  try {
    const base = start(root)
    const external = approveTeacherWorkspace({
      workspace: base,
      approvalId: 'external-approval',
      createdAt: '2026-08-28T18:00:00.000Z',
    })
    setTeacherUiAuthoritativeHistory(root, external.history)
    root.getElementById('teacher-field-value').value = 'D'

    const conflict = applyTeacherUiCorrection(root)
    assert.ok(conflict)
    assert.equal(conflict.state, 'conflict')
    assert.equal(conflict.history, external.history)
    assert.equal(conflict.history.correctionAuditEvents.length, 0)
    assert.equal(root.getElementById('teacher-status').getAttribute('role'), 'alert')
    assert.match(root.getElementById('teacher-status').textContent, /çakışma algılandı/i)
    assert.equal(root.getElementById('teacher-status').focused, true)
    assert.equal(root.getElementById('teacher-correction-btn').disabled, true)
    assert.equal(root.getElementById('teacher-approve-btn').disabled, true)
    assert.equal(root.getElementById('teacher-undo-btn').disabled, true)
    assert.equal(root.getElementById('teacher-refresh-btn').hidden, false)

    const before = conflict.history
    assert.equal(applyTeacherUiCorrection(root), null)
    assert.equal(getTeacherUiWorkspace(root).history, before)

    const refreshed = refreshTeacherUiAfterConflict(root)
    assert.equal(refreshed.state, 'active')
    assert.equal(root.getElementById('teacher-refresh-btn').hidden, true)
    assert.match(root.getElementById('teacher-status').textContent, /otomatik olarak yeniden uygulanmadı/i)
    assert.equal(refreshed.history.correctionAuditEvents.length, 0)
  } finally {
    unsubscribe()
    clearPackage3Notes()
  }
})

test('Package 8-T6 publishing a new exact NoteObject array invalidates the old session workspace', () => {
  const { root, unsubscribe } = setup(sourceNotes('C'))
  try {
    start(root)
    assert.ok(getTeacherUiWorkspace(root))
    publishPackage3Notes(sourceNotes('E'))
    assert.equal(getTeacherUiWorkspace(root), null)
    assert.equal(root.getElementById('teacher-active-workspace').hidden, true)
    assert.match(root.getElementById('teacher-status').textContent, /kaynak hazır/i)
  } finally {
    unsubscribe()
    clearPackage3Notes()
  }
})

test('Package 8-T6 source remains text/native-control only, while S14 retires its production teacher UI wiring', () => {
  const ui = readFileSync(new URL('../src/package8TeacherUi.js', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/package8TeacherUi.css', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')

  assert.match(ui, /textContent/)
  assert.doesNotMatch(ui, /innerHTML\s*=/)
  assert.doesNotMatch(ui, /Audiveris|omrService|gatewayProvider|backend\//i)
  assert.doesNotMatch(ui, /fetch\(|localStorage|indexedDB/i)
  assert.match(css, /:focus-visible/)
  assert.match(css, /role='alert'/)
  assert.doesNotMatch(main, /package8TeacherUi\.css/)
  assert.doesNotMatch(main, /package8TeacherUi\.js/)
  assert.doesNotMatch(main, /initPackage8TeacherUi/)
  assert.match(main, /initSmoosicEditorTab\(document\)/)
})
