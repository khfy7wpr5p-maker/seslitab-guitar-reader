import test from 'node:test'
import assert from 'node:assert/strict'

import { createGuitarTabRendererTargetResolver } from '../src/services/guitarTabSourceIdentity.js'

function sourceSession(events) {
  return {
    sessionId: 'source:test',
    sourceFingerprint: 'test',
    events,
    groups: [],
  }
}

function event(sourceEventId, overrides = {}) {
  return {
    sourceEventId,
    partId: 'P1',
    partIndex: 0,
    measureIndex: 0,
    voice: '1',
    staff: '1',
    onsetDivisions: 0,
    divisions: 1,
    sourceOrder: 0,
    ...overrides,
  }
}

function canonical(overrides = {}) {
  return {
    partId: 'P1',
    partIndex: 0,
    measureIndex: 0,
    measureKey: 'P1:0',
    voice: 1,
    staff: 1,
    startBeat: 0,
    isRest: false,
    ...overrides,
  }
}

test('GTAB-09C derives renderer noteIndex from canonical traversal including rests', () => {
  const resolver = createGuitarTabRendererTargetResolver(
    sourceSession([
      event('a', { onsetDivisions: 0, sourceOrder: 0 }),
      event('b', { onsetDivisions: 2, sourceOrder: 2 }),
    ]),
    [
      canonical({ startBeat: 0 }),
      canonical({ startBeat: 1, isRest: true }),
      canonical({ startBeat: 2 }),
    ],
  )

  assert.deepEqual(resolver.resolve('a'), {
    partId: 'P1',
    measureIndex: 0,
    noteIndex: 0,
    voice: 1,
  })
  assert.deepEqual(resolver.resolve('b'), {
    partId: 'P1',
    measureIndex: 0,
    noteIndex: 2,
    voice: 1,
  })
  assert.equal(resolver.matchedCount, 2)
})

test('GTAB-09C pairs simultaneous notes only by exact structural bucket and source order', () => {
  const resolver = createGuitarTabRendererTargetResolver(
    sourceSession([
      event('upper', { voice: '2', onsetDivisions: 4, divisions: 2, sourceOrder: 4 }),
      event('lower', { voice: '2', onsetDivisions: 4, divisions: 2, sourceOrder: 5 }),
    ]),
    [
      canonical({ voice: 2, startBeat: 2 }),
      canonical({ voice: 2, startBeat: 2 }),
    ],
  )

  assert.deepEqual(resolver.resolve('upper'), {
    partId: 'P1',
    measureIndex: 0,
    noteIndex: 0,
    voice: 2,
  })
  assert.deepEqual(resolver.resolve('lower'), {
    partId: 'P1',
    measureIndex: 0,
    noteIndex: 1,
    voice: 2,
  })
})

test('GTAB-09C abstains for an entire structural bucket when canonical evidence is not one-to-one', () => {
  const resolver = createGuitarTabRendererTargetResolver(
    sourceSession([
      event('first', { sourceOrder: 0 }),
      event('second', { sourceOrder: 1 }),
    ]),
    [canonical()],
  )

  assert.equal(resolver.resolve('first'), null)
  assert.equal(resolver.resolve('second'), null)
  assert.equal(resolver.matchedCount, 0)
})

test('GTAB-10B partIndex is required for exact source-to-canonical identity', () => {
  const mismatch = createGuitarTabRendererTargetResolver(
    sourceSession([
      event('wrong-part-index', { partId: 'P1', partIndex: 1 }),
    ]),
    [canonical({ partId: 'P1', partIndex: 0 })],
  )
  assert.equal(mismatch.resolve('wrong-part-index'), null)
  assert.equal(mismatch.matchedCount, 0)

  const exact = createGuitarTabRendererTargetResolver(
    sourceSession([
      event('exact-part-index', { partId: 'P1', partIndex: 0 }),
    ]),
    [canonical({ partId: 'P1', partIndex: 0 })],
  )
  assert.notEqual(exact.resolve('exact-part-index'), null)
  assert.equal(exact.matchedCount, 1)
})
