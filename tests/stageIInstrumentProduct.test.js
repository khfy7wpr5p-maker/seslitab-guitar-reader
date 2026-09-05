import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  resolveStageIInstrumentProduct,
  resolveStageIInstrumentProducts,
  STAGE_I_INSTRUMENT,
  STAGE_I_PRODUCT_COPY,
  STAGE_I_PRODUCT_STATE,
} from '../src/services/stageIInstrumentProduct.js'
import { STAGE_G_PRODUCT_STATE } from '../src/services/stageGProductRouting.js'
import { GUITAR_TAB_CONSUMER_STATE } from '../src/services/guitarTabConsumer.js'
import { VIOLIN_CONSUMER_STATE } from '../src/services/violinConsumer.js'
import {
  ensureStageIInstrumentProductUi,
  initStageIInstrumentProductUi,
  renderStageIInstrumentProductUi,
  STAGE_I_UI_COPY,
} from '../src/stageIInstrumentProductUi.js'
import {
  clearPackage3Notes,
  publishPackage3Notes,
} from '../package3MeasureBridge.js'

function passRoute() {
  return Object.freeze({
    state: STAGE_G_PRODUCT_STATE.PASS,
    automaticProceed: true,
    definitiveConsumerAllowed: true,
    reason: null,
    statusText: 'Otomatik kontrollerden geçti',
  })
}

function reviewRoute() {
  return Object.freeze({
    state: STAGE_G_PRODUCT_STATE.REVIEW,
    automaticProceed: false,
    definitiveConsumerAllowed: false,
    reason: 'review',
    statusText: 'İnceleme gerekiyor',
  })
}

function blockRoute() {
  return Object.freeze({
    state: STAGE_G_PRODUCT_STATE.BLOCK,
    automaticProceed: false,
    definitiveConsumerAllowed: false,
    reason: 'block',
    statusText: 'Kullanım engellendi',
  })
}

function guitarRendered(mode = 'advanced') {
  return Object.freeze({
    state: GUITAR_TAB_CONSUMER_STATE.RENDERED,
    allowed: true,
    definitive: true,
    mode,
    text: 'e|--0--|',
  })
}

function violinProjected(mode = 'advanced') {
  return Object.freeze({
    state: VIOLIN_CONSUMER_STATE.PROJECTED,
    allowed: true,
    definitive: true,
    teacherApproved: false,
    mode,
  })
}

test('Stage I passes the exact canonical array to Stage G and Package 9 only after PASS', () => {
  const notes = [{ noteName: 'Mi' }]
  let routeNotes = null
  let builderNotes = null
  let receivedConsumer = null

  const result = resolveStageIInstrumentProduct(notes, STAGE_I_INSTRUMENT.GUITAR, {
    resolveStageGConsumerRoute(value, consumer) {
      routeNotes = value
      receivedConsumer = consumer
      return passRoute()
    },
    builders: {
      guitar(value) {
        builderNotes = value
        return guitarRendered()
      },
    },
  })

  assert.equal(routeNotes, notes)
  assert.equal(builderNotes, notes)
  assert.equal(receivedConsumer, 'guitar-tab')
  assert.equal(result.state, STAGE_I_PRODUCT_STATE.AVAILABLE)
  assert.equal(result.actionAllowed, true)
  assert.equal(result.definitiveInstrumentOutput, true)
  assert.equal(result.mode, 'advanced')
  assert.equal(result.statusText, STAGE_I_PRODUCT_COPY.GUITAR_AVAILABLE)
  assert.equal(result.teacherApproved, false)
  assert.equal(result.shareAuthorized, false)
  assert.equal(result.studentDeliveryAuthorized, false)
  assert.ok(Object.isFrozen(result))
})

test('Stage I REVIEW and BLOCK never invoke Guitar or Violin solvers', () => {
  for (const [route, expectedState, expectedText] of [
    [reviewRoute(), STAGE_I_PRODUCT_STATE.REVIEW_REQUIRED, STAGE_I_PRODUCT_COPY.REVIEW_REQUIRED],
    [blockRoute(), STAGE_I_PRODUCT_STATE.BLOCKED, STAGE_I_PRODUCT_COPY.BLOCKED],
  ]) {
    for (const instrument of Object.values(STAGE_I_INSTRUMENT)) {
      let builderCalls = 0
      const result = resolveStageIInstrumentProduct([{}], instrument, {
        resolveStageGConsumerRoute: () => route,
        builders: {
          guitar: () => { builderCalls += 1; return guitarRendered() },
          violin: () => { builderCalls += 1; return violinProjected() },
        },
      })
      assert.equal(builderCalls, 0)
      assert.equal(result.state, expectedState)
      assert.equal(result.statusText, expectedText)
      assert.equal(result.actionAllowed, false)
      assert.equal(result.definitiveInstrumentOutput, false)
    }
  }
})

