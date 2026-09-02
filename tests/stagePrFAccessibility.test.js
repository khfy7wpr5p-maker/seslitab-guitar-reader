import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { renderStagePrCKeypadShell } from '../src/stagePrCKeypadUi.js'

const css = readFileSync(new URL('../src/stagePrCKeypad.css', import.meta.url), 'utf8')
const uiSource = readFileSync(new URL('../src/stagePrCKeypadUi.js', import.meta.url), 'utf8')

const groups = [
  ['duration', 'duration', [
    ['duration.whole', 'noteWhole'], ['duration.half', 'noteHalfUp'], ['duration.quarter', 'noteQuarterUp'],
    ['duration.eighth', 'note8thUp'], ['duration.16th', 'note16thUp'], ['duration.32nd', 'note32ndUp'],
  ]],
  ['rests', 'rests', [
    ['rest.whole', 'restWhole'], ['rest.half', 'restHalf'], ['rest.quarter', 'restQuarter'],
    ['rest.eighth', 'rest8th'], ['rest.16th', 'rest16th'], ['rest.32nd', 'rest32nd'],
  ]],
  ['accidentals', 'accidentals', [
    ['accidental.flat', 'accidentalFlat'], ['accidental.natural', 'accidentalNatural'], ['accidental.sharp', 'accidentalSharp'],
  ]],
  ['dots', 'dots', [
    ['dot.set.0', null], ['dot.set.1', 'augmentationDot'], ['dot.set.2', 'augmentationDot'], ['dot.set.3', 'augmentationDot'],
  ]],
  ['tuplets', 'tuplets', [['tuplet.triplet', 'tuplet3']]],
  ['connections', 'connections', [['tie.edit', null], ['slur.edit', null]]],
]

function manifest() {
  return Object.freeze({
    version: '1.0.0',
    mode: 'EXISTING_SCORE_CORRECTION',
    semanticAuthority: 'ACTION_ID_ONLY',
    glyphMetadataAuthority: false,
    rawGlyphCodepointsIncluded: false,
    fontAssetsIncluded: false,
    groups: Object.freeze(groups.map(([id, label, actions]) => Object.freeze({
      id,
      accessibleLabelKey: `keypad.group.${label}`,
      actions: Object.freeze(actions.map(([actionId, glyphName]) => Object.freeze({
        actionId,
        accessibleLabelKey: `keypad.${actionId}`,
        glyph: glyphName ? Object.freeze({
          smuflGlyphName: glyphName,
          repeat: actionId === 'dot.set.2' ? 2 : actionId === 'dot.set.3' ? 3 : 1,
        }) : null,
        hostPrimitiveHint: actionId === 'tie.edit' ? 'tie' : actionId === 'slur.edit' ? 'slur' : null,
      }))),
    }))),
  })
}

function glyphNames() {
  const names = new Set(groups.flatMap(([, , actions]) => actions.map(([, glyph]) => glyph).filter(Boolean)))
  let code = 0xe100
  return Object.fromEntries([...names].map((name) => [name, { codepoint: `U+${(code++).toString(16).toUpperCase()}` }]))
}

class FakeClassList {
  constructor(owner) { this.owner = owner }
  add(...tokens) {
    const current = new Set(String(this.owner.className || '').split(/\s+/).filter(Boolean))
    for (const token of tokens) current.add(token)
    this.owner.className = [...current].join(' ')
  }
}

class FakeElement {
  constructor(tagName, ownerRoot) {
    this.tagName = tagName.toUpperCase()
    this.ownerRoot = ownerRoot
    this.children = []
    this.parentNode = null
    this.dataset = {}
    this.attributes = new Map()
    this.listeners = new Map()
    this.className = ''
    this.classList = new FakeClassList(this)
    this.textContent = ''
    this.id = ''
    this.disabled = false
    this.type = ''
    this.title = ''
  }
  get firstChild() { return this.children[0] ?? null }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child }
  removeChild(child) {
    const index = this.children.indexOf(child)
    if (index >= 0) this.children.splice(index, 1)
    child.parentNode = null
    return child
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  removeAttribute(name) { this.attributes.delete(name) }
  addEventListener(type, listener) {
    const values = this.listeners.get(type) ?? []
    values.push(listener)
    this.listeners.set(type, values)
  }
  focus() { this.ownerRoot.activeElement = this }
  click() {
    this.focus()
    const event = { stopPropagation() {} }
    for (const listener of this.listeners.get('click') ?? []) listener(event)
  }
  remove() { this.parentNode?.removeChild(this) }
}

