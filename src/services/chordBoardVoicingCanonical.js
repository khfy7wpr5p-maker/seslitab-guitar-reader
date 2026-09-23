export const CHORD_BOARD_VOICING_SCHEMA_VERSION = 1
export const CHORD_BOARD_SOURCE_KIND = 'chord_board_exact_voicing'
export const CHORD_BOARD_MAX_FRET = 20

const SNAPSHOT_KEYS = Object.freeze([
  'schemaVersion',
  'sourceKind',
  'chord',
  'voicing',
  'provenance',
  'voicingFingerprint',
])
const CHORD_KEYS = Object.freeze([
  'canonicalSymbol',
  'canonicalRoot',
  'quality',
  'displayRoot',
  'displaySymbol',
])
const VOICING_KEYS = Object.freeze([
  'frets',
  'fingers',
  'barres',
  'shape',
  'generated',
  'curated',
])
const BARRE_KEYS = Object.freeze([
  'finger',
  'fret',
  'fromString',
  'toString',
])
const PROVENANCE_KEYS = Object.freeze([
  'sourceRepository',
  'sourceCommit',
  'catalogFingerprint',
])

function isPlainRecord(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function assertPlainRecord(value, label) {
  if (!isPlainRecord(value)) {
    throw new TypeError(`${label} must be a plain object.`)
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw new TypeError(`${label} must not contain symbol fields.`)
  }
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(value),
  )) {
    if (!('value' in descriptor)) {
      throw new TypeError(`${label} must contain data fields only.`)
    }
  }
  return value
}

function assertExactKeys(value, keys, label) {
  assertPlainRecord(value, label)
  const actual = Object.keys(value).sort((left, right) =>
    left.localeCompare(right, 'en'),
  )
  const expected = [...keys].sort((left, right) =>
    left.localeCompare(right, 'en'),
  )
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(`${label} contains an unsupported field or missing key.`)
  }
}

function normalizeText(value, label, maxLength = 256) {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be text.`)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    throw new TypeError(`${label} must be bounded non-empty text.`)
  }
  return trimmed
}

function normalizeBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${label} must be boolean.`)
  }
  return value
}

function normalizeSha256(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new TypeError(`${label} must be lowercase SHA-256 hex.`)
  }
  return value
}

function normalizeSixIntegers(value, label, min, max) {
  if (!Array.isArray(value) || value.length !== 6) {
    throw new TypeError(`${label} must contain exactly six integer values.`)
  }
  const normalized = value.map((entry) => {
    if (
      !Number.isInteger(entry) ||
      entry < min ||
      entry > max
    ) {
      throw new TypeError(
        `${label} values must be integers in ${min}..${max}.`,
      )
    }
    return entry
  })
  return Object.freeze(normalized)
}

function normalizeChord(value) {
  assertExactKeys(value, CHORD_KEYS, 'chord')
  return Object.freeze({
    canonicalSymbol: normalizeText(
      value.canonicalSymbol,
      'chord.canonicalSymbol',
      64,
    ),
    canonicalRoot: normalizeText(
      value.canonicalRoot,
      'chord.canonicalRoot',
      16,
    ),
    quality: normalizeText(
      value.quality,
      'chord.quality',
      32,
    ),
    displayRoot: normalizeText(
      value.displayRoot,
      'chord.displayRoot',
      16,
    ),
    displaySymbol: normalizeText(
      value.displaySymbol,
      'chord.displaySymbol',
      64,
    ),
  })
}

function normalizeBarre(value) {
  assertExactKeys(value, BARRE_KEYS, 'barre')
  const finger = value.finger
  const fret = value.fret
  const fromString = value.fromString
  const toString = value.toString

  if (!Number.isInteger(finger) || finger < 1 || finger > 4) {
    throw new TypeError('barre finger must be an integer in 1..4.')
  }
  if (
    !Number.isInteger(fret) ||
    fret < 1 ||
    fret > CHORD_BOARD_MAX_FRET
  ) {
    throw new TypeError(
      `barre fret must be an integer in 1..${CHORD_BOARD_MAX_FRET}.`,
    )
  }
  if (
    !Number.isInteger(fromString) ||
    fromString < 1 ||
    fromString > 6 ||
    !Number.isInteger(toString) ||
    toString < 1 ||
    toString > 6
  ) {
    throw new TypeError('barre strings must be integers in 1..6.')
  }
  if (fromString < toString) {
    throw new TypeError(
      'barre fromString must be greater than or equal to toString.',
    )
  }

  return Object.freeze({
    finger,
    fret,
    fromString,
    toString,
  })
}

