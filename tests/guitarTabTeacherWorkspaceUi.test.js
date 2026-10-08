import test from 'node:test'
import assert from 'node:assert/strict'

import {
  activateGuitarTabResultTab,
  ensureGuitarTabPanel,
} from '../src/package4Ui.js'
import {
  exportGuitarTabTeacherWorkspaceMusicXml,
  getGuitarTabTeacherWorkspaceState,
  loadGuitarTabTeacherSource,
  resetGuitarTabTeacherWorkspace,
} from '../src/guitarTabTeacherWorkspaceUi.js'

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
  remove(name) { this.toggle(name, false) }
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
    this.className = ''
    this.classList = new FakeClassList(this)
    this._textContent = ''
    this.type = ''
    this.value = ''
    this.parentElement = null
    this._id = ''
  }
  set id(value) {
    this._id = value
    if (value) this.root.nodes.set(value, this)
  }
  get id() { return this._id }
  set textContent(value) {
    for (const child of this.children) child.parentElement = null
    this.children = []
    this._textContent = String(value ?? '')
  }
  get textContent() { return this._textContent }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  appendChild(child) {
    if (child.parentElement) {
      child.parentElement.children = child.parentElement.children.filter((candidate) => candidate !== child)
    }
    child.parentElement = this
    this.children.push(child)
    return child
  }
  insertBefore(child, before) {
    if (child.parentElement) {
      child.parentElement.children = child.parentElement.children.filter((candidate) => candidate !== child)
    }
    child.parentElement = this
    const index = this.children.indexOf(before)
    if (index < 0) this.children.push(child)
    else this.children.splice(index, 0, child)
    return child
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null
    this.children = []
    this._textContent = ''
    for (const child of children) this.appendChild(child)
  }
  remove() {
    if (!this.parentElement) return
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this)
    this.parentElement = null
  }
  addEventListener(name, listener) {
    const list = this.listeners.get(name) ?? []
    list.push(listener)
    this.listeners.set(name, list)
  }
  click() {
    for (const listener of this.listeners.get('click') ?? []) {
      listener({ type: 'click', currentTarget: this })
    }
  }
}

function fakeDocument() {
  const root = {
    nodes: new Map(),
    elements: [],
    documentElement: null,
    createElement(tagName) {
      const element = new FakeElement(root, tagName)
      root.elements.push(element)
      return element
    },
    getElementById(id) { return root.nodes.get(id) ?? null },
    isConnected(element) {
      let current = element
      while (current) {
        if (current === root.documentElement) return true
        current = current.parentElement
      }
      return false
    },
    querySelector(selector) {
      if (selector.startsWith('.')) {
        const className = selector.slice(1)
        return root.elements.find((element) => root.isConnected(element) && element.classList.contains(className)) ?? null
      }
      return null
    },
    querySelectorAll(selector) {
      if (selector.startsWith('.')) {
        const className = selector.slice(1)
        return root.elements.filter((element) => root.isConnected(element) && element.classList.contains(className))
      }
      return []
    },
  }

  const results = root.createElement('section'); results.id = 'results-section'; root.documentElement = results
  const body = root.createElement('div'); body.className = 'card-body'; results.appendChild(body)
  const tabList = root.createElement('div'); tabList.className = 'result-tabs'; body.appendChild(tabList)

  for (const name of ['rhythmic', 'html', 'notes', 'assignment', 'xml', 'violin']) {
    const button = root.createElement('button')
    button.className = name === 'rhythmic' ? 'tab-btn active' : 'tab-btn'
    button.dataset.tab = name
    button.setAttribute('role', 'tab')
    button.setAttribute('aria-selected', name === 'rhythmic' ? 'true' : 'false')
    tabList.appendChild(button)

    const panel = root.createElement('div')
    panel.id = `tab-${name}`
    panel.hidden = name !== 'rhythmic'
    panel.setAttribute('role', 'tabpanel')
    body.appendChild(panel)
  }

  const summary = root.createElement('div'); summary.id = 'notes-summary'; body.appendChild(summary)
  return root
}

function sourceSession(id) {
  return Object.freeze({
    sessionId: id,
    sourceFingerprint: `fp-${id}`,
    events: Object.freeze([]),
    groups: Object.freeze([]),
  })
}

function successfulAdapters(observations = {}) {
  const renderer = { id: 'renderer' }
  return {
    validateMusicXmlFile: () => null,
    async readMusicXmlSourceFile(file) {
      return { xmlText: await file.text(), sourceName: file.name }
    },
    extractScoreInventory: () => ({ parts: [{
      partId: 'P1', partIndex: 0, name: 'Guitar', staves: [{ staff: 1, voices: [{ voice: 1, pitchedEventCount: 1 }] }],
    }] }),
    parseCanonicalNotes: () => [{ partId: 'P1', partIndex: 0, staff: 1, voice: 1, measureIndex: 0, startBeat: 0 }],
    loadEditorRuntime: async () => ({
      createSourceSession(xml, options) {
        observations.editorXml = xml
        observations.targetSelection = options?.targetSelection
        return sourceSession(observations.sessionId ?? 'source-1')
      },
    }),
    loadScoreRuntime: async () => renderer,
    async renderScore(runtime, xml, options) {
      observations.rendererRuntime = runtime
      observations.renderXml = xml
      observations.renderOptions = options
      return { renderEpoch: 'epoch-1' }
    },
    async clearScore(runtime) {
      observations.clearedRuntime = runtime
      observations.clearCount = (observations.clearCount ?? 0) + 1
      return true
    },
  }
}

