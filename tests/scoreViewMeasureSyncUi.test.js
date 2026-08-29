import assert from 'node:assert/strict'
import test from 'node:test'

import {
  renderScoreMeasureSelection,
  syncScoreMeasureCursor,
} from '../src/scoreViewUi.js'

function note(measureKey, measureIndex, measureNumber) {
  return { measureKey, measureIndex, measureNumber, partId: 'P1', partIndex: 0 }
}

function rootWithStatus() {
  const status = { dataset: {}, textContent: '' }
  const root = {
    getElementById(id) {
      return id === 'score-view-measure-sync' ? status : null
    },
  }
  return { root, status }
}

test('score view reflects SesliTab canonical measure selection and renderer locator', () => {
  const { root, status } = rootWithStatus()

  const ok = renderScoreMeasureSelection(root, {
    notes: [note('P1:M0', 0, '1'), note('P1:M1', 1, '2')],
    selectedMeasureKey: 'P1:M1',
  })

  assert.equal(ok, true)
  assert.equal(status.dataset.measureSelected, 'true')
  assert.equal(status.dataset.measureKey, 'P1:M1')
  assert.equal(status.dataset.cursorSynced, 'false')
  assert.equal(status.dataset.cursorPartId, 'P1')
  assert.equal(status.dataset.cursorMeasureIndex, '1')
  assert.match(status.textContent, /Ölçü 2/)
  assert.match(status.textContent, /eşlenmeye hazır/)
})

test('score view clears stale selection metadata fail closed', () => {
  const { root, status } = rootWithStatus()
  status.dataset.measureKey = 'old'

  renderScoreMeasureSelection(root, {
    notes: [note('P1:M0', 0, '1')],
    selectedMeasureKey: 'missing',
  })

  assert.equal(status.dataset.measureSelected, 'false')
  assert.equal(status.dataset.measureKey, '')
  assert.equal(status.dataset.cursorSynced, 'false')
  assert.equal(status.dataset.cursorPartId, '')
  assert.equal(status.dataset.cursorMeasureIndex, '')
  assert.match(status.textContent, /ölçü seçimi yok/i)
})

test('score cursor sync forwards canonical part and measure index to ST runtime', async () => {
  const { root, status } = rootWithStatus()
  let target = null
  const runtime = {
    async moveCursor(value) {
      target = value
    },
    async dispose() {},
  }
  const snapshot = {
    notes: [note('P1:M0', 0, '1'), note('P1:M1', 1, '2')],
    selectedMeasureKey: 'P1:M1',
  }

  renderScoreMeasureSelection(root, snapshot)
  assert.equal(await syncScoreMeasureCursor(root, snapshot, runtime), true)
  assert.deepEqual(target, { partId: 'P1', measureIndex: 1 })
  assert.equal(status.dataset.cursorSynced, 'true')
  assert.match(status.textContent, /cursor bu canonical ölçüyle eşlendi/)
})

test('score cursor sync removes stale presentation when runtime cursor movement fails', async () => {
  const { root, status } = rootWithStatus()
  let disposed = 0
  const runtime = {
    async moveCursor() {
      throw new Error('synthetic cursor failure')
    },
    async dispose() {
      disposed += 1
    },
  }
  const snapshot = {
    notes: [note('P1:M0', 0, '1')],
    selectedMeasureKey: 'P1:M0',
  }

  renderScoreMeasureSelection(root, snapshot)
  assert.equal(await syncScoreMeasureCursor(root, snapshot, runtime), false)
  assert.equal(disposed, 1)
  assert.equal(status.dataset.cursorSynced, 'false')
  assert.match(status.textContent, /güvenli şekilde temizlendi/)
})
