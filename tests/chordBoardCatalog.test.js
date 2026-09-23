import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isChordBoardVoicingSnapshot,
  sameChordBoardVoicingSnapshot,
} from '../src/services/chordBoardVoicingCanonical.js'
import {
  fingerprintChordBoardVoicing,
} from '../src/services/chordBoardVoicingFingerprint.js'

let catalogApi = null
try {
  catalogApi = await import('../src/services/chordBoardCatalog.js')
} catch {}

function requireCatalog() {
  assert.ok(catalogApi, 'TD-07 pinned Chord Board catalog module must exist')
  return catalogApi
}

test('TD-07 pinned catalog reports approved source revision and 180 chord symbols', () => {
  const {
    loadPinnedChordBoardCatalog,
    listChordBoardSymbols,
    getChordBoardVoicings,
  } = requireCatalog()

  const catalog = loadPinnedChordBoardCatalog()
  assert.equal(catalog.schemaVersion, 1)
  assert.equal(
    catalog.provenance.sourceRepository,
    'khfy7wpr5p-maker/st-guitar-chord-board',
  )
  assert.equal(
    catalog.provenance.sourceCommit,
    '6f8b869c32e9c2c5045449f79f4a686c0a67bb6d',
  )
  assert.match(catalog.catalogFingerprint, /^[a-f0-9]{64}$/u)

  const symbols = listChordBoardSymbols()
  assert.equal(symbols.length, 180)
  assert.equal(new Set(symbols).size, 180)

  const am = getChordBoardVoicings('Am')
  assert.equal(am.length >= 1, true)
  assert.deepEqual(am[0].voicing.frets, [-1, 0, 2, 2, 1, 0])
  assert.deepEqual(am[0].voicing.fingers, [-1, 0, 2, 3, 1, 0])
  assert.equal(isChordBoardVoicingSnapshot(am[0]), true)
})

test('TD-07 pinned catalog contains only strict exact snapshots with stable fingerprints', async () => {
  const {
    listChordBoardSymbols,
    getChordBoardVoicings,
  } = requireCatalog()

  for (const symbol of listChordBoardSymbols()) {
    const voicings = getChordBoardVoicings(symbol)
    assert.equal(voicings.length >= 1, true, symbol)
    assert.equal(voicings.length <= 3, true, symbol)

    const seen = new Set()
    for (const snapshot of voicings) {
      assert.equal(isChordBoardVoicingSnapshot(snapshot), true, symbol)
      assert.equal('voicingIndex' in snapshot, false)
      assert.match(snapshot.voicingFingerprint, /^[a-f0-9]{64}$/u)
      assert.equal(
        await fingerprintChordBoardVoicing(snapshot),
        snapshot.voicingFingerprint,
        symbol,
      )
      assert.equal(seen.has(snapshot.voicingFingerprint), false, symbol)
      seen.add(snapshot.voicingFingerprint)
    }
  }
})

test('TD-07 catalog exact membership requires fingerprint plus structural equality', () => {
  const {
    getChordBoardVoicings,
    isPinnedChordBoardVoicing,
  } = requireCatalog()

  const [selected] = getChordBoardVoicings('Am')
  assert.equal(isPinnedChordBoardVoicing(selected), true)

  const changed = Object.freeze({
    ...selected,
    voicing: Object.freeze({
      ...selected.voicing,
      frets: Object.freeze([-1, 0, 2, 2, 1, 3]),
      fingers: Object.freeze([-1, 0, 2, 3, 1, 4]),
    }),
  })

  assert.equal(
    sameChordBoardVoicingSnapshot(selected, changed),
    false,
  )
  assert.equal(
    isPinnedChordBoardVoicing(changed),
    false,
  )
})

test('TD-07 catalog rejects unsupported symbols without fallback voicing generation', () => {
  const {
    getChordBoardVoicings,
  } = requireCatalog()

  assert.deepEqual(getChordBoardVoicings('NotAChord'), [])
  assert.deepEqual(getChordBoardVoicings('H13'), [])
})
