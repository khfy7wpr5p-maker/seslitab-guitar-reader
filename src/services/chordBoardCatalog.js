import catalogData from '../data/chordBoardCatalogSnapshotV1.json' with { type: 'json' }

import {
  isChordBoardVoicingSnapshot,
  normalizeChordBoardVoicingSnapshot,
  sameChordBoardVoicingSnapshot,
} from './chordBoardVoicingCanonical.js'

export const CHORD_BOARD_CATALOG_SCHEMA_VERSION = 1
export const CHORD_BOARD_CATALOG_SOURCE_REPOSITORY =
  'khfy7wpr5p-maker/st-guitar-chord-board'
export const CHORD_BOARD_CATALOG_SOURCE_COMMIT =
  '6f8b869c32e9c2c5045449f79f4a686c0a67bb6d'

const EMPTY = Object.freeze([])

function normalizeSha256(value, label) {
  if (
    typeof value !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value)
  ) {
    throw new TypeError(
      `${label} must be lowercase SHA-256 hex.`,
    )
  }
  return value
}

function normalizeSymbol(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function loadCatalog() {
  if (
    catalogData?.schemaVersion !==
      CHORD_BOARD_CATALOG_SCHEMA_VERSION ||
    catalogData?.provenance?.sourceRepository !==
      CHORD_BOARD_CATALOG_SOURCE_REPOSITORY ||
    catalogData?.provenance?.sourceCommit !==
      CHORD_BOARD_CATALOG_SOURCE_COMMIT ||
    !Array.isArray(catalogData?.rows) ||
    catalogData.rows.length !== 180
  ) {
    throw new Error(
      'TD-07 pinned Chord Board catalog provenance is invalid.',
    )
  }

  const catalogFingerprint = normalizeSha256(
    catalogData.catalogFingerprint,
    'catalogFingerprint',
  )
  const symbols = new Set()
  const rows = catalogData.rows.map((rawRow) => {
    const symbol = normalizeSymbol(rawRow?.symbol)
    if (
      symbol === null ||
      symbols.has(symbol) ||
      !Array.isArray(rawRow.voicings) ||
      rawRow.voicings.length < 1 ||
      rawRow.voicings.length > 3
    ) {
      throw new Error(
        'TD-07 pinned Chord Board catalog row is invalid.',
      )
    }
    symbols.add(symbol)

    const fingerprints = new Set()
    const voicings = Object.freeze(
      rawRow.voicings.map((rawSnapshot) => {
        const snapshot =
          normalizeChordBoardVoicingSnapshot(
            rawSnapshot,
          )
        if (
          snapshot.provenance
            .sourceRepository !==
            CHORD_BOARD_CATALOG_SOURCE_REPOSITORY ||
          snapshot.provenance.sourceCommit !==
            CHORD_BOARD_CATALOG_SOURCE_COMMIT ||
          snapshot.provenance
            .catalogFingerprint !==
            catalogFingerprint ||
          fingerprints.has(
            snapshot.voicingFingerprint,
          )
        ) {
          throw new Error(
            'TD-07 pinned Chord Board voicing provenance is invalid.',
          )
        }
        fingerprints.add(
          snapshot.voicingFingerprint,
        )
        return snapshot
      }),
    )

    return Object.freeze({
      symbol,
      voicings,
    })
  })

  const frozenRows = Object.freeze(rows)
  const catalog = Object.freeze({
    schemaVersion:
      CHORD_BOARD_CATALOG_SCHEMA_VERSION,
    provenance: Object.freeze({
      sourceRepository:
        CHORD_BOARD_CATALOG_SOURCE_REPOSITORY,
      sourceCommit:
        CHORD_BOARD_CATALOG_SOURCE_COMMIT,
    }),
    catalogFingerprint,
    rows: frozenRows,
  })

  const bySymbol = new Map(
    frozenRows.map((row) => [
      row.symbol,
      row.voicings,
    ]),
  )
  const byFingerprint = new Map()
  for (const row of frozenRows) {
    for (const snapshot of row.voicings) {
      const list =
        byFingerprint.get(
          snapshot.voicingFingerprint,
        ) ?? []
      list.push(snapshot)
      byFingerprint.set(
        snapshot.voicingFingerprint,
        list,
      )
    }
  }

  return Object.freeze({
    catalog,
    symbols: Object.freeze(
      frozenRows.map((row) => row.symbol),
    ),
    bySymbol,
    byFingerprint,
  })
}

const STATE = loadCatalog()

export function loadPinnedChordBoardCatalog() {
  return STATE.catalog
}

export function listChordBoardSymbols() {
  return STATE.symbols
}

export function getChordBoardVoicings(symbol) {
  const normalized = normalizeSymbol(symbol)
  if (normalized === null) return EMPTY
  return STATE.bySymbol.get(normalized) ?? EMPTY
}

export function isPinnedChordBoardVoicing(value) {
  try {
    if (!isChordBoardVoicingSnapshot(value)) {
      return false
    }
    const candidates =
      STATE.byFingerprint.get(
        value.voicingFingerprint,
      ) ?? EMPTY

    return candidates.some((candidate) =>
      sameChordBoardVoicingSnapshot(
        candidate,
        value,
      ),
    )
  } catch {
    return false
  }
}
