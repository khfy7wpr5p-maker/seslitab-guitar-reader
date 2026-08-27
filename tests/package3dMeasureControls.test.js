import test from 'node:test'
import assert from 'node:assert/strict'

import { generateTurkishRhythmicHtml } from '../rhythmicTextGenerator.js'
import {
  clearPackage3Notes,
  getPackage3MeasureSnapshot,
  publishPackage3Notes,
} from '../package3MeasureBridge.js'
import {
  buildMeasureControlModels,
  renderMeasureControls,
} from '../src/package3Ui.js'

function canonicalNote({ key, display, measureIndex, partIndex = 0, midi = 60 }) {
  return {
    measureKey: key,
    measureNumber: display,
    measureIndex,
    partIndex,
    partId: 'P1',
    startBeat: 0,
    beats: 1,
    duration: 'quarter',
    midi,
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
    this.className = ''
    this.textContent = ''
    this.type = ''
    this._id = ''
  }

  set id(value) {
    this._id = value
    if (value) this.root.nodes.set(value, this)
  }
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
  addEventListener(name, listener) { this.listeners.set(name, listener) }
  click() { this.listeners.get('click')?.({ type: 'click' }) }
}

function fakeDocument() {
  const root = {
    nodes: new Map(),
    createElement(tagName) { return new FakeElement(root, tagName) },
    getElementById(id) { return root.nodes.get(id) ?? null },
  }

  const tab = root.createElement('div')
  tab.id = 'tab-html'
  const output = root.createElement('div')
  output.id = 'rhythmic-html-output'
  const live = root.createElement('div')
  live.id = 'aria-live-region'
  tab.appendChild(output)
  return { root, tab, output, live }
}

test('Package 3D Rhythmic HTML handoff preserves the exact NoteObject[] reference and output', () => {
  clearPackage3Notes()
  const notes = [canonicalNote({ key: '0:0', display: 1, measureIndex: 0 })]
  const before = JSON.stringify(notes)
  const html = generateTurkishRhythmicHtml(notes)
  const snapshot = getPackage3MeasureSnapshot()

  assert.equal(snapshot.notes, notes)
  assert.match(html, /Ölçü 1/)
  assert.doesNotMatch(html, /measure-select-btn|data-measure-key/)
  assert.equal(JSON.stringify(notes), before)
})

test('Package 3D control models use canonical measureKey and never invent identity for legacy notes', () => {
  const canonical = canonicalNote({ key: '0:0', display: 1, measureIndex: 0 })
  const legacy = { measureNumber: 2, startBeat: 0, noteName: 'Re' }
  const models = buildMeasureControlModels([canonical, legacy])

  assert.equal(models.length, 1)
  assert.equal(models[0].measureKey, '0:0')
  assert.equal(models[0].visibleLabel, 'Ölçü 1')
  assert.ok(Object.isFrozen(models))
  assert.ok(Object.isFrozen(models[0]))
})

test('Package 3D duplicate visible measure numbers receive distinct accessible labels', () => {
  const notes = [
    canonicalNote({ key: '0:0', display: 1, measureIndex: 0 }),
    canonicalNote({ key: '0:1', display: 1, measureIndex: 1 }),
  ]
  const models = buildMeasureControlModels(notes)

  assert.equal(models.length, 2)
  assert.notEqual(models[0].measureKey, models[1].measureKey)
  assert.match(models[0].ariaLabel, /fiziksel ölçü 1/)
  assert.match(models[1].ariaLabel, /fiziksel ölçü 2/)
})

test('Package 3D renders real buttons with keyboard-native semantics and aria-pressed state', () => {
  const { root, tab, output, live } = fakeDocument()
  const notes = [
    canonicalNote({ key: '0:0', display: 1, measureIndex: 0 }),
    canonicalNote({ key: '0:1', display: 2, measureIndex: 1 }),
  ]
  publishPackage3Notes(notes)

  assert.equal(renderMeasureControls(root, { notes, selectedMeasureKey: null }), true)
  const region = root.getElementById('measure-controls')
  const group = root.getElementById('measure-control-buttons')
  assert.equal(region.hidden, false)
  assert.equal(tab.children[0], region)
  assert.equal(tab.children[1], output)
  assert.equal(group.getAttribute('role'), 'group')
  assert.equal(group.children.length, 2)
  assert.equal(group.children[0].tagName, 'button')
  assert.equal(group.children[0].type, 'button')
  assert.equal(group.children[0].getAttribute('aria-pressed'), 'false')
  assert.equal(group.children[0].getAttribute('data-measure-key'), '0:0')

  group.children[0].click()
  assert.equal(getPackage3MeasureSnapshot().selectedMeasureKey, '0:0')
  assert.equal(live.textContent, 'Ölçü 1 seçildi.')
})

test('Package 3D hides controls for non-canonical TAB/legacy data and fails closed on identity conflict', () => {
  const { root } = fakeDocument()
  const legacy = [{ measureNumber: 1, noteName: 'Mi' }]
  assert.equal(renderMeasureControls(root, { notes: legacy, selectedMeasureKey: null }), true)
  assert.equal(root.getElementById('measure-controls').hidden, true)

  const conflict = [
    canonicalNote({ key: 'same', display: 1, measureIndex: 0 }),
    canonicalNote({ key: 'same', display: 1, measureIndex: 2 }),
  ]
  assert.equal(renderMeasureControls(root, { notes: conflict, selectedMeasureKey: null }), false)
  assert.equal(root.getElementById('measure-controls').hidden, true)
})
