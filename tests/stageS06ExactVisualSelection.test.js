import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

import {
  bindPackage3RevisionIdentity,
  clearPackage3Notes,
  getPackage3MeasureSnapshot,
  publishPackage3Notes,
  selectPackage3MeasureKey,
  selectPackage3NoteIndex,
} from '../package3MeasureBridge.js'
import {
  buildStageS06SelectionIdentity,
  createStageS06RevisionIdentity,
  isStageS06SelectionCurrent,
  stageS06SelectionMatchesRevision,
} from '../src/services/stageS06SelectionIdentity.js'
import { resolveCanonicalNoteFromScoreRef } from '../src/services/scoreNoteIdentity.js'
import {
  applyTeacherWorkspaceCorrection,
  createTeacherWorkspace,
  getTeacherWorkspaceCurrentRevision,
} from '../src/services/teacherWorkspaceModel.js'
import { buildStageEVisualEditModel } from '../src/services/stageEVisualNoteEdit.js'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixturePath = path.join(repoRoot, 'tests', 'fixtures', 'stage-s06-exact-selection-browser-proof.html')

function note(overrides = {}) {
  return {
    measureKey: 'P1:m0',
    partId: 'P1',
    partIndex: 0,
    measureIndex: 0,
    measureNumber: 1,
    voice: 1,
    staff: 1,
    startBeat: 0,
    isRest: false,
    isGrace: false,
    isChordNote: false,
    step: 'C',
    alter: 0,
    octave: 4,
    durationValue: 1,
    duration: 'quarter',
    beats: 1,
    midi: 60,
    frequency: 261.6256,
    noteName: 'Do4',
    string: 5,
    fret: 3,
    tieStart: false,
    tieStop: false,
    ...overrides,
  }
}

function workspace(notes) {
  return createTeacherWorkspace({
    content: notes,
    actorId: 'teacher-s06',
    sourceId: 'source-s06',
    automaticRevisionId: 'automatic-s06',
    historyId: 'history-s06',
    createdAt: '2026-09-01T01:00:00.000Z',
  })
}

function bindRevision(notes, revision) {
  return bindPackage3RevisionIdentity({
    notes,
    sourceId: revision.sourceId,
    sourceRevisionId: revision.sourceRevisionId,
    revisionId: revision.revisionId,
    contentFingerprint: revision.contentFingerprint,
  })
}

function findChrome() {
  for (const candidate of [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)) {
    if (spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0) return candidate
  }
  return null
}

function runBrowser(chrome, viewport) {
  const result = spawnSync(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--allow-file-access-from-files', '--virtual-time-budget=5000', `--window-size=${viewport}`,
    '--dump-dom', pathToFileURL(fixturePath).href,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
  })
  assert.equal(result.status, 0, result.error?.message || result.stderr)
  return result.stdout || ''
}

test('S06 resolves same-pitch notes only through exact ScoreNoteRef identity', () => {
  const first = note({ startBeat: 0, step: 'C' })
  const second = note({ startBeat: 1, step: 'C' })
  const notes = [first, second]
  const ref = { partId: 'P1', measureIndex: 0, noteIndex: 1, voice: 1 }
  const resolved = resolveCanonicalNoteFromScoreRef(notes, ref)
  assert.ok(resolved)
  assert.equal(resolved.note, second)
  assert.equal(resolved.noteIndex, 1)

  publishPackage3Notes(notes)
  const currentWorkspace = workspace(notes)
  const revision = getTeacherWorkspaceCurrentRevision(currentWorkspace)
  assert.equal(bindRevision(notes, revision), true)
  assert.equal(selectPackage3MeasureKey('P1:m0'), true)
  assert.equal(selectPackage3NoteIndex(resolved.noteIndex, { rendererTarget: ref, interaction: 'visual-hit' }), true)

  const snapshot = getPackage3MeasureSnapshot()
  assert.equal(snapshot.selectedNoteIdentity.note, second)
  assert.equal(snapshot.selectedNoteIdentity.rendererTarget.noteIndex, 1)
  assert.equal(isStageS06SelectionCurrent(snapshot, { requireRevision: true }), true)
  assert.equal(stageS06SelectionMatchesRevision(snapshot, revision), true)
  clearPackage3Notes()
})

