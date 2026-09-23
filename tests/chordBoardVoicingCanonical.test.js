import assert from 'node:assert/strict'
import test from 'node:test'

let canonicalApi = null
let browserFingerprintApi = null
let backendFingerprintApi = null

try {
  canonicalApi = await import('../src/services/chordBoardVoicingCanonical.js')
} catch {}

try {
  browserFingerprintApi = await import('../src/services/chordBoardVoicingFingerprint.js')
} catch {}

try {
  backendFingerprintApi = await import('../backend/delivery/integrity/chordBoardVoicingFingerprint.js')
} catch {}

const AM = Object.freeze({
  schemaVersion: 1,
  sourceKind: 'chord_board_exact_voicing',
  chord: Object.freeze({
    canonicalSymbol: 'Am',
    canonicalRoot: 'A',
    quality: 'm',
    displayRoot: 'A',
    displaySymbol: 'Am',
  }),
  voicing: Object.freeze({
    frets: Object.freeze([-1, 0, 2, 2, 1, 0]),
    fingers: Object.freeze([-1, 0, 2, 3, 1, 0]),
    barres: Object.freeze([]),
    shape: 'open',
    generated: false,
    curated: true,
  }),
  provenance: Object.freeze({
    sourceRepository: 'khfy7wpr5p-maker/st-guitar-chord-board',
    sourceCommit: '6f8b869c32e9c2c5045449f79f4a686c0a67bb6d',
    catalogFingerprint: '0'.repeat(64),
  }),
  voicingFingerprint: '1'.repeat(64),
})

function requireApis() {
  assert.ok(canonicalApi, 'TD-07 canonical voicing module must exist')
  assert.ok(browserFingerprintApi, 'TD-07 browser fingerprint module must exist')
  assert.ok(backendFingerprintApi, 'TD-07 backend fingerprint module must exist')
  return {
    ...canonicalApi,
    ...browserFingerprintApi,
    ...backendFingerprintApi,
  }
}

test('TD-07 exact voicing freezes six-string data low E to high E', () => {
  const {
    normalizeChordBoardVoicingSnapshot,
    isChordBoardVoicingSnapshot,
  } = requireApis()

  const snapshot = normalizeChordBoardVoicingSnapshot(AM)

  assert.equal(Object.isFrozen(snapshot), true)
  assert.equal(Object.isFrozen(snapshot.chord), true)
  assert.equal(Object.isFrozen(snapshot.voicing), true)
  assert.equal(Object.isFrozen(snapshot.voicing.frets), true)
  assert.equal(Object.isFrozen(snapshot.voicing.fingers), true)
  assert.equal(Object.isFrozen(snapshot.voicing.barres), true)
  assert.deepEqual(snapshot.voicing.frets, [-1, 0, 2, 2, 1, 0])
  assert.deepEqual(snapshot.voicing.fingers, [-1, 0, 2, 3, 1, 0])
  assert.equal(isChordBoardVoicingSnapshot(snapshot), true)
})

test('TD-07 exact voicing rejects malformed fret and finger values', () => {
  const { normalizeChordBoardVoicingSnapshot } = requireApis()

  assert.throws(
    () => normalizeChordBoardVoicingSnapshot({
      ...AM,
      voicing: { ...AM.voicing, frets: [-1, 0, 2] },
    }),
    /frets|six/i,
  )
  assert.throws(
    () => normalizeChordBoardVoicingSnapshot({
      ...AM,
      voicing: { ...AM.voicing, frets: [-1, 0, 2, 2, 21, 0] },
    }),
    /fret/i,
  )
  assert.throws(
    () => normalizeChordBoardVoicingSnapshot({
      ...AM,
      voicing: { ...AM.voicing, frets: [-1, 0, 2, 2.5, 1, 0] },
    }),
    /fret|integer/i,
  )
  assert.throws(
    () => normalizeChordBoardVoicingSnapshot({
      ...AM,
      voicing: { ...AM.voicing, fingers: [-1, 0, 2, 3, 5, 0] },
    }),
    /finger/i,
  )
  assert.throws(
    () => normalizeChordBoardVoicingSnapshot({
      ...AM,
      voicing: { ...AM.voicing, fingers: [-1, 0, 2, 3.5, 1, 0] },
    }),
    /finger|integer/i,
  )
})

