import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MEASURE_IDENTITY_STATES,
  buildMeasureIndex,
  selectCanonicalMeasure,
} from '../src/services/measureIdentity.js'

function note(overrides = {}) {
  return {
    measureNumber: 1,
    partId: 'P1',
    partIndex: 0,
    measureIndex: 0,
    measureKey: 'P1:0',
    midi: 60,
    beats: 1,
    ...overrides,
  }
}

test('Package 3C preserves parser supplied canonical measure identity', () => {
  const first = note()
  const second = note({ midi: 62 })
  const groups = buildMeasureIndex([first, second])

  assert.equal(groups.length, 1)
  assert.equal(groups[0].identityState, MEASURE_IDENTITY_STATES.CANONICAL)
  assert.equal(groups[0].selectable, true)
  assert.equal(groups[0].measureKey, 'P1:0')
  assert.equal(groups[0].partIndex, 0)
  assert.equal(groups[0].measureIndex, 0)
  assert.strictEqual(groups[0].notes[0], first)
  assert.strictEqual(groups[0].notes[1], second)
})

test('Package 3C keeps duplicate visible measure numbers distinct by canonical key', () => {
  const a = note({ measureNumber: 7, measureKey: 'P1:3', measureIndex: 3 })
  const b = note({ measureNumber: 7, measureKey: 'P1:4', measureIndex: 4, midi: 64 })
  const groups = buildMeasureIndex([a, b])

  assert.deepEqual(groups.map((group) => group.displayNumber), [7, 7])
  assert.deepEqual(groups.map((group) => group.measureKey), ['P1:3', 'P1:4'])
  assert.notStrictEqual(groups[0], groups[1])
})

test('Package 3C never promotes visible legacy measure numbers to canonical identity', () => {
  const legacy = [
    { measureNumber: 1, midi: 60 },
    { measureNumber: 1, midi: 62 },
    { measureNumber: 2, midi: 64 },
  ]
  const groups = buildMeasureIndex(legacy)

  assert.equal(groups.length, 2)
  for (const group of groups) {
    assert.equal(group.identityState, MEASURE_IDENTITY_STATES.UNAVAILABLE)
    assert.equal(group.selectable, false)
    assert.equal(group.measureKey, null)
  }
  assert.equal(selectCanonicalMeasure(legacy, '1'), null)
})

test('Package 3C repeated non-contiguous legacy number remains separate display-only runs', () => {
  const legacy = [
    { measureNumber: 1, midi: 60 },
    { measureNumber: 2, midi: 62 },
    { measureNumber: 1, midi: 64 },
  ]
  const groups = buildMeasureIndex(legacy)
  assert.equal(groups.length, 3)
  assert.deepEqual(groups.map((group) => group.displayNumber), [1, 2, 1])
  assert.ok(groups.every((group) => group.selectable === false))
})

test('Package 3C canonical selection returns the exact original NoteObject references', () => {
  const first = note({ measureKey: 'P1:0' })
  const second = note({ measureKey: 'P1:1', measureIndex: 1, measureNumber: 2 })
  const third = note({ measureKey: 'P1:1', measureIndex: 1, measureNumber: 2, midi: 67 })
  const source = [first, second, third]
  const selection = selectCanonicalMeasure(source, 'P1:1')

  assert.ok(selection)
  assert.strictEqual(selection.notes[0], second)
  assert.strictEqual(selection.notes[1], third)
  assert.equal(selection.notes.includes(first), false)
})

test('Package 3C conflicting metadata for one canonical key fails closed', () => {
  const source = [
    note({ measureKey: 'P1:0', measureIndex: 0 }),
    note({ measureKey: 'P1:0', measureIndex: 1 }),
  ]
  assert.throws(() => buildMeasureIndex(source), /conflicting canonical measure identity/i)
})

test('Package 3C malformed inputs fail closed', () => {
  assert.throws(() => buildMeasureIndex(null), /note array is required/i)
  assert.throws(() => buildMeasureIndex([null]), /invalid note at index 0/i)
  assert.equal(selectCanonicalMeasure([], ''), null)
})

test('Package 3C is deterministic, freezes index containers, and never mutates notes', () => {
  const first = note()
  const sourceBefore = JSON.stringify(first)
  const a = buildMeasureIndex([first])
  const b = buildMeasureIndex([first])

  assert.deepEqual(a.map(({ notes, ...rest }) => rest), b.map(({ notes, ...rest }) => rest))
  assert.equal(JSON.stringify(first), sourceBefore)
  assert.ok(Object.isFrozen(a))
  assert.ok(Object.isFrozen(a[0]))
  assert.ok(Object.isFrozen(a[0].notes))
  assert.equal(Object.isFrozen(first), false)
})
