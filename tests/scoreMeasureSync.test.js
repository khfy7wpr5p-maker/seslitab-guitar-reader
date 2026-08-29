import assert from 'node:assert/strict'
import test from 'node:test'

import { deriveScoreMeasureSelection } from '../src/services/scoreMeasureSync.js'

function note(measureKey, measureIndex, measureNumber, partId = 'P1') {
  return { measureKey, measureIndex, measureNumber, partId, partIndex: 0 }
}

test('derives selected canonical measure and renderer cursor target without inventing identity', () => {
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
    cursorTarget: { partId: 'P1', measureIndex: 1 },
  })
  assert.equal(Object.isFrozen(selection), true)
  assert.equal(Object.isFrozen(selection.cursorTarget), true)
})

test('keeps canonical selection but withholds cursor target when renderer locator is incomplete', () => {
  const selection = deriveScoreMeasureSelection({
    notes: [note('M0', 0, '1', null)],
    selectedMeasureKey: 'M0',
  })

  assert.deepEqual(selection, {
    selected: true,
    measureKey: 'M0',
    visibleLabel: '1',
    cursorTarget: null,
  })
})

test('fails closed for stale or missing selection', () => {
  const notes = [note('P1:M0', 0, '1')]

  assert.deepEqual(
    deriveScoreMeasureSelection({ notes, selectedMeasureKey: 'P1:M9' }),
    { selected: false, measureKey: null, visibleLabel: null, cursorTarget: null },
  )
  assert.deepEqual(
    deriveScoreMeasureSelection({ notes, selectedMeasureKey: null }),
    { selected: false, measureKey: null, visibleLabel: null, cursorTarget: null },
  )
})

test('fails closed when canonical identities conflict', () => {
  const notes = [
    note('same', 0, '1'),
    note('same', 1, '2'),
  ]

  assert.deepEqual(
    deriveScoreMeasureSelection({ notes, selectedMeasureKey: 'same' }),
    { selected: false, measureKey: null, visibleLabel: null, cursorTarget: null },
  )
})
