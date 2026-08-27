import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  clearPackage3Notes,
  publishPackage3Notes,
} from '../package3MeasureBridge.js'
import {
  activateViolinResultTab,
  buildViolinUiModel,
  ensureViolinPanel,
  formatBasicViolinProjectionForUi,
  initPackage5Ui,
  renderViolinPanel,
  VIOLIN_UI_MESSAGE,
  VIOLIN_UI_STATE,
} from '../src/package5Ui.js'
import {
  ensureGuitarTabPanel,
} from '../src/package4Ui.js'
import { VIOLIN_CONSUMER_STATE } from '../src/services/violinConsumer.js'

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
    this.textContent = ''
    this.type = ''
    this.parentElement = null
    this._id = ''
  }
  set id(value) {
    this._id = value
    if (value) this.root.nodes.set(value, this)
  }
  get id() { return this._id }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  appendChild(child) {
    child.parentElement = this
    this.children.push(child)
    return child
  }
  insertBefore(child, before) {
    child.parentElement = this
    const index = this.children.indexOf(before)
    if (index < 0) this.children.push(child)
    else this.children.splice(index, 0, child)
    return child
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
    createElement(tagName) {
      const element = new FakeElement(root, tagName)
      root.elements.push(element)
      return element
    },
    getElementById(id) { return root.nodes.get(id) ?? null },
    querySelector(selector) {
      if (selector.startsWith('.')) {
        const className = selector.slice(1)
        return root.elements.find((element) => element.classList.contains(className)) ?? null
      }
      return null
    },
    querySelectorAll(selector) {
      if (selector.startsWith('.')) {
        const className = selector.slice(1)
        return root.elements.filter((element) => element.classList.contains(className))
      }
      return []
    },
  }

  const results = root.createElement('section'); results.id = 'results-section'
  const body = root.createElement('div'); body.className = 'card-body'; results.appendChild(body)
  const tabList = root.createElement('div'); tabList.className = 'result-tabs'; body.appendChild(tabList)

  for (const name of ['rhythmic', 'html', 'notes', 'xml']) {
    const button = root.createElement('button')
    button.className = name === 'rhythmic' ? 'tab-btn active' : 'tab-btn'
    button.dataset.tab = name
    button.setAttribute('aria-selected', name === 'rhythmic' ? 'true' : 'false')
    tabList.appendChild(button)

    const panel = root.createElement('div')
    panel.id = `tab-${name}`
    panel.hidden = name !== 'rhythmic'
    body.appendChild(panel)
  }

  const summary = root.createElement('div'); summary.id = 'notes-summary'; body.appendChild(summary)
  return root
}

function projectedResult(notes, options = {}) {
  const measureKey = options.measureKey ?? 'P1:0'
  const measureNumber = options.measureNumber ?? '1'
  const events = notes.map((note, index) => {
    const semitoneOffset = index === 0 ? 0 : 2
    return {
      noteIndex: index,
      note,
      measureKey,
      measureIndex: 0,
      startBeat: index,
      beats: 1,
      voice: 1,
      staff: 1,
      isRest: false,
      isGrace: false,
      tieStart: false,
      tieStop: false,
      policyId: 'first-position-semitone-zone-v1',
      provenance: 'generated-basic-first-position-fingering',
      teacherApproved: false,
      fingering: {
        stringNumber: 4,
        stringName: 'G',
        openMidi: 55,
        writtenMidi: 55 + semitoneOffset,
        fingerNumber: index === 0 ? 0 : 1,
        semitoneOffset,
        position: 'first',
        policyId: 'first-position-semitone-zone-v1',
        provenance: 'generated-basic-first-position-fingering',
        teacherApproved: false,
      },
    }
  })

  return {
    state: VIOLIN_CONSUMER_STATE.PROJECTED,
    allowed: true,
    definitive: true,
    teacherApproved: false,
    noteCount: notes.length,
    measureCount: 1,
    projection: {
      state: 'projected',
      reason: null,
      policyId: 'first-position-semitone-zone-v1',
      provenance: 'generated-basic-first-position-fingering',
      teacherApproved: false,
      noteCount: notes.length,
      measureCount: 1,
      measures: [{
        measureKey,
        measureIndex: 0,
        measureNumber,
        partId: 'P1',
        partIndex: 0,
        events,
      }],
    },
  }
}

