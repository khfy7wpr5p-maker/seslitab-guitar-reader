import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  clearPackage3Notes,
  publishPackage3Notes,
} from '../package3MeasureBridge.js'
import { CHORD_SOURCE_CONSUMER_STATE } from '../src/services/chordSourceConsumer.js'
import {
  CHORD_UI_STATE,
  activateChordResultTab,
  buildChordUiModel,
  ensureChordPanel,
  hasConflictingAudioConsumer,
  initPackage7Ui,
  renderChordPanel,
  runChordSpeech,
  stopChordOperation,
} from '../src/package7Ui.js'

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
    this._id = ''
  }
  set id(value) { this._id = value; if (value) this.root.nodes.set(value, this) }
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
  addEventListener(name, listener, options = false) {
    const list = this.listeners.get(name) ?? []
    list.push({ listener, capture: options === true || options?.capture === true })
    this.listeners.set(name, list)
  }
  click() {
    const event = { type: 'click', currentTarget: this }
    const list = this.listeners.get('click') ?? []
    for (const entry of list.filter((item) => item.capture)) entry.listener(event)
    for (const entry of list.filter((item) => !item.capture)) entry.listener(event)
  }
}

function fakeDocument() {
  const root = {
    nodes: new Map(),
    elements: [],
    createElement(tagName) { const el = new FakeElement(root, tagName); root.elements.push(el); return el },
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
    const button = root.createElement('button'); button.className = name === 'rhythmic' ? 'tab-btn active' : 'tab-btn'; button.dataset.tab = name; tabs.appendChild(button)
    const panel = root.createElement('div'); panel.id = `tab-${name}`; panel.hidden = name !== 'rhythmic'; body.appendChild(panel)
  }
  const summary = root.createElement('div'); summary.id = 'notes-summary'; body.appendChild(summary)
  const live = root.createElement('div'); live.id = 'aria-live-region'; body.appendChild(live)
  const speed = root.createElement('input'); speed.id = 'speed-slider'; speed.value = '1.2'; body.appendChild(speed)
  const reset = root.createElement('button'); reset.id = 'reset-btn'; body.appendChild(reset)
  const voice = root.createElement('button'); voice.id = 'voice-btn'; body.appendChild(voice)
  const rhythm = root.createElement('button'); rhythm.id = 'rhythm-btn'; body.appendChild(rhythm)
  const selectedSpeak = root.createElement('button'); selectedSpeak.id = 'selected-measure-speak'; body.appendChild(selectedSpeak)
  const selectedPlay = root.createElement('button'); selectedPlay.id = 'selected-measure-play'; body.appendChild(selectedPlay)
  const selectedStop = root.createElement('button'); selectedStop.id = 'selected-measure-stop'; selectedStop.disabled = true; body.appendChild(selectedStop)
  return root
}

function readyResult(overrides = {}) {
  return Object.freeze({
    state: CHORD_SOURCE_CONSUMER_STATE.SOURCE_READY,
    message: 'source ready',
    renderable: true,
    speakable: true,
    sourceOnly: true,
    definitive: false,
    teacherApproved: false,
    displayText: 'Ölçü 1, ölçü başlangıcı: C',
    spokenText: 'Ölçü 1, ölçü başlangıcı, kaynak akor işareti: Do majör akoru.',
    ...overrides,
  })
}

function deniedResult(state) {
  return Object.freeze({
    state,
    message: `state:${state}`,
    renderable: false,
    speakable: false,
    sourceOnly: true,
    definitive: false,
    teacherApproved: false,
    displayText: '',
    spokenText: '',
  })
}

test('Package 7D builds a native accessible Akorlar tab and focusable text-only output', () => {
  const root = fakeDocument()
  const panel = ensureChordPanel(root)
  assert.ok(panel)
  assert.equal(root.getElementById('chord-tab-btn').getAttribute('role'), 'tab')
  assert.equal(panel.getAttribute('role'), 'tabpanel')
  assert.equal(panel.getAttribute('aria-labelledby'), 'chord-tab-btn')
  assert.equal(root.getElementById('chord-status').getAttribute('aria-live'), 'polite')
  assert.equal(root.getElementById('chord-output').getAttribute('tabindex'), '0')
  assert.equal(root.getElementById('chord-speak-btn').disabled, true)
})

test('Package 7D renders source-ready text only and labels it as non-teacher source evidence', () => {
  const root = fakeDocument()
  renderChordPanel(root, readyResult())
  assert.equal(root.getElementById('chord-output').textContent, 'Ölçü 1, ölçü başlangıcı: C')
  assert.equal(root.getElementById('chord-output').hidden, false)
  assert.match(root.getElementById('chord-status').textContent, /öğretmen onayı değildir/)
  assert.equal(root.getElementById('chord-speak-btn').disabled, false)
  assert.equal(buildChordUiModel(readyResult()).state, CHORD_UI_STATE.SOURCE_READY)
})

test('Package 7D REVIEW, INVALID, EMPTY and NO_SOURCE expose zero chord bytes and disable speech', () => {
  for (const state of [
    CHORD_SOURCE_CONSUMER_STATE.REVIEW_REQUIRED,
    CHORD_SOURCE_CONSUMER_STATE.INVALID,
    CHORD_SOURCE_CONSUMER_STATE.EMPTY,
    CHORD_SOURCE_CONSUMER_STATE.NO_SOURCE,
  ]) {
    const root = fakeDocument()
    renderChordPanel(root, deniedResult(state))
    assert.equal(root.getElementById('chord-output').textContent, '')
    assert.equal(root.getElementById('chord-output').hidden, true)
    assert.equal(root.getElementById('chord-speak-btn').disabled, true)
  }
})

