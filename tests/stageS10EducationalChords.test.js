import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  clearPackage3Notes,
  publishPackage3Notes,
} from '../package3MeasureBridge.js'
import { CHORD_SOURCE_CONSUMER_STATE } from '../src/services/chordSourceConsumer.js'
import {
  ensureChordPanel,
  initPackage7Ui,
  renderChordPanel,
} from '../src/package7Ui.js'
import {
  applyStageS10EducationalChordsUi,
  STAGE_S10_COPY,
  STAGE_S10_EDUCATIONAL_CHORDS,
} from '../src/stageS10EducationalChordsUi.js'

class FakeClassList {
  constructor(element) { this.element = element }
  values() { return String(this.element.className || '').split(/\s+/).filter(Boolean) }
  contains(name) { return this.values().includes(name) }
  toggle(name, force) {
    const values = new Set(this.values())
    const add = force === undefined ? !values.has(name) : Boolean(force)
    if (add) values.add(name)
    else values.delete(name)
    this.element.className = [...values].join(' ')
    return add
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
  removeAttribute(name) { this.attributes.delete(name) }
  appendChild(child) {
    if (child.parentElement && child.parentElement !== this) {
      child.parentElement.children = child.parentElement.children.filter((item) => item !== child)
    }
    child.parentElement = this
    if (!this.children.includes(child)) this.children.push(child)
    return child
  }
  insertBefore(child, before) {
    if (child.parentElement && child.parentElement !== this) {
      child.parentElement.children = child.parentElement.children.filter((item) => item !== child)
    }
    child.parentElement = this
    const index = this.children.indexOf(before)
    if (index < 0) this.children.push(child)
    else this.children.splice(index, 0, child)
    return child
  }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((item) => item !== this)
    this.parentElement = null
    if (this.id) this.root.nodes.delete(this.id)
    this.root.elements = this.root.elements.filter((item) => item !== this)
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
    readyState: 'complete',
    nodes: new Map(),
    elements: [],
    createElement(tagName) {
      const element = new FakeElement(root, tagName)
      root.elements.push(element)
      return element
    },
    getElementById(id) { return root.nodes.get(id) ?? null },
    querySelector(selector) {
      if (!selector.startsWith('.')) return null
      const className = selector.slice(1)
      return root.elements.find((element) => element.classList.contains(className)) ?? null
    },
    querySelectorAll(selector) {
      if (!selector.startsWith('.')) return []
      const className = selector.slice(1)
      return root.elements.filter((element) => element.classList.contains(className))
    },
  }

  const app = root.createElement('main'); app.className = 'app-main'
  const workspace = root.createElement('section'); workspace.id = 'stage-s05-score-workspace'; app.appendChild(workspace)
  const scoreColumn = root.createElement('div'); scoreColumn.id = 'stage-s05-score-column'; workspace.appendChild(scoreColumn)

  const results = root.createElement('section'); results.id = 'results-section'; app.appendChild(results)
  const body = root.createElement('div'); body.className = 'card-body'; results.appendChild(body)
  const tabs = root.createElement('div'); tabs.className = 'result-tabs'; body.appendChild(tabs)
  for (const name of ['rhythmic', 'html', 'notes', 'xml']) {
    const button = root.createElement('button')
    button.id = `tab-${name}-btn`
    button.className = name === 'rhythmic' ? 'tab-btn active' : 'tab-btn'
    button.dataset.tab = name
    tabs.appendChild(button)
    const panel = root.createElement('div')
    panel.id = `tab-${name}`
    panel.hidden = name !== 'rhythmic'
    body.appendChild(panel)
  }
  const summary = root.createElement('div'); summary.id = 'notes-summary'; body.appendChild(summary)
  const live = root.createElement('div'); live.id = 'aria-live-region'; body.appendChild(live)
  const speed = root.createElement('input'); speed.id = 'speed-slider'; speed.value = '1'; body.appendChild(speed)
  const reset = root.createElement('button'); reset.id = 'reset-btn'; body.appendChild(reset)
  const voice = root.createElement('button'); voice.id = 'voice-btn'; body.appendChild(voice)
  const rhythm = root.createElement('button'); rhythm.id = 'rhythm-btn'; body.appendChild(rhythm)
  const selectedSpeak = root.createElement('button'); selectedSpeak.id = 'selected-measure-speak'; body.appendChild(selectedSpeak)
  const selectedPlay = root.createElement('button'); selectedPlay.id = 'selected-measure-play'; body.appendChild(selectedPlay)
  const selectedStop = root.createElement('button'); selectedStop.id = 'selected-measure-stop'; selectedStop.disabled = true; body.appendChild(selectedStop)
  return root
}

function readyResult() {
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
  })
}

function emptyResult() {
  return Object.freeze({
    state: CHORD_SOURCE_CONSUMER_STATE.EMPTY,
    message: 'MusicXML içinde kaynak akor işareti bulunamadı.',
    renderable: false,
    speakable: false,
    sourceOnly: true,
    definitive: false,
    teacherApproved: false,
    displayText: '',
    spokenText: '',
  })
}