function normalizeVoicing(value) {
  assertExactKeys(value, VOICING_KEYS, 'voicing')

  const frets = normalizeSixIntegers(
    value.frets,
    'voicing.frets',
    -1,
    CHORD_BOARD_MAX_FRET,
  )
  const fingers = normalizeSixIntegers(
    value.fingers,
    'voicing.fingers',
    -1,
    4,
  )

  for (let index = 0; index < 6; index += 1) {
    if (frets[index] === -1 && fingers[index] !== -1) {
      throw new TypeError('muted string finger must be -1.')
    }
    if (frets[index] === 0 && fingers[index] !== 0) {
      throw new TypeError('open string finger must be 0.')
    }
    if (
      frets[index] > 0 &&
      (fingers[index] < 1 || fingers[index] > 4)
    ) {
      throw new TypeError('fretted string finger must be 1..4.')
    }
  }

  if (!Array.isArray(value.barres)) {
    throw new TypeError('voicing.barres must be an array.')
  }

  return Object.freeze({
    frets,
    fingers,
    barres: Object.freeze(
      value.barres.map((barre) => normalizeBarre(barre)),
    ),
    shape: normalizeText(value.shape, 'voicing.shape', 64),
    generated: normalizeBoolean(
      value.generated,
      'voicing.generated',
    ),
    curated: normalizeBoolean(
      value.curated,
      'voicing.curated',
    ),
  })
}

function normalizeProvenance(value) {
  assertExactKeys(value, PROVENANCE_KEYS, 'provenance')
  return Object.freeze({
    sourceRepository: normalizeText(
      value.sourceRepository,
      'provenance.sourceRepository',
      256,
    ),
    sourceCommit: normalizeText(
      value.sourceCommit,
      'provenance.sourceCommit',
      128,
    ),
    catalogFingerprint: normalizeSha256(
      value.catalogFingerprint,
      'provenance.catalogFingerprint',
    ),
  })
}

function canonicalize(value, ancestors = new Set()) {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('canonical JSON number must be finite.')
    }
    return JSON.stringify(value)
  }
  if (ancestors.has(value)) {
    throw new TypeError('canonical JSON contains a cycle.')
  }

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return `[${value
        .map((entry) => canonicalize(entry, ancestors))
        .join(',')}]`
    }
    if (!isPlainRecord(value)) {
      throw new TypeError('canonical JSON object must be plain data.')
    }
    const body = Object.keys(value)
      .sort((left, right) => left.localeCompare(right, 'en'))
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalize(
            value[key],
            ancestors,
          )}`,
      )
      .join(',')
    return `{${body}}`
  } finally {
    ancestors.delete(value)
  }
}

function isDeepFrozen(value, ancestors = new Set()) {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true
  }
  if (typeof value !== 'object' || ancestors.has(value)) {
    return false
  }
  if (!Object.isFrozen(value)) return false

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return value.every((entry) => isDeepFrozen(entry, ancestors))
    }
    if (!isPlainRecord(value)) return false
    return Object.values(value).every((entry) =>
      isDeepFrozen(entry, ancestors),
    )
  } finally {
    ancestors.delete(value)
  }
}

function fullSnapshotJson(value) {
  return canonicalize(value)
}

export function normalizeChordBoardVoicingSnapshot(value) {
  assertExactKeys(
    value,
    SNAPSHOT_KEYS,
    'ChordBoardVoicingSnapshot',
  )
  if (
    value.schemaVersion !==
    CHORD_BOARD_VOICING_SCHEMA_VERSION
  ) {
    throw new TypeError(
      'ChordBoardVoicingSnapshot schemaVersion must be 1.',
    )
  }
  if (value.sourceKind !== CHORD_BOARD_SOURCE_KIND) {
    throw new TypeError(
      'ChordBoardVoicingSnapshot sourceKind is unsupported.',
    )
  }

  return Object.freeze({
    schemaVersion: CHORD_BOARD_VOICING_SCHEMA_VERSION,
    sourceKind: CHORD_BOARD_SOURCE_KIND,
    chord: normalizeChord(value.chord),
    voicing: normalizeVoicing(value.voicing),
    provenance: normalizeProvenance(value.provenance),
    voicingFingerprint: normalizeSha256(
      value.voicingFingerprint,
      'voicingFingerprint',
    ),
  })
}

export function isChordBoardVoicingSnapshot(value) {
  try {
    if (!isDeepFrozen(value)) return false
    const normalized =
      normalizeChordBoardVoicingSnapshot(value)
    return fullSnapshotJson(normalized) ===
      fullSnapshotJson(value)
  } catch {
    return false
  }
}

export function canonicalChordBoardVoicingJson(value) {
  const normalized =
    normalizeChordBoardVoicingSnapshot(value)
  return canonicalize({
    schemaVersion: normalized.schemaVersion,
    sourceKind: normalized.sourceKind,
    chord: normalized.chord,
    voicing: normalized.voicing,
  })
}

export function sameChordBoardVoicingSnapshot(
  left,
  right,
) {
  try {
    const normalizedLeft =
      normalizeChordBoardVoicingSnapshot(left)
    const normalizedRight =
      normalizeChordBoardVoicingSnapshot(right)
    return (
      fullSnapshotJson(normalizedLeft) ===
      fullSnapshotJson(normalizedRight)
    )
  } catch {
    return false
  }
}
