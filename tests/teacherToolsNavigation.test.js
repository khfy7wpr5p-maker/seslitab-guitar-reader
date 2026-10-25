import test from 'node:test'
import assert from 'node:assert/strict'
import { createFakeDocument } from './support/fakeTeacherPoolDom.js'
import { activateTeacherTool, bindTeacherToolsNavigation, resetTeacherResultsPresentation } from '../src/teacherToolsNavigation.js'

function harness() {
  const doc = createFakeDocument(), nodes = new Map()
  const add = (id, tag = 'div') => { const n = doc.createElement(tag); n.id = id; nodes.set(id, n); return n }
  const nav = add('teacher-tools-navigation')
  for (const name of ['assignment', 'guitar-tab', 'violin']) {
    const button = add(`result-${name}-btn`, 'button')
    button.dataset.tool = name; nav.appendChild(button)
    add(`tab-${name}`).hidden = name !== 'assignment'
  }
  add('results-section').hidden = true
  add('tab-xml').hidden = true
  add('xml-output').textContent = '<score-partwise>old source</score-partwise>'
  const root = { getElementById: id => nodes.get(id) ?? null }
  return { root, nodes, nav }
}

test('teacher navigation reveals the existing panel and keeps XML visible without replacing state', () => {
  const { root, nodes } = harness()
  const panel = nodes.get('tab-assignment'), draft = { title: 'Vals', recipient: 'student-a' }
  panel.draft = draft
  for (const tool of ['guitar-tab', 'violin', 'assignment', 'assignment']) {
    assert.equal(activateTeacherTool(root, tool), true)
    assert.equal(nodes.get('tab-xml').hidden, false)
    assert.equal(nodes.get('results-section').hidden, false)
    assert.equal(nodes.get(`tab-${tool}`).hidden, false)
    assert.equal(nodes.get(`result-${tool}-btn`).getAttribute('aria-selected'), 'true')
  }
  assert.equal(nodes.get('tab-assignment'), panel)
  assert.equal(panel.draft, draft)
  assert.equal(nodes.get('tab-violin').hidden, true)
})

test('reset removes the old MusicXML source while keeping teacher panels and draft state mounted', () => {
  const { root, nodes } = harness()
  activateTeacherTool(root, 'assignment')
  const panel = nodes.get('tab-assignment'), source = nodes.get('xml-output')
  panel.draft = 'unfinished homework'
  resetTeacherResultsPresentation(root)
  assert.equal(source.textContent, '')
  assert.equal(nodes.get('results-section').hidden, false)
  assert.equal(nodes.get('tab-assignment'), panel)
  assert.equal(panel.draft, 'unfinished homework')
  assert.equal(nodes.get('tab-xml').hidden, false)
})

test('unknown or not-yet-mounted teacher targets leave selection unchanged', () => {
  const { root, nodes } = harness()
  activateTeacherTool(root, 'assignment')
  nodes.delete('tab-violin')
  assert.equal(activateTeacherTool(root, 'violin'), false)
  assert.equal(activateTeacherTool(root, 'xml'), false)
  assert.equal(nodes.get('tab-assignment').hidden, false)
  assert.equal(nodes.get('result-assignment-btn').getAttribute('aria-selected'), 'true')
})

test('keyboard arrows wrap, Home/End select and focus; repeated binding never duplicates listeners', () => {
  const { root, nodes } = harness()
  bindTeacherToolsNavigation(root); bindTeacherToolsNavigation(root)
  const assignment = nodes.get('result-assignment-btn'), violin = nodes.get('result-violin-btn')
  assert.equal(assignment.listeners.get('click').length, 1)
  assignment.dispatchEvent({ type: 'keydown', key: 'ArrowLeft', preventDefault() {} })
  assert.equal(violin.getAttribute('aria-selected'), 'true')
  assert.equal(violin.focused, true)
  violin.dispatchEvent({ type: 'keydown', key: 'Home', preventDefault() {} })
  assert.equal(assignment.getAttribute('aria-selected'), 'true')
  assert.equal(assignment.getAttribute('tabindex'), '0')
  assignment.dispatchEvent({ type: 'keydown', key: 'End', preventDefault() {} })
  assert.equal(violin.getAttribute('aria-selected'), 'true')
})