function fakeRoot() {
  const root = {
    activeElement: null,
    body: null,
    documentElement: null,
    createElement: null,
    getElementById: null,
  }
  root.createElement = (tagName) => new FakeElement(tagName, root)
  const tree = root.createElement('document')
  root.documentElement = tree
  root.body = root.createElement('body')
  tree.appendChild(root.body)
  const scoreColumn = root.createElement('div')
  scoreColumn.id = 'stage-s05-score-column'
  const workspace = root.createElement('div')
  workspace.id = 'stage-s05-score-workspace'
  root.body.appendChild(scoreColumn)
  root.body.appendChild(workspace)
  const findById = (node, id) => {
    if (node.id === id) return node
    for (const child of node.children) {
      const found = findById(child, id)
      if (found) return found
    }
    return null
  }
  root.getElementById = (id) => findById(tree, id)
  return root
}

test('STI-16 disabled notation actions expose VoiceOver-readable reasons and concise visible status', () => {
  const root = fakeRoot()
  renderStagePrCKeypadShell(root, {
    manifest: manifest(),
    glyphNames: glyphNames(),
    exactSelectionReady: false,
  })
  const quarter = root.getElementById('stage-prc-keypad-action-duration-quarter')
  assert.ok(quarter)
  assert.equal(quarter.disabled, true)
  assert.equal(quarter.getAttribute('aria-disabled'), 'true')
  assert.equal(quarter.getAttribute('aria-label'), 'Dörtlük nota')
  const reason = root.getElementById(quarter.getAttribute('aria-describedby'))
  assert.ok(reason)
  assert.equal(reason.textContent, 'Exact nota seçimi gerekiyor.')
  const status = root.getElementById('stage-prc-keypad-status')
  assert.equal(status.className, 'stage-prc-keypad-status')
  assert.equal(status.getAttribute('aria-atomic'), 'true')
  assert.match(status.textContent, /exact notaya dokunun/i)
})

test('STI-16 keypad preserves logical focus across busy rerender and page replacement', () => {
  const root = fakeRoot()
  const options = {
    manifest: manifest(),
    glyphNames: glyphNames(),
    exactSelectionReady: true,
    advancedActionsReady: true,
    onAction() {},
  }
  renderStagePrCKeypadShell(root, options)
  root.getElementById('stage-prc-keypad-action-duration-quarter').focus()

  renderStagePrCKeypadShell(root, { ...options, productSyncPending: true })
  assert.equal(root.activeElement?.dataset?.keypadPage, '1')

  renderStagePrCKeypadShell(root, options)
  assert.equal(root.activeElement?.dataset?.editorActionId, 'duration.quarter')

  root.getElementById('stage-prc-keypad-page-2').click()
  assert.equal(root.activeElement?.dataset?.keypadPage, '2')
  assert.equal(root.getElementById('stage-prc-keypad-panel-2').getAttribute('aria-labelledby'), 'stage-prc-keypad-page-2')
})

test('STI-16 CSS and source lock 44px, safe-area, landscape, focus and no inferred authority', () => {
  assert.match(css, /min-width:\s*44px/)
  assert.match(css, /min-height:\s*44px/)
  assert.match(css, /safe-area-inset-left/)
  assert.match(css, /safe-area-inset-right/)
  assert.match(css, /safe-area-inset-top/)
  assert.match(css, /safe-area-inset-bottom/)
  assert.match(css, /orientation:\s*landscape/)
  assert.match(css, /max-width:\s*360px/)
  assert.match(css, /stage-prc-keypad-status/)
  assert.match(uiSource, /preventScroll:\s*true/)
  assert.match(uiSource, /aria-describedby/)
  assert.match(uiSource, /aria-controls/)
  assert.doesNotMatch(uiSource, /nearest|proximity|pitch fallback/i)
})