test('Package 5F passes the exact published NoteObject[] reference to the gated violin consumer', () => {
  clearPackage3Notes()
  const root = fakeDocument()
  let receivedNotes = null
  const adapter = {
    buildQualityGatedBasicViolin(notes) {
      receivedNotes = notes
      return projectedResult(notes)
    },
  }

  assert.equal(initPackage5Ui(root, adapter), true)
  const notes = [
    { measureKey: 'P1:0', noteName: 'Sol' },
    { measureKey: 'P1:0', noteName: 'La' },
  ]
  publishPackage3Notes(notes)

  assert.equal(receivedNotes, notes)
  assert.equal(root.getElementById('violin-output').hidden, false)
  assert.match(root.getElementById('violin-output').textContent, /Sol notası: Dördüncü tel, açık tel/)
  clearPackage3Notes()
})

test('Package 5F renders only definitive generated-basic projection evidence', () => {
  const notes = [{ measureKey: 'P1:0', noteName: 'Sol' }]
  const model = buildViolinUiModel(notes, {
    buildQualityGatedBasicViolin: () => projectedResult(notes),
  })
  assert.equal(model.state, VIOLIN_UI_STATE.RENDERED)
  assert.equal(model.rendered, true)
  assert.match(model.text, /fiziksel kimlik P1:0/)
  assert.ok(Object.isFrozen(model))

  const unsafe = projectedResult(notes)
  unsafe.projection.measures[0].events[0].fingering.teacherApproved = true
  const rejected = buildViolinUiModel(notes, {
    buildQualityGatedBasicViolin: () => unsafe,
  })
  assert.equal(rejected.state, VIOLIN_UI_STATE.INVALID)
  assert.equal(rejected.text, '')
})

test('Package 5F REVIEW, BLOCK and not-available states expose no generated fingering text', () => {
  const cases = [
    [VIOLIN_CONSUMER_STATE.REVIEW_REQUIRED, VIOLIN_UI_STATE.REVIEW_REQUIRED, VIOLIN_UI_MESSAGE.REVIEW_REQUIRED],
    [VIOLIN_CONSUMER_STATE.BLOCKED, VIOLIN_UI_STATE.BLOCKED, VIOLIN_UI_MESSAGE.BLOCKED],
    [VIOLIN_CONSUMER_STATE.NOT_AVAILABLE, VIOLIN_UI_STATE.NOT_AVAILABLE, VIOLIN_UI_MESSAGE.NOT_AVAILABLE],
  ]

  for (const [consumerState, uiState, expectedMessage] of cases) {
    const root = fakeDocument()
    const model = renderViolinPanel(root, [{}], {
      buildQualityGatedBasicViolin: () => ({
        state: consumerState,
        reason: 'internal-diagnostic-must-not-leak',
        allowed: false,
        definitive: false,
        teacherApproved: false,
        projection: projectedResult([{}]).projection,
      }),
    })
    assert.equal(model.state, uiState)
    assert.equal(root.getElementById('violin-output').textContent, '')
    assert.equal(root.getElementById('violin-output').hidden, true)
    assert.equal(root.getElementById('violin-status').textContent, expectedMessage)
    assert.doesNotMatch(root.getElementById('violin-status').textContent, /internal-diagnostic/)
  }
})

