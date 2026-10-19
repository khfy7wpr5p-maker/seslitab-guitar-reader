import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { discoverBrowserPage } from './support/browserFixture.js'

const listen = (server, port = 0) => new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(port, '127.0.0.1', resolve)
})
const close = (server) => new Promise((resolve) => server.close(resolve))

test('browser discovery survives a real refused connection and waits for a usable page target', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'cdp-startup-test-'))
  const portFile = join(profile, 'DevToolsActivePort')
  let responses = 0
  const server = createServer((_req, res) => {
    responses += 1
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(responses === 1 ? [] : [{ type: 'page', webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/page/ready' }]))
  })
  await listen(server)
  const port = server.address().port
  await close(server)
  // Reproduce the CI ordering: the port file is visible before the listener.
  writeFileSync(portFile, `${port}\n/devtools/browser/test`)
  let refused = 0
  try {
    const page = await discoverBrowserPage(portFile, {
      deadline: Date.now() + 5000,
      async fetchImpl(...args) {
        try { return await fetch(...args) } catch (error) {
          assert.equal(error.cause?.code, 'ECONNREFUSED')
          refused += 1
          await listen(server, port)
          throw error
        }
      },
    })
    assert.equal(refused, 1)
    assert.equal(page.webSocketDebuggerUrl, 'ws://127.0.0.1/devtools/page/ready')
    assert.equal(responses, 2)
  } finally {
    await close(server)
    rmSync(profile, { recursive: true, force: true })
  }
})

test('browser discovery does not hide HTTP errors', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'cdp-http-test-'))
  const portFile = join(profile, 'DevToolsActivePort')
  writeFileSync(portFile, '12345\n')
  let requests = 0
  try {
    await assert.rejects(discoverBrowserPage(portFile, {
      deadline: Date.now() + 5000,
      async fetchImpl() { requests += 1; return new Response('', { status: 403 }) },
    }), /CDP discovery: HTTP 403/)
    assert.equal(requests, 1)
  } finally { rmSync(profile, { recursive: true, force: true }) }
})

test('browser discovery waits for a complete port file', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'cdp-port-test-'))
  const portFile = join(profile, 'DevToolsActivePort')
  const server = createServer((_req, res) => res.end(JSON.stringify([
    { type: 'page', webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/page/ready' },
  ])))
  await listen(server)
  writeFileSync(portFile, '')
  const publish = setTimeout(() => writeFileSync(portFile, `${server.address().port}\n`), 15)
  try {
    const page = await discoverBrowserPage(portFile, { deadline: Date.now() + 5000 })
    assert.equal(page.type, 'page')
  } finally {
    clearTimeout(publish)
    await close(server)
    rmSync(profile, { recursive: true, force: true })
  }
})

test('browser discovery bounds an unresponsive endpoint by the startup deadline', { timeout: 2000 }, async () => {
  const profile = mkdtempSync(join(tmpdir(), 'cdp-timeout-test-'))
  const portFile = join(profile, 'DevToolsActivePort')
  const server = createServer(() => {})
  await listen(server)
  writeFileSync(portFile, `${server.address().port}\n`)
  try {
    await assert.rejects(discoverBrowserPage(portFile, {
      deadline: Date.now() + 60,
    }), /CDP discovery timed out/)
  } finally {
    server.closeAllConnections()
    await close(server)
    rmSync(profile, { recursive: true, force: true })
  }
})

test('browser discovery checks process failure even when a port file already exists', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'cdp-exit-test-'))
  const portFile = join(profile, 'DevToolsActivePort')
  writeFileSync(portFile, '12345\n')
  try {
    await assert.rejects(discoverBrowserPage(portFile, {
      deadline: Date.now() + 1000,
      assertRunning() { throw new Error('browser exited') },
      async fetchImpl() { throw new Error('must not fetch') },
    }), /browser exited/)
  } finally { rmSync(profile, { recursive: true, force: true }) }
})
