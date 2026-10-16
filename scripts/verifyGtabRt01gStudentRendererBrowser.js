import assert from 'node:assert/strict'
import { constants as fsConstants } from 'node:fs'
import {
  access,
  cp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runBrowserFixture } from '../tests/support/browserFixture.js'
import {
  qualifyGtabRt01gReleaseEvidence,
} from './gtabRt01gReleaseGate.js'
import {
  verifyStudentRendererRuntimeIntegrity,
} from './studentRendererRuntimeIntegrity.js'

const EXPECTED_STUDENT_RENDERER_SHA =
  '13aa0843158257a207afe062879743d58048cc6d'
const EXPECTED_CONTRACT_VERSION = '0.2.0'

const root = path.resolve(
  fileURLToPath(new URL('..', import.meta.url)),
)
const studentRoot = process.env.STUDENT_APP_ROOT
if (!studentRoot) {
  throw new Error('STUDENT_APP_ROOT is required.')
}

const artifactRoot = path.join(
  root,
  'artifacts',
  'gtab-rt-01g',
)
const pendingPath = path.join(
  artifactRoot,
  'release-evidence.pending.json',
)
const finalPath = path.join(
  artifactRoot,
  'release-evidence.json',
)
const stagingRoot = path.join(
  artifactRoot,
  '.student-renderer-browser',
)

async function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK)
      return candidate
    } catch {
      // Keep searching the bounded candidate list.
    }
  }
  throw new Error('A Chromium-compatible browser executable is required.')
}

function fixtureHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>SES-225 pinned Student renderer proof</title>
  <script type="importmap">
    {
      "imports": {
        "@st/score-renderer-contracts": "./vendor/st-score-runtime/modules/contracts.js",
        "@st/score-renderer-core": "./vendor/st-score-runtime/modules/renderer-core.js",
        "@st/score-renderer-osmd": "./vendor/st-score-runtime/modules/adapter-osmd.js",
        "@st/score-renderer-browser-host": "./vendor/st-score-runtime/modules/browser-host.js",
        "opensheetmusicdisplay": "./vendor/st-score-runtime/modules/osmd-module-shim.mjs"
      }
    }
  </script>
</head>
<body>
  <div id="st-score-root" role="img" aria-label="SES-225 notation proof"></div>
  <pre id="proof">RUNNING</pre>
  <script type="module">
    import { createStNotationAdapter } from './src/practice/notationAdapter.js'
    import { createNotationRuntimeLoader } from './src/practice/notationRuntimeLoader.js'

    const proof = document.querySelector('#proof')
    const scoreRoot = document.querySelector('#st-score-root')

    async function readMusicXml(relativeUrl) {
      const response = await fetch(relativeUrl, { cache: 'no-store' })
      if (!response.ok) throw new Error('MusicXML fetch failed: ' + response.status)
      const value = await response.text()
      if (!value.includes('<score-partwise')) throw new Error('MusicXML payload is invalid')
      return value
    }

    function requireRender(result, sourceId) {
      if (result?.capability !== 'AVAILABLE') {
        throw new Error(sourceId + ' renderer capability: ' + String(result?.capability))
      }
      if (
        result?.evidence?.sourceId !== sourceId ||
        typeof result?.evidence?.renderEpoch !== 'string' ||
        result.evidence.renderEpoch.length === 0
      ) {
        throw new Error(sourceId + ' render evidence is missing')
      }
      if (!scoreRoot.querySelector('svg')) {
        throw new Error(sourceId + ' did not produce notation SVG')
      }
    }

    try {
      const loader = createNotationRuntimeLoader({
        bootstrapUrl: './vendor/st-score-runtime/browser-bootstrap.mjs',
        vendorUrl: './vendor/st-score-runtime/vendor/opensheetmusicdisplay.min.js',
        expectedContractVersion: '${EXPECTED_CONTRACT_VERSION}',
      })
      const adapter = createStNotationAdapter({ runtimeLoader: loader })
      const scoreXml = await readMusicXml('../student-score.musicxml')
      const tabXml = await readMusicXml('../student-guitar-tab.musicxml')

      const scoreResult = await adapter.render({
        musicXml: scoreXml,
        sourceId: 'ses225-score',
      })
      requireRender(scoreResult, 'ses225-score')
      document.documentElement.dataset.scoreRender = 'PASS'

      const tabResult = await adapter.render({
        musicXml: tabXml,
        sourceId: 'ses225-guitar-tab',
      })
      requireRender(tabResult, 'ses225-guitar-tab')
      document.documentElement.dataset.tabRender = 'PASS'
      document.documentElement.dataset.contractVersion = '${EXPECTED_CONTRACT_VERSION}'
      proof.textContent = 'PASS'
    } catch (error) {
      document.documentElement.dataset.scoreRender ??= 'FAIL'
      document.documentElement.dataset.tabRender ??= 'FAIL'
      document.documentElement.dataset.error = String(error?.message ?? error)
      proof.textContent = 'FAIL'
    }
  </script>
