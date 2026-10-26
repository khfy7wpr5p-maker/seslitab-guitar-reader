import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const firebaseRequire = createRequire(require.resolve('firebase-tools/package.json'))
const storageRequire = createRequire(require.resolve('@google-cloud/storage'))
const pubsubRequire = createRequire(firebaseRequire.resolve('@google-cloud/pubsub/package.json'))
const gaxiosRequire = createRequire(storageRequire.resolve('gaxios'))

async function localEndpoint(t, handler) {
  const server = createServer(handler)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve) }))
  return `http://127.0.0.1:${server.address().port}`
}

test('UUID consumed by gaxios rejects undersized output buffers and supports CommonJS and ESM', async () => {
  const uuid = gaxiosRequire('uuid')
  for (const name of ['v3', 'v5']) {
    assert.throws(() => uuid[name]('score', uuid[name].DNS, Buffer.alloc(1)), RangeError)
  }
  assert.match(uuid.v4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  const manifestPath = gaxiosRequire.resolve('uuid/package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const esmPath = resolve(dirname(manifestPath), manifest.exports['.'].node.import)
  const esm = await import(pathToFileURL(esmPath).href)
  assert.equal(esm.v5('score', esm.v5.DNS), uuid.v5('score', uuid.v5.DNS))
})

test('Storage gaxios consumer sends UUID-delimited multipart data without changing payload', { timeout: 10000 }, async (t) => {
  let received
  const endpoint = await localEndpoint(t, async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    received = { type: req.headers['content-type'], body: Buffer.concat(chunks).toString() }
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"accepted":true}')
  })
  const gaxios = storageRequire('gaxios')
  const response = await gaxios.request({
    url: endpoint, method: 'POST', noProxy: ['127.0.0.1'],
    multipart: [{ headers: { 'Content-Type': 'application/json' }, content: '{"name":"score.xml"}' },
      { headers: { 'Content-Type': 'application/xml' }, content: '<score-partwise/>' }],
  })
  assert.deepEqual(response.data, { accepted: true })
  const boundary = received.type.match(/boundary=([0-9a-f-]+)/)?.[1]
  assert.ok(boundary)
  assert.ok(received.body.includes(`--${boundary}`))
  assert.ok(received.body.includes('{"name":"score.xml"}'))
  assert.ok(received.body.includes('<score-partwise/>'))
})

test('Google Auth and Storage consumers preserve authenticated metadata requests', { timeout: 10000 }, async (t) => {
  const requests = []
  const endpoint = await localEndpoint(t, (req, res) => {
    requests.push({ url: req.url, authorization: req.headers.authorization })
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"name":"score.xml","bucket":"qualification","size":"42"}')
  })
  const { OAuth2Client } = storageRequire('google-auth-library')
  const authClient = new OAuth2Client()
  authClient.setCredentials({ access_token: 'local-qualification-only', expiry_date: Date.now() + 3600000 })
  const authResponse = await authClient.request({ url: endpoint + '/auth', noProxy: ['127.0.0.1'] })
  assert.equal(authResponse.data.size, '42')
  const { Storage } = require('@google-cloud/storage')
  const storage = new Storage({ projectId: 'demo-qualification', apiEndpoint: endpoint,
    authClient, useAuthWithCustomEndpoint: true, retryOptions: { autoRetry: false } })
  const [metadata] = await storage.bucket('qualification').file('score.xml').getMetadata()
  assert.equal(metadata.name, 'score.xml')
  assert.equal(metadata.size, '42')
  assert.ok(requests.some((req) => req.url.startsWith('/storage/v1/b/qualification/o/score.xml')))
  assert.ok(requests.every((req) => req.authorization === 'Bearer local-qualification-only'))
})

test('PubSub telemetry retains trace context round-trip with the patched Core API', async () => {
  const telemetry = pubsubRequire('./build/src/telemetry-tracing.js')
  const api = pubsubRequire('@opentelemetry/api')
  const spanContext = { traceId: '12345678901234567890123456789012', spanId: '1234567890123456', traceFlags: 1 }
  telemetry.setGloballyEnabled(true)
  try {
    const message = {}
    telemetry.injectSpan(api.trace.wrapSpanContext(spanContext), message)
    assert.ok(telemetry.containsSpanContext(message))
    delete message.parentSpan
    const received = telemetry.extractSpan(message, 'qualification-subscription')
    assert.deepEqual(received.spanContext(), { ...spanContext, isRemote: true })
    const { PubSub } = firebaseRequire('@google-cloud/pubsub')
    const client = new PubSub({ projectId: 'demo-qualification' })
    try {
      assert.equal(client.topic('qualification').name, 'projects/demo-qualification/topics/qualification')
    } finally { await client.close() }
  } finally { telemetry.setGloballyEnabled(false) }
})

test('Core rejects an oversized W3C baggage entry instead of retaining unbounded input', () => {
  const { W3CBaggagePropagator } = pubsubRequire('@opentelemetry/core')
  const api = pubsubRequire('@opentelemetry/api')
  const carrier = { baggage: 'score=' + 'x'.repeat(100000) }
  const context = new W3CBaggagePropagator().extract(api.ROOT_CONTEXT, carrier, api.defaultTextMapGetter)
  assert.equal(api.propagation.getBaggage(context)?.getEntry('score'), undefined)
})
