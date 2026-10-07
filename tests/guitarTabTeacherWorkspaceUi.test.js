import test from 'node:test'
import assert from 'node:assert/strict'

import {
  activateGuitarTabResultTab,
  ensureGuitarTabPanel,
} from '../src/package4Ui.js'
import {
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