test('GTAB-09B mounts the teacher workspace inside the existing accessible Gitar TAB tab', () => {
  const root = fakeDocument()
  const panel = ensureGuitarTabPanel(root)

  assert.ok(panel)
  assert.ok(root.getElementById('guitar-tab-teacher-workspace'))
  assert.equal(root.getElementById('guitar-tab-source-input')?.tagName, 'input')
  assert.equal(root.getElementById('guitar-tab-source-status')?.getAttribute('role'), 'status')
  assert.equal(root.getElementById('guitar-tab-score-surface')?.getAttribute('aria-readonly'), 'true')
  assert.ok(root.getElementById('guitar-tab-editor-surface'))

  const rows = root.querySelectorAll('.guitar-tab-string-row')
  assert.equal(rows.length, 6)
  assert.deepEqual(rows.map((row) => row.dataset.string), ['1', '2', '3', '4', '5', '6'])

  const button = root.getElementById('result-guitar-tab-btn')
  assert.equal(button.getAttribute('role'), 'tab')
  assert.equal(button.getAttribute('aria-controls'), 'tab-guitar-tab')
  assert.equal(panel.getAttribute('role'), 'tabpanel')
  assert.equal(panel.getAttribute('aria-labelledby'), 'result-guitar-tab-btn')

  assert.equal(activateGuitarTabResultTab(root), true)
  assert.equal(panel.hidden, false)
  assert.equal(root.getElementById('tab-assignment').hidden, true)
  assert.equal(root.getElementById('tab-violin').hidden, true)
})

test('GTAB-09B preserves exact source XML and sends the same immutable source to the ST renderer boundary', async () => {
  const root = fakeDocument()
  ensureGuitarTabPanel(root)
  const observations = { sessionId: 'audiveris-source' }
  const adapters = successfulAdapters(observations)
  const exactXml = '  <?xml version="1.0"?>\n<score-partwise version="4.0"></score-partwise>\n'

  const result = await loadGuitarTabTeacherSource(
    root,
    { name: 'audiveris-export.musicxml', text: async () => exactXml },
    adapters,
  )

  assert.equal(result.ok, true)
  assert.equal(result.rendererAvailable, true)
  assert.equal(observations.editorXml, exactXml)
  assert.deepEqual(observations.targetSelection, { partId: 'P1', partIndex: 0, staff: 1, voice: 1 })
  assert.equal(observations.renderXml, exactXml)
  assert.equal(observations.rendererRuntime.id, 'renderer')
  assert.equal(observations.renderOptions.pageMode, 'continuous')

  const state = getGuitarTabTeacherWorkspaceState(root)
  assert.equal(state.sourceName, 'audiveris-export.musicxml')
  assert.equal(state.sourceSession.sessionId, 'audiveris-source')
  assert.deepEqual(state.parsedScoreSummary, { partCount: 1, regionCount: 1, pitchedEventCount: 1 })
  assert.deepEqual(state.canonicalTabRegions[0], {
    partId: 'P1', partIndex: 0, staff: 1, voice: 1, partName: 'Guitar', pitchedEventCount: 1,
  })
  assert.deepEqual(state.selectedRegion, { partId: 'P1', partIndex: 0, staff: 1, voice: 1 })
  assert.equal(state.rendererAvailable, true)
  assert.equal(root.getElementById('guitar-tab-source-status').dataset.state, 'ready')
})

