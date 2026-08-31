import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  applyStageKTunerPresentation,
  STAGE_K_TUNER_COPY,
} from '../src/stageKTunerPresentation.js'

class FakeElement {
  constructor(root, tagName = 'div') {
    this.root = root
    this.tagName = tagName.toUpperCase()
    this.children = []
    this.parentElement = null
    this.attributes = new Map()
    this.className = ''
    this.textContent = ''
    this.value = ''
    this.disabled = false
    this.open = false
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
    if (child.parentElement) {
      const oldIndex = child.parentElement.children.indexOf(child)
      if (oldIndex >= 0) child.parentElement.children.splice(oldIndex, 1)
    }
    child.parentElement = this
    this.children.push(child)
    return child
  }

  insertBefore(child, before) {
    if (child.parentElement) {
      const oldIndex = child.parentElement.children.indexOf(child)
      if (oldIndex >= 0) child.parentElement.children.splice(oldIndex, 1)
    }
    child.parentElement = this
    const index = this.children.indexOf(before)
    if (index < 0) this.children.push(child)
    else this.children.splice(index, 0, child)
    return child
  }

  hasClass(name) {
    return String(this.className).split(/\s+/).filter(Boolean).includes(name)
  }

  matches(selector) {
    if (selector.startsWith('.')) return this.hasClass(selector.slice(1))
    return this.tagName.toLowerCase() === selector.toLowerCase()
  }

  querySelectorAll(selector) {
    const found = []
    const visit = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) found.push(child)
        visit(child)
      }
    }
    visit(this)
    return found
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null }
}

function fakeDocument() {
  const root = {
    nodes: new Map(),
    readyState: 'complete',
    createElement(tagName) { return new FakeElement(root, tagName) },
    getElementById(id) { return root.nodes.get(id) ?? null },
  }

  root.body = root.createElement('body')
  const section = root.createElement('section'); section.id = 'chromatic-tuner-section'; section.className = 'card tuner-card'; root.body.appendChild(section)
  const header = root.createElement('div'); header.className = 'card-header tuner-header'; section.appendChild(header)
  const titleWrap = root.createElement('div'); header.appendChild(titleWrap)
  const heading = root.createElement('h2'); heading.id = 'chromatic-tuner-heading'; heading.textContent = 'Kromatik Akort Cihazı'; titleWrap.appendChild(heading)
  const subtitle = root.createElement('p'); subtitle.className = 'tuner-subtitle'; subtitle.textContent = 'Eski açıklama'; titleWrap.appendChild(subtitle)
  const badge = root.createElement('span'); badge.className = 'tuner-badge'; badge.textContent = '12 ses · kromatik'; header.appendChild(badge)

  const body = root.createElement('div'); body.className = 'card-body tuner-body'; section.appendChild(body)
  const controls = root.createElement('div'); controls.className = 'tuner-controls'; body.appendChild(controls)
  const start = root.createElement('button'); start.id = 'tuner-start-btn'; start.textContent = 'Mikrofonu Başlat'; controls.appendChild(start)
  const stop = root.createElement('button'); stop.id = 'tuner-stop-btn'; stop.textContent = 'Durdur'; stop.disabled = true; controls.appendChild(stop)
  const calibration = root.createElement('label'); calibration.className = 'tuner-calibration'; controls.appendChild(calibration)
  const reference = root.createElement('input'); reference.id = 'tuner-reference-a4'; reference.value = '440'; calibration.appendChild(reference)

  const display = root.createElement('div'); display.className = 'tuner-display'; body.appendChild(display)
  const readout = root.createElement('div'); readout.className = 'tuner-readout'; display.appendChild(readout)
  const frequency = root.createElement('strong'); frequency.id = 'tuner-frequency'; frequency.textContent = '—'; readout.appendChild(frequency)
  const cents = root.createElement('strong'); cents.id = 'tuner-cents'; cents.textContent = '—'; readout.appendChild(cents)

  const help = root.createElement('p'); help.className = 'tuner-help'; help.id = 'tuner-help'; help.textContent = 'Hedef: 0 cent'; body.appendChild(help)
  const status = root.createElement('div'); status.id = 'tuner-status'; status.textContent = 'Akort cihazı hazır.'; body.appendChild(status)
  const error = root.createElement('div'); error.id = 'tuner-error'; body.appendChild(error)

  return { root, section, header, body, controls, start, stop, calibration, reference, display, readout, help, status, error, badge, heading, subtitle }
}

test('Stage K compacts Package 11 without replacing its primary tuner controls', () => {
  const fixture = fakeDocument()
  const { root, section, controls, start, stop, heading, subtitle } = fixture

  assert.equal(applyStageKTunerPresentation(root), true)
  assert.equal(heading.textContent, STAGE_K_TUNER_COPY.title)
  assert.equal(subtitle.textContent, STAGE_K_TUNER_COPY.subtitle)
  assert.equal(controls.children.length, 2)
  assert.equal(controls.children[0], start)
  assert.equal(controls.children[1], stop)
  assert.equal(start.textContent, 'Mikrofonu Başlat')
  assert.equal(stop.textContent, 'Durdur')
  assert.equal(stop.disabled, true)
  assert.equal(section.getAttribute('data-stage-k-presentation'), 'ready')
})

test('Stage K moves only secondary calibration/readout/help/badge into native details', () => {
  const fixture = fakeDocument()
  const { root, calibration, reference, readout, help, badge, status, error, body } = fixture

  applyStageKTunerPresentation(root)
  const details = root.getElementById('stage-k-tuner-details')
  assert.ok(details)
  assert.equal(details.tagName, 'DETAILS')
  assert.equal(details.open, false)
  assert.equal(details.querySelector('summary').textContent, STAGE_K_TUNER_COPY.details)
  for (const node of [calibration, readout, help, badge]) assert.equal(node.parentElement, details)
  assert.equal(reference.value, '440')
  assert.equal(status.parentElement, body)
  assert.equal(error.parentElement, body)
})

test('Stage K keeps microphone-local privacy visible and application idempotent', () => {
  const fixture = fakeDocument()
  const { root, body } = fixture

  applyStageKTunerPresentation(root)
  applyStageKTunerPresentation(root)

  const privacy = root.getElementById('stage-k-tuner-privacy')
  assert.ok(privacy)
  assert.equal(privacy.textContent, STAGE_K_TUNER_COPY.privacy)
  assert.equal(privacy.parentElement, body)
  assert.equal(root.body.querySelectorAll('.stage-k-tuner-privacy').length, 1)
  assert.equal(root.body.querySelectorAll('.stage-k-tuner-details').length, 1)
})

test('Stage K source stays presentation-only and main wires it after Package 11', () => {
  const source = readFileSync(new URL('../src/stageKTunerPresentation.js', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/stageKTunerPresentation.css', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /getUserMedia|AudioContext|analyzeChromaticTunerFrame|frequencyToChromaticPitch|evaluateTuningCents|requestAnimationFrame|fetch\s*\(|XMLHttpRequest|WebSocket/)
  assert.doesNotMatch(source, /\.disabled\s*=|\.value\s*=|tunerSession|referenceA4|minHz|maxHz|minConfidence|minRms/)
  assert.match(source, /Mikrofon sesi SesliTab sunucusuna gönderilmez/)
  assert.match(css, /min-height:\s*44px/)
  assert.match(main, /package11TunerUi\.js/)
  assert.match(main, /stageKTunerPresentation\.css/)
  assert.match(main, /initStageKTunerPresentation/)
  assert.ok(main.indexOf("import './src/package11TunerUi.js'") < main.indexOf("import { initStageKTunerPresentation"))
})
