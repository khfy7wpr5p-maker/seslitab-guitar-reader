import {
  createSecureDeliveryProvisioningCommand,
  isSecureDeliveryProvisioningCommand,
} from '../../../src/services/secureDeliveryProvisioning.js'
import {
  assertSecureDeliveryProvisioningStore,
} from './secureDeliveryProvisioningStore.js'

function normalizeCommands(commands) {
  if (
    !Array.isArray(commands) ||
    commands.length === 0
  ) {
    throw new TypeError(
      'commands must be a non-empty array.',
    )
  }

  return Object.freeze(
    commands.map((command) => {
      if (
        isSecureDeliveryProvisioningCommand(
          command,
        )
      ) {
        return command
      }
      return createSecureDeliveryProvisioningCommand(
        command,
      )
    }),
  )
}

export function createSecureDeliveryProvisioningService({
  store,
  applyEnabled = false,
} = {}) {
  const provisioningStore =
    assertSecureDeliveryProvisioningStore(
      store,
    )

  if (typeof applyEnabled !== 'boolean') {
    throw new TypeError(
      'applyEnabled must be a boolean.',
    )
  }

  async function execute({
    commands,
    apply = false,
  } = {}) {
    if (typeof apply !== 'boolean') {
      throw new TypeError(
        'apply must be a boolean.',
      )
    }

    const normalized =
      normalizeCommands(commands)

    if (!apply) {
      const operations =
        await provisioningStore
          .previewProvisioningBatch(
            normalized,
          )
      return Object.freeze({
        mode: 'DRY_RUN',
        operations,
      })
    }

    if (!applyEnabled) {
      throw new Error(
        'secure-delivery-provisioning-apply-disabled-by-safety-gate',
      )
    }

    const operations =
      await provisioningStore
        .commitProvisioningBatch(
          normalized,
        )

    return Object.freeze({
      mode: 'APPLIED',
      operations,
    })
  }

  return Object.freeze({
    execute,
  })
}