test('GTAB-10B offers canonical multipart targets and rebuilds the target-bound source session on change', async () => {
  const root = fakeDocument()
  ensureGuitarTabPanel(root)
  const observedTargets = []
  const adapters = successfulAdapters({})
  adapters.extractScoreInventory = () => ({ parts: [
    { partId: 'P1', partIndex: 0, name: 'Piyano', staves: [{ staff: 1, voices: [{ voice: 1, pitchedEventCount: 2 }] }] },
    { partId: 'P2', partIndex: 1, name: 'Gitar', staves: [{ staff: 1, voices: [{ voice: 1, pitchedEventCount: 1 }] }] },
  ] })
  adapters.parseCanonicalNotes = () => [
    { partId: 'P1', partIndex: 0, staff: 1, voice: 1, measureIndex: 0, startBeat: 0 },
    { partId: 'P2', partIndex: 1, staff: 1, voice: 1, measureIndex: 0, startBeat: 0 },
  ]
  adapters.loadEditorRuntime = async () => ({
    createSourceSession(xml, options) {
      observedTargets.push(options.targetSelection)
      return sourceSession(`session-${observedTargets.length}`)
    },
  })

  const result = await loadGuitarTabTeacherSource(root, {
    name: 'multipart.musicxml',
    text: async () => '<score-partwise/>',
  }, adapters)
  const select = root.getElementById('guitar-tab-target-region')
  assert.equal(result.ok, true)
  assert.equal(select.hidden, false)
  assert.equal(select.children.length, 3)
  assert.equal(observedTargets.length, 0)
  assert.equal(getGuitarTabTeacherWorkspaceState(root).selectedRegion, null)
  assert.equal(root.getElementById('guitar-tab-export').disabled, true)

  select.value = select.children[1].value
  await select.listeners.get('change')[0]()
  assert.deepEqual(JSON.parse(select.value), { partId: 'P1', partIndex: 0, staff: 1, voice: 1 })
  assert.deepEqual(observedTargets[0], { partId: 'P1', partIndex: 0, staff: 1, voice: 1 })
  const firstSession = getGuitarTabTeacherWorkspaceState(root).sourceSession

  select.value = select.children[2].value
  await select.listeners.get('change')[0]()
  assert.deepEqual(observedTargets[1], { partId: 'P2', partIndex: 1, staff: 1, voice: 1 })
  assert.notEqual(getGuitarTabTeacherWorkspaceState(root).sourceSession, firstSession)
  assert.deepEqual(getGuitarTabTeacherWorkspaceState(root).selectedRegion, observedTargets[1])
  assert.deepEqual(getGuitarTabTeacherWorkspaceState(root).selectedRegionSummary, {
    ...observedTargets[1], partName: 'Gitar', pitchedEventCount: 1,
  })
})

test('GTAB-10B renderer highlight keeps the full canonical note traversal for a selected staff', async () => {
  const root = fakeDocument()
  ensureGuitarTabPanel(root)
  const observations = { highlights: [] }
  const adapters = successfulAdapters(observations)
  adapters.extractScoreInventory = () => ({ parts: [{
    partId: 'P1', partIndex: 0, name: 'Guitar',
    staves: [{ staff: 1, voices: [{ voice: 1, pitchedEventCount: 1 }] }, { staff: 2, voices: [{ voice: 1, pitchedEventCount: 1 }] }],
  }] })
  adapters.parseCanonicalNotes = () => [
    { partId: 'P1', partIndex: 0, staff: 1, voice: 1, measureIndex: 0, startBeat: 0, pitch: { step: 'C', octave: 4 } },
    { partId: 'P1', partIndex: 0, staff: 2, voice: 1, measureIndex: 0, startBeat: 0, pitch: { step: 'D', octave: 4 } },
  ]
  adapters.loadEditorRuntime = async () => ({
    createSourceSession() {
      return {
        events: [{
          sourceEventId: 'staff-two-note', partId: 'P1', partIndex: 0, measureIndex: 0,
          voice: '1', staff: 2, onsetDivisions: 0, divisions: 1, sourceOrder: 0,
        }],
        groups: [{ groupId: 'group-two', sourceEventIds: ['staff-two-note'] }],
      }
    },
    createTabAssignmentDocument: () => ({ listAssignments: () => [] }),
    createKeyboardController: () => ({
      getState: () => ({ currentEventId: 'staff-two-note', currentGroupId: 'group-two', selectedString: 1, fretBuffer: '' }),
      handleKey() {},
    }),
    createFixedSixStringRows: () => [],
  })
  adapters.clearHighlights = async () => true
  adapters.moveCursor = async () => true
  adapters.highlightNote = async (_runtime, noteRef) => observations.highlights.push(noteRef)

  await loadGuitarTabTeacherSource(root, {
    name: 'two-staff.musicxml', text: async () => '<score-partwise/>',
  }, adapters)
  const targetSelect = root.getElementById('guitar-tab-target-region')
  targetSelect.value = targetSelect.children[2].value
  await targetSelect.listeners.get('change')[0]()

  assert.equal(observations.highlights.length, 1)
  assert.equal(observations.highlights[0].noteIndex, 1)
  assert.equal(getGuitarTabTeacherWorkspaceState(root).notationSynchronized, true)
})