test('Stage I fails closed when a nominal PASS lacks exact consumer permissions', () => {
  let builderCalls = 0
  const result = resolveStageIInstrumentProduct([{}], STAGE_I_INSTRUMENT.GUITAR, {
    resolveStageGConsumerRoute: () => ({
      state: STAGE_G_PRODUCT_STATE.PASS,
      automaticProceed: false,
      definitiveConsumerAllowed: true,
    }),
    builders: {
      guitar: () => { builderCalls += 1; return guitarRendered() },
    },
  })

  assert.equal(builderCalls, 0)
  assert.equal(result.state, STAGE_I_PRODUCT_STATE.INVALID)
  assert.equal(result.statusText, STAGE_I_PRODUCT_COPY.BLOCKED)
  assert.equal(result.blocked, true)
  assert.equal(result.actionAllowed, false)
})

test('Stage I preserves consumer-level REVIEW and NOT_AVAILABLE without exposing partial output', () => {
  const review = resolveStageIInstrumentProduct([{}], STAGE_I_INSTRUMENT.VIOLIN, {
    resolveStageGConsumerRoute: () => passRoute(),
    builders: {
      violin: () => ({
        state: VIOLIN_CONSUMER_STATE.REVIEW_REQUIRED,
        allowed: false,
        definitive: false,
        teacherApproved: false,
      }),
    },
  })
  assert.equal(review.state, STAGE_I_PRODUCT_STATE.REVIEW_REQUIRED)
  assert.equal(review.statusText, STAGE_I_PRODUCT_COPY.REVIEW_REQUIRED)
  assert.equal(review.actionAllowed, false)

  const unavailable = resolveStageIInstrumentProduct([{}], STAGE_I_INSTRUMENT.GUITAR, {
    resolveStageGConsumerRoute: () => passRoute(),
    builders: {
      guitar: () => ({
        state: GUITAR_TAB_CONSUMER_STATE.NOT_AVAILABLE,
        allowed: false,
        definitive: false,
        text: 'UNSAFE-PARTIAL',
      }),
    },
  })
  assert.equal(unavailable.state, STAGE_I_PRODUCT_STATE.NOT_AVAILABLE)
  assert.equal(unavailable.statusText, STAGE_I_PRODUCT_COPY.GUITAR_NOT_AVAILABLE)
  assert.equal(unavailable.actionAllowed, false)
  assert.equal('text' in unavailable, false)
})

test('Stage I accepts Violin only when generated output remains explicitly non-teacher-approved', () => {
  const safe = resolveStageIInstrumentProduct([{}], STAGE_I_INSTRUMENT.VIOLIN, {
    resolveStageGConsumerRoute: () => passRoute(),
    builders: { violin: () => violinProjected('basic') },
  })
  assert.equal(safe.state, STAGE_I_PRODUCT_STATE.AVAILABLE)
  assert.equal(safe.statusText, STAGE_I_PRODUCT_COPY.VIOLIN_AVAILABLE)
  assert.equal(safe.mode, 'basic')

  const malformed = resolveStageIInstrumentProduct([{}], STAGE_I_INSTRUMENT.VIOLIN, {
    resolveStageGConsumerRoute: () => passRoute(),
    builders: {
      violin: () => ({
        state: VIOLIN_CONSUMER_STATE.PROJECTED,
        allowed: true,
        definitive: true,
        teacherApproved: true,
      }),
    },
  })
  assert.equal(malformed.state, STAGE_I_PRODUCT_STATE.INVALID)
  assert.equal(malformed.actionAllowed, false)
})

test('Stage I aggregate never gains approval, sharing or delivery authority', () => {
  const products = resolveStageIInstrumentProducts([{}], {
    resolveStageGConsumerRoute: () => passRoute(),
    builders: {
      guitar: () => guitarRendered(),
      violin: () => violinProjected(),
    },
  })
  assert.equal(products.guitar.state, STAGE_I_PRODUCT_STATE.AVAILABLE)
  assert.equal(products.violin.state, STAGE_I_PRODUCT_STATE.AVAILABLE)
  assert.equal(products.teacherApproved, false)
  assert.equal(products.shareAuthorized, false)
  assert.equal(products.studentDeliveryAuthorized, false)
  assert.ok(Object.isFrozen(products))
})

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
  appendChild(child) { child.parentElement = this; this.children.push(child); return child }
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
  return root
}