test('Package 5F keeps duplicate displayed measure numbers distinct through physical measureKey', () => {
  const noteA = { noteName: 'Sol' }
  const noteB = { noteName: 'La' }
  const first = projectedResult([noteA], { measureKey: 'P1:0', measureNumber: '1' }).projection.measures[0]
  const second = projectedResult([noteB], { measureKey: 'P1:1', measureNumber: '1' }).projection.measures[0]
  second.measureIndex = 1
  second.events[0].measureKey = 'P1:1'
  second.events[0].noteIndex = 1

  const text = formatBasicViolinProjectionForUi({
    state: 'projected',
    policyId: 'first-position-semitone-zone-v1',
    provenance: 'generated-basic-first-position-fingering',
    teacherApproved: false,
    noteCount: 2,
    measureCount: 2,
    measures: [first, second],
  })

  assert.match(text, /Ölçü 1; fiziksel kimlik P1:0/)
  assert.match(text, /Ölçü 1; fiziksel kimlik P1:1/)
})

test('Package 5F creates a native accessible result tab and focusable plain-text output', () => {
  const root = fakeDocument()
  const panel = ensureViolinPanel(root)
  const button = root.getElementById('result-violin-btn')
  const status = root.getElementById('violin-status')
  const output = root.getElementById('violin-output')

  assert.ok(panel)
  assert.equal(button.tagName, 'button')
  assert.equal(button.type, 'button')
  assert.equal(button.getAttribute('role'), 'tab')
  assert.equal(button.getAttribute('aria-controls'), 'tab-violin')
  assert.equal(panel.getAttribute('role'), 'tabpanel')
  assert.equal(panel.getAttribute('aria-labelledby'), 'result-violin-btn')
  assert.equal(status.getAttribute('role'), 'status')
  assert.equal(status.getAttribute('aria-live'), 'polite')
  assert.equal(output.tagName, 'pre')
  assert.equal(output.getAttribute('aria-label'), 'Oluşturulan temel keman tel ve parmak önerisi')
  assert.equal(output.getAttribute('tabindex'), '0')
})

test('Package 5F tab switching coexists with Package 4F Guitar TAB and legacy result panels', () => {
  const root = fakeDocument()
  ensureGuitarTabPanel(root)
  ensureViolinPanel(root)

  assert.equal(activateViolinResultTab(root), true)
  assert.equal(root.getElementById('tab-violin').hidden, false)
  assert.equal(root.getElementById('tab-guitar-tab').hidden, true)
  const violinButton = root.getElementById('result-violin-btn')
  assert.equal(violinButton.getAttribute('aria-selected'), 'true')

  const guitarButton = root.getElementById('result-guitar-tab-btn')
  guitarButton.click()
  assert.equal(root.getElementById('tab-guitar-tab').hidden, false)
  assert.equal(root.getElementById('tab-violin').hidden, true)
  assert.equal(violinButton.getAttribute('aria-selected'), 'false')
})

test('Package 5F clear/reset handoff removes previously rendered violin output', () => {
  clearPackage3Notes()
  const root = fakeDocument()
  initPackage5Ui(root, {
    buildQualityGatedBasicViolin: (notes) => projectedResult(notes),
  })
  publishPackage3Notes([{ measureKey: 'P1:0', noteName: 'Sol' }])
  assert.match(root.getElementById('violin-output').textContent, /Dördüncü tel/)

  clearPackage3Notes()
  assert.equal(root.getElementById('violin-output').textContent, '')
  assert.equal(root.getElementById('violin-output').hidden, true)
  assert.equal(root.getElementById('violin-status').textContent, VIOLIN_UI_MESSAGE.EMPTY)
})

test('Package 5F source is text-only, imports no OMR boundary, preserves Discovery, and main loads the module', () => {
  const source = readFileSync(new URL('../src/package5Ui.js', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /\.innerHTML\s*=/)
  assert.doesNotMatch(source, /Audiveris|omrWorker|omrProvider|omrService|gatewayProvider|cloud-omr/i)
  assert.doesNotMatch(source, /result\?\.reason|result\.reason/)
  assert.match(main, /import ['"]\.\/src\/package4Ui\.js['"]/)
  assert.match(main, /import ['"]\.\/src\/package5Ui\.js['"]/)
  assert.match(main, /import ['"]\.\/src\/discoveryUi\.js['"]/)
})