test('TD-07 exact voicing enforces muted open and fretted finger semantics', () => {
  const { normalizeChordBoardVoicingSnapshot } = requireApis()

  for (const fingers of [
    [0, 0, 2, 3, 1, 0],
    [-1, 1, 2, 3, 1, 0],
    [-1, 0, 0, 3, 1, 0],
  ]) {
    assert.throws(
      () => normalizeChordBoardVoicingSnapshot({
        ...AM,
        voicing: { ...AM.voicing, fingers },
      }),
      /finger|muted|open|fretted/i,
    )
  }
})

test('TD-07 exact voicing validates barre geometry and bounds', () => {
  const { normalizeChordBoardVoicingSnapshot } = requireApis()
  const validBarre = {
    finger: 1,
    fret: 3,
    fromString: 5,
    toString: 1,
  }

  const valid = normalizeChordBoardVoicingSnapshot({
    ...AM,
    voicing: {
      ...AM.voicing,
      frets: [-1, 3, 5, 5, 5, 3],
      fingers: [-1, 1, 2, 3, 4, 1],
      barres: [validBarre],
      shape: 'A',
    },
  })
  assert.deepEqual(valid.voicing.barres, [validBarre])

  for (const barre of [
    { ...validBarre, finger: 5 },
    { ...validBarre, fret: 0 },
    { ...validBarre, fret: 21 },
    { ...validBarre, fromString: 7 },
    { ...validBarre, toString: 0 },
    { ...validBarre, fromString: 1, toString: 5 },
  ]) {
    assert.throws(
      () => normalizeChordBoardVoicingSnapshot({
        ...AM,
        voicing: {
          ...AM.voicing,
          frets: [-1, 3, 5, 5, 5, 3],
          fingers: [-1, 1, 2, 3, 4, 1],
          barres: [barre],
          shape: 'A',
        },
      }),
      /barre|finger|fret|string/i,
    )
  }
})

test('TD-07 exact voicing rejects unsupported keys and mutable validator inputs', () => {
  const {
    normalizeChordBoardVoicingSnapshot,
    isChordBoardVoicingSnapshot,
  } = requireApis()

  assert.throws(
    () => normalizeChordBoardVoicingSnapshot({
      ...AM,
      voicingIndex: 0,
    }),
    /unsupported|field|key/i,
  )

  const snapshot = normalizeChordBoardVoicingSnapshot(AM)
  const mutable = structuredClone(snapshot)
  assert.equal(isChordBoardVoicingSnapshot(mutable), false)
})

test('TD-07 canonical musical JSON ignores object insertion order and provenance', () => {
  const {
    normalizeChordBoardVoicingSnapshot,
    canonicalChordBoardVoicingJson,
  } = requireApis()

  const first = normalizeChordBoardVoicingSnapshot(AM)
  const second = normalizeChordBoardVoicingSnapshot({
    voicingFingerprint: AM.voicingFingerprint,
    provenance: {
      catalogFingerprint: 'f'.repeat(64),
      sourceCommit: 'different-auditable-provenance',
      sourceRepository: AM.provenance.sourceRepository,
    },
    voicing: {
      curated: true,
      generated: false,
      shape: 'open',
      barres: [],
      fingers: [-1, 0, 2, 3, 1, 0],
      frets: [-1, 0, 2, 2, 1, 0],
    },
    chord: {
      displaySymbol: 'Am',
      displayRoot: 'A',
      quality: 'm',
      canonicalRoot: 'A',
      canonicalSymbol: 'Am',
    },
    sourceKind: 'chord_board_exact_voicing',
    schemaVersion: 1,
  })

  assert.equal(
    canonicalChordBoardVoicingJson(first),
    canonicalChordBoardVoicingJson(second),
  )

  const changed = normalizeChordBoardVoicingSnapshot({
    ...AM,
    voicing: {
      ...AM.voicing,
      frets: [-1, 0, 2, 2, 1, 3],
      fingers: [-1, 0, 2, 3, 1, 4],
    },
  })
  assert.notEqual(
    canonicalChordBoardVoicingJson(first),
    canonicalChordBoardVoicingJson(changed),
  )
})

test('TD-07 browser and backend fingerprints agree on canonical musical content', async () => {
  const {
    normalizeChordBoardVoicingSnapshot,
    fingerprintChordBoardVoicing,
    fingerprintChordBoardVoicingSync,
  } = requireApis()

  const snapshot = normalizeChordBoardVoicingSnapshot(AM)
  const browserHash = await fingerprintChordBoardVoicing(snapshot)
  const backendHash = fingerprintChordBoardVoicingSync(snapshot)

  assert.match(browserHash, /^[a-f0-9]{64}$/u)
  assert.equal(browserHash, backendHash)
})
