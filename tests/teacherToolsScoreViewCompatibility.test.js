import test from 'node:test'
import assert from 'node:assert/strict'
import { createFakeDocument } from './support/fakeTeacherPoolDom.js'
import { activateScoreView } from '../src/scoreViewUi.js'
import { activateTeacherTool } from '../src/teacherToolsNavigation.js'

test('the production-reachable score view keeps XML available and yields back to teacher tools', async () => {
  const doc = createFakeDocument(), nodes = new Map()
  for (const id of ['teacher-tools-navigation', 'results-section', 'tab-xml', 'xml-output', 'tab-score-view', 'score-view-status', 'tab-assignment', 'tab-guitar-tab', 'tab-violin', 'result-assignment-btn', 'result-guitar-tab-btn', 'result-violin-btn']) nodes.set(id, doc.createElement('div'))
  const root = { ...doc, getElementById: id => nodes.get(id) ?? null }
  activateTeacherTool(root, 'assignment')
  // No renderer boot: the no-source path still executes the real selection code.
  await activateScoreView(root)
  assert.equal(nodes.get('tab-xml').hidden, false)
  assert.equal(nodes.get('tab-assignment').hidden, true)
  assert.equal(nodes.get('result-assignment-btn').getAttribute('aria-selected'), 'false')
  assert.equal(nodes.get('tab-score-view').hidden, false)
  activateTeacherTool(root, 'guitar-tab')
  assert.equal(nodes.get('tab-score-view').hidden, true)
  assert.equal(nodes.get('tab-xml').hidden, false)
})
