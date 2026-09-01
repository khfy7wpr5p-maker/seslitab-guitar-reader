import test from 'node:test'
import assert from 'node:assert/strict'

import {
  clearPackage3Notes,
  publishPackage3Notes,
} from '../package3MeasureBridge.js'
import {
  renderGuitarTabPanel,
} from '../src/package4Ui.js'
import {
  renderViolinPanel,
} from '../src/package5Ui.js'
import {
  renderStageIInstrumentProductUi,
} from '../src/stageIInstrumentProductUi.js'
import { STAGE_G_PRODUCT_STATE } from '../src/services/stageGProductRouting.js'
import { GUITAR_TAB_CONSUMER_STATE } from '../src/services/guitarTabConsumer.js'
import { VIOLIN_CONSUMER_STATE } from '../src/services/violinConsumer.js'
import { STAGE_I_PRODUCT_STATE } from '../src/services/stageIInstrumentProduct.js'

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
    this.disabled = false
    this.className = ''
    this.classList = new FakeClassList(this)
    this.textContent = ''
    this.type = ''
    this.parentElement = null
    this._id = ''
  }
  set id(value) { this._id = value; if (value) this.root.nodes.set(value, this) }
  get id() { return this._id }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  appendChild(child) {
    child.parentElement = this
    if (!this.children.includes(child)) this.children.push(child)
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
    for (const listener of this.listeners.get('click') ?? []) listener({ currentTarget: this })
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

  const body = root.createElement('div'); body.className = 'card-body'
  const tabList = root.createElement('div'); tabList.className = 'result-tabs'; body.appendChild(tabList)
  const summary = root.createElement('div'); summary.id = 'notes-summary'; body.appendChild(summary)
  const workspace = root.createElement('section'); workspace.id = 'stage-s05-score-workspace'; body.appendChild(workspace)
  const scoreColumn = root.createElement('div'); scoreColumn.id = 'stage-s05-score-column'; workspace.appendChild(scoreColumn)
  return root
}

function passRoute() {
  return Object.freeze({
    state: STAGE_G_PRODUCT_STATE.PASS,
    automaticProceed: true,
    definitiveConsumerAllowed: true,
    reason: null,
  })
}

function safeViolinProjection() {
  const policyId = 'first-position-semitone-zone-v1'
  const provenance = 'generated-basic-first-position-fingering'
  return Object.freeze({
    state: VIOLIN_CONSUMER_STATE.PROJECTED,
    allowed: true,
    definitive: true,
    teacherApproved: false,
    mode: 'basic',
    projection: Object.freeze({
      state: 'projected',
      teacherApproved: false,
      provenance,
      policyId,
      measureCount: 1,
      noteCount: 1,
      measures: Object.freeze([
        Object.freeze({
          measureKey: 'P1:m0',
          measureIndex: 0,
          measureNumber: 1,
          events: Object.freeze([
            Object.freeze({
              noteIndex: 0,
              measureKey: 'P1:m0',
              isRest: false,
              policyId,
              provenance,
              teacherApproved: false,
              note: Object.freeze({ midi: 76, noteName: 'Mi5' }),
              fingering: Object.freeze({
                stringNumber: 1,
                stringName: 'E',
                position: 'first',
                policyId,
                provenance,
                teacherApproved: false,
                openMidi: 76,
                semitoneOffset: 0,
                fingerNumber: 0,
                writtenMidi: 76,
              }),
            }),
          ]),
        }),
      ]),
    }),
  })
}

test('S09 PASS mirrors already-built Guitar and Violin output without invoking builders twice', () => {
  clearPackage3Notes()
  const root = fakeDocument()
  const notes = [{ measureKey: 'P1:m0', noteName: 'Mi5', midi: 76 }]
  publishPackage3Notes(notes)

  let guitarBuilds = 0
  let violinBuilds = 0
  renderGuitarTabPanel(root, notes, {
    buildQualityGatedGuitarTab(value) {
      assert.equal(value, notes)
      guitarBuilds += 1
      return Object.freeze({
        state: GUITAR_TAB_CONSUMER_STATE.RENDERED,
        allowed: true,
        definitive: true,
        mode: 'basic',
        text: 'e|--0--|',
      })
    },
  })
  renderViolinPanel(root, notes, {
    buildQualityGatedViolin(value) {
      assert.equal(value, notes)
      violinBuilds += 1
      return safeViolinProjection()
    },
  })

  const products = renderStageIInstrumentProductUi(root, notes, {
    resolveStageGConsumerRoute(value) {
      assert.equal(value, notes)
      return passRoute()
    },
  })

  assert.equal(guitarBuilds, 1)
  assert.equal(violinBuilds, 1)
  assert.equal(products.guitar.state, STAGE_I_PRODUCT_STATE.AVAILABLE)
  assert.equal(products.violin.state, STAGE_I_PRODUCT_STATE.AVAILABLE)
  assert.equal(root.getElementById('stage-i-guitar-output').hidden, false)
  assert.equal(root.getElementById('stage-i-guitar-output').textContent, 'e|--0--|')
  assert.equal(root.getElementById('stage-i-violin-output').hidden, false)
  assert.match(root.getElementById('stage-i-violin-output').textContent, /Mi5 notası/)
  assert.equal(root.getElementById('stage-i-instrument-products').parentElement, root.getElementById('stage-s05-score-column'))
  assert.equal(root.getElementById('stage-i-guitar-action').disabled, false)
  assert.equal(root.getElementById('stage-i-violin-action').disabled, false)
})

