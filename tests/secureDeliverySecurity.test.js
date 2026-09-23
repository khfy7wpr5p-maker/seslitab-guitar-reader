import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const deliveryPaths = [
  '../backend/delivery/authorization/secureDeliveryAuthorization.js',
  '../backend/delivery/repositories/secureDeliveryStore.js',
  '../backend/delivery/repositories/inMemorySecureDeliveryStore.js',
  '../backend/delivery/services/preparedAssignmentService.js',
  '../backend/delivery/services/teacherDeliveryService.js',
  '../backend/delivery/services/studentDeliveryReadService.js',
  '../backend/delivery/config.js',
  '../backend/delivery/http/bearerToken.js',
  '../backend/delivery/http/errorResponse.js',
  '../backend/delivery/http/router.js',
]

test('TD-06 server wiring is isolated, closed by default and contains no Firebase/credential literals before Gate A', () => {
  const server = readFileSync(
    new URL('../backend/server.js', import.meta.url),
    'utf8',
  )
  assert.match(server, /api\/secure-delivery\/v1/)
  assert.match(server, /SECURE_DELIVERY/i)

  const sources = deliveryPaths.map((path) =>
    readFileSync(new URL(path, import.meta.url), 'utf8'),
  ).join('\n')

  for (const forbidden of [
    /localStorage/i,
    /sessionStorage/i,
    /serviceAccount/i,
    /private_key/i,
    /firebase-admin/i,
    /firebaseapp\.com/i,
    /googleapis\.com\/identitytoolkit/i,
    /backend\/jobs|jobManager|musicXmlStorage|omrWorker/i,
  ]) {
    assert.doesNotMatch(sources, forbidden)
  }
})

test('TD-06 HTTP source never persists or logs Authorization tokens', () => {
  const source = [
    '../backend/delivery/http/bearerToken.js',
    '../backend/delivery/http/errorResponse.js',
    '../backend/delivery/http/router.js',
  ].map((path) =>
    readFileSync(new URL(path, import.meta.url), 'utf8'),
  ).join('\n')

  assert.doesNotMatch(source, /console\.(?:log|error).*token/i)
  assert.doesNotMatch(source, /authorization.*(?:writeFile|setItem|save|persist)/i)
})
