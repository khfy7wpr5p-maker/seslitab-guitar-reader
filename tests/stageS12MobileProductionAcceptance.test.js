import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  moveStageS12PrimaryScoreActions,
  resolveStageS12InteractionPoint,
  syncStageS12InputSlot,
} from '../src/stageS12MobileProductionAcceptanceUi.js'

class FakeElement {
  constructor(root) {
    this.root = root
    this.children = []
    this.parentElement = null
    this.attributes = new Map()
    this.hidden = false
    this.textContent = ''
    this._id = ''
  }
  set id(value) { this._id = value; if (value) this.root.nodes.set(value, this) }
  get id() { return this._id }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  appendChild(child) {
    if (child.parentElement) child.parentElement.children = child.parentElement.children.filter((item) => item !== child)
    child.parentElement = this
    this.children.push(child)
    return child
  }
  insertBefore(child, before) {
    if (child.parentElement) child.parentElement.children = child.parentElement.children.filter((item) => item !== child)
    child.parentElement = this
    const index = this.children.indexOf(before)
    if (index < 0) this.children.push(child)
    else this.children.splice(index, 0, child)
    return child
  }
}

function fakeDocument() {
  const root = {
    nodes: new Map(),
    createElement() { return new FakeElement(root) },
    getElementById(id) { return root.nodes.get(id) ?? null },
  }
  const scoreColumn = root.createElement(); scoreColumn.id = 'stage-s05-score-column'
  const voice = root.createElement(); voice.id = 'voice-section'
  const rhythm = root.createElement(); rhythm.id = 'rhythm-section'
  const instruments = root.createElement(); instruments.id = 'stage-i-instrument-products'; scoreColumn.appendChild(instruments)
  return { root, scoreColumn, voice, rhythm, instruments }
}

test('S12 resolves Pointer Events and Touch Events to renderer client coordinates without inference', () => {
  assert.deepEqual(resolveStageS12InteractionPoint({ clientX: 12, clientY: 34 }), { clientX: 12, clientY: 34 })
  assert.deepEqual(resolveStageS12InteractionPoint({ changedTouches: [{ clientX: 56, clientY: 78 }] }), { clientX: 56, clientY: 78 })
  assert.equal(resolveStageS12InteractionPoint({ clientX: NaN, clientY: 1 }), null)
})

test('S12 moves the existing full-score playback sections beside the score without recreating controls', () => {
  const { root, scoreColumn, voice, rhythm, instruments } = fakeDocument()
  assert.equal(moveStageS12PrimaryScoreActions(root), true)
  const rail = root.getElementById('stage-s12-primary-score-actions')
  assert.ok(rail)
  assert.equal(rail.parentElement, scoreColumn)
  assert.equal(scoreColumn.children.indexOf(rail) < scoreColumn.children.indexOf(instruments), true)
  assert.equal(voice.parentElement, rail)
  assert.equal(rhythm.parentElement, rail)
  assert.equal(moveStageS12PrimaryScoreActions(root), true)
  assert.equal(rail.children.length, 2)
})

test('S12 hands the input card slot to a successfully rendered score and restores it when score is not ready', () => {
  const { root } = fakeDocument()
  const input = root.createElement(); input.id = 'input-section'
  const workspace = root.createElement(); workspace.id = 'stage-s05-score-workspace'; workspace.hidden = false
  const status = root.createElement(); status.id = 'score-view-status'; status.textContent = 'Görsel nota hazır. Kaynak çizildi.'
  const xml = root.createElement(); xml.id = 'xml-output'; xml.textContent = '<score-partwise version="4.0"></score-partwise>'

  assert.equal(syncStageS12InputSlot(root), true)
  assert.equal(input.hidden, true)
  assert.equal(input.attributes.get('data-stage-s12-slot-state'), 'score-active')

  workspace.hidden = true
  assert.equal(syncStageS12InputSlot(root), false)
  assert.equal(input.hidden, false)
  assert.equal(input.attributes.get('data-stage-s12-slot-state'), 'input-active')
})

test('S12 mobile interaction remains exact ScoreNoteRef/canonical selection and adds no musical guessing', () => {
  const source = readFileSync(new URL('../src/stageS12MobileProductionAcceptanceUi.js', import.meta.url), 'utf8')
  assert.match(source, /hitTestScoreNote/)
  assert.match(source, /resolveCanonicalNoteFromScoreRef/)
  assert.match(source, /selectPackage3MeasureKey/)
  assert.match(source, /selectPackage3NoteIndex/)
  assert.match(source, /pointerup/)
  assert.match(source, /touchend/)
  assert.match(source, /addEventListener\('click'/)
  assert.match(source, /capture:\s*true/)
  assert.match(source, /if \(selectStageS12ExactRenderedNote\([\s\S]*rememberSuccessfulInteraction/)
  assert.doesNotMatch(source, /nearest-note|pitch-label|elementFromPoint|querySelectorAll\([^)]*svg/i)
  assert.doesNotMatch(source, /Audiveris|OMR_PROVIDER|Package 12 authorization.*=/i)
})

test('S12 score landing replaces the input slot without the previous forced start-scroll jump', () => {
  const source = readFileSync(new URL('../src/stageS12MobileProductionAcceptanceUi.js', import.meta.url), 'utf8')
  assert.match(source, /syncStageS12InputSlot\(root\)/)
  assert.match(source, /scrollIntoView\?\.\(\{ block: 'nearest', inline: 'nearest' \}\)/)
  assert.doesNotMatch(source, /scrollIntoView\?\.\(\{ block: 'start'/)
})

test('S12 PASS presentation remains input-origin agnostic and fail-closed policy stays in Stage G', () => {
  const stageI = readFileSync(new URL('../src/stageIInstrumentProductUi.js', import.meta.url), 'utf8')
  const stageG = readFileSync(new URL('../src/services/stageGProductRouting.js', import.meta.url), 'utf8')
  assert.doesNotMatch(stageI, /\bpdf\b|musicxml origin|input[-_ ]type/i)
  assert.match(stageG, /STAGE_G_PRODUCT_STATE\.PASS/)
  assert.match(stageG, /automaticProceed:\s*pass/)
  assert.match(stageG, /definitiveConsumerAllowed/)
  assert.match(stageG, /STAGE_G_PRODUCT_STATE\.REVIEW/)
  assert.match(stageG, /STAGE_G_PRODUCT_STATE\.BLOCK/)
})

test('S12 CSS enforces compact <=390px tuner and >=44px touch targets without score scaling hacks', () => {
  const css = readFileSync(new URL('../src/stageS12MobileProductionAcceptance.css', import.meta.url), 'utf8')
  assert.match(css, /max-width:\s*390px/)
  assert.match(css, /min-height:\s*44px/)
  assert.match(css, /stage-s04-tuner-panel[\s\S]*max-height:/)
  assert.match(css, /max-width:\s*100%/)
  assert.doesNotMatch(css, /transform:\s*scale\(/)
})

test('main wires S12 after exact selection/quality workspace and before instrument output presentation', () => {
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')
  assert.match(main, /stageS12MobileProductionAcceptance\.css/)
  assert.match(main, /initStageS12MobileProductionAcceptanceUi/)
  assert.ok(main.indexOf('initStageS12MobileProductionAcceptanceUi(document)') > main.indexOf('initStageS08ScoreQualityOverlay(document)'))
  assert.ok(main.indexOf('initStageS12MobileProductionAcceptanceUi(document)') < main.indexOf('initStageIInstrumentProductUi(document)'))
})
