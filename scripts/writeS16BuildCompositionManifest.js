import { resolve } from 'node:path'
import {
  createS16BuildCompositionManifest,
  resolveS16BuildRevision,
  writeS16BuildCompositionManifest,
} from './s16BuildCompositionManifest.js'

try {
  const revision = resolveS16BuildRevision()
  const manifest = createS16BuildCompositionManifest({
    revision,
    builtAt: new Date().toISOString(),
  })
  const outputPath = await writeS16BuildCompositionManifest({
    distRoot: resolve('dist'),
    manifest,
  })
  console.log(`S16 build composition manifest written: ${outputPath} (${revision})`)
} catch (error) {
  console.error(`S16 build composition manifest failed closed: ${error?.message ?? error}`)
  process.exitCode = 1
}
