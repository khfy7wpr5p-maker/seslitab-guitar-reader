import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import {
  fileURLToPath,
  pathToFileURL,
} from 'node:url'

import {
  createSmoosicRoundTripWorkingCopy,
  restoreSmoosicRoundTripCandidate,
} from '../src/services/smoosicOctaveClefRoundTrip.js'
import {
  createTeacherAssignmentComposerService,
} from '../src/services/teacherAssignmentComposerService.js'
import {
  SmoosicTestDOMParser,
  SmoosicTestXMLSerializer,
} from '../tests/support/smoosicXmlDom.js'
import {
  qualifyGtabRt01gReleaseEvidence,
} from './gtabRt01gReleaseGate.js'

const EXPECTED = Object.freeze({
  editor:
    '4eb479bc84b12c6deefb289d03c933ce9980bc9f',
  student:
    '70042d2314c005e71de80094363ba66faa795456',
  semanticEngine:
    'ef305f45ff90d940ac6c51a0c46c4fac006d7c5c',
  studentRenderer:
    '13aa0843158257a207afe062879743d58048cc6d',
})

const root = path.resolve(
  fileURLToPath(new URL('..', import.meta.url)),
)
const editorRoot =
  process.env.GTAB_EDITOR_ROOT
const studentRoot =
  process.env.STUDENT_APP_ROOT
const semanticEngineRoot =
  process.env.SEMANTIC_ENGINE_ROOT
const teacherSha =
  process.env.SES225_TEACHER_SHA

if (
  !editorRoot ||
  !studentRoot ||
  !semanticEngineRoot ||
  !/^[0-9a-f]{40}$/u.test(teacherSha ?? '')
) {
  throw new Error(
    'GTAB_EDITOR_ROOT, STUDENT_APP_ROOT, SEMANTIC_ENGINE_ROOT and SES225_TEACHER_SHA are required.',
  )
}

function gitHead(directory) {
  return execFileSync(
    '/usr/bin/git',
    ['-C', directory, 'rev-parse', 'HEAD'],
    { encoding: 'utf8' },
  ).trim()
}

function sha256(value) {
  return createHash('sha256')
    .update(value)
    .digest('hex')
}

async function importFrom(directory, relative) {
  return import(
    pathToFileURL(
      path.resolve(directory, relative),
    ).href
  )
}

function composerHarness() {
  const prepared = []
  const client = {
    async listTeacherRoster() {
      return Object.freeze([
        Object.freeze({
          schemaVersion: 1,
          studentId: 'ses225-student',
          displayNameOrNickname:
            'SES-225 Student',
          active: true,
        }),
      ])
    },
    async prepareAssignments(items) {
      prepared.push(items)
      return Object.freeze(
        items.map((item) =>
          Object.freeze({
            schemaVersion: 1,
            teacherId: 'ses225-teacher',
            assignment:
              structuredClone(item.assignment),
            packageId: item.package.packageId,
            packageFingerprint:
              'a'.repeat(64),
            preparedAt:
              '2026-10-11T17:00:01Z',
          })),
      )
    },
    async deliverAssignments(ids) {
      const items = prepared.at(-1)
      const byId = new Map(
        items.map((item) => [
          item.assignment.assignmentId,
          item,
        ]),
      )
      return Object.freeze(
        ids.map((id) => {
          const item = byId.get(id)
          return Object.freeze({
            schemaVersion: 1,
            deliveryId: id,
            assignmentId: id,
            packageId: item.package.packageId,
            teacherId: 'ses225-teacher',
            studentId:
              item.assignment.studentId,
            deliveredAt:
              '2026-10-11T17:00:02Z',
            revokedAt: null,
          })
        }),
      )
    },
    async createTeacherPiece(input) {
      return Object.freeze({
        schemaVersion: 1,
        ...input,
        state: 'assigned',
        assignedAt:
          '2026-10-11T17:00:03Z',
        contentRefs: Object.freeze({
          scoreAssignmentId:
            input.scoreAssignmentId,
          chordAssignmentIds:
            Object.freeze([
              ...input.chordAssignmentIds,
            ]),
        }),
      })
    },
  }
  return {
    prepared,
    service:
      createTeacherAssignmentComposerService({
        teacherId: 'ses225-teacher',
        secureDeliveryClient: client,
        now: () =>
          '2026-10-11T17:00:00Z',
      }),
  }
}

