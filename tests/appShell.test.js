import test from 'node:test'
import assert from 'node:assert/strict'

import {
  APP_SHELL_FEATURES,
  activateAppShellFeature,
} from '../src/appShell.js'

test('app shell exposes only bounded primary product surfaces', () => {
  assert.deepEqual(
    APP_SHELL_FEATURES.map(({ id, label, targetId }) => [id, label, targetId]),
    [
      ['workspace', 'Çalışma Alanı', 'input-section'],
      ['discovery', 'Nota Ara', 'input-section'],
      ['tuner', 'Akort', 'chromatic-tuner-section'],
    ],
  )

  assert.equal(APP_SHELL_FEATURES.some(({ id }) => id === 'teacher'), false)
  assert.equal(APP_SHELL_FEATURES.some(({ id }) => id === 'results'), false)
})

test('app shell activates an existing feature without inventing availability', () => {
  let clicked = 0
  let focused = 0
  let scrolled = 0
  const nodes = new Map()
  nodes.set('discovery-tab-btn', { click() { clicked += 1 } })
  nodes.set('input-section', {
    hidden: true,
    attributes: new Map(),
    hasAttribute(name) { return this.attributes.has(name) },
    setAttribute(name, value) { this.attributes.set(name, value) },
    scrollIntoView() { scrolled += 1 },
    focus() { focused += 1 },
  })
  nodes.set('aria-live-region', { textContent: '' })
  const root = { getElementById(id) { return nodes.get(id) ?? null } }

  assert.equal(activateAppShellFeature(root, 'discovery'), true)
  assert.equal(clicked, 1)
  assert.equal(scrolled, 1)
  assert.equal(focused, 1)
  assert.equal(nodes.get('input-section').hidden, false)
  assert.equal(nodes.get('aria-live-region').textContent, 'Nota Ara açıldı.')
})

test('app shell fails closed when a feature surface is absent', () => {
  const live = { textContent: '' }
  const root = {
    getElementById(id) {
      if (id === 'aria-live-region') return live
      return null
    },
  }

  assert.equal(activateAppShellFeature(root, 'tuner'), false)
  assert.equal(live.textContent, 'Akort henüz bu ekranda kullanılamıyor.')
})
