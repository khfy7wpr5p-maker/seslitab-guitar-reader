import assert from 'node:assert/strict'
import test from 'node:test'

import { deriveScoreMeasureSelection } from '../src/services/scoreMeasureSync.js'

function note(measureKey, measureIndex, measureNumber) {
  return { measureKey, measureIndex, measureNumber, partId: 'P1', partIndex: 0 }
}

test('derives selected canonical measure without inventing identity', () => {
  const notes = [
    note('P1:M0', 0, '1'),
    note('P1:M1', 1, '2'),
  ]

  const selection = deriveScoreMeasureSelection({
    notes,
    selectedMeasureKey: 'P1:M1',
  })

  assert.deepEqual(selection, {
    selected: true,
    measureKey: 'P1:M1',
    visibleLabel: '2',
  })
  assert.equal(Object.isFrozen(selection), true)
})

test('fails closed for stale or missing selection', () => {
  const notes = [note('P1:M0', 0, '1')]

  assert.deepEqual(
    deriveScoreMeasureSelection({ notes, selectedMeasureKey: 'P1:M9' }),
    { selected: false, measureKey: null, visibleLabel: null },
  )
  assert.deepEqual(
    deriveScoreMeasureSelection({ notes, selectedMeasureKey: null }),
    { selected: false, measureKey: null, visibleLabel: null },
  )
})

test('fails closed when canonical identities conflict', () => {
  const notes = [
    note('same', 0, '1'),
    note('same', 1, '2'),
  ]

  assert.deepEqual(
    deriveScoreMeasureSelection({ notes, selectedMeasureKey: 'same' }),
    { selected: false, measureKey: null, visibleLabel: null },
  )
})
