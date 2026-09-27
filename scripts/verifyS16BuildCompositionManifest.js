import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  resolveS16BuildRevision,
  validateS16BuildCompositionManifest,
} from './s16BuildCompositionManifest.js'

try {
  const distRoot = resolve('dist')
  await access(resolve(distRoot, 'index.html'))
  const value = JSON.parse(await readFile(resolve(distRoot, 'seslitab-build.json'), 'utf8'))
  const expectedRevision = resolveS16BuildRevision()
  const manifest = validateS16BuildCompositionManifest(value, { expectedRevision })
  console.log(`S16 build composition verified: ${manifest.composition} ${manifest.revision}`)
} catch (error) {
  console.error(`S16 build composition verification failed closed: ${error?.message ?? error}`)
  process.exitCode = 1
}