test('S09 REVIEW/BLOCK clears definitive bytes and shows explainable reasons without rebuilding', () => {
  clearPackage3Notes()
  const root = fakeDocument()
  const sourceNotes = [{ measureKey: 'P1:m0', noteName: 'Mi5', midi: 76 }]
  publishPackage3Notes(sourceNotes)

  let guitarBuilds = 0
  let violinBuilds = 0
  renderGuitarTabPanel(root, sourceNotes, {
    buildQualityGatedGuitarTab() {
      guitarBuilds += 1
      return Object.freeze({ state: GUITAR_TAB_CONSUMER_STATE.RENDERED, allowed: true, definitive: true, mode: 'basic', text: 'STALE-GUITAR' })
    },
  })
  renderViolinPanel(root, sourceNotes, {
    buildQualityGatedViolin() {
      violinBuilds += 1
      return safeViolinProjection()
    },
  })

  const revisedNotes = [{ measureKey: 'P1:m0', noteName: 'Fa5', midi: 77 }]
  publishPackage3Notes(revisedNotes)
  const products = renderStageIInstrumentProductUi(root, revisedNotes, {
    resolveStageGConsumerRoute(value, consumer) {
      assert.equal(value, revisedNotes)
      if (consumer === 'guitar-tab') {
        return Object.freeze({ state: STAGE_G_PRODUCT_STATE.REVIEW, automaticProceed: false, definitiveConsumerAllowed: false, reason: 'source-not-verified' })
      }
      return Object.freeze({ state: STAGE_G_PRODUCT_STATE.BLOCK, automaticProceed: false, definitiveConsumerAllowed: false, reason: 'canonical-data-blocked' })
    },
  })

  assert.equal(guitarBuilds, 1)
  assert.equal(violinBuilds, 1)
  assert.equal(products.guitar.state, STAGE_I_PRODUCT_STATE.REVIEW_REQUIRED)
  assert.equal(products.violin.state, STAGE_I_PRODUCT_STATE.BLOCKED)
  assert.equal(root.getElementById('stage-i-guitar-output').hidden, true)
  assert.equal(root.getElementById('stage-i-guitar-output').textContent, '')
  assert.equal(root.getElementById('stage-i-violin-output').hidden, true)
  assert.equal(root.getElementById('stage-i-violin-output').textContent, '')
  assert.match(root.getElementById('stage-i-guitar-status').textContent, /Kaynak müzikal olarak doğrulanmadı/)
  assert.match(root.getElementById('stage-i-violin-status').textContent, /engelleyici bir tutarsızlık/)
  assert.equal(root.getElementById('stage-i-guitar-action').disabled, true)
  assert.equal(root.getElementById('stage-i-violin-action').disabled, true)
})

test('S09 refuses a stale NoteObject[] identity even if legacy output remains mounted', () => {
  clearPackage3Notes()
  const root = fakeDocument()
  const oldNotes = [{ measureKey: 'P1:m0' }]
  publishPackage3Notes(oldNotes)
  const currentNotes = [{ measureKey: 'P1:m0' }]
  publishPackage3Notes(currentNotes)

  const products = renderStageIInstrumentProductUi(root, oldNotes, {
    resolveStageGConsumerRoute: () => passRoute(),
  })

  assert.equal(products.guitar.state, STAGE_I_PRODUCT_STATE.INVALID)
  assert.equal(products.violin.state, STAGE_I_PRODUCT_STATE.INVALID)
  assert.equal(root.getElementById('stage-i-guitar-output').hidden, true)
  assert.equal(root.getElementById('stage-i-violin-output').hidden, true)
})
