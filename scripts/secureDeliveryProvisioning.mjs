import {
  readFile,
} from 'node:fs/promises'

import {
  createSecureDeliveryProvisioningService,
} from '../backend/delivery/provisioning/secureDeliveryProvisioningService.js'
import {
  assertSecureDeliveryProvisioningApplyAuthorization,
  createSecureDeliveryProvisioningTarget,
} from '../backend/delivery/provisioning/secureDeliveryProvisioningTarget.js'
import {
  normalizeSecureDeliveryProvisioningManifest,
  parseSecureDeliveryProvisioningCliArgs,
} from '../backend/delivery/provisioning/secureDeliveryProvisioningManifest.js'

function safeError(error) {
  return error instanceof Error
    ? error.message
    : 'secure-delivery-provisioning-failed'
}

async function readManifest(path) {
  const text = await readFile(
    path,
    'utf8',
  )
  return normalizeSecureDeliveryProvisioningManifest(
    JSON.parse(text),
  )
}

async function main() {
  const options =
    parseSecureDeliveryProvisioningCliArgs(
      process.argv.slice(2),
    )
  const manifest =
    await readManifest(
      options.manifestPath,
    )

  const applyEnabled =
    assertSecureDeliveryProvisioningApplyAuthorization({
      options,
      env: process.env,
    })

  const target =
    await createSecureDeliveryProvisioningTarget({
      options,
      env: process.env,
    })

  try {
    const service =
      createSecureDeliveryProvisioningService({
        store: target.store,
        applyEnabled,
      })

    const result =
      await service.execute({
        commands:
          manifest.commands,
        apply:
          options.apply,
      })

    process.stdout.write(
      JSON.stringify({
        ok: true,
        target: target.target,
        mode: result.mode,
        operations:
          result.operations,
      }) + '\n',
    )
  } finally {
    await target.close()
  }
}

main().catch((error) => {
  process.stderr.write(
    JSON.stringify({
      ok: false,
      error: safeError(error),
    }) + '\n',
  )
  process.exitCode = 1
})