globalThis.DOMParser = SmoosicTestDOMParser
globalThis.XMLSerializer =
  SmoosicTestXMLSerializer

const studentRendererManifest = JSON.parse(
  await readFile(
    path.join(
      studentRoot,
      'vendor/st-score-runtime/runtime-manifest.json',
    ),
    'utf8',
  ),
)
const revisions = Object.freeze({
  teacher: gitHead(root),
  editor: gitHead(editorRoot),
  student: gitHead(studentRoot),
  semanticEngine:
    gitHead(semanticEngineRoot),
  studentRenderer:
    studentRendererManifest
      .rendererSourceRevision,
})
const expectedRevisions = Object.freeze({
  teacher: teacherSha,
  ...EXPECTED,
})
assert.deepEqual(
  revisions,
  expectedRevisions,
  'SES-225 checkouts must match every exact pinned revision.',
)

const sourcePath = new URL(
  '../tests/fixtures/ses-221/audiveris-octave-clef.musicxml',
  import.meta.url,
)
const sourceBefore = await readFile(sourcePath)
const sourceMusicXml =
  sourceBefore.toString('utf8')
const working =
  await createSmoosicRoundTripWorkingCopy({
    musicXml: sourceMusicXml,
    sourceRevision: 1,
    DOMParserCtor: SmoosicTestDOMParser,
    XMLSerializerCtor:
      SmoosicTestXMLSerializer,
    cryptoScope: globalThis.crypto,
  })
assert.equal(working.kind, 'DERIVED')

const candidateMusicXml = working.musicXml
  .replace(
    '<score-partwise version="4.0">',
    '<score-partwise version="4.0"><identification><encoding><software>Smoosic</software></encoding></identification>',
  )
  .replace(
    '<divisions>1</divisions>',
    '<divisions>4096</divisions>',
  )
  .replaceAll(
    '<duration>1</duration>',
    '<duration>4096</duration>',
  )
const restored =
  await restoreSmoosicRoundTripCandidate({
    sourceMusicXml,
    candidateMusicXml,
    provenance: working.provenance,
    sourceRevision: 1,
    DOMParserCtor: SmoosicTestDOMParser,
    XMLSerializerCtor:
      SmoosicTestXMLSerializer,
    cryptoScope: globalThis.crypto,
  })
const finalScoreMusicXml = restored.musicXml
assert.match(
  finalScoreMusicXml,
  /<clef-octave-change>-1<\/clef-octave-change>/u,
)
assert.match(
  finalScoreMusicXml,
  /<step>C<\/step><alter>1<\/alter><octave>4<\/octave>/u,
)

const editor = await importFrom(
  editorRoot,
  'src/index.js',
)
const sourceSession =
  editor.createSourceSession(
    finalScoreMusicXml,
    {
      targetSelection: {
        partId: 'P1',
        partIndex: 0,
        staff: 1,
        voice: 1,
      },
    },
  )
assert.ok(sourceSession.events.length > 0)
assert.equal(
  sourceSession.events[0].pitch.midi,
  61,
)
assert.equal(
  sourceSession.events[0]
    .soundingPitchMidi,
  61,
)
const tabDocument =
  editor.createTabAssignmentDocument(
    sourceSession,
  )
for (const event of sourceSession.events) {
  tabDocument.assignPosition(
    event.sourceEventId,
    { string: 2, fret: 2 },
  )
}
assert.equal(tabDocument.canExport(), true)
const guitarTabMusicXml =
  editor.serializeGuitarTabMusicXml({
    sourceSession,
    document: tabDocument,
  })
assert.match(
  guitarTabMusicXml,
  /<technical><string>2<\/string><fret>2<\/fret><\/technical>/u,
)

const exact = composerHarness()
const scoreUpload =
  await exact.service.prepareScoreUpload({
    musicXml: finalScoreMusicXml,
    draftId: 'ses225-final',
  })
const guitarTabUpload =
  await exact.service.prepareGuitarTabUpload({
    scoreUpload,
    guitarTabMusicXml,
    draftId: 'ses225-final',
    targetSelection: {
      partId: 'P1',
      partIndex: 0,
      staff: 1,
      voice: 1,
    },
  })
const delivered = await exact.service.send({
  draftId: 'ses225-final',
  studentIds: ['ses225-student'],
  title: 'SES-225 Exact Pair',
  scoreUpload,
  guitarTabUpload,
  chordSnapshots: [],
})
assert.equal(delivered.ok, true)
const pkg = exact.prepared[0][0].package

