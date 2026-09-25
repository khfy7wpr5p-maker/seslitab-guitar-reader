const REQUIRED_METHODS = Object.freeze([
  'previewProvisioningBatch',
  'commitProvisioningBatch',
  'getProvisioningAudit',
  'listProvisioningAudit',
])

export function assertSecureDeliveryProvisioningStore(
  store,
) {
  if (
    !store ||
    typeof store !== 'object'
  ) {
    throw new TypeError(
      'secure delivery provisioning store must be an object.',
    )
  }

  for (const method of REQUIRED_METHODS) {
    if (typeof store[method] !== 'function') {
      throw new TypeError(
        `secure delivery provisioning store must provide ${method}().`,
      )
    }
  }

  return store
}
