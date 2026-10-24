import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer, request } from 'node:http'
import { deflateSync } from 'node:zlib'

const require = createRequire(import.meta.url)
const parser = require(process.argv[2]).json()
const first = Buffer.concat([deflateSync('{"accepted":true}'), Buffer.from([0])])
const trailing = Buffer.alloc(64 * 1024, 0x58)
let upload
const server = createServer((req, res) => {
  if (req.method === 'GET') { res.end('healthy'); return }
  parser(req, res, error => {
    if (error) { res.writeHead(400).end(error.type); return }
    // Deliver trailing bytes only after the valid compressed frame was parsed.
    req.once('end', () => res.end(JSON.stringify(req.body)))
    upload.end(trailing)
  })
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const address = { host: '127.0.0.1', port: server.address().port, agent: false }
try {
  const body = await new Promise((resolve, reject) => {
    upload = request({ ...address, method: 'POST', headers: {
      'content-type': 'application/json', 'content-encoding': 'deflate',
      'content-length': first.length + trailing.length,
    } }, res => {
      let value = ''
      res.setEncoding('utf8').on('data', chunk => { value += chunk })
      res.on('end', () => res.statusCode === 200 ? resolve(value) : reject(new Error(value)))
    })
    upload.on('error', reject)
    upload.setTimeout(3000, () => upload.destroy(new Error('compressed request did not finish')))
    upload.write(first)
  })
  assert.deepEqual(JSON.parse(body), { accepted: true })
  const health = await new Promise((resolve, reject) => {
    const probe = request(address, res => {
      let value = ''
      res.setEncoding('utf8').on('data', chunk => { value += chunk })
      res.on('end', () => resolve(value))
    })
    probe.on('error', reject)
    probe.end()
  })
  assert.equal(health, 'healthy')
  process.stdout.write('compressed JSON preserved; trailing bytes drained; server healthy\n')
} finally {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
