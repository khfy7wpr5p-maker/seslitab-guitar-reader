import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { createBrowserPipeConnection } from './support/browserFixture.js'

function harness(t, deadline = Date.now() + 5000) {
  const child = new EventEmitter()
  const writer = new PassThrough()
  const reader = new PassThrough()
  child.stdio = [null, null, null, writer, reader]
  const sent = []
  writer.on('data', (chunk) => sent.push(JSON.parse(chunk.toString().replace(/\0$/, ''))))
  const connection = createBrowserPipeConnection(child, { deadline })
  t.after(() => connection.close())
  return { child, writer, reader, sent, connection }
}

test('pipe preserves fragmented UTF-8 JSON and correlates multiple replies by id', async (t) => {
  const { reader, sent, connection } = harness(t)
  const version = connection.send('Browser.getVersion')
  const page = connection.send('Runtime.evaluate', { expression: '1' }, 'page-session')
  assert.deepEqual(sent, [
    { id: 1, method: 'Browser.getVersion', params: {} },
    { id: 2, method: 'Runtime.evaluate', params: { expression: '1' }, sessionId: 'page-session' },
  ])
  const bytes = Buffer.from(JSON.stringify({ id: 2, result: { text: 'Önder 🎸' } }) + '\0'
    + JSON.stringify({ method: 'Page.loadEventFired', params: {} }) + '\0'
    + JSON.stringify({ id: 1, result: { product: 'Chrome/test' } }) + '\0')
  const split = bytes.indexOf(Buffer.from('Ö')) + 1
  reader.write(bytes.subarray(0, split))
  reader.write(bytes.subarray(split))
  assert.deepEqual(await page, { text: 'Önder 🎸' })
  assert.deepEqual(await version, { product: 'Chrome/test' })
})

test('pipe protocol error rejects only its exact pending command', async (t) => {
  const { reader, connection } = harness(t)
  const invalid = connection.send('Unknown.method')
  const ready = connection.send('Browser.getVersion')
  const rejected = assert.rejects(invalid, /Unknown.method failed \(-32601\)/)
  reader.write(JSON.stringify({ id: 1, error: { code: -32601 } }) + '\0')
  reader.write(JSON.stringify({ id: 2, result: { product: 'Chrome/test' } }) + '\0')
  await rejected
  assert.deepEqual(await ready, { product: 'Chrome/test' })
})

test('pipe rejects malformed frames and retires all pending commands', async (t) => {
  const { reader, connection } = harness(t)
  const first = connection.send('Browser.getVersion')
  const second = connection.send('Target.createTarget')
  const rejected = Promise.all([
    assert.rejects(first, /Malformed CDP pipe response/),
    assert.rejects(second, /Malformed CDP pipe response/),
  ])
  reader.write('not-json\0')
  await rejected
  await assert.rejects(connection.send('Page.enable'), /pipe is closed/)
})

test('pipe closes pending commands immediately when Chromium exits', async (t) => {
  const { child, connection } = harness(t)
  const pending = connection.send('Browser.getVersion')
  const rejected = assert.rejects(pending, /Chromium exited.*code=7/)
  child.emit('exit', 7, null)
  await rejected
})

for (const source of ['writer', 'reader', 'child']) {
  test(`pipe reports ${source} failure and cancels pending work`, async (t) => {
    const h = harness(t)
    const pending = h.connection.send('Browser.getVersion')
    const rejected = assert.rejects(pending, /CDP pipe transport failed/)
    h[source].emit('error', new Error('controlled failure'))
    await rejected
  })
}

test('pipe EOF rejects unfinished commands instead of manufacturing success', async (t) => {
  const { reader, connection } = harness(t)
  const pending = connection.send('Target.createTarget')
  const rejected = assert.rejects(pending, /pipe ended before proof completion/)
  reader.end()
  await rejected
})

test('unresponsive pipe respects the shared proof deadline and identifies the command', async (t) => {
  const { writer, reader, connection } = harness(t, Date.now() + 40)
  await assert.rejects(connection.send('Browser.getVersion'), /Browser.getVersion timed out/)
  assert.equal(writer.destroyed, true)
  assert.equal(reader.destroyed, true)
})

test('expired proof cannot enqueue a new command', async (t) => {
  const { sent, connection } = harness(t, Date.now() - 1)
  await assert.rejects(connection.send('Page.navigate'), /exceeded the proof deadline/)
  assert.deepEqual(sent, [])
})
