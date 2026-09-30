import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { once } from 'node:events'

const GUARD_MODULE_URL = new URL('../scripts/s16ReadOnlyRequestGuard.js', import.meta.url)
const PROBE_MODULE_URL = new URL('../scripts/verifyS16DeployedCompositionBrowser.js', import.meta.url)
const GUARD_EXISTS = existsSync(GUARD_MODULE_URL)

function chromeBinary() {
  for (const candidate of [
    process.env.CHROME_BIN,
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
  ].filter(Boolean)) {
    if (spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0) return candidate
  }
  return null
}

const chrome = chromeBinary()

test('S16 browser guard prevents a controlled POST from reaching the server', {
  skip: !GUARD_EXISTS || !chrome,
  timeout: 20000,
}, async () => {
  let postCount = 0
  const server = createServer((request, response) => {
    if (request.method === 'POST') {
      postCount += 1
      response.writeHead(204).end()
      return
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><script>
      fetch('/write', { method: 'POST', body: 'must-not-arrive' }).catch(() => {});
    </script>`)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  try {
    const { runBrowserProbe } = await import(PROBE_MODULE_URL)
    const address = server.address()
    await assert.rejects(
      runBrowserProbe({ chrome, target: new URL(`http://127.0.0.1:${address.port}/`) }),
      /blocked a non-GET request: POST/i,
    )
    assert.equal(postCount, 0)
  } finally {
    server.close()
    await once(server, 'close')
  }
})
