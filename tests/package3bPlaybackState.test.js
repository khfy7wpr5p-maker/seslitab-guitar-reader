import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PLAYBACK_STATES,
  createPlaybackSessionManager,
} from '../src/services/playbackSession.js'

function createAdapter() {
  const calls = []
  const endings = new Map()
  return {
    calls,
    endings,
    async start(payload, control) {
      calls.push(['start', control.sessionId, payload])
      endings.set(control.sessionId, control.onEnded)
    },
    async pause(control) { calls.push(['pause', control.sessionId]) },
    async resume(control) { calls.push(['resume', control.sessionId]) },
    async stop(control) { calls.push(['stop', control.sessionId]) },
  }
}

test('Package 3B state vocabulary is immutable and starts idle', () => {
  assert.ok(Object.isFrozen(PLAYBACK_STATES))
  const manager = createPlaybackSessionManager(createAdapter())
  const state = manager.getSnapshot()
  assert.deepEqual(state, {
    state: 'idle', sessionId: 0, hasActiveSession: false, payload: null,
  })
  assert.ok(Object.isFrozen(state))
})

test('Package 3B performs play pause resume stop in truthful order', async () => {
  const adapter = createAdapter()
  const manager = createPlaybackSessionManager(adapter)

  assert.equal((await manager.start({ score: 'A' })).state, 'playing')
  assert.equal((await manager.pause()).state, 'paused')
  assert.equal((await manager.resume()).state, 'playing')
  assert.equal((await manager.stop()).state, 'idle')

  assert.deepEqual(adapter.calls.map((entry) => entry.slice(0, 2)), [
    ['start', 1], ['pause', 1], ['resume', 1], ['stop', 1],
  ])
})

test('Package 3B ignores invalid lifecycle requests instead of inventing transitions', async () => {
  const adapter = createAdapter()
  const manager = createPlaybackSessionManager(adapter)

  assert.equal((await manager.pause()).state, 'idle')
  assert.equal((await manager.resume()).state, 'idle')
  assert.equal((await manager.stop()).state, 'idle')
  assert.deepEqual(adapter.calls, [])

  await manager.start('score')
  await manager.resume()
  assert.equal(manager.getSnapshot().state, 'playing')
  assert.deepEqual(adapter.calls.map((entry) => entry[0]), ['start'])
})

test('Package 3B enforces one active session by stopping the old session before replacement', async () => {
  const adapter = createAdapter()
  const manager = createPlaybackSessionManager(adapter)

  await manager.start('first')
  const second = await manager.start('second')

  assert.equal(second.state, 'playing')
  assert.equal(second.sessionId, 2)
  assert.equal(second.payload, 'second')
  assert.deepEqual(adapter.calls.map((entry) => entry.slice(0, 2)), [
    ['start', 1], ['stop', 1], ['start', 2],
  ])
})

test('Package 3B serializes overlapping start requests deterministically', async () => {
  const adapter = createAdapter()
  let releaseFirst
  adapter.start = async (payload, control) => {
    adapter.calls.push(['start', control.sessionId, payload])
    adapter.endings.set(control.sessionId, control.onEnded)
    if (payload === 'first') await new Promise((resolve) => { releaseFirst = resolve })
  }

  const manager = createPlaybackSessionManager(adapter)
  const first = manager.start('first')
  await Promise.resolve()
  const second = manager.start('second')
  releaseFirst()
  await first
  const finalState = await second

  assert.equal(finalState.sessionId, 2)
  assert.equal(finalState.payload, 'second')
  assert.deepEqual(adapter.calls.map((entry) => entry.slice(0, 2)), [
    ['start', 1], ['stop', 1], ['start', 2],
  ])
})

test('Package 3B natural completion clears only the matching active session', async () => {
  const adapter = createAdapter()
  const manager = createPlaybackSessionManager(adapter)

  await manager.start('first')
  const staleEnd = adapter.endings.get(1)
  await manager.start('second')

  staleEnd()
  const afterStaleEnd = await manager.whenSettled()
  assert.equal(afterStaleEnd.sessionId, 2)
  assert.equal(afterStaleEnd.state, 'playing')

  adapter.endings.get(2)()
  const afterCurrentEnd = await manager.whenSettled()
  assert.equal(afterCurrentEnd.sessionId, 2)
  assert.equal(afterCurrentEnd.state, 'idle')
})

test('Package 3B adapter failures do not fabricate a successful state transition', async () => {
  const adapter = createAdapter()
  adapter.pause = async () => { throw new Error('pause failed') }
  const manager = createPlaybackSessionManager(adapter)
  await manager.start('score')

  await assert.rejects(manager.pause(), /pause failed/)
  assert.equal(manager.getSnapshot().state, PLAYBACK_STATES.PLAYING)
})

test('Package 3B fails closed for incomplete adapters', () => {
  assert.throws(() => createPlaybackSessionManager(null), /adapter is required/i)
  assert.throws(
    () => createPlaybackSessionManager({ start() {}, pause() {}, resume() {} }),
    /must implement stop/i,
  )
})
