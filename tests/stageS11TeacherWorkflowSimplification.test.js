import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  STAGE_S11_COPY,
  applyStageS11TeacherWorkflowUi,
} from '../src/stageS11TeacherWorkflowUi.js'

class FakeClassList {
  constructor(element) { this.element = element }
  values() { return String(this.element.className || '').split(/\s+/).filter(Boolean) }
  contains(name) { return this.values().includes(name) }
  add(name) {
    const values = new Set(this.values()); values.add(name)
    this.element.className = [...values].join(' ')
  }
}

class FakeElement {
  constructor(root, tagName) {
    this.root = root
    this.tagName = tagName
    this.children = []
    this.attributes = new Map()
    this.listeners = new Map()
    this.hidden = false
    this.className = ''
    this.classList = new FakeClassList(this)
    this.textContent = ''
    this.parentElement = null
    this._id = ''
  }
  set id(value) { this._id = value; if (value) this.root.nodes.set(value, this) }
  get id() { return this._id }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child }
  addEventListener(name, listener) {
    const values = this.listeners.get(name) ?? []
    values.push(listener); this.listeners.set(name, values)
  }
  querySelector(selector) {
    if (!selector.startsWith('.')) return null
    const className = selector.slice(1)
    const visit = (node) => {
      for (const child of node.children) {
        if (child.classList.contains(className)) return child
        const nested = visit(child)
        if (nested) return nested
      }
      return null
    }
    return visit(this)
  }
  focus() { this.root.activeElement = this }
}

function fakeDocument() {
  const root = {
    readyState: 'complete',
    nodes: new Map(),
    activeElement: null,
    createElement(tagName) { return new FakeElement(root, tagName) },
    getElementById(id) { return root.nodes.get(id) ?? null },
  }

  const tabs = root.createElement('div'); tabs.className = 'result-tabs'
  const teacherTab = root.createElement('button'); teacherTab.id = 'teacher-tab-btn'; tabs.appendChild(teacherTab)
  const teacherPanel = root.createElement('section'); teacherPanel.id = 'tab-teacher'; teacherPanel.hidden = false
  const internal = root.createElement('pre'); internal.id = 'teacher-current-content'; internal.textContent = '{"revisionId":"internal-only"}'; teacherPanel.appendChild(internal)

  const workspace = root.createElement('section'); workspace.id = 'stage-s05-score-workspace'; workspace.setAttribute('data-stage-s07-score-state', 'source')
  const placeholder = root.createElement('p'); placeholder.id = 'stage-s05-score-inspector-placeholder'
  const inspector = root.createElement('section'); inspector.id = 'stage-s07-inline-teacher-inspector'
  const help = root.createElement('p'); help.id = 'stage-s07-inline-help'; help.textContent = 'long legacy help'; inspector.appendChild(help)
  const status = root.createElement('p'); status.id = 'stage-s07-inline-status'; inspector.appendChild(status)
  const actions = root.createElement('div'); actions.className = 'stage-s07-inline-actions'; inspector.appendChild(actions)
  const undo = root.createElement('button'); undo.id = 'stage-s07-undo-btn'; undo.textContent = 'Son değişikliği geri al'; actions.appendChild(undo)
  const approve = root.createElement('button'); approve.id = 'stage-s07-approve-btn'; approve.textContent = 'Geçerli sürümü ayrıca onayla'; actions.appendChild(approve)

  return { root, tabs, teacherTab, teacherPanel, workspace, placeholder, inspector, help, status, actions, undo, approve }
}

test('S11 removes the duplicate technical teacher tab from the normal workflow without deleting Package 8 controls', () => {
  const { root, teacherTab, teacherPanel } = fakeDocument()
  assert.equal(applyStageS11TeacherWorkflowUi(root), true)
  assert.equal(teacherTab.hidden, true)
  assert.equal(teacherTab.getAttribute('aria-hidden'), 'true')
  assert.equal(teacherTab.getAttribute('tabindex'), '-1')
  assert.equal(teacherPanel.hidden, true)
  assert.equal(teacherPanel.getAttribute('aria-hidden'), 'true')
  assert.equal(teacherPanel.getAttribute('data-stage-s11-internal-controls'), 'true')
  assert.ok(root.getElementById('teacher-current-content'))
})

test('S11 keeps correction undo and exact approval beside the score with compact safe copy', () => {
  const { root, workspace, placeholder, inspector, help, status, actions, undo } = fakeDocument()
  assert.equal(applyStageS11TeacherWorkflowUi(root), true)
  assert.equal(workspace.getAttribute('data-stage-s11-teacher-workflow'), 'ready')
  assert.equal(inspector.getAttribute('data-stage-s11-primary-workflow'), 'ready')
  assert.equal(placeholder.hidden, true)
  assert.equal(help.textContent, STAGE_S11_COPY.conciseHelp)
  assert.equal(status.getAttribute('tabindex'), '-1')
  assert.equal(status.getAttribute('aria-atomic'), 'true')
  assert.equal(actions.getAttribute('aria-label'), 'Geri alma ve exact sürüm onayı')
  assert.equal(undo.textContent, 'Geri al')
  const details = root.getElementById('stage-s11-workflow-details')
  assert.ok(details)
  assert.match(root.getElementById('stage-s11-workflow-details-text').textContent, /immutable sürüm/)
  assert.doesNotMatch(root.getElementById('stage-s11-workflow-details-text').textContent, /revisionId|actorId|sourceId|raw JSON/i)
})

test('S11 application is idempotent and does not duplicate secondary details', () => {
  const { root, inspector } = fakeDocument()
  assert.equal(applyStageS11TeacherWorkflowUi(root), true)
  const first = root.getElementById('stage-s11-workflow-details')
  assert.equal(applyStageS11TeacherWorkflowUi(root), true)
  assert.equal(root.getElementById('stage-s11-workflow-details'), first)
  assert.equal(inspector.children.filter((child) => child.id === 'stage-s11-workflow-details').length, 1)
})

test('S11 remains presentation-only and main wires it after the established S10 workspace surface', () => {
  const source = readFileSync(new URL('../src/stageS11TeacherWorkflowUi.js', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/stageS11TeacherWorkflow.css', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /package12|shareAuthorization|OMR_PROVIDER|Audiveris|gatewayProvider|fetch\(|XMLHttpRequest|localStorage|sessionStorage/i)
  assert.doesNotMatch(source, /login|authentication|authorization/i)
  assert.match(main, /stageS11TeacherWorkflow\.css/)
  assert.match(main, /initStageS11TeacherWorkflowUi/)
  assert.ok(main.indexOf('initStageS11TeacherWorkflowUi(document)') > main.indexOf('initStageS10EducationalChordsUi(document)'))
  assert.match(css, /min-height:\s*44px/)
  assert.match(css, /max-width:\s*100%/)
})
