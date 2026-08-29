import assert from 'node:assert/strict'
import test from 'node:test'

import { renderScoreMeasureSelection } from '../src/scoreViewUi.js'

function note(measureKey, measureIndex, measureNumber) {
  return { measureKey, measureIndex, measureNumber, partId: 'P1', partIndex: 0 }
}

test('score view reflects SesliTab canonical measure selection without claiming highlight', () => {
  const status = { dataset: {}, textContent: '' }
  const root = {
    getElementById(id) {
      return id === 'score-view-measure-sync' ? status : null
    },
  }

  const ok = renderScoreMeasureSelection(root, {
    notes: [note('P1:M0', 0, '1'), note('P1:M1', 1, '2')],
    selectedMeasureKey: 'P1:M1',
  })

  assert.equal(ok, true)
  assert.equal(status.dataset.measureSelected, 'true')
  assert.equal(status.dataset.measureKey, 'P1:M1')
  assert.match(status.textContent, /Ölçü 2/)
  assert.match(status.textContent, /highlight sonraki güvenli aşamada/)
})

test('score view clears stale selection metadata fail closed', () => {
  const status = { dataset: { measureKey: 'old' }, textContent: '' }
  const root = {
    getElementById(id) {
      return id === 'score-view-measure-sync' ? status : null
    },
  }

  renderScoreMeasureSelection(root, {
    notes: [note('P1:M0', 0, '1')],
    selectedMeasureKey: 'missing',
  })

  assert.equal(status.dataset.measureSelected, 'false')
  assert.equal(status.dataset.measureKey, '')
  assert.match(status.textContent, /ölçü seçimi yok/i)
})