test('Package 7D subscription passes the exact published NoteObject[] reference to Package 7C consumer', () => {
  clearPackage3Notes()
  const root = fakeDocument()
  let received = null
  initPackage7Ui(root, {
    buildRegisteredChordSourceConsumer(notes) { received = notes; return readyResult() },
  })
  const notes = [{ measureKey: 'P1:0' }]
  publishPackage3Notes(notes)
  assert.equal(received, notes)
  assert.equal(root.getElementById('chord-output').textContent.includes(': C'), true)
  clearPackage3Notes()
})

test('Package 7D activating Akorlar hides legacy, Guitar TAB and Violin panels without deleting them', () => {
  const root = fakeDocument()
  const body = root.querySelector('.result-tabs').parentElement
  for (const id of ['tab-guitar-tab', 'tab-violin']) {
    const panel = root.createElement('section'); panel.id = id; panel.hidden = false; body.appendChild(panel)
  }
  ensureChordPanel(root)
  assert.equal(activateChordResultTab(root), true)
  assert.equal(root.getElementById('tab-chords').hidden, false)
  for (const id of ['tab-rhythmic', 'tab-html', 'tab-notes', 'tab-xml', 'tab-guitar-tab', 'tab-violin']) {
    assert.equal(root.getElementById(id).hidden, true)
  }
  assert.equal(root.getElementById('chord-tab-btn').getAttribute('aria-selected'), 'true')
})

test('Package 7E chord speech fails closed while full-score or selected-measure audio owns the shared lifecycle', async () => {
  const root = fakeDocument()
  renderChordPanel(root, readyResult())
  let calls = 0
  const adapter = { async speakChordSourceResult() { calls += 1; return { ok: true } } }

  root.getElementById('voice-btn').className = 'playing'
  assert.equal(hasConflictingAudioConsumer(root), true)
  assert.equal(await runChordSpeech(root, adapter), false)
  root.getElementById('voice-btn').className = ''

  root.getElementById('selected-measure-stop').disabled = false
  assert.equal(await runChordSpeech(root, adapter), false)
  assert.equal(calls, 0)
  assert.match(root.getElementById('aria-live-region').textContent, /Başka bir sesli okuma veya çalma/)
})

test('Package 7E uses existing speed control and exact source spoken result', async () => {
  const root = fakeDocument()
  renderChordPanel(root, readyResult())
  let receivedSource = null
  let receivedRate = null
  const ok = await runChordSpeech(root, {
    async speakChordSourceResult(source, options) {
      receivedSource = source
      receivedRate = options.rate
      options.onStart?.()
      return { ok: true }
    },
  })
  assert.equal(ok, true)
  assert.equal(receivedSource.spokenText, readyResult().spokenText)
  assert.equal(receivedRate, 1.2)
  assert.match(root.getElementById('chord-status').textContent, /tamamlandı/)
})

test('Package 7E capture-phase preemption stops only an active Package 7-owned utterance before another audio action', async () => {
  const previousWindow = globalThis.window
  let cancelCalls = 0
  globalThis.window = { speechSynthesis: { cancel() { cancelCalls += 1 } } }
  try {
    const root = fakeDocument()
    initPackage7Ui(root, { buildRegisteredChordSourceConsumer() { return readyResult() } })
    publishPackage3Notes([{ measureKey: 'P1:0' }])

    let resolveSpeech
    const pending = runChordSpeech(root, {
      speakChordSourceResult() { return new Promise((resolve) => { resolveSpeech = resolve }) },
    })
    await Promise.resolve()
    assert.equal(root.getElementById('chord-stop-btn').disabled, false)

    root.getElementById('voice-btn').click()
    assert.equal(cancelCalls, 1)
    assert.equal(root.getElementById('chord-stop-btn').disabled, true)

    resolveSpeech({ ok: true })
    assert.equal(await pending, false)
    clearPackage3Notes()
  } finally {
    globalThis.window = previousWindow
  }
})

test('Package 7E stop/reset/source replacement never cancels shared speech when Package 7 does not own it', () => {
  const previousWindow = globalThis.window
  let cancelCalls = 0
  globalThis.window = { speechSynthesis: { cancel() { cancelCalls += 1 } } }
  try {
    const root = fakeDocument()
    renderChordPanel(root, readyResult())
    assert.equal(stopChordOperation(root), false)
    root.getElementById('reset-btn').click()
    assert.equal(cancelCalls, 0)
  } finally {
    globalThis.window = previousWindow
  }
})

test('Package 7D-F source stays text-only and reusable, while S14 retires its production UI wiring', () => {
  const ui = readFileSync(new URL('../src/package7Ui.js', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')
  assert.match(ui, /buildRegisteredChordSourceConsumer/)
  assert.match(ui, /speakChordSourceResult/)
  assert.match(ui, /textContent/)
  assert.doesNotMatch(ui, /innerHTML\s*=/)
  assert.doesNotMatch(ui, /Audiveris|omrService|gateway|worker/i)
  assert.doesNotMatch(main, /package7Ui\.js/)
  assert.match(main, /initSmoosicEditorTab\(document\)/)
})
