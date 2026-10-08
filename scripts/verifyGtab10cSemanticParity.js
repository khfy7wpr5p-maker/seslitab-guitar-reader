import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  GTAB10C_PINNED_EDITOR_COMMIT,
  GTAB10C_PINNED_PARTITURA_VERSION,
  GTAB10C_PINNED_SEMANTIC_ENGINE_COMMIT,
  GTAB10C_PINNED_SNAPSHOT_SCHEMA,
  GTAB10C_REFERENCE_BUNDLE_SCHEMA,
  qualifyGtab10cSemanticParity,
} from '../src/qualification/gtab10cSemanticParity.js'
import {
  SmoosicTestDOMParser,
  SmoosicTestXMLSerializer,
} from '../tests/support/smoosicXmlDom.js'
import { prepareEditorGuitarTabHandoff } from '../src/services/editorGuitarTabHandoff.js'
import { prepareTeacherAssignmentScoreUpload } from '../src/services/teacherAssignmentComposerScoreUpload.js'

globalThis.DOMParser = SmoosicTestDOMParser
globalThis.XMLSerializer = SmoosicTestXMLSerializer

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const editorRoot = process.env.GTAB_EDITOR_ROOT
const semanticEngineRoot = process.env.SEMANTIC_ENGINE_ROOT
const sesliTabCommit = process.env.GITHUB_SHA ?? process.env.GTAB10C_SESILITAB_SHA
if (!editorRoot || !semanticEngineRoot || !/^[0-9a-f]{40}$/u.test(sesliTabCommit ?? '')) {
  throw new Error('GTAB_EDITOR_ROOT, SEMANTIC_ENGINE_ROOT and the exact SesliTab commit SHA are required.')
}

