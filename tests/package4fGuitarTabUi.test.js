import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  clearPackage3Notes,
  publishPackage3Notes,
} from '../package3MeasureBridge.js'
import {
  activateGuitarTabResultTab,
  buildGuitarTabUiModel,
  ensureGuitarTabPanel,
  GUITAR_TAB_UI_MESSAGE,
  GUITAR_TAB_UI_STATE,
  initPackage4Ui,
  renderGuitarTabPanel,
} from '../src/package4Ui.js'
import { GUITAR_TAB_CONSUMER_STATE } from '../src/services/guitarTabConsumer.js'

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

function renderedResult(text = 'e|--0--|\nB|-----|\nG|-----|\nD|-----|\nA|-----|\nE|-----|') {
  return {
    state: GUITAR_TAB_CONSUMER_STATE.RENDERED,
    allowed: true,
    definitive: true,
    text,
  }
}

test('Package 4F passes the exact published NoteObject[] reference to the gated consumer', () => {
  clearPackage3Notes()
  const root = fakeDocument()
  let receivedNotes = null
  const adapter = {
    buildQualityGatedBasicGuitarTab(notes) {
      receivedNotes = notes
      return renderedResult()
    },
  }

  assert.equal(initPackage4Ui(root, adapter), true)
  const notes = [{ measureKey: '0:0', noteName: 'Mi' }]
  publishPackage3Notes(notes)

  assert.equal(receivedNotes, notes)
  assert.equal(root.getElementById('guitar-tab-output').hidden, false)
  assert.match(root.getElementById('guitar-tab-output').textContent, /^e\|/)
  clearPackage3Notes()
})

test('Package 4F displays TAB text only for a definitive rendered consumer result', () => {
  const notes = [{}]
  const model = buildGuitarTabUiModel(notes, {
    buildQualityGatedBasicGuitarTab: () => renderedResult('SAFE-TAB'),
  })
  assert.equal(model.state, GUITAR_TAB_UI_STATE.RENDERED)
  assert.equal(model.text, 'SAFE-TAB')
  assert.equal(model.rendered, true)
  assert.ok(Object.isFrozen(model))

  const malformedRendered = buildGuitarTabUiModel(notes, {
    buildQualityGatedBasicGuitarTab: () => ({
      state: GUITAR_TAB_CONSUMER_STATE.RENDERED,
      allowed: false,
      definitive: false,
      text: 'MUST-NOT-SHOW',
    }),
  })
  assert.equal(malformedRendered.state, GUITAR_TAB_UI_STATE.INVALID)
  assert.equal(malformedRendered.text, '')
})

test('Package 4F REVIEW, BLOCK and advanced-required states expose no generated TAB bytes', () => {
  const cases = [
    [GUITAR_TAB_CONSUMER_STATE.REVIEW_REQUIRED, GUITAR_TAB_UI_STATE.REVIEW_REQUIRED, GUITAR_TAB_UI_MESSAGE.REVIEW_REQUIRED],
    [GUITAR_TAB_CONSUMER_STATE.BLOCKED, GUITAR_TAB_UI_STATE.BLOCKED, GUITAR_TAB_UI_MESSAGE.BLOCKED],
    [GUITAR_TAB_CONSUMER_STATE.NOT_AVAILABLE, GUITAR_TAB_UI_STATE.NOT_AVAILABLE, GUITAR_TAB_UI_MESSAGE.NOT_AVAILABLE],
  ]

  for (const [consumerState, uiState, expectedMessage] of cases) {
    const root = fakeDocument()
    const model = renderGuitarTabPanel(root, [{}], {
      buildQualityGatedBasicGuitarTab: () => ({
        state: consumerState,
        reason: 'internal-diagnostic-must-not-leak',
        allowed: false,
        definitive: false,
        text: 'UNSAFE-PARTIAL-TAB',
      }),
    })
    assert.equal(model.state, uiState)
    assert.equal(root.getElementById('guitar-tab-output').textContent, '')
    assert.equal(root.getElementById('guitar-tab-output').hidden, true)
    assert.equal(root.getElementById('guitar-tab-status').textContent, expectedMessage)
    assert.doesNotMatch(root.getElementById('guitar-tab-status').textContent, /internal-diagnostic/)
  }
})

test('Package 4F creates a native accessible result tab and focusable text output', () => {
  const root = fakeDocument()
  const panel = ensureGuitarTabPanel(root)
  const button = root.getElementById('result-guitar-tab-btn')
  const status = root.getElementById('guitar-tab-status')
  const output = root.getElementById('guitar-tab-output')

  assert.ok(panel)
  assert.equal(button.tagName, 'button')
  assert.equal(button.type, 'button')
  assert.equal(button.getAttribute('role'), 'tab')
  assert.equal(button.getAttribute('aria-controls'), 'tab-guitar-tab')
  assert.equal(panel.getAttribute('role'), 'tabpanel')
  assert.equal(panel.getAttribute('aria-labelledby'), 'result-guitar-tab-btn')
  assert.equal(status.getAttribute('role'), 'status')
  assert.equal(status.getAttribute('aria-live'), 'polite')
  assert.equal(output.tagName, 'pre')
  assert.equal(output.getAttribute('aria-label'), 'Oluşturulan temel gitar TAB')
  assert.equal(output.getAttribute('tabindex'), '0')
})

test('Package 4F result tab switching hides legacy panels and yields back cleanly', () => {
  const root = fakeDocument()
  ensureGuitarTabPanel(root)
  const guitarButton = root.getElementById('result-guitar-tab-btn')

  assert.equal(activateGuitarTabResultTab(root), true)
  assert.equal(root.getElementById('tab-guitar-tab').hidden, false)
  for (const id of ['tab-rhythmic', 'tab-html', 'tab-notes', 'tab-xml']) {
    assert.equal(root.getElementById(id).hidden, true)
  }
  assert.equal(guitarButton.getAttribute('aria-selected'), 'true')

  const rhythmicButton = root.querySelectorAll('.tab-btn').find((button) => button.dataset.tab === 'rhythmic')
  rhythmicButton.click()
  assert.equal(root.getElementById('tab-guitar-tab').hidden, true)
  assert.equal(guitarButton.getAttribute('aria-selected'), 'false')
})

test('Package 4F clear/reset handoff removes previously rendered TAB', () => {
  clearPackage3Notes()
  const root = fakeDocument()
  initPackage4Ui(root, {
    buildQualityGatedBasicGuitarTab: () => renderedResult('VISIBLE-TAB'),
  })
  publishPackage3Notes([{}])
  assert.equal(root.getElementById('guitar-tab-output').textContent, 'VISIBLE-TAB')

  clearPackage3Notes()
  assert.equal(root.getElementById('guitar-tab-output').textContent, '')
  assert.equal(root.getElementById('guitar-tab-output').hidden, true)
  assert.equal(root.getElementById('guitar-tab-status').textContent, GUITAR_TAB_UI_MESSAGE.EMPTY)
})

test('Package 4F source is text-only, imports no OMR boundary, and main loads the module', () => {
  const source = readFileSync(new URL('../src/package4Ui.js', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /\.innerHTML\s*=/)
  assert.doesNotMatch(source, /Audiveris|omrWorker|omrProvider|omrService|gatewayProvider|cloud-omr/i)
  assert.doesNotMatch(source, /result\?\.reason|result\.reason/)
  assert.match(main, /import ['"]\.\/src\/package4Ui\.js['"]/)
})
