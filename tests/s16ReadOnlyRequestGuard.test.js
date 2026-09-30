import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

const GUARD_MODULE_URL = new URL('../scripts/s16ReadOnlyRequestGuard.js', import.meta.url)
const GUARD_EXISTS = existsSync(GUARD_MODULE_URL)

function controlledCdp() {
  const listeners = new Map()
  const commands = []
  return {
    commands,
    on(method, listener) {
      listeners.set(method, listener)
    },
    async send(method, params = {}) {
      commands.push({ method, params })
      return {}
    },
    async emit(method, params) {
      await listeners.get(method)?.(params)
    },
  }
}

test('S16 read-only request guard module exists', () => {
  assert.equal(GUARD_EXISTS, true)
})

test('S16 request guard blocks non-GET before it can continue', { skip: !GUARD_EXISTS }, async () => {
  const { createS16ReadOnlyRequestGuard } = await import(GUARD_MODULE_URL)
  const cdp = controlledCdp()
  const guard = createS16ReadOnlyRequestGuard(cdp)

  await guard.enable()
  await cdp.emit('Fetch.requestPaused', {
    requestId: 'write-1',
    request: { method: 'POST', url: 'https://seslitab-app.onrender.com/write' },
  })

  assert.deepEqual(cdp.commands.slice(0, 2), [
    { method: 'Network.setBypassServiceWorker', params: { bypass: true } },
    {
      method: 'Fetch.enable',
      params: { patterns: [{ urlPattern: '*', requestStage: 'Request' }] },
    },
  ])
  assert.deepEqual(cdp.commands.at(-1), {
    method: 'Fetch.failRequest',
    params: { requestId: 'write-1', errorReason: 'BlockedByClient' },
  })
  assert.throws(
    () => guard.assertSafe(),
    /blocked a non-GET request: POST https:\/\/seslitab-app\.onrender\.com\/write/i,
  )
})

test('S16 request guard continues GET traffic and remains safe', { skip: !GUARD_EXISTS }, async () => {
  const { createS16ReadOnlyRequestGuard } = await import(GUARD_MODULE_URL)
  const cdp = controlledCdp()
  const guard = createS16ReadOnlyRequestGuard(cdp)

  await guard.enable()
  await cdp.emit('Fetch.requestPaused', {
    requestId: 'read-1',
    request: { method: 'GET', url: 'https://seslitab-app.onrender.com/app.js' },
  })

  assert.deepEqual(cdp.commands.at(-1), {
    method: 'Fetch.continueRequest',
    params: { requestId: 'read-1' },
  })
  assert.doesNotThrow(() => guard.assertSafe())
})
