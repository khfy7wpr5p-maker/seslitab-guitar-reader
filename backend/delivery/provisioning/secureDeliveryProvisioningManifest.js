import {
  assertStrictInputObject,
  normalizeRequiredText,
} from '../../../src/services/teacherDeliveryContractValidation.js'
import {
  createSecureDeliveryProvisioningCommand,
} from '../../../src/services/secureDeliveryProvisioning.js'

const MANIFEST_FIELDS =
  Object.freeze([
    'commands',
  ])

export function normalizeSecureDeliveryProvisioningManifest(
  input = {},
) {
  assertStrictInputObject(
    input,
    MANIFEST_FIELDS,
    'SecureDeliveryProvisioningManifest',
  )

  if (
    !Array.isArray(input.commands) ||
    input.commands.length === 0
  ) {
    throw new TypeError(
      'provisioning manifest commands must be a non-empty array.',
    )
  }

  return Object.freeze({
    commands: Object.freeze(
      input.commands.map(
        (command) =>
          createSecureDeliveryProvisioningCommand(
            command,
          ),
      ),
    ),
  })
}

export function parseSecureDeliveryProvisioningCliArgs(
  argv = [],
) {
  if (!Array.isArray(argv)) {
    throw new TypeError(
      'CLI arguments must be an array.',
    )
  }

  let manifestPath = null
  let apply = false
  let emulator = false

  for (
    let index = 0;
    index < argv.length;
    index += 1
  ) {
    const arg = argv[index]

    if (arg === '--manifest') {
      if (manifestPath !== null) {
        throw new Error(
          'duplicate --manifest argument.',
        )
      }
      const value =
        argv[index + 1]
      if (
        value === undefined ||
        value.startsWith('--')
      ) {
        throw new Error(
          '--manifest requires a path.',
        )
      }
      manifestPath =
        normalizeRequiredText(
          value,
          'manifestPath',
          1024,
        )
      index += 1
      continue
    }

    if (arg === '--apply') {
      if (apply) {
        throw new Error(
          'duplicate --apply argument.',
        )
      }
      apply = true
      continue
    }

    if (arg === '--emulator') {
      if (emulator) {
        throw new Error(
          'duplicate --emulator argument.',
        )
      }
      emulator = true
      continue
    }

    throw new Error(
      'unsupported provisioning CLI argument.',
    )
  }

  if (manifestPath === null) {
    throw new Error(
      '--manifest is required.',
    )
  }

  if (apply && !emulator) {
    throw new Error(
      'SES-14 apply is emulator-only; production adapter is not authorized.',
    )
  }

  return Object.freeze({
    manifestPath,
    apply,
    emulator,
  })
}
