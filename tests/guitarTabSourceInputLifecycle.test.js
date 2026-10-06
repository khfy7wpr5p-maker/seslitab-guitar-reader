import test from 'node:test'
import assert from 'node:assert/strict'

import { ensureGuitarTabPanel } from '../src/package4Ui.js'

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
    this.className = ''
    this.classList = new FakeClassList(this)
    this.parentElement = null
    this._id = ''
    this._textContent = ''
    this.type = ''
    this.disabled = false
  }
  set id(value) { this._id = value; if (value) this.root.nodes.set(value, this) }
  get id() { return this._id }
  set textContent(value) {
    for (const child of this.children) child.parentElement = null
    this.children = []
    this._textContent = String(value ?? '')
  }
  get textContent() { return this._textContent }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
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
  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null
    this.children = []
    this._textContent = ''
    for (const child of children) this.appendChild(child)
  }
  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) ?? []
    listeners.push(listener)
    this.listeners.set(name, listeners)
  }
}

function fakeDocument() {
  const root = {
    nodes: new Map(),
    elements: [],
    documentElement: null,
    createElement(tagName) {
      const element = new FakeElement(root, tagName)
      root.elements.push(element)
      return element
    },
    isConnected(element) {
      let current = element
      while (current) {
        if (current === root.documentElement) return true
        current = current.parentElement
      }
      return false
    },
    getElementById(id) {
      const element = root.nodes.get(id) ?? null
      return element && root.isConnected(element) ? element : null
    },
    querySelector(selector) {
      if (!selector.startsWith('.')) return null
      const className = selector.slice(1)
      return root.elements.find((element) => root.isConnected(element) && element.classList.contains(className)) ?? null
    },
    querySelectorAll(selector) {
      if (!selector.startsWith('.')) return []
      const className = selector.slice(1)
      return root.elements.filter((element) => root.isConnected(element) && element.classList.contains(className))
    },
  }

  const results = root.createElement('section')
  root.documentElement = results
  const body = root.createElement('div')
  body.className = 'card-body'
  results.appendChild(body)
  const tabs = root.createElement('div')
  tabs.className = 'result-tabs'
  body.appendChild(tabs)
  const notesSummary = root.createElement('div')
  notesSummary.id = 'notes-summary'
  body.appendChild(notesSummary)
  return root
}

test('SES-196 binds MusicXML source input after the Guitar TAB panel joins the document tree', () => {
  const root = fakeDocument()

  const panel = ensureGuitarTabPanel(root)
  const sourceInput = root.getElementById('guitar-tab-source-input')

  assert.ok(panel)
  assert.ok(sourceInput, 'MusicXML source input must be discoverable after panel insertion')
  assert.equal(sourceInput.listeners.get('change')?.length ?? 0, 1, 'MusicXML change listener must be bound exactly once')
})
