import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  CHORD_BOARD_SOURCE_KIND,
  CHORD_BOARD_VOICING_SCHEMA_VERSION,
  canonicalChordBoardVoicingJson,
  normalizeChordBoardVoicingSnapshot,
} from '../src/services/chordBoardVoicingCanonical.js'

const execFileAsync = promisify(execFile)

const SOURCE_REPOSITORY =
  'khfy7wpr5p-maker/st-guitar-chord-board'
const SOURCE_COMMIT =
  '6f8b869c32e9c2c5045449f79f4a686c0a67bb6d'
const EMPTY_SHA256 = '0'.repeat(64)
const OUTPUT_PATH = fileURLToPath(
  new URL(
    '../src/data/chordBoardCatalogSnapshotV1.json',
    import.meta.url,
  ),
)

function sha256(text) {
  return createHash('sha256')
    .update(text, 'utf8')
    .digest('hex')
}

function canonicalize(value) {
  if (value === null) return 'null'
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        'catalog canonical JSON number must be finite.',
      )
    }
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value
      .map((child) => canonicalize(child))
      .join(',')}]`
  }
  if (
    value === null ||
    typeof value !== 'object'
  ) {
    throw new TypeError(
      'catalog canonical JSON must contain plain data.',
    )
  }

  const prototype = Object.getPrototypeOf(value)
  if (
    prototype !== Object.prototype &&
    prototype !== null
  ) {
    throw new TypeError(
      'catalog canonical JSON object must be plain data.',
    )
  }

  const fields = Object.keys(value)
    .sort((left, right) =>
      left.localeCompare(right, 'en'),
    )
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalize(
          value[key],
        )}`,
    )
  return `{${fields.join(',')}}`
}

async function assertExactSourceRevision(sourceDir) {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', sourceDir, 'rev-parse', 'HEAD'],
  )
  if (stdout.trim() !== SOURCE_COMMIT) {
    throw new Error(
      `Chord Board source must be exactly ${SOURCE_COMMIT}.`,
    )
  }
}

async function loadSourceModules(sourceDir) {
  const source = (relativePath) =>
    pathToFileURL(
      path.join(sourceDir, 'src', relativePath),
    ).href

  const [core, catalog, voicingLibrary] =
    await Promise.all([
      import(source('chord-core.js')),
      import(source('chord-catalog.js')),
      import(source('voicing-library.js')),
    ])

  return { core, catalog, voicingLibrary }
}

function provisionalSnapshot(
  chord,
  voicing,
) {
  return normalizeChordBoardVoicingSnapshot({
    schemaVersion:
      CHORD_BOARD_VOICING_SCHEMA_VERSION,
    sourceKind: CHORD_BOARD_SOURCE_KIND,
    chord: {
      canonicalSymbol: chord.symbol,
      canonicalRoot: chord.root,
      quality: chord.quality,
      displayRoot: chord.displayRoot,
      displaySymbol: chord.displaySymbol,
    },
    voicing: {
      frets: [...voicing.frets],
      fingers: [...voicing.fingers],
      barres: (voicing.barres ?? []).map(
        (barre) => ({
          finger: barre.finger,
          fret: barre.fret,
          fromString: barre.fromString,
          toString: barre.toString,
        }),
      ),
      shape: String(voicing.shape),
      generated: voicing.generated === true,
      curated: voicing.curated === true,
    },
    provenance: {
      sourceRepository: SOURCE_REPOSITORY,
      sourceCommit: SOURCE_COMMIT,
      catalogFingerprint: EMPTY_SHA256,
    },
    voicingFingerprint: EMPTY_SHA256,
  })
}

function withVoicingFingerprint(snapshot) {
  const voicingFingerprint = sha256(
    canonicalChordBoardVoicingJson(snapshot),
  )
  return {
    ...snapshot,
    chord: { ...snapshot.chord },
    voicing: {
      ...snapshot.voicing,
      frets: [...snapshot.voicing.frets],
      fingers: [...snapshot.voicing.fingers],
      barres: snapshot.voicing.barres.map(
        (barre) => ({ ...barre }),
      ),
    },
    provenance: { ...snapshot.provenance },
    voicingFingerprint,
  }
}

function catalogFingerprintFor(rows) {
  return sha256(
    canonicalize({
      schemaVersion: 1,
      provenance: {
        sourceRepository: SOURCE_REPOSITORY,
        sourceCommit: SOURCE_COMMIT,
      },
      rows: rows.map((row) => ({
        symbol: row.symbol,
        voicings: row.voicings.map(
          (snapshot) => ({
            schemaVersion:
              snapshot.schemaVersion,
            sourceKind: snapshot.sourceKind,
            chord: snapshot.chord,
            voicing: snapshot.voicing,
            voicingFingerprint:
              snapshot.voicingFingerprint,
          }),
        ),
      })),
    }),
  )
}

async function main() {
  const sourceDir =
    process.env.CHORD_BOARD_SOURCE_DIR
  if (
    typeof sourceDir !== 'string' ||
    sourceDir.trim().length === 0
  ) {
    throw new Error(
      'CHORD_BOARD_SOURCE_DIR is required.',
    )
  }

  await assertExactSourceRevision(sourceDir)
  const { core, catalog, voicingLibrary } =
    await loadSourceModules(sourceDir)

  if (
    !Array.isArray(catalog.CHORD_SYMBOLS) ||
    catalog.CHORD_SYMBOLS.length !== 180
  ) {
    throw new Error(
      'Pinned Chord Board source must expose exactly 180 chord symbols.',
    )
  }

  const rows = catalog.CHORD_SYMBOLS.map(
    (symbol) => {
      const chord =
        core.parseChordPresentation(symbol)
      const voicings =
        voicingLibrary.getVoicings(symbol)

      if (
        chord === null ||
        !Array.isArray(voicings) ||
        voicings.length < 1 ||
        voicings.length > 3
      ) {
        throw new Error(
          `Pinned Chord Board catalog is invalid at ${symbol}.`,
        )
      }

      return {
        symbol,
        voicings: voicings.map(
          (voicing) =>
            withVoicingFingerprint(
              provisionalSnapshot(
                chord,
                voicing,
              ),
            ),
        ),
      }
    },
  )

  const catalogFingerprint =
    catalogFingerprintFor(rows)

  const output = {
    schemaVersion: 1,
    provenance: {
      sourceRepository: SOURCE_REPOSITORY,
      sourceCommit: SOURCE_COMMIT,
    },
    catalogFingerprint,
    rows: rows.map((row) => ({
      symbol: row.symbol,
      voicings: row.voicings.map(
        (snapshot) => ({
          ...snapshot,
          provenance: {
            ...snapshot.provenance,
            catalogFingerprint,
          },
        }),
      ),
    })),
  }

  await writeFile(
    OUTPUT_PATH,
    `${JSON.stringify(output, null, 2)}\n`,
    'utf8',
  )

  process.stdout.write(
    `TD-07 catalog snapshot: ${output.rows.length} symbols, ${output.rows.reduce(
      (total, row) =>
        total + row.voicings.length,
      0,
    )} voicings, ${catalogFingerprint}\n`,
  )
}

await main()