test('GTAB-10B superseded target synchronization cannot restore the previous staff highlight', async () => {
  const root = fakeDocument()
  ensureGuitarTabPanel(root)
  const adapters = successfulAdapters({})
  adapters.extractScoreInventory = () => ({ parts: [
    { partId: 'P1', partIndex: 0, name: 'First', staves: [{ staff: 1, voices: [{ voice: 1, pitchedEventCount: 1 }] }] },
    { partId: 'P2', partIndex: 1, name: 'Second', staves: [{ staff: 1, voices: [{ voice: 1, pitchedEventCount: 1 }] }] },
  ] })
  adapters.parseCanonicalNotes = () => [
    { partId: 'P1', partIndex: 0, staff: 1, voice: 1, measureIndex: 0, startBeat: 0, measureKey: 'P1-1' },
    { partId: 'P2', partIndex: 1, staff: 1, voice: 1, measureIndex: 0, startBeat: 0, measureKey: 'P2-1' },
  ]
  adapters.loadEditorRuntime = async () => ({
    createSourceSession(_xml, { targetSelection }) {
      const eventId = `${targetSelection.partId}-note`
      return {
        events: [{
          sourceEventId: eventId, partId: targetSelection.partId, partIndex: targetSelection.partIndex,
          measureIndex: 0, voice: '1', staff: 1, onsetDivisions: 0, divisions: 1, sourceOrder: 0,
        }],
        groups: [{ groupId: `${eventId}-group`, sourceEventIds: [eventId] }],
      }
    },
    createTabAssignmentDocument: () => ({ listAssignments: () => [] }),
    createKeyboardController: ({ sourceSession }) => ({
      getState: () => ({
        currentEventId: sourceSession.events[0].sourceEventId,
        currentGroupId: sourceSession.groups[0].groupId,
        selectedString: 1,
        fretBuffer: '',
      }),
      handleKey() {},
    }),
    createFixedSixStringRows: () => [],
  })
  let finishFirstClear
  let firstClearStarted
  const firstClearStartedPromise = new Promise((resolve) => { firstClearStarted = resolve })
  const firstClearGate = new Promise((resolve) => { finishFirstClear = resolve })
  let clearCalls = 0
  const movedParts = []
  const highlightedParts = []
  adapters.clearHighlights = async () => {
    clearCalls += 1
    if (clearCalls === 1) {
      firstClearStarted()
      await firstClearGate
    }
    return true
  }
  adapters.moveCursor = async (_runtime, target) => movedParts.push(target.partId)
  adapters.highlightNote = async (_runtime, target) => highlightedParts.push(target.partId)

  await loadGuitarTabTeacherSource(root, {
    name: 'multipart.musicxml', text: async () => '<score-partwise/>',
  }, adapters)
  const select = root.getElementById('guitar-tab-target-region')
  select.value = select.children[1].value
  const firstActivation = select.listeners.get('change')[0]()
  await firstClearStartedPromise
  select.value = select.children[2].value
  const secondActivation = select.listeners.get('change')[0]()
  finishFirstClear()
  await Promise.all([firstActivation, secondActivation])

  assert.deepEqual(movedParts, ['P2'])
  assert.deepEqual(highlightedParts, ['P2'])
  assert.equal(getGuitarTabTeacherWorkspaceState(root).selectedRegion.partId, 'P2')
  assert.equal(getGuitarTabTeacherWorkspaceState(root).notationSynchronized, true)
})

test('GTAB-10B stale target synchronization cannot overwrite a newer unsupported target state', async () => {
  const root = fakeDocument()
  ensureGuitarTabPanel(root)
  let sessionCount = 0
  const adapters = successfulAdapters()
  adapters.extractScoreInventory = () => ({ parts: [
    { partId: 'P1', partIndex: 0, name: 'First', staves: [{ staff: 1, voices: [{ voice: 1, pitchedEventCount: 1 }] }] },
    { partId: 'P2', partIndex: 1, name: 'Second', staves: [{ staff: 1, voices: [{ voice: 1, pitchedEventCount: 1 }] }] },
  ] })
  adapters.loadEditorRuntime = async () => ({ createSourceSession() {
    sessionCount += 1
    if (sessionCount === 2) throw new Error('unsupported selected target')
    return {
      events: [{ sourceEventId: 'first-note', partId: 'P1', partIndex: 0, measureIndex: 0, voice: '1', staff: 1, onsetDivisions: 0, divisions: 1, sourceOrder: 0 }],
      groups: [{ groupId: 'first-group', sourceEventIds: ['first-note'] }],
    }
  },
  createTabAssignmentDocument: () => ({ listAssignments: () => [] }),
  createKeyboardController: () => ({ getState: () => ({ currentEventId: 'first-note', currentGroupId: 'first-group', selectedString: 1, fretBuffer: '' }), handleKey() {} }),
  createFixedSixStringRows: () => [],
  })
  let releaseFirstClear
  let signalFirstClearStarted
  let firstClear = true
  const started = new Promise((resolve) => { signalFirstClearStarted = resolve })
  const firstClearGate = new Promise((resolve) => { releaseFirstClear = resolve })
  adapters.clearHighlights = async () => {
    if (firstClear) {
      firstClear = false
      signalFirstClearStarted()
      await firstClearGate
    }
    return true
  }
  await loadGuitarTabTeacherSource(root, {
    name: 'multipart.musicxml', text: async () => '<score-partwise/>',
  }, adapters)
  const select = root.getElementById('guitar-tab-target-region')
  select.value = select.children[1].value
  const firstActivation = select.listeners.get('change')[0]()
  await started
  select.value = select.children[2].value
  select.listeners.get('change')[0]()
  assert.equal(root.getElementById('guitar-tab-source-status').dataset.state, 'unsupported')
  releaseFirstClear()
  await firstActivation

  const state = getGuitarTabTeacherWorkspaceState(root)
  assert.equal(state.selectedRegion, null)
  assert.equal(state.sourceSession, null)
  assert.equal(state.authoringAvailable, false)
  assert.equal(root.getElementById('guitar-tab-source-status').dataset.state, 'unsupported')
})

