import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ensureGuitarTabTeacherWorkspace,
  getGuitarTabTeacherWorkspaceState,
  loadGuitarTabTeacherSource,
} from '../src/guitarTabTeacherWorkspaceUi.js'
import { SmoosicTestDOMParser, SmoosicTestXMLSerializer } from './support/smoosicXmlDom.js'
import { extractGuitarTabScoreInventory, prepareGuitarTabEditorSourceXml } from '../src/services/guitarTabScoreInventory.js'

class Element {
  constructor(root, tagName) {
    this.root = root; this.tagName = tagName; this.children = []; this.listeners = new Map()
    this.attributes = new Map(); this.dataset = {}; this.className = ''; this.textContent = ''; this.parentElement = null; this._id = ''
    this.disabled = false
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
    { sourceEventId: 'e1', groupId: 'g1', partId: 'P1', partIndex: 0, measureIndex: 0, staff: '1', voice: '1', onsetDivisions: 0, divisions: 1, sourceOrder: 0, pitch: { midi: 66 } },
    { sourceEventId: 'e2', groupId: 'g2', partId: 'P1', partIndex: 0, measureIndex: 0, staff: '1', voice: '1', onsetDivisions: 1, divisions: 1, sourceOrder: 1, pitch: { midi: 65 } },
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
    sessionId: session.sessionId,
    getAssignment(id) { return assignments.get(id) ?? null },
    assignPosition(id, position) { assignments.set(id, { ...position }) },
    clearPosition(id) { return assignments.delete(id) },
    undo() { return false }, redo() { return false },
    listAssignments() { return [...assignments].map(([sourceEventId, position]) => ({ sourceEventId, ...position })) },
    canExport() { return assignments.size === session.events.length },
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
    serializeGuitarTabMusicXml({ sourceSession: runtimeSession, document: runtimeDocument }) {
      observations.serializeArgs = { sourceSession: runtimeSession, document: runtimeDocument }
      return '<score-partwise version="4.0"><part-list/><part id="P1"/></score-partwise>'
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
    { partId: 'P1', partIndex: 0, measureIndex: 0, measureKey: 'P1:0', voice: 1, staff: 1, startBeat: 0, isRest: false },
    { partId: 'P1', partIndex: 0, measureIndex: 0, measureKey: 'P1:0', voice: 1, staff: 1, startBeat: 1, isRest: false },
  ]
  const adapters = {
    loadEditorRuntime: async () => editorRuntime,
    loadScoreRuntime: async () => ({ id: 'renderer' }), renderScore: async () => ({ renderEpoch: 'r1' }), clearScore: async () => true,
    extractScoreInventory: () => ({ parts: [{ partId: 'P1', partIndex: 0, name: 'Guitar', staves: [{ staff: 1, voices: [{ voice: 1, pitchedEventCount: 2 }] }] }] }),
    prepareEditorSourceXml: (xml) => xml,
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

test('GTAB-10C exposes clickable fret positions and commits them to the active source note', async () => {
  const documentRoot = root(); const panel = documentRoot.createElement('div'); ensureGuitarTabTeacherWorkspace(documentRoot, panel)
  const session = sourceSession(); const observations = {}; const editorRuntime = runtime(session, observations)
  const adapters = {
    loadEditorRuntime: async () => editorRuntime,
    loadScoreRuntime: async () => null,
    extractScoreInventory: () => ({ parts: [{ partId: 'P1', partIndex: 0, name: 'Guitar', staves: [{ staff: 1, voices: [{ voice: 1, pitchedEventCount: 2 }] }] }] }),
    prepareEditorSourceXml: (xml) => xml,
    parseCanonicalNotes: () => [],
  }

  const loaded = await loadGuitarTabTeacherSource(documentRoot, '<score-partwise/>', adapters)
  assert.equal(loaded.ok, true)
  const cells = documentRoot.elements.filter((element) => String(element.className).split(/\s+/u).includes('guitar-tab-fret-position'))
  assert.equal(cells.length, 6 * 21)
  const target = cells.find((element) => element.dataset.string === '2' && element.dataset.fret === '7')
  assert.ok(target)
  assert.equal(target.disabled, false)
  assert.equal(cells.find((element) => element.dataset.string === '2' && element.dataset.fret === '3').disabled, true)
  await target.listeners.get('click')[0]({ currentTarget: target })

  assert.deepEqual(observations.document.getAssignment('e1'), { string: 2, fret: 7 })
  assert.equal(getGuitarTabTeacherWorkspaceState(documentRoot).assignmentCount, 1)
  assert.equal(getGuitarTabTeacherWorkspaceState(documentRoot).currentEventId, 'e2')
})

test('GTAB-10C sends an editor-only defaulted view when pitched MusicXML notes omit staff and voice', async () => {
  const documentRoot = root(); const panel = documentRoot.createElement('div'); ensureGuitarTabTeacherWorkspace(documentRoot, panel)
  const sourceXml = '<score-partwise><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note></measure></part></score-partwise>'
  const session = sourceSession(); const observations = {}; const baseRuntime = runtime(session, observations)
  const editorRuntime = {
    ...baseRuntime,
    createSourceSession(editorXml, options) {
      observations.editorXml = editorXml
      observations.targetSelection = options.targetSelection
      return session
    },
  }
  const result = await loadGuitarTabTeacherSource(documentRoot, sourceXml, {
    loadEditorRuntime: async () => editorRuntime,
    loadScoreRuntime: async () => null,
    extractScoreInventory: (xml) => extractGuitarTabScoreInventory(xml, { DOMParserCtor: SmoosicTestDOMParser }),
    prepareEditorSourceXml: (xml, target) => prepareGuitarTabEditorSourceXml(xml, target, {
      DOMParserCtor: SmoosicTestDOMParser, XMLSerializerCtor: SmoosicTestXMLSerializer,
    }),
    parseCanonicalNotes: () => [],
  })

  assert.equal(result.ok, true)
  assert.match(observations.editorXml, /<voice>1<\/voice>/u)
  assert.match(observations.editorXml, /<staff>1<\/staff>/u)
  assert.equal(sourceXml.includes('<voice>'), false)
  assert.equal(sourceXml.includes('<staff>'), false)
  assert.deepEqual(observations.targetSelection, { partId: 'P1', partIndex: 0, staff: 1, voice: 1 })
})

test('GTAB-10C uses distinct strings while clicking through a simultaneous chord', async () => {
  const documentRoot = root(); const panel = documentRoot.createElement('div'); ensureGuitarTabTeacherWorkspace(documentRoot, panel)
  const events = [
    { sourceEventId: 'c1', groupId: 'chord', pitch: { midi: 64 } },
    { sourceEventId: 'c2', groupId: 'chord', pitch: { midi: 67 } },
    { sourceEventId: 'n3', groupId: 'next', pitch: { midi: 69 } },
  ]
  const session = {
    sessionId: 'chord-session', sourceFingerprint: 'chord-fingerprint', events,
    groups: [{ groupId: 'chord', sourceEventIds: ['c1', 'c2'] }, { groupId: 'next', sourceEventIds: ['n3'] }],
  }
  const assignments = new Map()
  const document = {
    getAssignment: (id) => assignments.get(id) ?? null,
    assignPosition: (id, position) => assignments.set(id, { ...position }),
    clearPosition: (id) => assignments.delete(id),
    listAssignments: () => [...assignments].map(([sourceEventId, position]) => ({ sourceEventId, ...position })),
    canExport: () => assignments.size === events.length,
    undo() {}, redo() {},
  }
  let groupIndex = 0; let noteIndex = 0; let selectedString = 1; let fretBuffer = ''
  const controller = {
    getState() {
      const group = session.groups[groupIndex]
      return { groupIndex, groupCount: session.groups.length, noteIndex, noteCount: group.sourceEventIds.length, selectedString, fretBuffer, currentGroupId: group.groupId, currentEventId: group.sourceEventIds[noteIndex] }
    },
    handleKey({ key }) {
      if (key === 'Escape') fretBuffer = ''
      else if (key === 'ArrowDown') selectedString += 1
      else if (key === 'ArrowUp') selectedString -= 1
      else if (/^\d$/u.test(key)) fretBuffer += key
      else if (key === 'Tab') { assignments.set(controller.getState().currentEventId, { string: selectedString, fret: Number(fretBuffer) }); fretBuffer = ''; noteIndex += 1 }
      else if (key === 'Enter') {
        assignments.set(controller.getState().currentEventId, { string: selectedString, fret: Number(fretBuffer) }); fretBuffer = ''
        if (groupIndex < session.groups.length - 1) { groupIndex += 1; noteIndex = 0; selectedString = 1 }
      }
      return controller.getState()
    },
  }
  const editorRuntime = {
    createSourceSession: () => session,
    createTabAssignmentDocument: () => document,
    createKeyboardController: () => controller,
    createFixedSixStringRows({ activeString, placements }) {
      return Array.from({ length: 6 }, (_, index) => {
        const string = index + 1; const placement = placements.find((item) => item.string === string)
        return { string, label: ['e', 'B', 'G', 'D', 'A', 'E'][index], active: string === activeString, fret: placement?.fret ?? null, sourceEventId: placement?.sourceEventId ?? null }
      })
    },
    serializeGuitarTabMusicXml: () => '<score-partwise/>',
  }
  const adapters = {
    loadEditorRuntime: async () => editorRuntime, loadScoreRuntime: async () => null,
    extractScoreInventory: () => ({ parts: [{ partId: 'P1', partIndex: 0, name: 'Guitar', staves: [{ staff: 1, voices: [{ voice: 1, pitchedEventCount: 3 }] }] }] }),
    prepareEditorSourceXml: (xml) => xml,
    parseCanonicalNotes: () => [],
    validateExport: () => ({ ok: true, category: null, code: null, facts: {} }),
  }

  assert.equal((await loadGuitarTabTeacherSource(documentRoot, '<score-partwise/>', adapters)).ok, true)
  const clickCell = async (string, fret) => {
    const cell = documentRoot.elements.findLast((element) => String(element.className).split(/\s+/u).includes('guitar-tab-fret-position') && element.dataset.string === String(string) && element.dataset.fret === String(fret))
    assert.ok(cell)
    assert.equal(cell.disabled, false)
    await cell.listeners.get('click')[0]({ currentTarget: cell })
  }
  await clickCell(1, 0)
  assert.deepEqual(document.getAssignment('c1'), { string: 1, fret: 0 })
  const occupied = documentRoot.elements.findLast((element) => String(element.className).split(/\s+/u).includes('guitar-tab-fret-position') && element.dataset.string === '1' && element.dataset.fret === '3')
  assert.equal(occupied.disabled, true)
  await clickCell(2, 8)
  assert.deepEqual(document.getAssignment('c2'), { string: 2, fret: 8 })
  assert.equal(getGuitarTabTeacherWorkspaceState(documentRoot).currentEventId, 'n3')
  await clickCell(1, 5)
  assert.deepEqual(document.getAssignment('n3'), { string: 1, fret: 5 })
  assert.equal(getGuitarTabTeacherWorkspaceState(documentRoot).exportReady, true)
})

test('GTAB-09D exports a new validated MusicXML only after all assignments are complete and preserves exact source bytes', async () => {
  const workspaceModule = await import('../src/guitarTabTeacherWorkspaceUi.js')
  assert.equal(typeof workspaceModule.exportGuitarTabTeacherWorkspaceMusicXml, 'function')

  const documentRoot = root(); const panel = documentRoot.createElement('div'); ensureGuitarTabTeacherWorkspace(documentRoot, panel)
  const session = sourceSession(); const observations = {}; const editorRuntime = runtime(session, observations)
  const exactSource = '  <?xml version="1.0"?>\n<score-partwise version="4.0"><part-list/></score-partwise>\n'
  const adapters = {
    loadEditorRuntime: async () => editorRuntime,
    loadScoreRuntime: async () => null,
    extractScoreInventory: () => ({ parts: [{ partId: 'P1', partIndex: 0, name: 'Guitar', staves: [{ staff: 1, voices: [{ voice: 1, pitchedEventCount: 2 }] }] }] }),
    prepareEditorSourceXml: (xml) => xml,
    parseCanonicalNotes: () => [],
    validateExport: () => ({ ok: true, category: null, code: null, facts: {} }),
    async prepareScoreUpload(input) {
      observations.scoreUploadInput = input
      return Object.freeze({ draftId: input.draftId, musicXml: input.musicXml, musicXmlFingerprint: 'a'.repeat(64) })
    },
    async prepareHandoff(input) {
      observations.handoffInput = input
      return Object.freeze({ guitarTabMusicXml: input.guitarTabMusicXml, guitarTabMusicXmlFingerprint: 'b'.repeat(64), pitchedEventCount: 2 })
    },
    async downloadText(input) { observations.download = input },
  }

  const loadResult = await loadGuitarTabTeacherSource(
    documentRoot,
    { name: 'audiveris-export.musicxml', size: Buffer.byteLength(exactSource), text: async () => exactSource },
    adapters,
  )
  assert.equal(loadResult.ok, true)
  assert.ok(documentRoot.getElementById('guitar-tab-export'))

  const blocked = await workspaceModule.exportGuitarTabTeacherWorkspaceMusicXml(documentRoot, adapters)
  assert.deepEqual(blocked, { ok: false, reason: 'INCOMPLETE_ASSIGNMENTS' })

  observations.document.assignPosition('e1', { string: 2, fret: 1 })
  observations.document.assignPosition('e2', { string: 1, fret: 3 })
  const exported = await workspaceModule.exportGuitarTabTeacherWorkspaceMusicXml(documentRoot, adapters)

  assert.equal(exported.ok, true)
  assert.equal(observations.scoreUploadInput.musicXml, exactSource)
  assert.equal(observations.scoreUploadInput.draftId, session.sessionId)
  assert.equal(observations.handoffInput.scoreUpload.musicXml, exactSource)
  assert.equal(observations.handoffInput.guitarTabMusicXml, exported.musicXml)
  assert.equal(observations.handoffInput.draftId, session.sessionId)
  assert.equal(observations.serializeArgs.sourceSession, session)
  assert.equal(observations.serializeArgs.document, observations.document)
  assert.deepEqual(observations.download, {
    filename: 'audiveris-export-guitar-tab.musicxml',
    text: exported.musicXml,
    mimeType: 'application/vnd.recordare.musicxml+xml',
  })
  assert.equal(getGuitarTabTeacherWorkspaceState(documentRoot).sourceName, 'audiveris-export.musicxml')
  assert.equal(observations.scoreUploadInput.musicXml, exactSource)
})

test('GTAB-VALIDATOR-01 blocks export readiness and final export on unified validator failure', async () => {
  const workspaceModule = await import('../src/guitarTabTeacherWorkspaceUi.js')
  const documentRoot = root(); const panel = documentRoot.createElement('div'); ensureGuitarTabTeacherWorkspace(documentRoot, panel)
  const session = sourceSession(); const observations = {}; const editorRuntime = runtime(session, observations)
  const adapters = {
    loadEditorRuntime: async () => editorRuntime,
    loadScoreRuntime: async () => null,
    extractScoreInventory: () => ({ parts: [{ partId: 'P1', partIndex: 0, name: 'Guitar', staves: [{ staff: 1, voices: [{ voice: 1, pitchedEventCount: 2 }] }] }] }),
    prepareEditorSourceXml: (xml) => xml,
    parseCanonicalNotes: () => [],
    validateExport: () => ({ ok: false, category: 'PHYSICAL', code: 'TECHNICAL_POSITION_PITCH_MISMATCH' }),
  }

  assert.equal((await loadGuitarTabTeacherSource(documentRoot, '<score-partwise/>', adapters)).ok, true)
  observations.document.assignPosition('e1', { string: 2, fret: 1 })
  observations.document.assignPosition('e2', { string: 1, fret: 3 })

  const state = getGuitarTabTeacherWorkspaceState(documentRoot)
  assert.equal(state.exportReady, false)
  assert.equal(state.exportValidationCategory, 'PHYSICAL')
  assert.equal(state.exportValidationCode, 'TECHNICAL_POSITION_PITCH_MISMATCH')

  const result = await workspaceModule.exportGuitarTabTeacherWorkspaceMusicXml(documentRoot, adapters)
  assert.deepEqual(result, {
    ok: false,
    reason: 'EXPORT_VALIDATION_FAILED',
    category: 'PHYSICAL',
    code: 'TECHNICAL_POSITION_PITCH_MISMATCH',
  })
  assert.match(documentRoot.getElementById('guitar-tab-editor-status').textContent, /gerçek ses yüksekliğiyle eşleşmiyor/u)
})