</body>
</html>
`
}

async function stageStudentRenderer() {
  await rm(stagingRoot, {
    recursive: true,
    force: true,
  })
  await mkdir(
    path.join(stagingRoot, 'src', 'practice'),
    { recursive: true },
  )
  await cp(
    path.join(
      studentRoot,
      'vendor',
      'st-score-runtime',
    ),
    path.join(
      stagingRoot,
      'vendor',
      'st-score-runtime',
    ),
    { recursive: true },
  )
  for (const fileName of [
    'notationAdapter.js',
    'notationRuntimeLoader.js',
    'practiceCapabilities.js',
  ]) {
    await cp(
      path.join(
        studentRoot,
        'src',
        'practice',
        fileName,
      ),
      path.join(
        stagingRoot,
        'src',
        'practice',
        fileName,
      ),
    )
  }
  await writeFile(
    path.join(stagingRoot, 'proof.html'),
    fixtureHtml(),
    'utf8',
  )
}

const pending = JSON.parse(
  await readFile(pendingPath, 'utf8'),
)
assert.equal(
  pending.status,
  'PENDING_STUDENT_RENDERER',
  'SES-225 browser proof requires pending exact-head evidence.',
)
assert.equal(
  pending.revisions?.studentRenderer,
  EXPECTED_STUDENT_RENDERER_SHA,
)
assert.equal(
  pending.expectedRevisions?.studentRenderer,
  EXPECTED_STUDENT_RENDERER_SHA,
)
assert.equal(
  pending.checks?.studentRendererArtifact,
  'PASS',
)
assert.equal(
  pending.checks?.studentRendererRender,
  'PENDING',
)

const studentRendererIntegrity =
  await verifyStudentRendererRuntimeIntegrity({
    runtimeRoot: path.join(
      studentRoot,
      'vendor',
      'st-score-runtime',
    ),
    expectedRendererRevision:
      EXPECTED_STUDENT_RENDERER_SHA,
    expectedContractVersion:
      EXPECTED_CONTRACT_VERSION,
  })
assert.deepEqual(
  {
    rendererSourceRevision:
      pending.studentRenderer
        ?.rendererSourceRevision,
    scoreRendererContractVersion:
      pending.studentRenderer
        ?.scoreRendererContractVersion,
    verifiedFiles:
      pending.studentRenderer?.verifiedFiles,
  },
  studentRendererIntegrity,
  'Pinned Student renderer integrity evidence changed between preflight and browser proof.',
)

await rm(finalPath, { force: true })
await stageStudentRenderer()

try {
  const chrome = await findChrome()
  const html = await runBrowserFixture(
    chrome,
    path.join(stagingRoot, 'proof.html'),
    '1280,900',
  )
  assert.match(
    html,
    /<pre id="proof">PASS<\/pre>/u,
    'Pinned Student renderer browser proof did not pass.',
  )
  assert.match(html, /data-score-render="PASS"/u)
  assert.match(html, /data-tab-render="PASS"/u)
  assert.match(
    html,
    /data-contract-version="0\.2\.0"/u,
  )

  const evidence = {
    revisions: pending.revisions,
    expectedRevisions:
      pending.expectedRevisions,
    source: pending.source,
    finalPair: pending.finalPair,
    music: pending.music,
    checks: {
      ...pending.checks,
      studentRendererRender: 'PASS',
    },
  }
  const report =
    qualifyGtabRt01gReleaseEvidence(evidence)
  assert.equal(
    report.status,
    'PASS',
    JSON.stringify(report.diagnostics),
  )

  await writeFile(
    finalPath,
    `${JSON.stringify({
      ...report,
      expectedRevisions:
        evidence.expectedRevisions,
      source: evidence.source,
      finalPair: evidence.finalPair,
      music: evidence.music,
      checks: evidence.checks,
      studentRenderer: {
        ...studentRendererIntegrity,
        scoreRender: 'PASS',
        guitarTabRender: 'PASS',
      },
    }, null, 2)}\n`,
    'utf8',
  )
  await rm(pendingPath, { force: true })

  console.log(
    'GTAB-RT-01G STUDENT RENDERER BROWSER PROOF PASS',
  )
} finally {
  await rm(stagingRoot, {
    recursive: true,
    force: true,
  })
}
