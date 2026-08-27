import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MUSIC_LISTEN_LABELS,
  applyMusicListenLabels,
} from '../src/package3Ui.js'

function fakeRoot({ complete = true } = {}) {
  const text = { textContent: '🎵 Notaları Çal' }
  const heading = { textContent: 'Ritmik Çal' }
  const attributes = new Map()
  const button = {
    setAttribute(name, value) { attributes.set(name, value) },
    querySelector(selector) {
      return selector === '.btn-icon-text' && complete ? text : null
    },
  }

  return {
    heading,
    button,
    text,
    attributes,
    getElementById(id) {
      if (!complete) return null
      if (id === 'rhythm-heading') return heading
      if (id === 'rhythm-btn') return button
      return null
    },
  }
}

test('Package 3A exposes immutable approved music-listen wording', () => {
  assert.equal(MUSIC_LISTEN_LABELS.heading, 'Müziği Dinle')
  assert.equal(MUSIC_LISTEN_LABELS.button, '🎵 Müziği Dinle')
  assert.equal(MUSIC_LISTEN_LABELS.ariaLabel, 'Müziği dinlemeyi başlat')
  assert.ok(Object.isFrozen(MUSIC_LISTEN_LABELS))
})

test('Package 3A updates heading, visible button label and accessible name together', () => {
  const root = fakeRoot()
  assert.equal(applyMusicListenLabels(root), true)
  assert.equal(root.heading.textContent, 'Müziği Dinle')
  assert.equal(root.text.textContent, '🎵 Müziği Dinle')
  assert.equal(root.attributes.get('aria-label'), 'Müziği dinlemeyi başlat')
})

test('Package 3A fails closed when expected playback controls are absent', () => {
  assert.equal(applyMusicListenLabels(null), false)
  assert.equal(applyMusicListenLabels(fakeRoot({ complete: false })), false)
})