function gitHead(root) {
  return execFileSync('/usr/bin/git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

assert.equal(gitHead(projectRoot), sesliTabCommit, 'SesliTab provenance must match actual checkout HEAD (including workflow merge SHA).')
const editorCommit = gitHead(editorRoot)
const semanticEngineCommit = gitHead(semanticEngineRoot)
assert.equal(editorCommit, GTAB10C_PINNED_EDITOR_COMMIT, 'Editor runtime pin must match the checked-out exact SHA.')
assert.equal(semanticEngineCommit, GTAB10C_PINNED_SEMANTIC_ENGINE_COMMIT, 'Semantic Engine checkout must match the exact pinned SHA.')

const editor = await import(pathToFileURL(path.resolve(editorRoot, 'src/index.js')).href)
const fixtures = [
  {
    id: 'audiveris-like-single-part',
    path: 'tests/fixtures/gtab10c/audiveris-like-source.musicxml',
    targetSelection: { partId: 'P1', partIndex: 0, staff: 1, voice: 1 },
    positionByMidi: new Map([[64, { string: 1, fret: 0 }], [67, { string: 1, fret: 3 }]]),
    expectedEventCount: 2,
  },
  {
    id: 'smoosic-like-multivoice-target',
    path: 'tests/fixtures/gtab10c/smoosic-like-source.musicxml',
    targetSelection: { partId: 'P1', partIndex: 0, staff: 1, voice: 3 },
    positionByMidi: new Map([[55, { string: 3, fret: 0 }]]),
    expectedEventCount: 1,
  },
  {
    id: 'musescore-like-multipart-meter-tie-accidentals',
    path: 'tests/fixtures/gtab10c/musescore-like-multipart-source.musicxml',
    targetSelection: { partId: 'P2', partIndex: 1, staff: 1, voice: 1 },
    positionByMidi: new Map([[66, { string: 1, fret: 2 }], [65, { string: 1, fret: 1 }], [69, { string: 1, fret: 5 }]]),
    expectedEventCount: 4,
  },
]

const artifactsRoot = path.resolve(projectRoot, 'artifacts/gtab10c-semantic-parity')
const oracleScript = path.resolve(projectRoot, 'scripts/gtab10cSemanticOracle.py')
await mkdir(path.join(artifactsRoot, 'derived'), { recursive: true })
const qualifications = []

for (const fixture of fixtures) {
  const sourcePath = path.resolve(projectRoot, fixture.path)
  const sourceBytes = await readFile(sourcePath)
  const sourceXml = sourceBytes.toString('utf8')
  const sourceFingerprint = createHash('sha256').update(sourceBytes).digest('hex')
  const sourceSession = editor.createSourceSession(sourceXml, { targetSelection: fixture.targetSelection })
  assert.deepEqual(sourceSession.targetSelection, fixture.targetSelection, `${fixture.id}: selected target identity changed.`)
  assert.equal(sourceSession.events.length, fixture.expectedEventCount, `${fixture.id}: selected event count changed.`)

  const assignmentDocument = editor.createTabAssignmentDocument(sourceSession)
  for (const event of sourceSession.events) {
    const position = fixture.positionByMidi.get(event.pitch.midi)
    assert.ok(position, `${fixture.id}: missing teacher position for MIDI ${event.pitch.midi}.`)
    assignmentDocument.assignPosition(event.sourceEventId, position)
  }
  assert.equal(assignmentDocument.canExport(), true)
  const derivedXml = editor.serializeGuitarTabMusicXml({ sourceSession, document: assignmentDocument })
  const draftId = `gtab10c-${fixture.id}`
  const scoreUpload = await prepareTeacherAssignmentScoreUpload({
    musicXml: sourceXml,
    teacherId: 'gtab10c-qualification',
    draftId,
    now: () => '2026-10-08T00:00:00Z',
  })
  const handoff = await prepareEditorGuitarTabHandoff({
    scoreUpload,
    guitarTabMusicXml: derivedXml,
    draftId,
    targetSelection: fixture.targetSelection,
  })
  assert.equal(handoff.guitarTabMusicXml, derivedXml)
  assert.equal(handoff.pitchedEventCount, sourceSession.events.length)
  assert.equal(createHash('sha256').update(await readFile(sourcePath)).digest('hex'), sourceFingerprint)

  const derivedName = `${fixture.id}.musicxml`
  const derivedPath = path.join(artifactsRoot, 'derived', derivedName)
  const snapshotPath = path.join(artifactsRoot, `${fixture.id}.snapshots.json`)
  await writeFile(derivedPath, derivedXml, 'utf8')
  const python = process.env.GTAB10C_PYTHON ?? '/usr/bin/python3'
  assert.ok(path.isAbsolute(python), 'CI Python executable must be an absolute configured path.')
  const coverageArgs = process.env.GTAB10C_COVERAGE === '1' ? ['-m', 'coverage', 'run', '--parallel-mode'] : []
  execFileSync(python, [...coverageArgs, oracleScript, sourcePath, derivedPath, snapshotPath], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PYTHONPATH: path.join(semanticEngineRoot, 'src'),
    },
    stdio: 'inherit',
  })
  const oracle = JSON.parse(await readFile(snapshotPath, 'utf8'))
  const derivedBytes = await readFile(derivedPath)
  const report = qualifyGtab10cSemanticParity({
    fixtureId: fixture.id,
    sourceBytes,
    derivedBytes,
    expectedSesliTabCommit: gitHead(projectRoot),
    oracleEvidence: oracle,
    sourceSnapshot: oracle.sourceSnapshot,
    derivedSnapshot: oracle.derivedSnapshot,
    tabPositions: oracle.tabPositions,
    targetSelection: fixture.targetSelection,
    provenance: {
      sourceSha256: sourceFingerprint,
      derivedSha256: createHash('sha256').update(derivedBytes).digest('hex'),
      targetSelection: fixture.targetSelection,
      sesliTabCommit,
      editorCommit,
      semanticEngineCommit,
      referenceBundleSchemaVersion: GTAB10C_REFERENCE_BUNDLE_SCHEMA,
      snapshotSchemaVersion: GTAB10C_PINNED_SNAPSHOT_SCHEMA,
      partituraVersion: oracle.partituraVersion,
    },
  })
  assert.equal(oracle.partituraVersion, GTAB10C_PINNED_PARTITURA_VERSION)
  await writeFile(path.join(artifactsRoot, `${fixture.id}.report.json`), `${JSON.stringify({ report, readViews: oracle.readViews }, null, 2)}\n`, 'utf8')
  assert.equal(report.status, 'PASS', `${fixture.id}: ${JSON.stringify(report.diagnostics)}`)
  qualifications.push({
    fixtureId: fixture.id,
    targetSelection: fixture.targetSelection,
    sourceSha256: report.provenance.sourceSha256,
    derivedSha256: report.provenance.derivedSha256,
    readViews: oracle.readViews,
    preSnapshot: oracle.sourceSnapshot,
    postSnapshot: oracle.derivedSnapshot,
    tabPositions: oracle.tabPositions,
    report,
  })
}

const artifact = {
  schema: 'gtab-10c-semantic-parity-artifact-v1',
  provenance: {
    sesliTabCommit,
    editorCommit,
    semanticEngineCommit,
    snapshotSchemaVersion: GTAB10C_PINNED_SNAPSHOT_SCHEMA,
    partituraVersion: GTAB10C_PINNED_PARTITURA_VERSION,
  },
  qualifications,
}
const artifactPath = path.join(artifactsRoot, 'report.json')
await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
console.log(`GTAB-10C semantic parity PASS: ${qualifications.length} fixtures; evidence ${path.relative(projectRoot, artifactPath)}`)
