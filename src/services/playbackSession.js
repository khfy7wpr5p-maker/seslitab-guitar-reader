// Package 3B — deterministic playback session state management.
//
// This module owns lifecycle truth only. It does not replace the proven Web
// Audio scheduler. Audio/TTS adapters are injected so later Package 3 stages
// can wire one accessible session without coupling state transitions to a
// particular browser/audio implementation.

export const PLAYBACK_STATES = Object.freeze({
  IDLE: 'idle',
  PLAYING: 'playing',
  PAUSED: 'paused',
})

const REQUIRED_ADAPTER_METHODS = Object.freeze(['start', 'pause', 'resume', 'stop'])

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new TypeError('Playback adapter is required.')
  }
  for (const method of REQUIRED_ADAPTER_METHODS) {
    if (typeof adapter[method] !== 'function') {
      throw new TypeError(`Playback adapter must implement ${method}().`)
    }
  }
}

function frozenSnapshot(state, sessionId, payload) {
  return Object.freeze({
    state,
    sessionId,
    hasActiveSession: state !== PLAYBACK_STATES.IDLE,
    payload: state === PLAYBACK_STATES.IDLE ? null : payload,
  })
}

/**
 * Create a single-session playback lifecycle manager.
 *
 * Adapter contract:
 * - start(payload, { sessionId, onEnded }) starts and returns promptly.
 * - pause({ sessionId }), resume({ sessionId }), stop({ sessionId }) perform
 *   the matching operation and resolve only when the operation is accepted.
 * - onEnded() must be called by the adapter only for natural completion.
 *
 * Transitions are serialized. A newer start always stops an older active
 * session before becoming active. Failed adapter transitions do not fabricate
 * a state change.
 */
export function createPlaybackSessionManager(adapter) {
  validateAdapter(adapter)

  let state = PLAYBACK_STATES.IDLE
  let activeSessionId = 0
  let activePayload = null
  let transitionQueue = Promise.resolve()

  function snapshot() {
    return frozenSnapshot(state, activeSessionId, activePayload)
  }

  function enqueue(operation) {
    const run = transitionQueue.then(operation, operation)
    transitionQueue = run.catch(() => {})
    return run
  }

  async function stopCurrent() {
    if (state === PLAYBACK_STATES.IDLE) return false
    const sessionId = activeSessionId
    await adapter.stop({ sessionId })
    if (activeSessionId === sessionId) {
      state = PLAYBACK_STATES.IDLE
      activePayload = null
    }
    return true
  }

  function handleNaturalEnd(sessionId) {
    void enqueue(async () => {
      if (sessionId !== activeSessionId || state === PLAYBACK_STATES.IDLE) return
      state = PLAYBACK_STATES.IDLE
      activePayload = null
    })
  }

  return Object.freeze({
    getSnapshot: snapshot,

    start(payload) {
      return enqueue(async () => {
        if (state !== PLAYBACK_STATES.IDLE) {
          await stopCurrent()
        }

        const sessionId = activeSessionId + 1
        activeSessionId = sessionId
        activePayload = payload

        try {
          await adapter.start(payload, {
            sessionId,
            onEnded: () => handleNaturalEnd(sessionId),
          })
          state = PLAYBACK_STATES.PLAYING
        } catch (error) {
          if (activeSessionId === sessionId) {
            state = PLAYBACK_STATES.IDLE
            activePayload = null
          }
          throw error
        }

        return snapshot()
      })
    },

    pause() {
      return enqueue(async () => {
        if (state !== PLAYBACK_STATES.PLAYING) return snapshot()
        const sessionId = activeSessionId
        await adapter.pause({ sessionId })
        if (activeSessionId === sessionId) state = PLAYBACK_STATES.PAUSED
        return snapshot()
      })
    },

    resume() {
      return enqueue(async () => {
        if (state !== PLAYBACK_STATES.PAUSED) return snapshot()
        const sessionId = activeSessionId
        await adapter.resume({ sessionId })
        if (activeSessionId === sessionId) state = PLAYBACK_STATES.PLAYING
        return snapshot()
      })
    },

    stop() {
      return enqueue(async () => {
        await stopCurrent()
        return snapshot()
      })
    },
  })
}
