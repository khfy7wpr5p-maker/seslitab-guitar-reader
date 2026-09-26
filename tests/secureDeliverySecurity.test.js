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

test('SES-15 backend remains fail-closed behind a dedicated production activation boundary', () => {
  const server = readFileSync(
    new URL('../backend/server.js', import.meta.url),
    'utf8',
  )
  const boundary = readFileSync(
    new URL(
      '../backend/delivery/production/secureDeliveryProductionBoundary.js',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(
    server,
    /createSecureDeliveryProductionBoundary/,
  )
  assert.doesNotMatch(
    server,
    /createUnavailableSecureDeliveryRouter/,
  )
  assert.doesNotMatch(
    server,
    /firebaseAdmin|firestoreSecureDeliveryStore|firebaseTokenVerifier/,
  )

  assert.match(
    boundary,
    /SECURE_DELIVERY_PRODUCTION_ACTIVATION/,
  )
  assert.match(
    boundary,
    /SECURE_DELIVERY_FIREBASE_PROJECT_ID/,
  )
  assert.match(
    boundary,
    /read-only-requires-writes-disabled/,
  )
  assert.match(
    boundary,
    /createUnavailableSecureDeliveryRouter/,
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

test('SES-14 provisioning stays non-HTTP, secret-free and production-disabled', () => {
  const provisioningSource = [
    '../src/services/secureDeliveryProvisioning.js',
    '../backend/delivery/provisioning/secureDeliveryProvisioningDomain.js',
    '../backend/delivery/provisioning/secureDeliveryProvisioningStore.js',
    '../backend/delivery/provisioning/secureDeliveryProvisioningService.js',
    '../backend/delivery/provisioning/firestoreSecureDeliveryProvisioningStore.js',
    '../backend/delivery/provisioning/secureDeliveryProvisioningManifest.js',
    '../scripts/secureDeliveryProvisioning.mjs',
  ].map((path) =>
    readFileSync(
      new URL(path, import.meta.url),
      'utf8',
    ),
  ).join('\n')

  for (const forbidden of [
    /serviceAccount/i,
    /private_key/i,
    /client_email/i,
    /credential\.cert/i,
    /password/i,
    /raw ID token/i,
    /BEGIN PRIVATE KEY/i,
  ]) {
    assert.doesNotMatch(
      provisioningSource,
      forbidden,
    )
  }

  const server = readFileSync(
    new URL(
      '../backend/server.js',
      import.meta.url,
    ),
    'utf8',
  )
  const router = readFileSync(
    new URL(
      '../backend/delivery/http/router.js',
      import.meta.url,
    ),
    'utf8',
  )

  assert.doesNotMatch(
    server + '\n' + router,
    /secureDeliveryProvisioning|provisioning\/v1|provisioning.*router/i,
  )

  const cliContract = [
    '../scripts/secureDeliveryProvisioning.mjs',
    '../backend/delivery/provisioning/secureDeliveryProvisioningManifest.js',
  ].map((path) =>
    readFileSync(
      new URL(path, import.meta.url),
      'utf8',
    ),
  ).join('\n')

  assert.match(
    cliContract,
    /SECURE_DELIVERY_PROVISIONING_APPLY/,
  )
  assert.match(
    cliContract,
    /--apply/,
  )

  const admin = readFileSync(
    new URL(
      '../backend/delivery/firebase/firebaseAdmin.js',
      import.meta.url,
    ),
    'utf8',
  )
  assert.match(
    admin,
    /production-not-authorized/,
  )
})

