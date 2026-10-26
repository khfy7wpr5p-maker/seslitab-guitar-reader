import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createSecureDeliveryApiClient,
} from '../src/services/secureDeliveryApiClient.js'

test('requestStudentWork uses dedicated student/work-requests endpoint and leaves pool untouched', async () => {
  const calls = []
  const client = createSecureDeliveryApiClient({
    baseUrl: 'https://example.test/secure-delivery',
    getIdToken: async () => 'token-a',
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            success: true,
            data: {
              title: 'Sor Etüdü No. 13',
              state: 'PENDING',
              requestedAt: '2026-10-04T08:00:00Z',
              updatedAt: '2026-10-04T08:00:00Z',
              targetState: null,
            },
          }
        },
      }
    },
  })

  const result = await client.requestStudentWork('Sor Etüdü No. 13')

  assert.equal(calls.length, 1)
  assert.equal(
    calls[0].url,
    'https://example.test/secure-delivery/student/work-requests',
  )
  assert.equal(calls[0].init.method, 'POST')
  assert.deepEqual(
    JSON.parse(calls[0].init.body),
    { title: 'Sor Etüdü No. 13' },
  )
  assert.equal(Object.hasOwn(result, 'requestId'), false)

  await client.listStudentPool()
  assert.equal(
    calls[1].url,
    'https://example.test/secure-delivery/student/pool',
  )
})
