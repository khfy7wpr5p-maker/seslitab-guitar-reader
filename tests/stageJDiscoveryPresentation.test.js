import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  applyStageJDiscoveryPresentation,
  simplifyDiscoveryResultActions,
  STAGE_J_DISCOVERY_COPY,
} from '../src/stageJDiscoveryPresentation.js'

class FakeElement {
  constructor(root, tagName = 'div') {
    this.root = root
    this.tagName = tagName.toUpperCase()
    this.children = []
    this.parentElement = null
    this.attributes = new Map()
    this.className = ''
    this.textContent = ''
    this.href = ''
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

  closest(selector) {
    let node = this
    while (node) {
      if (node.matches?.(selector)) return node
      node = node.parentElement
    }
    return null
  }
}

function fakeDocument() {
  const root = {
    nodes: new Map(),
    readyState: 'complete',
    createElement(tagName) { return new FakeElement(root, tagName) },
    getElementById(id) { return root.nodes.get(id) ?? null },
    querySelector(selector) { return root.body.querySelector(selector) },
    querySelectorAll(selector) { return root.body.querySelectorAll(selector) },
  }
  root.body = new FakeElement(root, 'body')

  const panel = root.createElement('div'); panel.id = 'discovery-panel'; root.body.appendChild(panel)
  const intro = root.createElement('div'); intro.className = 'discovery-intro'; panel.appendChild(intro)
  const heading = root.createElement('h3'); heading.textContent = 'Eski başlık'; intro.appendChild(heading)
  const introText = root.createElement('p'); introText.textContent = 'Eski açıklama'; intro.appendChild(introText)

  const form = root.createElement('form'); form.id = 'discovery-search-form'; panel.appendChild(form)
  const label = root.createElement('label'); label.setAttribute('for', 'discovery-query'); label.textContent = 'Eski etiket'; form.appendChild(label)
  const input = root.createElement('input'); input.id = 'discovery-query'; input.setAttribute('aria-describedby', 'discovery-help'); form.appendChild(input)
  const help = root.createElement('p'); help.id = 'discovery-help'; help.className = 'discovery-help'; help.textContent = 'Eski yardım'; form.appendChild(help)
  const filters = root.createElement('div'); filters.className = 'discovery-filters'; form.appendChild(filters)
  const features = root.createElement('fieldset'); features.className = 'discovery-feature-group'; form.appendChild(features)

  const status = root.createElement('div'); status.id = 'discovery-status'; panel.appendChild(status)
  const results = root.createElement('ul'); results.id = 'discovery-results'; panel.appendChild(results)

  const card = root.createElement('li'); card.className = 'discovery-result-card'; results.appendChild(card)
  const title = root.createElement('h4'); title.className = 'discovery-result-title'; title.textContent = 'Cambaz'; card.appendChild(title)
  const actions = root.createElement('div'); actions.className = 'discovery-result-actions'; card.appendChild(actions)
  const sourceLink = root.createElement('a'); sourceLink.href = 'https://example.test/cambaz'; sourceLink.textContent = 'Kaynağı Aç'; actions.appendChild(sourceLink)
  const intake = root.createElement('button'); intake.textContent = 'MusicXML Yüklemeye Geç'; actions.appendChild(intake)

  const sourceSection = root.createElement('section'); sourceSection.id = 'discovery-source-section'; panel.appendChild(sourceSection)
  const sourceHeading = root.createElement('h3'); sourceHeading.id = 'discovery-source-heading'; sourceHeading.textContent = 'Kaynaklarda ara'; sourceSection.appendChild(sourceHeading)
  const sourceHelp = root.createElement('p'); sourceHelp.className = 'discovery-help'; sourceHelp.textContent = 'Eski kaynak açıklaması'; sourceSection.appendChild(sourceHelp)
  const sourceList = root.createElement('ul'); sourceList.id = 'discovery-source-locators'; sourceSection.appendChild(sourceList)
  const sourceCard = root.createElement('li'); sourceCard.className = 'discovery-result-card discovery-source-card'; sourceList.appendChild(sourceCard)
  const locatorLink = root.createElement('a'); locatorLink.href = 'https://search.example.test/?q=cambaz'; locatorLink.textContent = 'YouTube’da ara'; sourceCard.appendChild(locatorLink)

  return { root, panel, form, filters, features, status, sourceLink, locatorLink, intake, help, input }
}

test('Stage J makes source search the primary task while preserving optional filters', () => {
  const { root, panel, form, filters, features, help, input } = fakeDocument()

  assert.equal(applyStageJDiscoveryPresentation(root), true)

  assert.equal(panel.querySelector('.discovery-intro').querySelector('h3').textContent, STAGE_J_DISCOVERY_COPY.title)
  assert.equal(panel.querySelector('.discovery-intro').querySelector('p').textContent, STAGE_J_DISCOVERY_COPY.intro)
  assert.equal(root.querySelectorAll('label')[0].textContent, STAGE_J_DISCOVERY_COPY.queryLabel)
  assert.equal(help.textContent, STAGE_J_DISCOVERY_COPY.help)
  assert.equal(help.parentElement, form)
  assert.equal(input.getAttribute('aria-describedby'), 'discovery-help')

  const details = root.getElementById('stage-j-discovery-options')
  assert.ok(details)
  assert.equal(details.tagName, 'DETAILS')
  assert.equal(details.querySelector('summary').textContent, STAGE_J_DISCOVERY_COPY.options)
  assert.equal(filters.parentElement, details)
  assert.equal(features.parentElement, details)
  assert.equal(panel.getAttribute('data-stage-j-presentation'), 'ready')
})

test('Stage J adds an explicit discovery-not-verification boundary without deleting source evidence', () => {
  const { root, panel } = fakeDocument()
  applyStageJDiscoveryPresentation(root)

  const trust = root.getElementById('stage-j-discovery-trust-note')
  assert.ok(trust)
  assert.equal(trust.textContent, STAGE_J_DISCOVERY_COPY.trust)
  assert.match(trust.textContent, /doğrulanmış nota değildir/i)
  assert.equal(root.getElementById('discovery-source-heading').textContent, STAGE_J_DISCOVERY_COPY.sourceHeading)
  assert.equal(root.getElementById('discovery-source-section').querySelector('.discovery-help').textContent, STAGE_J_DISCOVERY_COPY.sourceHelp)

  // Idempotent re-application must not duplicate trust/options surfaces.
  applyStageJDiscoveryPresentation(root)
  assert.equal(panel.querySelectorAll('.stage-j-discovery-trust-note').length, 1)
  assert.equal(panel.querySelectorAll('.stage-j-discovery-options').length, 1)
})

test('Stage J standardizes only direct result source links and leaves intake/source-locator actions intact', () => {
  const { root, sourceLink, locatorLink, intake } = fakeDocument()
  const originalHref = sourceLink.href
  const locatorText = locatorLink.textContent

  assert.equal(simplifyDiscoveryResultActions(root), 1)
  assert.equal(sourceLink.textContent, STAGE_J_DISCOVERY_COPY.sourceOpen)
  assert.equal(sourceLink.href, originalHref)
  assert.equal(sourceLink.getAttribute('aria-label'), 'Cambaz için kaynak sitesini yeni sekmede aç')
  assert.equal(intake.textContent, 'MusicXML Yüklemeye Geç')
  assert.equal(locatorLink.textContent, locatorText)
})

test('Stage J source stays presentation-only and main wires it after Discovery UI', () => {
  const source = readFileSync(new URL('../src/stageJDiscoveryPresentation.js', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/stageJDiscoveryPresentation.css', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /from ['"][^'"]*discoveryService/)
  assert.doesNotMatch(source, /from ['"][^'"]*discoveryGatewayClient/)
  assert.doesNotMatch(source, /\bsearchScores\s*\(/)
  assert.doesNotMatch(source, /\bfetch\s*\(/)
  assert.doesNotMatch(source, /\.innerHTML\s*=/)
  assert.doesNotMatch(source, /\bhandoffMode\s*=/)
  assert.doesNotMatch(source, /\bsourcePageUrl\s*=/)
  assert.match(source, /Kaynak Sitesinde Aç/)
  assert.match(source, /doğrulanmış nota değildir/)
  assert.match(css, /min-height:\s*44px/)
  assert.match(main, /import ['"]\.\/src\/discoveryUi\.js['"]/)
  assert.match(main, /stageJDiscoveryPresentation\.css/)
  assert.match(main, /initStageJDiscoveryPresentation/)
  assert.ok(main.indexOf("import './src/discoveryUi.js'") < main.indexOf("import { initStageJDiscoveryPresentation"))
})