function educationalSymbols(root) {
  return root.getElementById('stage-s10-education-list').children.map((item) => item.textContent)
}

test('S10 moves source chords into the score workspace and removes chord tab clutter', () => {
  const root = fakeDocument()
  renderChordPanel(root, readyResult())

  assert.equal(applyStageS10EducationalChordsUi(root), true)
  assert.equal(root.getElementById('stage-s10-educational-chords').parentElement, root.getElementById('stage-s05-score-column'))
  assert.equal(root.getElementById('tab-chords').parentElement, root.getElementById('stage-s10-educational-chords'))
  assert.equal(root.getElementById('tab-chords').hidden, false)
  assert.equal(root.getElementById('chord-tab-btn'), null)
  assert.equal(root.getElementById('chord-heading').textContent, STAGE_S10_COPY.sourceHeading)
  assert.equal(root.getElementById('stage-s10-education-heading').textContent, STAGE_S10_COPY.educationHeading)
  assert.deepEqual(educationalSymbols(root), STAGE_S10_EDUCATIONAL_CHORDS)
})

test('S10 preserves Package 7 source-only output and labels education as non-piece content', () => {
  const root = fakeDocument()
  renderChordPanel(root, readyResult())
  applyStageS10EducationalChordsUi(root)

  assert.equal(root.getElementById('chord-output').textContent, 'Ölçü 1, ölçü başlangıcı: C')
  assert.equal(root.getElementById('chord-output').hidden, false)
  assert.match(root.getElementById('chord-status').textContent, /öğretmen onayı değildir/)
  assert.match(root.getElementById('stage-s10-education-note').textContent, /parçadan çıkarılmamıştır/)
  assert.match(root.getElementById('stage-s10-education-note').textContent, /parçanın armonisi/)
})

test('S10 empty MusicXML harmony state stays empty and never promotes education into source output', () => {
  const root = fakeDocument()
  renderChordPanel(root, emptyResult())
  applyStageS10EducationalChordsUi(root)

  assert.equal(root.getElementById('chord-output').textContent, '')
  assert.equal(root.getElementById('chord-output').hidden, true)
  assert.match(root.getElementById('chord-status').textContent, /bulunamadı/)
  assert.deepEqual(educationalSymbols(root), ['C', 'Dm', 'Em', 'F', 'G', 'Am'])
})

test('S10 source and education groups have separate accessible labels', () => {
  const root = fakeDocument()
  ensureChordPanel(root)
  applyStageS10EducationalChordsUi(root)

  assert.equal(root.getElementById('tab-chords').getAttribute('aria-labelledby'), 'chord-heading')
  assert.equal(root.getElementById('chord-heading').textContent, 'Parçada Yazılı Akorlar')
  assert.equal(root.getElementById('stage-s10-education-group').getAttribute('aria-labelledby'), 'stage-s10-education-heading')
  assert.equal(root.getElementById('stage-s10-education-list').getAttribute('aria-label'), 'Genel eğitim akorları')
  assert.equal(root.getElementById('chord-output').getAttribute('aria-label'), 'Parçada yazılı MusicXML kaynak akorları')
})

test('S10 adopted source group remains visible when a legacy result tab is clicked', () => {
  clearPackage3Notes()
  const root = fakeDocument()
  initPackage7Ui(root, { buildRegisteredChordSourceConsumer: () => readyResult() })
  publishPackage3Notes([{ measureKey: 'P1:m0' }])
  applyStageS10EducationalChordsUi(root)

  root.getElementById('tab-rhythmic-btn').click()
  assert.equal(root.getElementById('tab-chords').hidden, false)
  assert.equal(root.getElementById('chord-tab-btn'), null)
  clearPackage3Notes()
})

test('S10 is idempotent and keeps one fixed six-chord education library', () => {
  const root = fakeDocument()
  ensureChordPanel(root)
  assert.equal(applyStageS10EducationalChordsUi(root), true)
  assert.equal(applyStageS10EducationalChordsUi(root), true)
  assert.equal(root.elements.filter((element) => element.id === 'stage-s10-education-group').length, 1)
  assert.equal(root.getElementById('stage-s10-education-list').children.length, 6)
})

test('S10 remains presentation-only as a reusable module, while S14 retires the chord workspace from production', () => {
  const source = readFileSync(new URL('../src/stageS10EducationalChordsUi.js', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')

  assert.match(source, /ensureChordPanel/)
  assert.match(source, /initPackage7Ui/)
  assert.doesNotMatch(source, /buildChordSourceConsumer|parseMusicXmlHarmony|Audiveris|omrService|package12|fetch\s*\(/i)
  assert.doesNotMatch(main, /stageS10EducationalChords\.css/)
  assert.doesNotMatch(main, /stageS10EducationalChordsUi\.js/)
  assert.doesNotMatch(main, /initStageS10EducationalChordsUi\(document\)/)
  assert.doesNotMatch(main, /initStageS05ScoreWorkspaceUi\(document\)/)
  assert.match(main, /initSmoosicEditorTab\(document\)/)
})
