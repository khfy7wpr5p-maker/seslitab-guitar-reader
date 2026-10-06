import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ensureGuitarTabTeacherWorkspace,
  getGuitarTabTeacherWorkspaceState,
  loadGuitarTabTeacherSource,
} from '../src/guitarTabTeacherWorkspaceUi.js'

class Element {
  constructor(root, tagName) {
    this.root = root; this.tagName = tagName; this.children = []; this.listeners = new Map()
    this.attributes = new Map(); this.dataset = {}; this.className = ''; this.textContent = ''; this.parentElement = null; this._id = ''
  }
  set id(value) { this._id = value; if (value) this.root.nodes.set(value, this) }
  get id() { return this._id }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child }
  replaceChildren(...children) { this.children = []; children.forEach((child) => this.appendChild(child)) }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this) }
  addEventListener(name, listener) { this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]) }
}

function root() {
  const value = { nodes: new Map(), elements: [] }
  value.createElement = (tagName) => { const element = new Element(value, tagName); value.elements.push(element); return element }
  value.getElementById = (id) => value.nodes.get(id) ?? null
  value.querySelectorAll = (selector) => {
    const name = selector.startsWith('.') ? selector.slice(1) : ''
    return value.elements.filter((element) => String(element.className).split(/\s+/).includes(name) && element.parentElement)
  }
  return value
}

function sourceSession() {
  const events = [
    { sourceEventId: 'e1', groupId: 'g1', partId: 'P1', measureIndex: 0, staff: '1', voice: '1', onsetDivisions: 0, divisions: 1, sourceOrder: 0 },
    { sourceEventId: 'e2', groupId: 'g2', partId: 'P1', measureIndex: 0, staff: '1', voice: '1', onsetDivisions: 1, divisions: 1, sourceOrder: 1 },
  ]
  return Object.freeze({
    sessionId: 'source:test', sourceFingerprint: 'fp', events: Object.freeze(events),
    groups: Object.freeze([
      Object.freeze({ groupId: 'g1', sourceEventIds: Object.freeze(['e1']) }),
      Object.freeze({ groupId: 'g2', sourceEventIds: Object.freeze(['e2']) }),
    ]),
  })
}

function runtime(session, observations) {
  const assignments = new Map()
  const document = {
    getAssignment(id) { return assignments.get(id) ?? null },
    assignPosition(id, position) { assignments.set(id, { ...position }) },
    clearPosition(id) { return assignments.delete(id) },
    undo() { return false }, redo() { return false },
    listAssignments() { return [...assignments].map(([sourceEventId, position]) => ({ sourceEventId, ...position })) },
  }
  let groupIndex = 0; let selectedString = 1; let fretBuffer = ''
  const controller = {
    getState() {
      const group = session.groups[groupIndex]
      return Object.freeze({ groupIndex, groupCount: 2, noteIndex: 0, noteCount: 1, selectedString, fretBuffer, currentGroupId: group.groupId, currentEventId: group.sourceEventIds[0] })
    },
    handleKey(event) {
      if (event.key === 'ArrowDown') selectedString += 1
      else if (/^[0-9]$/.test(event.key)) fretBuffer += event.key
      else if (event.key === 'Enter') {
        document.assignPosition(controller.getState().currentEventId, { string: selectedString, fret: Number(fretBuffer) })
        fretBuffer = ''; groupIndex = Math.min(1, groupIndex + 1); selectedString = 1
      }
      return controller.getState()
    },
  }
  return {
    createSourceSession() { return session },
    createTabAssignmentDocument() { observations.document = document; return document },
    createKeyboardController() { return controller },
    createFixedSixStringRows({ activeString, placements }) {
      observations.rows = { activeString, placements }
      return Array.from({ length: 6 }, (_, index) => {
        const string = index + 1; const placement = placements.find((item) => item.string === string)
        return { string, label: ['e', 'B', 'G', 'D', 'A', 'E'][index], active: string === activeString, fret: placement?.fret ?? null, sourceEventId: placement?.sourceEventId ?? null }
      })
    },
  }
}

async function key(element, key) {
  const event = { key, ctrlKey: false, shiftKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true } }
  for (const listener of element.listeners.get('keydown') ?? []) await listener(event)
  return event
}

test('GTAB-09C delegates keyboard authoring and synchronizes only proven source-event targets', async () => {
  const documentRoot = root(); const panel = documentRoot.createElement('div'); ensureGuitarTabTeacherWorkspace(documentRoot, panel)
  const session = sourceSession(); const observations = {}; const editorRuntime = runtime(session, observations)
  const canonicalNotes = [
    { partId: 'P1', measureIndex: 0, measureKey: 'P1:0', voice: 1, staff: 1, startBeat: 0, isRest: false },
    { partId: 'P1', measureIndex: 0, measureKey: 'P1:0', voice: 1, staff: 1, startBeat: 1, isRest: false },
  ]
  const adapters = {
    loadEditorRuntime: async () => editorRuntime,
    loadScoreRuntime: async () => ({ id: 'renderer' }), renderScore: async () => ({ renderEpoch: 'r1' }), clearScore: async () => true,
    parseCanonicalNotes: () => canonicalNotes,
    clearHighlights: async () => { observations.clears = (observations.clears ?? 0) + 1 },
    moveCursor: async (_host, target) => { observations.cursor = target },
    highlightNote: async (_host, target) => { observations.highlight = target },
  }

  const result = await loadGuitarTabTeacherSource(documentRoot, '<score-partwise/>', adapters)
  assert.equal(result.ok, true)
  const editor = documentRoot.getElementById('guitar-tab-editor-surface')
  assert.equal(editor.getAttribute('tabindex'), '0')
  assert.equal(getGuitarTabTeacherWorkspaceState(documentRoot).currentEventId, 'e1')
  assert.deepEqual(observations.highlight, { partId: 'P1', measureIndex: 0, noteIndex: 0, voice: 1 })

  assert.equal((await key(editor, 'ArrowDown')).defaultPrevented, true)
  assert.equal((await key(editor, '3')).defaultPrevented, true)
  assert.equal((await key(editor, 'Enter')).defaultPrevented, true)
  assert.deepEqual(observations.document.getAssignment('e1'), { string: 2, fret: 3 })
  assert.equal(getGuitarTabTeacherWorkspaceState(documentRoot).assignmentCount, 1)
  assert.equal(getGuitarTabTeacherWorkspaceState(documentRoot).currentEventId, 'e2')
  assert.deepEqual(observations.highlight, { partId: 'P1', measureIndex: 0, noteIndex: 1, voice: 1 })
})
