import { createHash } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const BRAVURA_REPOSITORY = 'https://github.com/steinbergmedia/bravura.git'
export const BRAVURA_REVISION = '37b194378b710cc40e406ab6c4b07608bb9548ae'
export const BRAVURA_VERSION = '1.482'
export const BRAVURA_WOFF2_GIT_BLOB = '4c6502f6f8eec2fb4f8c385a304fc757c60c31af'
export const BRAVURA_OFL_GIT_BLOB = 'cfe591f37e6d6ac77a13ac3d97559dadd02786f7'

export const SMUFL_REPOSITORY = 'https://github.com/w3c-cg/smufl.git'
export const SMUFL_REVISION = '14acb17a6a479036f38e337396ed605fc4197b23'
export const SMUFL_GLYPHNAMES_GIT_BLOB = 'd23147a6a237ac4ef5489d3fc81a81e194206ff7'

export const REQUIRED_EDITOR_KEYPAD_GLYPHS = Object.freeze([
  'noteWhole',
  'noteHalfUp',
  'noteQuarterUp',
  'note8thUp',
  'note16thUp',
  'note32ndUp',
  'restWhole',
  'restHalf',
  'restQuarter',
  'rest8th',
  'rest16th',
  'rest32nd',
  'accidentalFlat',
  'accidentalNatural',
  'accidentalSharp',
  'augmentationDot',
  'tuplet3',
])

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const publicRoot = path.join(repoRoot, 'public', 'smufl-keypad')
const BRAVURA_RAW_BASE = `https://raw.githubusercontent.com/steinbergmedia/bravura/${BRAVURA_REVISION}`
const SMUFL_RAW_BASE = `https://raw.githubusercontent.com/w3c-cg/smufl/${SMUFL_REVISION}`

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function gitBlobSha1(bytes) {
  const content = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? '')
  const header = Buffer.from(`blob ${content.byteLength}\0`, 'utf8')
  return createHash('sha1').update(header).update(content).digest('hex')
}

export function verifyPinnedGitBlob(bytes, expected, label = 'asset') {
  if (typeof expected !== 'string' || !/^[0-9a-f]{40}$/.test(expected)) {
    throw new Error(`Pinned Git blob identity is invalid for ${label}.`)
  }
  const observed = gitBlobSha1(bytes)
  if (observed !== expected) {
    throw new Error(`Pinned upstream blob mismatch for ${label}: expected ${expected}, got ${observed}.`)
  }
  return observed
}

export function verifyBravuraLicense(text) {
  if (typeof text !== 'string') throw new TypeError('Bravura license text is required.')
  if (!text.includes('Reserved Font Name "Bravura"')) throw new Error('Bravura Reserved Font Name notice is missing.')
  if (!text.includes('SIL OPEN FONT LICENSE Version 1.1')) throw new Error('Bravura SIL Open Font License 1.1 text is missing.')
  if (!text.includes('bundled, embedded')) throw new Error('Bravura OFL redistribution/embedding terms are missing.')
  return true
}

export function verifySmuflGlyphNames(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new TypeError('SMuFL glyphnames metadata must be an object.')
  }
  for (const glyphName of REQUIRED_EDITOR_KEYPAD_GLYPHS) {
    const entry = metadata[glyphName]
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Pinned SMuFL metadata does not define required glyph ${glyphName}.`)
    }
    if (typeof entry.codepoint !== 'string' || !/^U\+[0-9A-F]{4,6}$/.test(entry.codepoint)) {
      throw new Error(`Pinned SMuFL codepoint is invalid for ${glyphName}.`)
    }
  }
  return true
}

async function downloadExact(url, expectedBlob, label, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error(`Fetch is unavailable for ${label}.`)
  const response = await fetchImpl(url, { redirect: 'follow' })
  if (!response?.ok) throw new Error(`Pinned asset fetch failed for ${label} (${response?.status ?? 'unknown'}).`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength === 0) throw new Error(`Pinned asset is empty for ${label}.`)
  verifyPinnedGitBlob(bytes, expectedBlob, label)
  return bytes
}

export async function prepareSmuflKeypadAssets({ fetchImpl = globalThis.fetch } = {}) {
  await rm(publicRoot, { recursive: true, force: true })
  await mkdir(publicRoot, { recursive: true })

  const fontBytes = await downloadExact(
    `${BRAVURA_RAW_BASE}/redist/woff/Bravura.woff2`,
    BRAVURA_WOFF2_GIT_BLOB,
    'Bravura.woff2',
    fetchImpl,
  )
  const oflBytes = await downloadExact(
    `${BRAVURA_RAW_BASE}/redist/OFL.txt`,
    BRAVURA_OFL_GIT_BLOB,
    'Bravura OFL',
    fetchImpl,
  )
  const glyphNamesBytes = await downloadExact(
    `${SMUFL_RAW_BASE}/metadata/glyphnames.json`,
    SMUFL_GLYPHNAMES_GIT_BLOB,
    'SMuFL glyphnames.json',
    fetchImpl,
  )

  verifyBravuraLicense(oflBytes.toString('utf8'))
  verifySmuflGlyphNames(JSON.parse(glyphNamesBytes.toString('utf8')))

  await writeFile(path.join(publicRoot, 'Bravura.woff2'), fontBytes)
  await writeFile(path.join(publicRoot, 'Bravura-OFL.txt'), oflBytes)
  await writeFile(path.join(publicRoot, 'glyphnames.json'), glyphNamesBytes)

  const provenance = Object.freeze({
    schemaVersion: 1,
    purpose: 'SesliTab SMuFL keypad presentation only; action authority remains Editor Core actionId.',
    bravura: Object.freeze({
      repository: BRAVURA_REPOSITORY,
      revision: BRAVURA_REVISION,
      version: BRAVURA_VERSION,
      fontPath: 'redist/woff/Bravura.woff2',
      fontGitBlob: BRAVURA_WOFF2_GIT_BLOB,
      licensePath: 'redist/OFL.txt',
      licenseGitBlob: BRAVURA_OFL_GIT_BLOB,
      license: 'SIL Open Font License 1.1',
      reservedFontName: 'Bravura',
    }),
    smufl: Object.freeze({
      repository: SMUFL_REPOSITORY,
      revision: SMUFL_REVISION,
      glyphNamesPath: 'metadata/glyphnames.json',
      glyphNamesGitBlob: SMUFL_GLYPHNAMES_GIT_BLOB,
      specificationLicense: 'W3C Community Final Specification Agreement',
    }),
    files: Object.freeze([
      Object.freeze({ path: 'Bravura.woff2', bytes: fontBytes.byteLength, sha256: sha256(fontBytes) }),
      Object.freeze({ path: 'Bravura-OFL.txt', bytes: oflBytes.byteLength, sha256: sha256(oflBytes) }),
      Object.freeze({ path: 'glyphnames.json', bytes: glyphNamesBytes.byteLength, sha256: sha256(glyphNamesBytes) }),
    ]),
    requiredEditorKeypadGlyphs: REQUIRED_EDITOR_KEYPAD_GLYPHS,
  })
  await writeFile(path.join(publicRoot, 'seslitab-smufl-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8')

  return Object.freeze({ destination: publicRoot, provenance })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prepareSmuflKeypadAssets()
  console.log(`SMuFL keypad assets prepared: ${path.relative(repoRoot, result.destination)}`)
  console.log(`Bravura: ${BRAVURA_VERSION} @ ${BRAVURA_REVISION}`)
  console.log(`SMuFL metadata: ${SMUFL_REVISION}`)
}
