import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SCORE_RENDERER_REPOSITORY = 'https://github.com/khfy7wpr5p-maker/st-score-rendering-layer.git'
export const SCORE_RENDERER_REVISION = 'a8961e0e68a950cbe980162e23c09f23f0ce5d0a'
export const SCORE_RENDERER_CONTRACT_VERSION = '0.2.0'
export const SCORE_RENDERER_OSMD_VERSION = '2.1.2'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const buildRoot = path.join(repoRoot, '.score-runtime-build')
const rendererRoot = path.join(buildRoot, 'renderer')
const generatedRuntimeRoot = path.join(rendererRoot, 'dist', 'workstation-runtime')
const publicRuntimeRoot = path.join(repoRoot, 'public', 'st-score-runtime')

export function verifyRuntimeManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new TypeError('ST score runtime manifest is invalid.')
  }
  if (manifest.rendererSourceRevision !== SCORE_RENDERER_REVISION) {
    throw new Error('ST score runtime renderer revision mismatch.')
  }
  if (manifest.scoreRendererContractVersion !== SCORE_RENDERER_CONTRACT_VERSION) {
    throw new Error('ST score runtime contract version mismatch.')
  }
  if (manifest.vendor?.opensheetmusicdisplay?.version !== SCORE_RENDERER_OSMD_VERSION) {
    throw new Error('ST score runtime OSMD provenance mismatch.')
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('ST score runtime manifest file inventory is missing.')
  }
  for (const entry of manifest.files) {
    if (!entry || typeof entry.path !== 'string' || !entry.path || entry.path.includes('..')) {
      throw new Error('ST score runtime manifest contains an unsafe file path.')
    }
    if (!Number.isInteger(entry.bytes) || entry.bytes < 0) {
      throw new Error('ST score runtime manifest contains an invalid file size.')
    }
    if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
      throw new Error('ST score runtime manifest contains an invalid digest.')
    }
  }
  return manifest
}

export function verifyRuntimeFeatureSources({ bootstrap, browserHost } = {}) {
  if (typeof bootstrap !== 'string' || typeof browserHost !== 'string') {
    throw new TypeError('ST score runtime feature sources are required.')
  }
  if (!bootstrap.includes('hitTestNoteDetailed')) {
    throw new Error('ST score runtime detailed hit-test feature is missing.')
  }
  if (!browserHost.includes('renderEpoch')) {
    throw new Error('ST score runtime renderEpoch feature is missing.')
  }
  return true
}

function run(command, args, cwd, env = process.env) {
  execFileSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
  })
}

export async function prepareScoreRuntime() {
  await rm(buildRoot, { recursive: true, force: true })
  await rm(publicRuntimeRoot, { recursive: true, force: true })
  await mkdir(buildRoot, { recursive: true })

  try {
    run('git', ['init', rendererRoot], repoRoot)
    run('git', ['remote', 'add', 'origin', SCORE_RENDERER_REPOSITORY], rendererRoot)
    run('git', ['fetch', '--depth=1', 'origin', SCORE_RENDERER_REVISION], rendererRoot)
    run('git', ['checkout', '--detach', 'FETCH_HEAD'], rendererRoot)
    // The reviewed renderer revision intentionally has no package-lock.json.
    // package.json pins every external dependency exactly, so use npm install
    // with lockfile generation disabled while keeping lifecycle scripts disabled.
    run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false'], rendererRoot)
    run('npm', ['run', 'export:workstation-runtime'], rendererRoot, {
      ...process.env,
      ST_SCORE_RENDERER_SOURCE_REVISION: SCORE_RENDERER_REVISION,
    })

    const manifest = verifyRuntimeManifest(JSON.parse(
      await readFile(path.join(generatedRuntimeRoot, 'runtime-manifest.json'), 'utf8'),
    ))
    verifyRuntimeFeatureSources({
      bootstrap: await readFile(path.join(generatedRuntimeRoot, 'workstation-bootstrap.mjs'), 'utf8'),
      browserHost: await readFile(path.join(generatedRuntimeRoot, 'modules', 'browser-host.js'), 'utf8'),
    })

    await mkdir(path.dirname(publicRuntimeRoot), { recursive: true })
    await cp(generatedRuntimeRoot, publicRuntimeRoot, { recursive: true, force: true })
    return Object.freeze({
      destination: publicRuntimeRoot,
      revision: manifest.rendererSourceRevision,
      contractVersion: manifest.scoreRendererContractVersion,
    })
  } finally {
    await rm(buildRoot, { recursive: true, force: true })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prepareScoreRuntime()
  console.log(`ST score runtime prepared: ${path.relative(repoRoot, result.destination)}`)
  console.log(`Renderer revision: ${result.revision}`)
  console.log(`Contract: ${result.contractVersion}`)
}
