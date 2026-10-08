import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  GUITAR_TAB_EDITOR_REVISION,
} from '../scripts/prepareGuitarTabEditorRuntime.js'
import {
  verifyGuitarTabEditorRuntimeBuild,
} from '../scripts/verifyGuitarTabEditorRuntimeBuild.js'

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

async function buildFixture(t, { includeRuntime = true } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gtab-runtime-build-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const runtimeRoot = path.join(root, 'st-guitar-tab-editor-runtime')
  await mkdir(runtimeRoot, { recursive: true })
  const artifact = Buffer.from('globalThis.STGuitarTabEditorRuntime = Object.freeze({});')
  const manifest = Buffer.from('{"contract":"ST_GUITAR_TAB_EDITOR_BROWSER_BUNDLE"}')
  const files = [
    { path: 'st-guitar-tab-editor.runtime.js', bytes: artifact.byteLength, sha256: sha256(artifact) },
    { path: 'st-guitar-tab-editor.runtime.manifest.json', bytes: manifest.byteLength, sha256: sha256(manifest) },
  ]
  if (includeRuntime) await writeFile(path.join(runtimeRoot, files[0].path), artifact)
  await writeFile(path.join(runtimeRoot, files[1].path), manifest)
  await writeFile(path.join(runtimeRoot, 'seslitab-runtime-provenance.json'), JSON.stringify({
    schemaVersion: 1,
    editorSourceRevision: GUITAR_TAB_EDITOR_REVISION,
    runtimeVersion: '1.0.0',
    files,
  }))
  return root
}

test('production build contains the exact pinned Guitar TAB Editor runtime and provenance', async (t) => {
  const root = await buildFixture(t)
  const result = await verifyGuitarTabEditorRuntimeBuild(root)
  assert.equal(result.editorSourceRevision, GUITAR_TAB_EDITOR_REVISION)
  assert.equal(result.runtimeVersion, '1.0.0')
})

test('production build fails closed when the Guitar TAB Editor runtime was not copied to dist', async (t) => {
  const root = await buildFixture(t, { includeRuntime: false })
  await assert.rejects(
    verifyGuitarTabEditorRuntimeBuild(root),
    /runtime artifact is missing/u,
  )
})