test('S06 abstains on renderer mismatch, ambiguity, incomplete identity, and out-of-range input', () => {
  const notes = [note({ startBeat: 0 }), note({ startBeat: 1 })]
  publishPackage3Notes(notes)
  assert.equal(selectPackage3MeasureKey('P1:m0'), true)
  assert.equal(selectPackage3NoteIndex(1, {
    rendererTarget: { partId: 'P1', measureIndex: 0, noteIndex: 0, voice: 1 },
  }), false)
  assert.equal(selectPackage3NoteIndex(99), false)
  assert.equal(getPackage3MeasureSnapshot().selectedNoteIndex, null)

  const repeated = note()
  publishPackage3Notes([repeated, repeated])
  assert.equal(selectPackage3MeasureKey('P1:m0'), true)
  assert.equal(selectPackage3NoteIndex(0), false)

  const incomplete = note({ voice: undefined })
  publishPackage3Notes([incomplete])
  assert.equal(selectPackage3MeasureKey('P1:m0'), true)
  assert.equal(selectPackage3NoteIndex(0), false)
  clearPackage3Notes()
})

test('S06 revision identity change invalidates an old selected note instead of carrying its numeric index', () => {
  const notes = [note()]
  publishPackage3Notes(notes)
  let currentWorkspace = workspace(notes)
  const firstRevision = getTeacherWorkspaceCurrentRevision(currentWorkspace)
  assert.equal(bindRevision(notes, firstRevision), true)
  assert.equal(selectPackage3MeasureKey('P1:m0'), true)
  assert.equal(selectPackage3NoteIndex(0), true)
  const stale = getPackage3MeasureSnapshot()
  assert.equal(stale.selectedNoteIndex, 0)

  currentWorkspace = applyTeacherWorkspaceCorrection({
    workspace: currentWorkspace,
    fieldKey: '0:step',
    value: 'D',
    revisionId: 'teacher-s06-1',
    eventId: 'event-s06-1',
    operationId: 'operation-s06-1',
    createdAt: '2026-09-01T01:01:00.000Z',
  })
  const nextRevision = getTeacherWorkspaceCurrentRevision(currentWorkspace)

  assert.equal(buildStageEVisualEditModel({ workspace: currentWorkspace, snapshot: stale }), null)
  assert.equal(bindRevision(notes, nextRevision), true)
  const after = getPackage3MeasureSnapshot()
  assert.equal(after.selectedMeasureKey, 'P1:m0')
  assert.equal(after.selectedNoteIndex, null)
  assert.equal(after.selectedNoteIdentity, null)
  assert.equal(after.revisionIdentity.revisionId, 'teacher-s06-1')
  clearPackage3Notes()
})

test('S06 Stage E editor opens only for an exact current revision-bound selection', () => {
  const notes = [note()]
  const currentWorkspace = workspace(notes)
  const revision = getTeacherWorkspaceCurrentRevision(currentWorkspace)
  const revisionIdentity = createStageS06RevisionIdentity(revision)
  const selectedNoteIdentity = buildStageS06SelectionIdentity({
    notes,
    measureKey: 'P1:m0',
    noteIndex: 0,
    revisionIdentity,
  })
  const exactSnapshot = {
    notes,
    selectedMeasureKey: 'P1:m0',
    selectedNoteIndex: 0,
    revisionIdentity,
    selectedNoteIdentity,
  }
  assert.ok(buildStageEVisualEditModel({ workspace: currentWorkspace, snapshot: exactSnapshot }))

  assert.equal(buildStageEVisualEditModel({
    workspace: currentWorkspace,
    snapshot: { ...exactSnapshot, revisionIdentity: null },
  }), null)
  assert.equal(buildStageEVisualEditModel({
    workspace: currentWorkspace,
    snapshot: { ...exactSnapshot, selectedNoteIdentity: null },
  }), null)
})

test('S06 real Chrome proof keeps mouse, keyboard and touch on one exact canonical note and invalidates stale revisions', (t) => {
  const chrome = findChrome()
  if (!chrome) {
    t.skip('Chrome/Chromium not available in this environment')
    return
  }

  for (const viewport of ['1280,900', '390,844']) {
    const html = runBrowser(chrome, viewport)
    assert.match(html, /data-stage-s06-identity-pass="true"/)
    assert.match(html, /data-stage-s06-revision-invalidation-pass="true"/)
    assert.match(html, /data-stage-s06-input-parity-pass="true"/)
    assert.match(html, /data-stage-s06-abstain-pass="true"/)
    assert.match(html, /data-stage-s06-accessibility-pass="true"/)
    assert.match(html, /data-canonical-note-index="1"/)
  }
})
