import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildGuitarTabAssignmentProjection,
  formatGuitarTabAssignmentProgress,
} from '../src/services/guitarTabAssignmentProjection.js'

function sourceSession() {
  return {
    events: [
      { sourceEventId: 'e1', measureIndex: 0, onsetDivisions: 0, sourceOrder: 0 },
      { sourceEventId: 'e2', measureIndex: 0, onsetDivisions: 1, sourceOrder: 1 },
      { sourceEventId: 'e3', measureIndex: 1, onsetDivisions: 0, sourceOrder: 2 },
      { sourceEventId: 'e4', measureIndex: 1, onsetDivisions: 0, sourceOrder: 3 },
    ],
    groups: [
      { groupId: 'g1', sourceEventIds: ['e1'] },
      { groupId: 'g2', sourceEventIds: ['e2'] },
      { groupId: 'g3', sourceEventIds: ['e3', 'e4'] },
    ],
  }
}

test('GTAB-10C projection keeps assignments from earlier groups visible in measure/onset order', () => {
  const projection = buildGuitarTabAssignmentProjection({
    sourceSession: sourceSession(),
    assignments: [
      { sourceEventId: 'e1', string: 1, fret: 0 },
      { sourceEventId: 'e3', string: 2, fret: 3 },
      { sourceEventId: 'e4', string: 3, fret: 2 },
    ],
  })

  assert.equal(projection.total, 4)
  assert.equal(projection.assigned, 3)
  assert.equal(projection.remaining, 1)
  assert.equal(projection.invalid, 0)
  assert.deepEqual(projection.measures.map((measure) => measure.measureIndex), [0, 1])
  assert.deepEqual(projection.measures[0].groups.map((group) => group.groupId), ['g1', 'g2'])
  assert.deepEqual(projection.measures[0].groups[0].placements, [
    { sourceEventId: 'e1', string: 1, fret: 0 },
  ])
  assert.deepEqual(projection.measures[1].groups[0].placements, [
    { sourceEventId: 'e3', string: 2, fret: 3 },
    { sourceEventId: 'e4', string: 3, fret: 2 },
  ])
  assert.equal(formatGuitarTabAssignmentProgress(projection, false), '3/4 nota atandı — dışa aktarım için 1 nota kaldı.')
})

test('GTAB-10C projection rejects duplicate event/string conflicts without relaxing export readiness', () => {
  const projection = buildGuitarTabAssignmentProjection({
    sourceSession: sourceSession(),
    assignments: [
      { sourceEventId: 'e1', string: 1, fret: 0 },
      { sourceEventId: 'e1', string: 2, fret: 5 },
      { sourceEventId: 'e3', string: 2, fret: 3 },
      { sourceEventId: 'e4', string: 2, fret: 7 },
      { sourceEventId: 'unknown', string: 6, fret: 1 },
    ],
  })

  assert.equal(projection.assigned, 3)
  assert.equal(projection.invalid, 3)
  assert.match(formatGuitarTabAssignmentProgress(projection, false), /3 hatalı kayıt/u)
  assert.doesNotMatch(formatGuitarTabAssignmentProgress(projection, false), /hazır/u)
})

test('GTAB-10C progress requires editor export authority after all assignments are present', () => {
  const projection = buildGuitarTabAssignmentProjection({
    sourceSession: sourceSession(),
    assignments: [
      { sourceEventId: 'e1', string: 1, fret: 0 },
      { sourceEventId: 'e2', string: 2, fret: 1 },
      { sourceEventId: 'e3', string: 3, fret: 2 },
      { sourceEventId: 'e4', string: 4, fret: 3 },
    ],
  })

  assert.equal(projection.remaining, 0)
  assert.equal(formatGuitarTabAssignmentProgress(projection, false), '4/4 nota atandı — atamalar tamam; editör doğrulaması dışa aktarımı henüz onaylamadı.')
  assert.equal(formatGuitarTabAssignmentProgress(projection, true), '4/4 nota atandı — TAB MusicXML dışa aktarıma hazır.')
})
