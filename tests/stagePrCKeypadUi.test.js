import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildStagePrCKeypadModel,
  loadStagePrCSmuflPresentation,
  renderStagePrCKeypadShell,
  resolveSmuflGlyphPresentation,
  smuflCodepointToCharacter,
} from '../src/stagePrCKeypadUi.js'

const source = readFileSync(new URL('../src/stagePrCKeypadUi.js', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/stagePrCKeypad.css', import.meta.url), 'utf8')

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
        glyph: glyphName ? Object.freeze({ smuflGlyphName: glyphName, repeat: actionId === 'dot.set.2' ? 2 : actionId === 'dot.set.3' ? 3 : 1 }) : null,
        hostPrimitiveHint: actionId === 'tie.edit' ? 'tie' : actionId === 'slur.edit' ? 'slur' : null,
      }))),
    }))),
  })
}

function glyphNames() {
  const names = new Set(groups.flatMap(([, , actions]) => actions.map(([, glyph]) => glyph).filter(Boolean)))
  let code = 0xe100
  return Object.fromEntries([...names].map((name) => [name, { codepoint: `U+${(code++).toString(16).toUpperCase()}`, description: name }]))
}

class FakeClassList {
  constructor(owner) { this.owner = owner }
  add(...tokens) {
    const current = new Set(String(this.owner.className || '').split(/\s+/).filter(Boolean))
    for (const token of tokens) current.add(token)
    this.owner.className = [...current].join(' ')
  }
  contains(token) { return String(this.owner.className || '').split(/\s+/).includes(token) }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase()
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
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }
  click() {
    const event = { stopPropagation() {} }
    for (const listener of this.listeners.get('click') ?? []) listener(event)
  }
  remove() { this.parentNode?.removeChild(this) }
}

function fakeRoot() {
  const rootNode = new FakeElement('document')
  const scoreColumn = new FakeElement('div')
  scoreColumn.id = 'stage-s05-score-column'
  const workspace = new FakeElement('div')
  workspace.id = 'stage-s05-score-workspace'
  rootNode.appendChild(scoreColumn)
  rootNode.appendChild(workspace)

  const findById = (node, id) => {
    if (node.id === id) return node
    for (const child of node.children) {
      const found = findById(child, id)
      if (found) return found
    }
    return null
  }

  return {
    createElement: (tagName) => new FakeElement(tagName),
    getElementById: (id) => findById(rootNode, id),
  }
}

test('STI-08 resolves official SMuFL codepoint metadata only after Editor manifest supplies a glyph name', () => {
  assert.equal(smuflCodepointToCharacter('U+E1D5'), String.fromCodePoint(0xe1d5))
  const descriptor = manifest().groups[0].actions.find((item) => item.actionId === 'duration.quarter')
  const presentation = resolveSmuflGlyphPresentation(descriptor, { noteQuarterUp: { codepoint: 'U+E1D5' } })
  assert.equal(presentation.glyphName, 'noteQuarterUp')
  assert.equal(presentation.character, String.fromCodePoint(0xe1d5))
  assert.throws(() => resolveSmuflGlyphPresentation(descriptor, {}), /noteQuarterUp/)
})

test('STI-08/10 keypad model keeps advanced actions gated until the explicit-target host is ready', () => {
  const gated = buildStagePrCKeypadModel(manifest(), glyphNames(), { exactSelectionReady: true })
  assert.equal(gated.actions.length, 22)
  const quarter = gated.actions.find((item) => item.actionId === 'duration.quarter')
  const rest = gated.actions.find((item) => item.actionId === 'rest.eighth')
  const sharp = gated.actions.find((item) => item.actionId === 'accidental.sharp')
  const dot2 = gated.actions.find((item) => item.actionId === 'dot.set.2')
  const triplet = gated.actions.find((item) => item.actionId === 'tuplet.triplet')
  assert.equal(quarter.page, 1)
  assert.equal(rest.page, 1)
  assert.equal(sharp.page, 2)
  assert.equal(dot2.glyph.repeat, 2)
  assert.equal(triplet.page, 3)
  assert.equal(triplet.enabled, false)
  assert.match(triplet.disabledReason, /Explicit advanced hedef/)
  assert.equal(quarter.enabled, true)

  const admitted = buildStagePrCKeypadModel(manifest(), glyphNames(), {
    exactSelectionReady: true,
    advancedActionsReady: true,
  })
  assert.equal(admitted.actions.filter((item) => item.advanced).every((item) => item.enabled), true)
})

