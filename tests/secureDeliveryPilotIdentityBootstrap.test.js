import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'

import {
  createPilotIdentityBootstrap,
  wrapTokenVerifierWithPilotIdentityBootstrap,
} from '../backend/delivery/production/pilotIdentityBootstrap.js'

function hash(value) {
  return crypto
    .createHash('sha256')
    .update(value, 'utf8')
    .digest('hex')
}

function activeEnv(subject, overrides = {}) {
  return {
    SECURE_DELIVERY_PILOT_IDENTITY_BOOTSTRAP_CREATE:
      'true',
    SECURE_DELIVERY_PILOT_IDENTITY_BOOTSTRAP_TIMESTAMP:
      '2026-09-26T17:45:00Z',
    STUDENT08_PILOT_ALLOWED_PROVIDER_SUBJECT_HASHES:
      hash(subject),
    ...overrides,
  }
}

function fakeProvisioning(calls) {
  return {
    async execute(input) {
      calls.push(input)
      return {
        mode: 'APPLIED',
        operations: [
          {
            operationId:
              input.commands[0].operationId,
            action:
              input.commands[0].action,
            result: 'APPLIED',
          },
        ],
      }
    },
  }
}

test('pilot bootstrap creates a STUDENT identity only for an existing SES-8 allowlisted Firebase subject', async () => {
  const calls = []
  const logs = []
  const subject =
    'firebase-subject-private-value'
  const bootstrap =
    createPilotIdentityBootstrap({
      env: activeEnv(subject),
      firestore: {},
      createProvisioningService:
        () => fakeProvisioning(calls),
      write: (line) => logs.push(line),
    })

  const result =
    await bootstrap.syncVerifiedSubject(
      subject,
    )

  assert.equal(result.matched, true)
  assert.equal(result.action, 'CREATE_IDENTITY')
  assert.equal(result.result, 'APPLIED')
  assert.equal(calls.length, 1)

  const command =
    calls[0].commands[0]
  assert.equal(
    command.providerSubject,
    subject,
  )
  assert.equal(command.role, 'STUDENT')
  assert.equal(command.teacherId, null)
  assert.equal(
    command.studentId,
    'pilot-student-' +
      hash(subject).slice(0, 16),
  )
  assert.equal(
    command.operatorId,
    'ses15-production-bootstrap',
  )
  assert.equal(
    calls[0].apply,
    true,
  )

  assert.equal(logs.length, 1)
  assert.doesNotMatch(
    logs[0],
    new RegExp(subject),
  )
  assert.doesNotMatch(
    logs[0],
    /pilot-student-/,
  )
})

test('pilot bootstrap never provisions a subject outside the pre-existing SES-8 allowlist', async () => {
  const calls = []
  const bootstrap =
    createPilotIdentityBootstrap({
      env: activeEnv(
        'approved-subject',
      ),
      firestore: {},
      createProvisioningService:
        () => fakeProvisioning(calls),
      write: () => {},
    })

  const result =
    await bootstrap.syncVerifiedSubject(
      'different-subject',
    )

  assert.deepEqual(result, {
    matched: false,
    action: 'NOOP',
    result: 'NOT_ALLOWLISTED',
  })
  assert.deepEqual(calls, [])
})

test('create and disable bootstrap gates are mutually exclusive and require a fixed audit timestamp', () => {
  assert.throws(
    () =>
      createPilotIdentityBootstrap({
        env: {
          SECURE_DELIVERY_PILOT_IDENTITY_BOOTSTRAP_CREATE:
            'true',
          SECURE_DELIVERY_PILOT_IDENTITY_BOOTSTRAP_DISABLE:
            'true',
          SECURE_DELIVERY_PILOT_IDENTITY_BOOTSTRAP_TIMESTAMP:
            '2026-09-26T17:45:00Z',
          STUDENT08_PILOT_ALLOWED_PROVIDER_SUBJECT_HASHES:
            hash('subject'),
        },
        firestore: {},
      }),
    /mutually exclusive/i,
  )

  assert.throws(
    () =>
      createPilotIdentityBootstrap({
        env: {
          SECURE_DELIVERY_PILOT_IDENTITY_BOOTSTRAP_CREATE:
            'true',
          STUDENT08_PILOT_ALLOWED_PROVIDER_SUBJECT_HASHES:
            hash('subject'),
        },
        firestore: {},
      }),
    /timestamp/i,
  )
})

test('disable gate uses audited DISABLE_IDENTITY without logging the raw Firebase subject', async () => {
  const calls = []
  const logs = []
  const subject =
    'firebase-subject-to-disable'
  const bootstrap =
    createPilotIdentityBootstrap({
      env: activeEnv(subject, {
        SECURE_DELIVERY_PILOT_IDENTITY_BOOTSTRAP_CREATE:
          'false',
        SECURE_DELIVERY_PILOT_IDENTITY_BOOTSTRAP_DISABLE:
          'true',
        SECURE_DELIVERY_PILOT_IDENTITY_BOOTSTRAP_TIMESTAMP:
          '2026-09-26T18:00:00Z',
      }),
      firestore: {},
      createProvisioningService:
        () => fakeProvisioning(calls),
      write: (line) => logs.push(line),
    })

  const result =
    await bootstrap.syncVerifiedSubject(
      subject,
    )

  assert.equal(result.matched, true)
  assert.equal(
    calls[0].commands[0].action,
    'DISABLE_IDENTITY',
  )
  assert.equal(
    calls[0].commands[0]
      .providerSubject,
    subject,
  )
  assert.doesNotMatch(
    logs[0],
    new RegExp(subject),
  )
})

test('token verifier wrapper provisions only after Firebase verification succeeds and returns the original decoded identity', async () => {
  const calls = []
  const verifier =
    wrapTokenVerifierWithPilotIdentityBootstrap({
      tokenVerifier: {
        async verifyIdToken(token) {
          calls.push(['verify', token])
          return {
            uid: 'verified-subject',
          }
        },
      },
      bootstrap: {
        async syncVerifiedSubject(subject) {
          calls.push([
            'bootstrap',
            subject,
          ])
        },
      },
    })

  assert.deepEqual(
    await verifier.verifyIdToken(
      'id-token',
    ),
    {
      uid: 'verified-subject',
    },
  )
  assert.deepEqual(calls, [
    ['verify', 'id-token'],
    [
      'bootstrap',
      'verified-subject',
    ],
  ])
})

test('token verifier wrapper never bootstraps an unverified token', async () => {
  let bootstrapCalls = 0
  const verifier =
    wrapTokenVerifierWithPilotIdentityBootstrap({
      tokenVerifier: {
        async verifyIdToken() {
          throw new Error(
            'invalid-token',
          )
        },
      },
      bootstrap: {
        async syncVerifiedSubject() {
          bootstrapCalls += 1
        },
      },
    })

  await assert.rejects(
    () =>
      verifier.verifyIdToken(
        'invalid',
      ),
    /invalid-token/,
  )
  assert.equal(
    bootstrapCalls,
    0,
  )
})