const stale = composerHarness()
const staleScoreUpload =
  await stale.service.prepareScoreUpload({
    musicXml: sourceMusicXml,
    draftId: 'ses225-final',
  })
let stalePairRejected = false
try {
  await stale.service.send({
    draftId: 'ses225-final',
    studentIds: ['ses225-student'],
    title: 'SES-225 Stale Pair',
    scoreUpload: staleScoreUpload,
    guitarTabUpload,
    chordSnapshots: [],
  })
} catch (error) {
  stalePairRejected =
    /guitar-tab-authority-mismatch/u.test(
      error instanceof Error
        ? error.message
        : '',
    )
}
assert.equal(stalePairRejected, true)

const studentContract = await importFrom(
  studentRoot,
  'src/contracts/practicePackage.js',
)
const studentWorkspace = await importFrom(
  studentRoot,
  'src/practice/practiceWorkspace.js',
)
const studentPlayback = await importFrom(
  studentRoot,
  'src/playback/playbackPlanResolver.js',
)
const requireFromStudent = createRequire(
  path.join(studentRoot, 'package.json'),
)
const { DOMParser: StudentDOMParser } =
  requireFromStudent('@xmldom/xmldom')
globalThis.DOMParser = StudentDOMParser
assert.deepEqual(
  studentContract.validatePracticePackage(pkg),
  { ok: true, errors: [] },
)
const workspace =
  studentWorkspace.createPracticeWorkspace({
    deliveryItem: {
      package: pkg,
      accessRef: {
        kind: 'SECURE_DELIVERY',
        deliveryId: 'ses225-delivery',
      },
    },
    notationRuntimeAvailable: true,
    playbackPort: null,
  })
assert.equal(
  workspace.renderSource.musicXml,
  pkg.content.score.data,
)
assert.equal(
  workspace.tabRenderSource.musicXml,
  pkg.content.guitarTab.data,
)
const playbackContext =
  studentPlayback
    .createPlaybackPlanResolver()
    .resolvePackageContext(pkg)
const studentPlaybackMidi =
  playbackContext?.plan?.notes?.[0]?.midi
assert.equal(studentPlaybackMidi, 61)

const sourceAfter = await readFile(sourcePath)
const evidence = {
  revisions,
  expectedRevisions,
  source: {
    beforeSha256: sha256(sourceBefore),
    afterSha256: sha256(sourceAfter),
    provenanceSourceSha256:
      working.provenance.sourceSha256,
    workingSha256:
      working.provenance.workingSha256,
  },
  finalPair: {
    scoreSha256:
      sha256(finalScoreMusicXml),
    handoffScoreSha256:
      guitarTabUpload
        .scoreMusicXmlFingerprint,
    packageScoreSha256:
      sha256(pkg.content.score.data),
    tabSha256:
      sha256(guitarTabMusicXml),
    handoffTabSha256:
      guitarTabUpload
        .guitarTabMusicXmlFingerprint,
    packageTabSha256:
      sha256(pkg.content.guitarTab.data),
  },
  music: {
    writtenMidi:
      sourceSession.events[0].pitch.midi,
    soundingMidi:
      sourceSession.events[0]
        .soundingPitchMidi,
    string: 2,
    fret: 2,
    studentPlaybackMidi,
  },
  checks: {
    roundTrip: 'PASS',
    sourceImmutable: 'PASS',
    editorRuntime: 'PASS',
    composerBinding: 'PASS',
    stalePairRejected: 'PASS',
    studentContract: 'PASS',
    studentWorkspace: 'PASS',
    studentPlayback: 'PASS',
  },
}
const report =
  qualifyGtabRt01gReleaseEvidence(evidence)
assert.equal(
  report.status,
  'PASS',
  JSON.stringify(report.diagnostics),
)

const artifactRoot = path.join(
  root,
  'artifacts',
  'gtab-rt-01g',
)
await mkdir(artifactRoot, {
  recursive: true,
})
await writeFile(
  path.join(
    artifactRoot,
    'release-evidence.json',
  ),
  `${JSON.stringify({
    ...report,
    source: evidence.source,
    finalPair: evidence.finalPair,
    music: evidence.music,
    checks: evidence.checks,
  }, null, 2)}\n`,
  'utf8',
)

console.log(
  'SES-225 cross-app exact-head release evidence PASS',
)