test('STI-08 keypad page tabs switch the rendered action panel without changing action authority', () => {
  const root = fakeRoot()
  const rendered = renderStagePrCKeypadShell(root, {
    manifest: manifest(),
    glyphNames: glyphNames(),
    exactSelectionReady: true,
    activePage: 1,
  })
  assert.ok(rendered)
  const shell = root.getElementById('stage-prc-keypad')
  assert.equal(shell.dataset.page, '1')
  assert.equal(shell.children[1].dataset.keypadPagePanel, '1')
  assert.equal(shell.children[1].children.some((child) => child.dataset.editorActionId === 'duration.quarter'), true)

  shell.children[0].children[1].click()
  assert.equal(shell.dataset.page, '2')
  assert.equal(shell.children[0].children[1].getAttribute('aria-selected'), 'true')
  assert.equal(shell.children[1].dataset.keypadPagePanel, '2')
  assert.equal(shell.children[1].children.some((child) => child.dataset.editorActionId === 'accidental.sharp'), true)
  assert.equal(shell.children[1].children.some((child) => child.dataset.editorActionId === 'duration.quarter'), false)

  shell.children[0].children[2].click()
  assert.equal(shell.dataset.page, '3')
  assert.equal(shell.children[1].children.some((child) => child.dataset.editorActionId === 'tuplet.triplet'), true)
  assert.equal(shell.children[1].children.find((child) => child.dataset.editorActionId === 'tuplet.triplet')?.disabled, true)
})

test('STI-08/10 actions remain disabled without exact selection and during pending product synchronization', () => {
  const noSelection = buildStagePrCKeypadModel(manifest(), glyphNames(), { exactSelectionReady: false, advancedActionsReady: true })
  assert.equal(noSelection.actions.every((item) => !item.enabled), true)
  assert.equal(noSelection.actions.find((item) => item.actionId === 'duration.quarter').disabledReason, 'Exact nota seçimi gerekiyor.')

  const pending = buildStagePrCKeypadModel(manifest(), glyphNames(), { exactSelectionReady: true, productSyncPending: true, advancedActionsReady: true })
  assert.equal(pending.actions.every((item) => !item.enabled), true)
  assert.match(pending.actions.find((item) => item.actionId === 'accidental.flat').disabledReason, /senkronizasyon/)
})

test('STI-08 verifies same-origin glyph metadata and Bravura FontFaceSet readiness before mounting presentation', async () => {
  const expected = glyphNames()
  let requested = null
  const result = await loadStagePrCSmuflPresentation({
    fetchImpl: async (url) => {
      requested = url
      return { ok: true, status: 200, json: async () => expected }
    },
    fontSet: {
      async load(value) { assert.match(value, /Bravura/) },
      check(value) { assert.match(value, /Bravura/); return true },
    },
  })
  assert.equal(requested, '/smufl-keypad/glyphnames.json')
  assert.equal(result.glyphNames, expected)
})

test('STI-08 keypad source does not import or execute legacy Stage E/S07 field mutation', () => {
  assert.doesNotMatch(source, /STAGE_E_EDIT_FIELD/)
  assert.doesNotMatch(source, /stageEVisualNoteEdit/)
  assert.doesNotMatch(source, /stage-s07-pitch|stage-s07-accidental|stage-s07-octave|stage-s07-duration/)
  assert.match(source, /data\.editorActionId|dataset\.editorActionId/)
  assert.match(source, /aria-label/)
})

test('STI-08/12 mobile CSS enforces 44px controls, Bravura font, safe areas, and retires legacy write paths only under the integrated gates', () => {
  assert.match(css, /@font-face/)
  assert.match(css, /Bravura\.woff2/)
  assert.match(css, /min-width:\s*44px/)
  assert.match(css, /min-height:\s*44px/)
  assert.match(css, /safe-area-inset-bottom/)
  assert.match(css, /data-sti-prc-keypad-active='true'.*\.stage-s12-note-tools/s)
  assert.match(css, /data-sti-prd-keypad-active='true'.*#stage-s07-inline-fields/s)
  assert.match(css, /data-sti-prd-keypad-active='true'.*#stage-f-undo-last-btn/s)
  assert.doesNotMatch(css, /^\.stage-s12-note-tools\s*\{\s*display:\s*none/m)
})
