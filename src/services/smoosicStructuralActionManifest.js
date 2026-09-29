export const TEACHER_STRUCTURAL_ACTION_MANIFEST_VERSION = 1
export const TEACHER_STRUCTURAL_ACTION_MAX_OPERATIONS = 128
export const TEACHER_STRUCTURAL_ACTION_MAX_BYTES = 64 * 1024

const TOP_LEVEL_FIELDS = Object.freeze([
  'version',
  'sourceRevision',
  'editorSessionId',
  'actionId',
  'operations',
  'baseMappingFingerprint',
  'createdFromExplicitTeacherApply',
])

const OPERATION_FIELDS = Object.freeze([
  'order',
  'operation',
  'rawNoteOrdinal',
  'staffIndex',
  'measureIndex',
  'voiceIndex',
  'noteIndex',
  'noteIdentity',
  'before',
  'after',
])

const CE_STRUCTURAL_OPERATIONS = new Set([
  'INSERT_EVENT',
  'REMOVE_EVENT',
  'CHANGE_EVENT_DURATION',
  'CHANGE_EVENT_VOICE',
  'CHANGE_EVENT_STAFF',
  'CHANGE_EVENT_TIE',
  'CHANGE_MEASURE_METER',
])

function assertPlainDataObject(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} shape is invalid.`)
  }
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError(`${label} shape is invalid.`)
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw new TypeError(`${label} symbol keys are forbidden.`)
  }
  const keys = Object.keys(value)
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) {
    throw new TypeError(`${label} contains an unknown or missing field.`)
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const field of fields) {
    const descriptor = descriptors[field]
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new TypeError(`${label} accessor fields are forbidden.`)
    }
  }
  return descriptors
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non-empty string.`)
  }
  return value
}

function nonNegativeSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer.`)
  }
  return value
}

function positiveFinite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive finite number.`)
  }
  return value
}

function validateOperation(value, index) {
  const descriptors = assertPlainDataObject(
    value,
    OPERATION_FIELDS,
    `structural operation ${index}`,
  )
  const operation = descriptors.operation.value
  if (!CE_STRUCTURAL_OPERATIONS.has(operation)) {
    throw new TypeError('Unsupported structural operation.')
  }
  if (operation !== 'CHANGE_EVENT_DURATION') {
    throw new TypeError(`Unsupported structural operation in this milestone: ${operation}.`)
  }

  if (descriptors.order.value !== index) {
    throw new TypeError('Structural operation order is invalid.')
  }
  for (const field of [
    'rawNoteOrdinal',
    'staffIndex',
    'measureIndex',
    'voiceIndex',
    'noteIndex',
  ]) {
    nonNegativeSafeInteger(descriptors[field].value, field)
  }
  requiredString(descriptors.noteIdentity.value, 'noteIdentity')
  const before = positiveFinite(descriptors.before.value, 'before')
  const after = positiveFinite(descriptors.after.value, 'after')
  if (Object.is(before, after)) {
    throw new TypeError('Structural duration operation must change duration.')
  }

  return Object.freeze({
    order: index,
    operation,
    rawNoteOrdinal: descriptors.rawNoteOrdinal.value,
    staffIndex: descriptors.staffIndex.value,
    measureIndex: descriptors.measureIndex.value,
    voiceIndex: descriptors.voiceIndex.value,
    noteIndex: descriptors.noteIndex.value,
    noteIdentity: descriptors.noteIdentity.value,
    before,
    after,
  })
}

export function validateTeacherStructuralActionManifest(
  value,
  { sourceRevision, baseMappingFingerprint } = {},
) {
  const descriptors = assertPlainDataObject(
    value,
    TOP_LEVEL_FIELDS,
    'Teacher structural action manifest',
  )

  if (descriptors.version.value !== TEACHER_STRUCTURAL_ACTION_MANIFEST_VERSION) {
    throw new TypeError('Teacher structural action manifest version is unsupported.')
  }
  nonNegativeSafeInteger(sourceRevision, 'expected source revision')
  if (descriptors.sourceRevision.value !== sourceRevision) {
    throw new Error('Teacher structural action manifest source revision is stale.')
  }

  requiredString(descriptors.editorSessionId.value, 'editorSessionId')
  requiredString(descriptors.actionId.value, 'actionId')

  const expectedFingerprint = requiredString(
    baseMappingFingerprint,
    'expected baseMappingFingerprint',
  )
  const actualFingerprint = descriptors.baseMappingFingerprint.value
  if (
    typeof actualFingerprint !== 'string'
    || !/^[0-9a-f]{16}$/.test(actualFingerprint)
    || actualFingerprint !== expectedFingerprint
  ) {
    throw new Error('Teacher structural action manifest base mapping fingerprint mismatch.')
  }

  if (descriptors.createdFromExplicitTeacherApply.value !== true) {
    throw new TypeError('Teacher structural action manifest lacks explicit teacher Apply provenance.')
  }

  const operations = descriptors.operations.value
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new TypeError('Teacher structural action manifest operations must be non-empty.')
  }
  if (Object.getOwnPropertySymbols(operations).length !== 0) {
    throw new TypeError('Teacher structural action manifest operations contain symbol keys.')
  }
  if (operations.length > TEACHER_STRUCTURAL_ACTION_MAX_OPERATIONS) {
    throw new RangeError('Teacher structural action manifest operation limit exceeded.')
  }
  for (let index = 0; index < operations.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(operations, index)) {
      throw new TypeError('Teacher structural action manifest operations must be dense.')
    }
  }

  const normalizedOperations = Object.freeze(
    operations.map((operation, index) => validateOperation(operation, index)),
  )

  const normalized = Object.freeze({
    version: TEACHER_STRUCTURAL_ACTION_MANIFEST_VERSION,
    sourceRevision,
    editorSessionId: descriptors.editorSessionId.value,
    actionId: descriptors.actionId.value,
    operations: normalizedOperations,
    baseMappingFingerprint: actualFingerprint,
    createdFromExplicitTeacherApply: true,
  })

  const bytes = new TextEncoder().encode(JSON.stringify(normalized)).byteLength
  if (bytes > TEACHER_STRUCTURAL_ACTION_MAX_BYTES) {
    throw new RangeError('Teacher structural action manifest exceeds the 64 KiB size limit.')
  }
  return normalized
}
