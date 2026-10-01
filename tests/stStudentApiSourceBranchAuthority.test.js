import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const QUALIFIED_MAIN_SHA =
  'a10cf3e609de5a566294eea58640cf3fd5097716'
const LEGACY_BRANCH_SHA =
  '515189192b139a0924e2adca41bdc47a7cacdc26'

test('SES-128 st-student-api source authority is main and live mutation stays gated', async () => {
  const raw = await readFile(
    new URL(
      '../ops/st-student-api-source-branch.v1.json',
      import.meta.url,
    ),
    'utf8',
  )
  const contract = JSON.parse(raw)

  assert.equal(contract.schemaVersion, 1)
  assert.equal(contract.sourceRevision, QUALIFIED_MAIN_SHA)
  assert.equal(contract.scope, 'SOURCE_BRANCH_AUTHORITY_ONLY')

  const api = contract.service
  assert.equal(api.name, 'st-student-api')
  assert.equal(api.serviceId, 'srv-darsntfavr4c7381t9f0')
  assert.equal(
    api.url,
    'https://st-student-api.onrender.com',
  )
  assert.equal(
    api.startCommand,
    'node backend/delivery/pilot/server.js',
  )

  assert.equal(
    api.observedLive.trackedBranch,
    'ses8-pilot-authorization-hardening',
  )
  assert.equal(
    api.observedLive.deployCommit,
    LEGACY_BRANCH_SHA,
  )
  assert.equal(
    api.observedLive.deployId,
    'dep-daulsgvf3r2c73fv8on0',
  )
  assert.equal(api.observedLive.deployStatus, 'live')
  assert.equal(api.observedLive.autoDeploy, 'yes')

  assert.equal(
    api.sourceAuthority.canonicalBranch,
    'main',
  )
  assert.equal(
    api.sourceAuthority.canonicalCommit,
    QUALIFIED_MAIN_SHA,
  )
  assert.equal(
    api.sourceAuthority.legacyBranch,
    'ses8-pilot-authorization-hardening',
  )
  assert.equal(
    api.sourceAuthority.legacyBranchCommit,
    LEGACY_BRANCH_SHA,
  )
  assert.equal(
    api.sourceAuthority.legacyRole,
    'LIVE_TRACKED_HISTORICAL',
  )
  assert.equal(
    api.sourceAuthority.relation.mainAheadBy,
    21,
  )
  assert.equal(
    api.sourceAuthority.relation.mainBehindBy,
    0,
  )
  assert.equal(
    api.sourceAuthority.relation.fastForwardCompatible,
    true,
  )

  assert.deepEqual(api.executionPolicy, {
    renderBranchMutationAuthorized: false,
    renderDeployAuthorized: false,
    environmentMutationAuthorized: false,
    teacherWriteActivationAuthorized: false,
    firebaseProductionWriteAuthorized: false,
    omrMutationAuthorized: false,
    legacyBranchMutationAuthorized: false,
    newRenderServiceAuthorized: false,
  })

  assert.equal(contract.qualification.exactMainSha, QUALIFIED_MAIN_SHA)
  assert.deepEqual(contract.qualification.ci, {
    runNumber: 1458,
    attempt: 1,
    conclusion: 'success',
  })
  assert.deepEqual(contract.qualification.regressionQuality, {
    runNumber: 795,
    attempt: 1,
    conclusion: 'success',
  })
  assert.deepEqual(contract.qualification.dependencySecurity, {
    runNumber: 14,
    attempt: 1,
    conclusion: 'success',
  })
  assert.deepEqual(contract.qualification.productionGate, {
    runNumber: 2,
    attempt: 1,
    conclusion: 'success',
  })

  assert.equal(
    contract.nextGate.action,
    'SWITCH_EXISTING_RENDER_TRACKED_BRANCH_TO_MAIN',
  )
  assert.equal(
    contract.nextGate.requiresExplicitUserApproval,
    true,
  )
  assert.equal(
    contract.nextGate.requiresFreshRead,
    true,
  )
  assert.equal(
    contract.nextGate.requiresExactMainProductionGate,
    true,
  )
  assert.equal(
    contract.nextGate.requiresAutoDeployDisabledBeforeBranchSwitch,
    true,
  )
  assert.equal(
    contract.nextGate.teacherWritesRemainSeparateGate,
    true,
  )
  assert.equal(
    contract.nextGate.omrRemainsSeparateGate,
    true,
  )
})
