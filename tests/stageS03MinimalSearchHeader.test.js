import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { ensureAppShell } from '../src/appShell.js'

class FakeElement {
  constructor(root, tagName = 'div') {
    this.root = root
    this.tagName = tagName.toUpperCase()
    this.children = []
    this.parentElement = null
    this.attributes = new Map()
    this.listeners = new Map()
    this.className = ''
    this.textContent = ''
    this.hidden = false
    this._id = ''
    this.scrollCount = 0
    this.focusCount = 0
  }

  set id(value) {
    this._id = value
    if (value) this.root.nodes.set(value, this)
  }
  get id() { return this._id }

  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  hasAttribute(name) { return this.attributes.has(name) }

  appendChild(child) {
    if (child.parentElement) {
      const index = child.parentElement.children.indexOf(child)
      if (index >= 0) child.parentElement.children.splice(index, 1)
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

  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) ?? []) listener({ type, preventDefault() {} })
  }

  click() { this.dispatch('click') }
  scrollIntoView() { this.scrollCount += 1 }
  focus() { this.focusCount += 1 }

  hasClass(name) {
    return String(this.className).split(/\s+/).filter(Boolean).includes(name)
  }

  matches(selector) {
    if (selector.startsWith('.')) return this.hasClass(selector.slice(1))
    if (selector.startsWith('#')) return this.id === selector.slice(1)
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
    querySelector(selector) { return root.body.querySelector(selector) },
    querySelectorAll(selector) { return root.body.querySelectorAll(selector) },
  }
  root.body = new FakeElement(root, 'body')

  const live = root.createElement('div'); live.id = 'aria-live-region'; root.body.appendChild(live)

  const header = root.createElement('header'); header.className = 'app-header'; root.body.appendChild(header)
  const headerContent = root.createElement('div'); headerContent.className = 'header-content'; header.appendChild(headerContent)
  const logo = root.createElement('div'); logo.className = 'logo'; headerContent.appendChild(logo)
  const icon = root.createElement('span'); icon.className = 'logo-icon'; logo.appendChild(icon)
  const logoText = root.createElement('div'); logoText.className = 'logo-text'; logo.appendChild(logoText)
  const heading = root.createElement('h1'); heading.textContent = 'SesliTab'; logoText.appendChild(heading)
  const subtitle = root.createElement('p'); subtitle.className = 'logo-subtitle'; subtitle.textContent = 'Uzun ürün açıklaması'; logoText.appendChild(subtitle)
  const provider = root.createElement('div'); provider.id = 'provider-badge'; provider.className = 'header-badge'; headerContent.appendChild(provider)

  const main = root.createElement('main'); main.className = 'app-main'; root.body.appendChild(main)
  const input = root.createElement('section'); input.id = 'input-section'; main.appendChild(input)

  const discoveryTab = root.createElement('button'); discoveryTab.id = 'discovery-tab-btn'; input.appendChild(discoveryTab)
  const panel = root.createElement('div'); panel.id = 'discovery-panel'; panel.hidden = true; input.appendChild(panel)
  discoveryTab.addEventListener('click', () => { panel.hidden = false })

  const form = root.createElement('form'); form.id = 'discovery-search-form'; panel.appendChild(form)
  const label = root.createElement('label'); label.setAttribute('for', 'discovery-query'); label.textContent = 'Eser veya sanatçı'; form.appendChild(label)
  const queryRow = root.createElement('div'); queryRow.className = 'discovery-query-row'; form.appendChild(queryRow)
  const query = root.createElement('input'); query.id = 'discovery-query'; queryRow.appendChild(query)
  const searchButton = root.createElement('button'); searchButton.id = 'discovery-search-btn'; searchButton.setAttribute('type', 'submit'); queryRow.appendChild(searchButton)
  const help = root.createElement('p'); help.id = 'discovery-help'; form.appendChild(help)

  return { root, header, headerContent, heading, subtitle, provider, main, form, label, queryRow, query, searchButton, panel }
}

test('S03 replaces the old hero/nav surface with one compact identity and the real Discovery search controls', () => {
  const { root, header, headerContent, heading, subtitle, provider, main, form, label, queryRow, query, searchButton } = fakeDocument()

  const shell = ensureAppShell(root)

  assert.ok(shell)
  assert.equal(shell.id, 'seslitab-app-shell')
  assert.equal(shell.parentElement, headerContent)
  assert.equal(heading.textContent, 'SesliTab Guitar Reader')
  assert.equal(subtitle.hidden, true)
  assert.equal(header.getAttribute('data-stage-s03-shell'), 'ready')
  assert.equal(shell.getAttribute('role'), 'search')
  assert.equal(shell.getAttribute('aria-label'), 'Eser veya sanatçı ara')

  assert.equal(label.parentElement, shell)
  assert.equal(queryRow.parentElement, shell)
  assert.equal(query.getAttribute('form'), form.id)
  assert.equal(searchButton.getAttribute('form'), form.id)
  assert.equal(provider.parentElement, headerContent)

  assert.equal(root.querySelector('.app-shell-nav'), null)
  assert.equal(root.querySelector('.app-shell-status'), null)
  assert.equal(main.querySelector('#seslitab-app-shell'), null)
})

test('S03 header search keeps the original Discovery form authority and reveals its result panel on submit', () => {
  const { root, form, panel, query } = fakeDocument()
  ensureAppShell(root)

  assert.equal(panel.hidden, true)
  form.dispatch('submit')
  assert.equal(panel.hidden, false)
  assert.equal(panel.scrollCount, 1)
  assert.equal(query.parentElement.parentElement.id, 'seslitab-app-shell')

  const firstShell = root.getElementById('seslitab-app-shell')
  assert.equal(ensureAppShell(root), firstShell)
  assert.equal(root.querySelectorAll('.app-shell').length, 1)
})

test('S03 stays presentation-only, keyboard-visible, compact and mobile-bounded', () => {
  const source = readFileSync(new URL('../src/appShell.js', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/appShell.css', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /from ['"][^'"]*discoveryService/)
  assert.doesNotMatch(source, /\bsearchScores\s*\(/)
  assert.doesNotMatch(source, /\bfetch\s*\(/)
  assert.doesNotMatch(source, /\.innerHTML\s*=/)
  assert.doesNotMatch(source, /createFeatureButton|createProductIntro/)
  assert.match(source, /SesliTab Guitar Reader/)
  assert.match(source, /setAttribute\?\.\('form', form\.id\)/)

  assert.match(css, /position:\s*sticky/)
  assert.match(css, /min-height:\s*44px/)
  assert.match(css, /@media \(max-width:\s*420px\)/)
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) auto/)

  assert.ok(main.indexOf("import './src/discoveryUi.js'") < main.indexOf("import './src/appShell.js'"))
})