test('GTAB-10B clears the previous authoring session when a newly selected target is unsupported', async () => {
  const root = fakeDocument()
  ensureGuitarTabPanel(root)
  let sessionCount = 0
  const adapters = successfulAdapters()
  adapters.extractScoreInventory = () => ({ parts: [
    { partId: 'P1', partIndex: 0, name: 'Piano', staves: [{ staff: 1, voices: [{ voice: 1, pitchedEventCount: 1 }] }] },
    { partId: 'P2', partIndex: 1, name: 'Guitar', staves: [{ staff: 1, voices: [{ voice: 1, pitchedEventCount: 1 }] }] },
  ] })
  adapters.loadEditorRuntime = async () => ({ createSourceSession() {
    sessionCount += 1
    if (sessionCount === 2) throw new Error('unsupported selected target')
    return sourceSession(`session-${sessionCount}`)
  } })
  await loadGuitarTabTeacherSource(root, { name: 'two.musicxml', text: async () => '<score-partwise/>', size: 24 }, adapters)
  const select = root.getElementById('guitar-tab-target-region')
  select.value = select.children[1].value
  await select.listeners.get('change')[0]()
  assert.ok(getGuitarTabTeacherWorkspaceState(root).sourceSession)
  select.value = select.children[2].value
  await select.listeners.get('change')[0]()
  const state = getGuitarTabTeacherWorkspaceState(root)
  assert.equal(state.sourceSession, null)
  assert.equal(state.selectedRegion, null)
  assert.equal(state.authoringAvailable, false)
  assert.equal(root.getElementById('guitar-tab-export').disabled, true)
})

test('GTAB-10B stale source load cannot replace a newer source after runtime loading', async () => {
  const root = fakeDocument()
  ensureGuitarTabPanel(root)
  const adapters = successfulAdapters()
  let firstStarted
  let releaseFirst
  const firstLoadStarted = new Promise((resolve) => { firstStarted = resolve })
  adapters.loadEditorRuntime = () => {
    if (releaseFirst) return Promise.resolve({
      createSourceSession() { return sourceSession('second') },
    })
    return new Promise((resolve) => {
      releaseFirst = () => resolve({
        createSourceSession() { return sourceSession('first') },
      })
      firstStarted()
    })
  }

  const first = loadGuitarTabTeacherSource(root, {
    name: 'first.musicxml', text: async () => '<score-partwise id="first"/>',
  }, adapters)
  await firstLoadStarted
  const second = await loadGuitarTabTeacherSource(root, {
    name: 'second.musicxml', text: async () => '<score-partwise id="second"/>',
  }, adapters)
  assert.equal(second.ok, true)
  assert.equal(getGuitarTabTeacherWorkspaceState(root).sourceName, 'second.musicxml')

  releaseFirst()
  assert.deepEqual(await first, { ok: false, reason: 'STALE_SOURCE' })
  assert.equal(getGuitarTabTeacherWorkspaceState(root).sourceName, 'second.musicxml')
  assert.equal(getGuitarTabTeacherWorkspaceState(root).sourceSession.sessionId, 'second')
})

test('GTAB-10B accepts validated FileReader-only sources without requiring File.text', async () => {
  const root = fakeDocument()
  ensureGuitarTabPanel(root)
  const adapters = successfulAdapters()
  adapters.readMusicXmlSourceFile = async (file) => ({ xmlText: '<score-partwise/>', sourceName: file.name })
  const result = await loadGuitarTabTeacherSource(root, { name: 'legacy.musicxml', size: 20, arrayBuffer: async () => new ArrayBuffer(20) }, adapters)
  assert.equal(result.ok, true)
  assert.equal(getGuitarTabTeacherWorkspaceState(root).sourceName, 'legacy.musicxml')
})

