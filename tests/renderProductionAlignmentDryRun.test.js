import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const MAIN_SHA =
  '48bfa4443356632cd1401efd246f0c590701f8d7'

test('SES-123 Render alignment manifest is fail-closed and existing-service-only', async () => {
  const raw = await readFile(
    new URL(
      '../ops/render-production-alignment.v1.json',
      import.meta.url,
    ),
    'utf8',
  )
  const plan = JSON.parse(raw)

  assert.equal(plan.schemaVersion, 1)
  assert.equal(plan.sourceRevision, MAIN_SHA)
  assert.equal(
    plan.workspaceId,
    'tea-d9j83h3eo5us73b0i180',
  )

  const byName = Object.fromEntries(
    plan.services.map((service) => [
      service.name,
      service,
    ]),
  )

  assert.deepEqual(
    Object.keys(byName).sort(),
    [
      'seslitab-app',
      'seslitab-omr',
      'st-student-api',
      'st-student-app',
    ],
  )

  assert.equal(
    byName['seslitab-app'].target.commit,
    MAIN_SHA,
  )
  assert.equal(
    byName['seslitab-app'].status,
    'ALIGNED',
  )

  const api = byName['st-student-api']
  assert.equal(
    api.serviceId,
    'srv-darsntfavr4c7381t9f0',
  )
  assert.equal(
    api.url,
    'https://st-student-api.onrender.com',
  )
  assert.equal(
    api.current.branch,
    'ses8-pilot-authorization-hardening',
  )
  assert.equal(
    api.current.commit,
    '33825c8332ab0f6b65a7206fc34c3ab3dd4f4185',
  )
  assert.equal(
    api.current.startCommand,
    'node backend/delivery/pilot/server.js',
  )
  assert.equal(api.target.branch, 'main')
  assert.equal(api.target.commit, MAIN_SHA)
  assert.equal(
    api.target.startCommand,
    api.current.startCommand,
  )
  assert.equal(
    api.activationPreflight
      .secureDeliveryProductionActivation,
    true,
  )
  assert.equal(
    api.activationPreflight
      .secureDeliveryWritesEnabled,
    false,
  )
  assert.equal(
    api.activationPreflight
      .secureDeliveryTeacherWritesActivation,
    false,
  )
  assert.equal(
    api.activationPreflight
      .productionProvisioningBootstrap,
    'disabled',
  )
  assert.equal(
    api.activationPreflight
      .productionAcceptanceBootstrap,
    'disabled',
  )
  assert.equal(
    api.executionPolicy.deployAuthorized,
    false,
  )
  assert.equal(
    api.executionPolicy.environmentMutationAuthorized,
    false,
  )
  assert.equal(
    api.executionPolicy.branchMutationAuthorized,
    false,
  )

  const omr = byName['seslitab-omr']
  assert.equal(omr.current.suspended, true)
  assert.equal(
    omr.executionPolicy.resumeAuthorized,
    false,
  )
  assert.equal(
    omr.executionPolicy.deployAuthorized,
    false,
  )

  assert.deepEqual(
    plan.forbiddenActions.sort(),
    [
      'create-render-domain',
      'create-render-service',
      'firebase-production-write',
      'resume-seslitab-omr',
      'teacher-write-activation',
      'trigger-render-deploy',
    ],
  )

  assert.equal(
    plan.rollback.studentApi.commit,
    '33825c8332ab0f6b65a7206fc34c3ab3dd4f4185',
  )
  assert.equal(
    plan.rollback.studentApi.deployId,
    'dep-das3a6chaf8s73f1irr0',
  )
})
