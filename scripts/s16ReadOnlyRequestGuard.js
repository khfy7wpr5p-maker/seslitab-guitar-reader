function assertCdp(value) {
  if (!value || typeof value.on !== 'function' || typeof value.send !== 'function') {
    throw new TypeError('S16 read-only request guard requires a CDP connection.')
  }
}

export function createS16ReadOnlyRequestGuard(cdp) {
  assertCdp(cdp)
  const pending = new Set()
  let violation = null
  let handlerFailure = null

  const track = (operation) => {
    pending.add(operation)
    operation
      .catch((error) => {
        handlerFailure ??= error
      })
      .finally(() => pending.delete(operation))
    return operation
  }

  cdp.on('Fetch.requestPaused', ({ requestId, request }) => {
    const method = String(request?.method ?? '').toUpperCase()
    const url = String(request?.url ?? '')
    if (method === 'GET') {
      return track(cdp.send('Fetch.continueRequest', { requestId }))
    }

    violation ??= `${method || 'UNKNOWN'} ${url}`.trim()
    return track(cdp.send('Fetch.failRequest', {
      requestId,
      errorReason: 'BlockedByClient',
    }))
  })

  const assertSafe = () => {
    if (violation) {
      throw new Error(`S16 production probe blocked a non-GET request: ${violation}`)
    }
    if (handlerFailure) {
      throw new Error(`S16 production probe request interception failed: ${handlerFailure.message}`)
    }
  }

  return Object.freeze({
    async enable() {
      await cdp.send('Network.setBypassServiceWorker', { bypass: true })
      await cdp.send('Fetch.enable', {
        patterns: [{ urlPattern: '*', requestStage: 'Request' }],
      })
    },
    assertSafe,
    async settle() {
      await Promise.allSettled([...pending])
      assertSafe()
    },
  })
}