test('GTAB-10B rejects inventory extraction failures before source-session or renderer access', async () => {
  const root = fakeDocument()
  ensureGuitarTabPanel(root)
  const observations = { sourceSessionCalls: 0, renderCalls: 0 }
  const adapters = successfulAdapters(observations)
  adapters.extractScoreInventory = () => { throw new Error('contradictory source identity') }
  adapters.loadEditorRuntime = async () => ({
    createSourceSession() {
      observations.sourceSessionCalls += 1
      return sourceSession('should-not-start')
    },
  })
  adapters.renderScore = async () => { observations.renderCalls += 1; return { renderEpoch: 'unexpected' } }

  const result = await loadGuitarTabTeacherSource(root, {
    name: 'unsafe.musicxml', text: async () => '<score-partwise/>',
  }, adapters)

  assert.deepEqual(result, { ok: false, reason: 'SOURCE_UNSUPPORTED' })
  assert.equal(observations.sourceSessionCalls, 0)
  assert.equal(observations.renderCalls, 0)
  assert.equal(getGuitarTabTeacherWorkspaceState(root).rendererAvailable, false)
  assert.equal(root.getElementById('guitar-tab-source-status').dataset.state, 'unsupported')
})

test('GTAB-10B leaves the target unset and disables TAB export when inventory has no eligible regions', async () => {
  const root = fakeDocument()
  ensureGuitarTabPanel(root)
  const adapters = successfulAdapters()
  adapters.extractScoreInventory = () => ({ parts: [] })

  const result = await loadGuitarTabTeacherSource(root, {
    name: 'empty.musicxml', text: async () => '<score-partwise/>',
  }, adapters)

  assert.equal(result.ok, true)
  assert.equal(root.getElementById('guitar-tab-target-region').disabled, true)
  assert.equal(root.getElementById('guitar-tab-export').disabled, true)
  assert.equal(getGuitarTabTeacherWorkspaceState(root).selectedRegion, null)
  assert.match(root.getElementById('guitar-tab-source-status').textContent, /kullanılabilir TAB bölgesi yok/u)
})

test('GTAB-10B rejects an invalid file before the reader can access its contents', async () => {
  const root = fakeDocument()
  ensureGuitarTabPanel(root)
  const order = []
  const adapters = successfulAdapters()
  adapters.validateMusicXmlFile = () => { order.push('validate'); return 'invalid extension' }
  adapters.readMusicXmlSourceFile = async () => { order.push('read'); throw new Error('must not read') }
  adapters.extractScoreInventory = () => { order.push('inventory'); throw new Error('must not parse') }
  adapters.parseCanonicalNotes = () => { order.push('parse'); throw new Error('must not parse') }

  const result = await loadGuitarTabTeacherSource(root, {
    name: 'invalid.exe',
    text: async () => { order.push('text'); return '<score-partwise/>' },
  }, adapters)

  assert.deepEqual(result, { ok: false, reason: 'SOURCE_READ_FAILED' })
  assert.deepEqual(order, ['validate'])
})

test('GTAB-09B keeps source session and six-string editor available when notation rendering fails', async () => {
  const root = fakeDocument()
  ensureGuitarTabPanel(root)
  const observations = { sessionId: 'smoosic-source' }
  const adapters = successfulAdapters(observations)
  adapters.renderScore = async () => { throw new Error('renderer failed') }
  const xml = '<score-partwise version="4.0"></score-partwise>'

  const result = await loadGuitarTabTeacherSource(
    root,
    { name: 'edited-in-smoosic.xml', text: async () => xml },
    adapters,
  )

  assert.equal(result.ok, true)
  assert.equal(result.rendererAvailable, false)
  assert.equal(getGuitarTabTeacherWorkspaceState(root).sourceSession.sessionId, 'smoosic-source')
  assert.equal(getGuitarTabTeacherWorkspaceState(root).rendererAvailable, false)
  assert.equal(root.querySelectorAll('.guitar-tab-string-row').length, 6)
  assert.match(root.getElementById('guitar-tab-source-status').textContent, /TAB çalışma alanı kullanılabilir/)
})

test('GTAB-09B fails closed on unsupported source without removing the editor shell', async () => {
  const root = fakeDocument()
  ensureGuitarTabPanel(root)
  const adapters = successfulAdapters()
  adapters.loadEditorRuntime = async () => ({
    createSourceSession() { throw new Error('unsupported') },
  })

  const result = await loadGuitarTabTeacherSource(root, '<not-musicxml/>', adapters)

  assert.deepEqual(result, { ok: false, reason: 'SOURCE_UNSUPPORTED' })
  assert.equal(root.getElementById('guitar-tab-source-status').dataset.state, 'unsupported')
  assert.equal(root.querySelectorAll('.guitar-tab-string-row').length, 6)
})

test('GTAB-10C clears the TAB loading message when the shared editor runtime is unavailable', async () => {
  const root = fakeDocument()
  ensureGuitarTabPanel(root)
  const adapters = successfulAdapters()
  adapters.loadEditorRuntime = async () => null

  const result = await loadGuitarTabTeacherSource(root, {
    name: 'ordinary.musicxml', text: async () => '<score-partwise/>' ,
  }, adapters)

  assert.deepEqual(result, { ok: false, reason: 'EDITOR_RUNTIME_UNAVAILABLE' })
  const editorStatus = root.getElementById('guitar-tab-editor-status')
  assert.notEqual(editorStatus.dataset.state, 'loading')
  assert.doesNotMatch(editorStatus.textContent, /hazırlanıyor/u)
  assert.match(editorStatus.textContent, /bileşeni yüklenemedi/u)
})

