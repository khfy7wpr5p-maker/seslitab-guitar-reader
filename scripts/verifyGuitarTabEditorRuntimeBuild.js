import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  GUITAR_TAB_EDITOR_REVISION,
  GUITAR_TAB_EDITOR_RUNTIME_VERSION,
} from './prepareGuitarTabEditorRuntime.js'

const runtimeDirectory = 'st-guitar-tab-editor-runtime'
const provenanceName = 'seslitab-runtime-provenance.json'
const expectedFiles = Object.freeze([
  'st-guitar-tab-editor.runtime.js',
  'st-guitar-tab-editor.runtime.manifest.json',
])

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export async function verifyGuitarTabEditorRuntimeBuild(distRoot = path.resolve('dist')) {
  const runtimeRoot = path.resolve(distRoot, runtimeDirectory)
  let provenance
  try {
    provenance = JSON.parse(await readFile(path.join(runtimeRoot, provenanceName), 'utf8'))
  } catch {
    throw new Error('Guitar TAB Editor runtime provenance is missing or invalid.')
  }

  if (
    provenance?.schemaVersion !== 1
    || provenance.editorSourceRevision !== GUITAR_TAB_EDITOR_REVISION
    || provenance.runtimeVersion !== GUITAR_TAB_EDITOR_RUNTIME_VERSION
    || !Array.isArray(provenance.files)
  ) {
    throw new Error('Guitar TAB Editor runtime provenance does not match the pinned runtime.')
  }

  for (const fileName of expectedFiles) {
    const record = provenance.files.find((entry) => entry?.path === fileName)
    if (!record) throw new Error(`Guitar TAB Editor runtime provenance is missing ${fileName}.`)

    let bytes
    try {
      bytes = await readFile(path.join(runtimeRoot, fileName))
    } catch {
      if (fileName === expectedFiles[0]) throw new Error('Guitar TAB Editor runtime artifact is missing from dist.')
      throw new Error(`Guitar TAB Editor runtime manifest is missing from dist: ${fileName}.`)
    }

    if (record.bytes !== bytes.byteLength || record.sha256 !== sha256(bytes)) {
      throw new Error(`Guitar TAB Editor runtime build artifact failed provenance verification: ${fileName}.`)
    }
  }

  return Object.freeze({
    editorSourceRevision: provenance.editorSourceRevision,
    runtimeVersion: provenance.runtimeVersion,
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await verifyGuitarTabEditorRuntimeBuild()
    console.log(`Guitar TAB Editor runtime build verified: ${result.editorSourceRevision}`)
  } catch (error) {
    console.error(`Guitar TAB Editor runtime build verification failed: ${error?.message ?? error}`)
    process.exitCode = 1
  }
}
