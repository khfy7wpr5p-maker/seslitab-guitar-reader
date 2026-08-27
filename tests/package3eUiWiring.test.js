import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  clearPackage3Notes,
  publishPackage3Notes,
} from '../package3MeasureBridge.js'
import { initMeasureControls } from '../src/package3Ui.js'

function note(key, measureIndex) {
  return {
    measureKey: key,
    measureNumber: measureIndex + 1,
    measureIndex,
    partIndex: 0,
    partId: 'P1',
    startBeat: 0,
    beats: 1,
    duration: 'quarter',
    midi: 60 + measureIndex,
    frequency: 261.63,
    noteName: 'Do',
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
    this.disabled = false
    this.className = ''
    this.textContent = ''
    this.type = ''
    this.value = ''
    this._id = ''
  }
  set id(value) { this._id = value; if (value) this.root.nodes.set(value, this) }
  get id() { return this._id }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  appendChild(child) { this.children.push(child); return child }
  replaceChildren(...children) { this.children = [...children] }
  insertBefore(child, before) {
    const index = this.children.indexOf(before)
    if (index < 0) this.children.push(child)
    else this.children.splice(index, 0, child)
    return child
  }
  addEventListener(name, listener, options = false) {
    const list = this.listeners.get(name) ?? []
    list.push({ listener, options })
    this.listeners.set(name, list)
  }
  click() {
    for (const { listener } of this.listeners.get('click') ?? []) listener({ type: 'click' })
  }
}

function fakeDocument() {
  const root = {
    nodes: new Map(),
    createElement(tagName) { return new FakeElement(root, tagName) },
    getElementById(id) { return root.nodes.get(id) ?? null },
  }
  const tab = root.createElement('div'); tab.id = 'tab-html'
  const output = root.createElement('div'); output.id = 'rhythmic-html-output'; tab.appendChild(output)
  const live = root.createElement('div'); live.id = 'aria-live-region'
  const reset = root.createElement('button'); reset.id = 'reset-btn'
  const voice = root.createElement('button'); voice.id = 'voice-btn'
  const rhythm = root.createElement('button'); rhythm.id = 'rhythm-btn'
  const speed = root.createElement('input'); speed.id = 'speed-slider'; speed.value = '1'
  const tempo = root.createElement('input'); tempo.id = 'tempo-slider'; tempo.value = '120'
  return { root, live, voice, rhythm }
}

test('Package 3E action buttons stay disabled until a canonical measure is selected', () => {
  clearPackage3Notes()
  const { root } = fakeDocument()
  assert.equal(initMeasureControls(root), true)

  const notes = [note('0:0', 0), note('0:1', 1)]
  publishPackage3Notes(notes)
  const group = root.getElementById('measure-control-buttons')
  const speak = root.getElementById('selected-measure-speak')
  const play = root.getElementById('selected-measure-play')
  const stop = root.getElementById('selected-measure-stop')

  assert.equal(group.children.length, 2)
  assert.equal(speak.disabled, true)
  assert.equal(play.disabled, true)
  assert.equal(stop.disabled, true)

  group.children[1].click()
  assert.equal(speak.disabled, false)
  assert.equal(play.disabled, false)
  assert.equal(stop.disabled, true)
  assert.equal(root.getElementById('aria-live-region').textContent, 'Ölçü 2 seçildi.')
})

test('Package 3E full-score buttons register capture-phase selected-operation preemption', () => {
  clearPackage3Notes()
  const { root, voice, rhythm } = fakeDocument()
  initMeasureControls(root)

  const voiceListeners = voice.listeners.get('click') ?? []
  const rhythmListeners = rhythm.listeners.get('click') ?? []
  assert.equal(voiceListeners.length, 1)
  assert.equal(rhythmListeners.length, 1)
  assert.equal(voiceListeners[0].options, true)
  assert.equal(rhythmListeners[0].options, true)
})

test('Package 3E UI source never imports or changes OMR integration boundaries', () => {
  const source = readFileSync(new URL('../src/package3Ui.js', import.meta.url), 'utf8')
  const consumer = readFileSync(new URL('../src/services/selectedMeasureConsumer.js', import.meta.url), 'utf8')
  const combined = `${source}\n${consumer}`

  assert.doesNotMatch(combined, /AudiverisProvider|omrWorker|gatewayProvider|omrService/)
  assert.doesNotMatch(combined, /musicXmlParser/)
})