test('GTAB-10C resets the file picker so the same MusicXML source can be selected again', async () => {
  const root = fakeDocument()
  ensureGuitarTabPanel(root)
  const input = root.getElementById('guitar-tab-source-input')
  const source = { name: 'ordinary.musicxml', text: async () => '<score-partwise/>' }
  input.files = [source]
  input.value = 'C:\\fakepath\\ordinary.musicxml'

  await input.listeners.get('change')[0]()
  assert.equal(input.value, '')
  assert.equal(getGuitarTabTeacherWorkspaceState(root).sourceName, null)
})

test('GTAB-09B source replacement and reset clear prior renderer state deterministically', async () => {
  const root = fakeDocument()
  ensureGuitarTabPanel(root)
  const observations = { sessionId: 'first' }
  const adapters = successfulAdapters(observations)

  await loadGuitarTabTeacherSource(
    root,
    { name: 'first.musicxml', text: async () => '<score-partwise id="first"></score-partwise>' },
    adapters,
  )
  observations.sessionId = 'second'
  await loadGuitarTabTeacherSource(
    root,
    { name: 'second.musicxml', text: async () => '<score-partwise id="second"></score-partwise>' },
    adapters,
  )

  assert.equal(observations.clearCount, 1)
  assert.equal(getGuitarTabTeacherWorkspaceState(root).sourceName, 'second.musicxml')
  assert.equal(getGuitarTabTeacherWorkspaceState(root).sourceSession.sessionId, 'second')

  await resetGuitarTabTeacherWorkspace(root, adapters)
  assert.equal(observations.clearCount, 2)
  assert.equal(getGuitarTabTeacherWorkspaceState(root).sourceName, null)
  assert.equal(getGuitarTabTeacherWorkspaceState(root).sourceSession, null)
  assert.equal(root.getElementById('guitar-tab-source-status').dataset.state, 'empty')
  assert.equal(root.getElementById('guitar-tab-target-region').hidden, true)
  assert.equal(root.getElementById('guitar-tab-target-region').disabled, true)
  assert.equal(root.getElementById('guitar-tab-target-region').children.length, 1)
  assert.equal(root.querySelectorAll('.guitar-tab-string-row').length, 6)
})

