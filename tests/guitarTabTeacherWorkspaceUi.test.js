import test from 'node:test'
import assert from 'node:assert/strict'

import {
  activateGuitarTabResultTab,
  ensureGuitarTabPanel,
} from '../src/package4Ui.js'

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
    this.textContent = ''
    this.type = ''
    this.parentElement = null
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
    child.parentElement = this
    this.children.push(child)
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
    for (const listener of this.listeners.get('click') ?? []) {
      listener({ type: 'click', currentTarget: this })
    }
  }
}

function fakeDocument() {
  const root = {
    nodes: new Map(),
    elements: [],
    createElement(tagName) {
      const element = new FakeElement(root, tagName)
      root.elements.push(element)
      return element
    },
    getElementById(id) { return root.nodes.get(id) ?? null },
    querySelector(selector) {
      if (selector.startsWith('.')) {
        const className = selector.slice(1)
        return root.elements.find((element) => element.classList.contains(className)) ?? null
      }
      return null
    },
    querySelectorAll(selector) {
      if (selector.startsWith('.')) {
        const className = selector.slice(1)
        return root.elements.filter((element) => element.classList.contains(className))
      }
      return []
    },
  }

  const results = root.createElement('section'); results.id = 'results-section'
  const body = root.createElement('div'); body.className = 'card-body'; results.appendChild(body)
  const tabList = root.createElement('div'); tabList.className = 'result-tabs'; body.appendChild(tabList)

  for (const name of ['rhythmic', 'html', 'notes', 'assignment', 'xml', 'violin']) {
    const button = root.createElement('button')
    button.className = name === 'rhythmic' ? 'tab-btn active' : 'tab-btn'
    button.dataset.tab = name
    button.setAttribute('role', 'tab')
    button.setAttribute('aria-selected', name === 'rhythmic' ? 'true' : 'false')
    tabList.appendChild(button)

    const panel = root.createElement('div')
    panel.id = `tab-${name}`
    panel.hidden = name !== 'rhythmic'
    panel.setAttribute('role', 'tabpanel')
    body.appendChild(panel)
  }

  const summary = root.createElement('div'); summary.id = 'notes-summary'; body.appendChild(summary)
  return root
}

test('GTAB-09B mounts the teacher workspace inside the existing accessible Gitar TAB tab', () => {
  const root = fakeDocument()
  const panel = ensureGuitarTabPanel(root)

  assert.ok(panel)
  assert.ok(root.getElementById('guitar-tab-teacher-workspace'))
  assert.equal(root.getElementById('guitar-tab-source-input')?.tagName, 'input')
  assert.equal(root.getElementById('guitar-tab-source-status')?.getAttribute('role'), 'status')
  assert.equal(root.getElementById('guitar-tab-score-surface')?.getAttribute('aria-readonly'), 'true')
  assert.ok(root.getElementById('guitar-tab-editor-surface'))

  const rows = root.querySelectorAll('.guitar-tab-string-row')
  assert.equal(rows.length, 6)
  assert.deepEqual(rows.map((row) => row.dataset.string), ['1', '2', '3', '4', '5', '6'])

  const button = root.getElementById('result-guitar-tab-btn')
  assert.equal(button.getAttribute('role'), 'tab')
  assert.equal(button.getAttribute('aria-controls'), 'tab-guitar-tab')
  assert.equal(panel.getAttribute('role'), 'tabpanel')
  assert.equal(panel.getAttribute('aria-labelledby'), 'result-guitar-tab-btn')

  assert.equal(activateGuitarTabResultTab(root), true)
  assert.equal(panel.hidden, false)
  assert.equal(root.getElementById('tab-assignment').hidden, true)
  assert.equal(root.getElementById('tab-violin').hidden, true)
})
