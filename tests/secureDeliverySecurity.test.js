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

test('TD-06 provider-neutral server wiring stays isolated and closed by default', () => {
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


test('TD-06 Firebase adapter contains no production project or credential material', () => {
  const source = [
    '../backend/delivery/firebase/firebaseAdmin.js',
    '../backend/delivery/firebase/firebaseTokenVerifier.js',
    '../backend/delivery/firebase/firestoreSecureDeliveryStore.js',
    '../backend/delivery/composition.js',
    '../firebase.json',
    '../firestore.rules',
    '../firestore.indexes.json',
  ].map((path) =>
    readFileSync(new URL(path, import.meta.url), 'utf8'),
  ).join('\n')

  assert.ok(source.includes('demo-seslitab-td06'))
  for (const forbidden of [
    /serviceAccount/i,
    /private_key/i,
    /client_email/i,
    /credential\.cert/i,
    /firebaseapp\.com/i,
    /firebasestorage\.app/i,
  ]) {
    assert.doesNotMatch(source, forbidden)
  }
})

test('TD-06 browser client is provider-neutral and never imports Firebase SDK', () => {
  const client = readFileSync(
    new URL('../src/services/secureDeliveryApiClient.js', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(client, /from\s+['"]firebase(?:\/|['"])/i)
  assert.doesNotMatch(client, /firebase-admin/i)
  assert.doesNotMatch(client, /localStorage|sessionStorage|indexedDB/i)
  assert.doesNotMatch(client, /console\.(?:log|error).*token/i)
})

test('TD-06 is not automatically mounted into the production browser entry points', () => {
  const source = [
    '../main.js',
    '../src/app.js',
    '../src/appShell.js',
  ].map((path) =>
    readFileSync(new URL(path, import.meta.url), 'utf8'),
  ).join('\n')

  assert.doesNotMatch(
    source,
    /secureDeliveryApiClient|createSecureDeliveryApiClient|secure-delivery\/v1/i,
  )
})

test('TD-06 backend remains fail-closed instead of silently activating Firebase composition', () => {
  const server = readFileSync(
    new URL('../backend/server.js', import.meta.url),
    'utf8',
  )

  assert.match(
    server,
    /createUnavailableSecureDeliveryRouter/,
  )
  assert.doesNotMatch(
    server,
    /createSecureDeliveryComposition/,
  )
  assert.doesNotMatch(
    server,
    /firebaseAdmin|firestoreSecureDeliveryStore|firebaseTokenVerifier/,
  )
})

test('TD-06 keeps DURABLY_PREPARED distinct from DELIVERED_TO_STUDENT', () => {
  const sources = [
    '../backend/delivery/services/preparedAssignmentService.js',
    '../backend/delivery/services/teacherDeliveryService.js',
    '../backend/delivery/composition.js',
    '../src/services/secureDeliveryApiClient.js',
  ].map((path) =>
    readFileSync(new URL(path, import.meta.url), 'utf8'),
  ).join('\n')

  assert.doesNotMatch(
    sources,
    /prepared[^\n]{0,40}(?:means|=|is)\s*delivered/i,
  )
})