test('GTAB-10B target invalidation clears the previous notation highlight', async () => {
  const root = fakeDocument()
  ensureGuitarTabPanel(root)
  const adapters = successfulAdapters()
  adapters.extractScoreInventory = () => ({ parts: [
    { partId: 'P1', partIndex: 0, name: 'Guitar', staves: [{ staff: 1, voices: [{ voice: 1, pitchedEventCount: 1 }] }] },
    { partId: 'P2', partIndex: 1, name: 'Piano', staves: [{ staff: 1, voices: [{ voice: 1, pitchedEventCount: 1 }] }] },
  ] })
  adapters.parseCanonicalNotes = () => [
    { partId: 'P1', partIndex: 0, staff: 1, voice: 1, measureIndex: 0, startBeat: 0 },
    { partId: 'P2', partIndex: 1, staff: 1, voice: 1, measureIndex: 0, startBeat: 0 },
  ]
  adapters.loadEditorRuntime = async () => ({
    createSourceSession(_xml, { targetSelection }) {
      const noteId = `${targetSelection.partId}-note`
      const groupId = `${noteId}-group`
      return {
        events: [{ sourceEventId: noteId, partId: targetSelection.partId, partIndex: targetSelection.partIndex, measureIndex: 0, voice: '1', staff: 1, onsetDivisions: 0, divisions: 1, sourceOrder: 0 }],
        groups: [{ groupId, sourceEventIds: [noteId] }],
      }
    },
    createTabAssignmentDocument: () => ({ listAssignments: () => [] }),
    createKeyboardController: ({ sourceSession }) => ({ getState: () => ({ currentEventId: sourceSession.events[0].sourceEventId, currentGroupId: sourceSession.groups[0].groupId, selectedString: 1, fretBuffer: '' }), handleKey() {} }),
    createFixedSixStringRows: () => [],
  })
  const highlights = []
  let clearCount = 0
  adapters.clearHighlights = async () => { clearCount += 1; return true }
  adapters.moveCursor = async () => true
  adapters.highlightNote = async (_runtime, target) => highlights.push(target)
  await loadGuitarTabTeacherSource(root, { name: 'one.musicxml', text: async () => '<score-partwise/>' }, adapters)
  const select = root.getElementById('guitar-tab-target-region')
  select.value = select.children[1].value
  await select.listeners.get('change')[0]()
  assert.equal(highlights.length, 1)
  const clearCountBeforeInvalidation = clearCount
  select.value = ''
  await select.listeners.get('change')[0]()
  assert.equal(clearCount, clearCountBeforeInvalidation + 1)
  assert.equal(getGuitarTabTeacherWorkspaceState(root).selectedRegion, null)
  assert.equal(root.getElementById('guitar-tab-source-status').dataset.state, 'target-required')
})
test('GTAB-10B target changes cancel an in-flight export before download', async () => {
  const root = fakeDocument()
  ensureGuitarTabPanel(root)
  let releasePreparation
  let preparationStarted
  const started = new Promise((resolve) => { preparationStarted = resolve })
  const gate = new Promise((resolve) => { releasePreparation = resolve })
  let handoffCalls = 0
  let downloadCalls = 0
  const adapters = successfulAdapters()
  adapters.extractScoreInventory = () => ({ parts: [{
    partId: 'P1', partIndex: 0, name: 'Guitar', staves: [{ staff: 1, voices: [{ voice: 1, pitchedEventCount: 1 }] }],
  }] })
  adapters.parseCanonicalNotes = () => [{ partId: 'P1', partIndex: 0, staff: 1, voice: 1, measureIndex: 0, startBeat: 0 }]
  adapters.loadEditorRuntime = async () => ({
    createSourceSession() {
      return { sessionId: 'session', events: [{ sourceEventId: 'note', partId: 'P1', partIndex: 0, measureIndex: 0, voice: '1', staff: 1, onsetDivisions: 0, divisions: 1, sourceOrder: 0 }], groups: [{ groupId: 'group', sourceEventIds: ['note'] }] }
    },
    createTabAssignmentDocument: () => ({ canExport: () => true, listAssignments: () => [] }),
    createKeyboardController: () => ({ getState: () => ({ currentEventId: 'note', currentGroupId: 'group', selectedString: 1, fretBuffer: '' }), handleKey() {} }),
    createFixedSixStringRows: () => [],
    serializeGuitarTabMusicXml: () => '<score-partwise/>',
  })
  adapters.prepareScoreUpload = async () => { preparationStarted(); await gate; return { id: 'upload' } }
  adapters.prepareHandoff = async () => { handoffCalls += 1; return {} }
  adapters.downloadText = async () => { downloadCalls += 1 }
  await loadGuitarTabTeacherSource(root, { name: 'one.musicxml', text: async () => '<score-partwise/>' }, adapters)
  const select = root.getElementById('guitar-tab-target-region')
  select.value = select.children[1].value
  await select.listeners.get('change')[0]()
  assert.equal(root.getElementById('guitar-tab-export').disabled, false)
  const exportPromise = exportGuitarTabTeacherWorkspaceMusicXml(root)
  await started
  select.value = ''
  await select.listeners.get('change')[0]()
  releasePreparation()
  assert.deepEqual(await exportPromise, { ok: false, reason: 'STALE_TARGET' })
  assert.equal(handoffCalls, 0)
  assert.equal(downloadCalls, 0)
  assert.equal(getGuitarTabTeacherWorkspaceState(root).selectedRegion, null)
  assert.equal(root.getElementById('guitar-tab-source-status').dataset.state, 'target-required')
})

test('GTAB-10B stale renderer rejection cannot return a newer source session', async () => {
  const root = fakeDocument()
  ensureGuitarTabPanel(root)
  const adapters = successfulAdapters()
  let releaseFirstRender
  let signalFirstRender
  const firstRenderStarted = new Promise((resolve) => { signalFirstRender = resolve })
  const firstRenderGate = new Promise((resolve) => { releaseFirstRender = resolve })
  adapters.loadEditorRuntime = async () => ({ createSourceSession(_xml, { targetSelection }) {
    return sourceSession(`${targetSelection.partId}-${_xml.includes('first') ? 'first' : 'second'}`)
  } })
  adapters.loadScoreRuntime = async (_root) => ({ id: 'renderer' })
  adapters.renderScore = async (_runtime, xml) => {
    if (xml.includes('first')) {
      signalFirstRender()
      await firstRenderGate
      throw new Error('stale renderer failure')
    }
    return { renderEpoch: 'second' }
  }
  const first = loadGuitarTabTeacherSource(root, { name: 'first.musicxml', text: async () => '<score-partwise>first</score-partwise>' }, adapters)
  await firstRenderStarted
  const second = await loadGuitarTabTeacherSource(root, { name: 'second.musicxml', text: async () => '<score-partwise>second</score-partwise>' }, adapters)
  assert.equal(second.ok, true)
  const currentSession = getGuitarTabTeacherWorkspaceState(root).sourceSession
  releaseFirstRender()
  assert.deepEqual(await first, { ok: false, reason: 'STALE_SOURCE' })
  assert.equal(getGuitarTabTeacherWorkspaceState(root).sourceSession, currentSession)
  assert.equal(getGuitarTabTeacherWorkspaceState(root).sourceName, 'second.musicxml')
})
