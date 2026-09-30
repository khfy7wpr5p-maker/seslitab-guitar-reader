import {
  validateSuspiciousMeasureAnalysis,
} from './correctionAnalysisConsumer.js'

export const SMOOSIC_CORRECTION_OVERLAY_REQUEST =
  'seslitab:smoosic-correction-overlay-request'
export const SMOOSIC_CORRECTION_OVERLAY_RESULT =
  'seslitab:smoosic-correction-overlay-result'
export const SMOOSIC_CORRECTION_OVERLAY_VERSION = 1
export const SMOOSIC_CORRECTION_OVERLAY_MAX_TARGETS = 128

const SHA256 = /^[0-9a-f]{64}$/

function requiredBoundedText(value, label, max = 256) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > max
    || value !== value.trim()
    || value.includes('\0')
  ) {
    throw new TypeError(`${label} is invalid.`)
  }
  return value
}

function sourceRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(
      'sourceRevision must be a non-negative safe integer.',
    )
  }
  return value
}

function frozenTargets(result) {
  if (result.unmappedFindingCount !== 0) {
    throw new Error(
      'Correction measure mapping is incomplete; overlay rejected.',
    )
  }

  const seen = new Set()
  const targets = []
  for (const measure of result.suspiciousMeasures) {
    const key = `${result.partId}\u0000${measure.measureIndex}`
    if (seen.has(key)) continue
    seen.add(key)
    targets.push(Object.freeze({
      partId: result.partId,
      measureIndex: measure.measureIndex,
    }))
  }

  if (
    targets.length
      > SMOOSIC_CORRECTION_OVERLAY_MAX_TARGETS
  ) {
    throw new RangeError(
      'Correction overlay target limit exceeded.',
    )
  }
  return Object.freeze(targets)
}

export function createSmoosicCorrectionOverlayCommand(
  result,
  {
    requestId,
    sourceRevision: revision,
    expectedSourceId,
  } = {},
) {
  const accepted =
    validateSuspiciousMeasureAnalysis(
      result,
      { expectedSourceId },
    )

  return Object.freeze({
    type: SMOOSIC_CORRECTION_OVERLAY_REQUEST,
    version: SMOOSIC_CORRECTION_OVERLAY_VERSION,
    action: 'replace',
    requestId: requiredBoundedText(
      requestId,
      'requestId',
    ),
    sourceRevision: sourceRevision(revision),
    sourceHash: accepted.sourceHash,
    targets: frozenTargets(accepted),
  })
}

export function createSmoosicCorrectionOverlayClearCommand({
  requestId,
  sourceRevision: revision,
} = {}) {
  return Object.freeze({
    type: SMOOSIC_CORRECTION_OVERLAY_REQUEST,
    version: SMOOSIC_CORRECTION_OVERLAY_VERSION,
    action: 'clear',
    requestId: requiredBoundedText(
      requestId,
      'requestId',
    ),
    sourceRevision: sourceRevision(revision),
    sourceHash: null,
    targets: Object.freeze([]),
  })
}

export function validateSmoosicCorrectionOverlayResult(
  message,
  {
    requestId,
    sourceRevision: revision,
    sourceHash = null,
  } = {},
) {
  if (
    !message
    || typeof message !== 'object'
    || Array.isArray(message)
  ) {
    throw new TypeError(
      'Smoosic correction overlay result must be an object.',
    )
  }
  if (
    message.type !== SMOOSIC_CORRECTION_OVERLAY_RESULT
    || message.version
      !== SMOOSIC_CORRECTION_OVERLAY_VERSION
  ) {
    throw new TypeError(
      'Smoosic correction overlay result contract mismatch.',
    )
  }

  const expectedRequestId =
    requiredBoundedText(
      requestId,
      'requestId',
    )
  if (message.requestId !== expectedRequestId) {
    throw new Error(
      'Smoosic correction overlay requestId mismatch.',
    )
  }

  const expectedRevision =
    sourceRevision(revision)
  if (message.sourceRevision !== expectedRevision) {
    throw new Error(
      'Smoosic correction overlay sourceRevision mismatch.',
    )
  }

  if (typeof message.ok !== 'boolean') {
    throw new TypeError(
      'Smoosic correction overlay result ok flag is invalid.',
    )
  }
  if (
    !Number.isSafeInteger(message.appliedCount)
    || message.appliedCount < 0
    || message.appliedCount
      > SMOOSIC_CORRECTION_OVERLAY_MAX_TARGETS
  ) {
    throw new TypeError(
      'Smoosic correction overlay appliedCount is invalid.',
    )
  }

  if (sourceHash !== null) {
    if (!SHA256.test(sourceHash)) {
      throw new TypeError(
        'Expected Smoosic correction overlay source hash is invalid.',
      )
    }
    if (message.sourceHash !== sourceHash) {
      throw new Error(
        'Smoosic correction overlay source hash mismatch.',
      )
    }
  } else if (
    message.sourceHash !== null
    && !SHA256.test(message.sourceHash ?? '')
  ) {
    throw new TypeError(
      'Smoosic correction overlay source hash is invalid.',
    )
  }

  return message
}