function availableModel(instrument) {
  return Object.freeze({
    instrument,
    state: STAGE_I_PRODUCT_STATE.AVAILABLE,
    actionAllowed: true,
    statusText: instrument === 'guitar'
      ? STAGE_I_PRODUCT_COPY.GUITAR_AVAILABLE
      : STAGE_I_PRODUCT_COPY.VIOLIN_AVAILABLE,
  })
}

function reviewModel(instrument) {
  return Object.freeze({
    instrument,
    state: STAGE_I_PRODUCT_STATE.REVIEW_REQUIRED,
    actionAllowed: false,
    statusText: STAGE_I_PRODUCT_COPY.REVIEW_REQUIRED,
  })
}

test('Stage I UI creates native accessible product actions and opens only available instrument tabs', () => {
  const root = fakeDocument()
  let guitarActivations = 0
  let violinActivations = 0
  const adapters = {
    resolveStageIInstrumentProducts: () => Object.freeze({
      guitar: availableModel('guitar'),
      violin: reviewModel('violin'),
    }),
    activateGuitarTabResultTab: () => { guitarActivations += 1; return true },
    activateViolinResultTab: () => { violinActivations += 1; return true },
  }

  assert.ok(ensureStageIInstrumentProductUi(root, adapters))
  const products = renderStageIInstrumentProductUi(root, [{}], adapters)
  const guitar = root.getElementById('stage-i-guitar-action')
  const violin = root.getElementById('stage-i-violin-action')

  assert.equal(root.getElementById('stage-i-instrument-heading').textContent, STAGE_I_UI_COPY.heading)
  assert.equal(guitar.tagName, 'button')
  assert.equal(guitar.type, 'button')
  assert.equal(guitar.disabled, false)
  assert.equal(guitar.getAttribute('aria-disabled'), 'false')
  assert.equal(guitar.getAttribute('aria-describedby'), 'stage-i-guitar-status')
  assert.equal(violin.disabled, true)
  assert.equal(violin.getAttribute('aria-disabled'), 'true')
  assert.equal(root.getElementById('stage-i-guitar-status').getAttribute('role'), 'status')
  assert.equal(root.getElementById('stage-i-guitar-status').getAttribute('aria-live'), 'polite')
  assert.equal(products.guitar.state, STAGE_I_PRODUCT_STATE.AVAILABLE)

  guitar.click()
  violin.click()
  assert.equal(guitarActivations, 1)
  assert.equal(violinActivations, 0)
})

test('Stage I UI subscription preserves exact Package 3 NoteObject[] identity and clears actions', () => {
  clearPackage3Notes()
  const root = fakeDocument()
  let receivedNotes = 'unset'
  const adapters = {
    resolveStageIInstrumentProducts(notes) {
      receivedNotes = notes
      const empty = !Array.isArray(notes) || notes.length === 0
      const model = empty
        ? Object.freeze({ state: STAGE_I_PRODUCT_STATE.EMPTY, actionAllowed: false, statusText: STAGE_I_PRODUCT_COPY.EMPTY })
        : availableModel('guitar')
      return Object.freeze({ guitar: model, violin: model })
    },
  }

  assert.equal(initStageIInstrumentProductUi(root, adapters), true)
  const notes = [{ measureKey: 'P1:0', noteName: 'Mi' }]
  publishPackage3Notes(notes)
  assert.equal(receivedNotes, notes)
  assert.equal(root.getElementById('stage-i-guitar-action').disabled, false)

  clearPackage3Notes()
  assert.equal(root.getElementById('stage-i-guitar-action').disabled, true)
  assert.equal(root.getElementById('stage-i-guitar-status').textContent, STAGE_I_PRODUCT_COPY.EMPTY)
})

test('Stage I source stays presentation-only, while S14 retires the duplicate product rail from production', () => {
  const service = readFileSync(new URL('../src/services/stageIInstrumentProduct.js', import.meta.url), 'utf8')
  const ui = readFileSync(new URL('../src/stageIInstrumentProductUi.js', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')

  assert.doesNotMatch(service, /teacherApproval|authorizeShare|studentPayload|Audiveris|omrWorker|cloud-omr/i)
  assert.doesNotMatch(ui, /\.innerHTML\s*=/)
  assert.doesNotMatch(ui, /Audiveris|omrWorker|omrProvider|cloud-omr/i)
  assert.doesNotMatch(main, /stageIInstrumentProduct\.css/)
  assert.doesNotMatch(main, /stageIInstrumentProductUi\.js/)
  assert.doesNotMatch(main, /initStageIInstrumentProductUi\(document\)/)
  assert.match(main, /import '\.\/src\/package4Ui\.js'/)
  assert.match(main, /import '\.\/src\/package5Ui\.js'/)
  assert.match(main, /initSmoosicEditorTab\(document\)/)
})
