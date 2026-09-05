import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

import {
  bindPackage3RevisionIdentity,
  bindPackage3SelectionProjection,
  clearPackage3Notes,
  getPackage3MeasureSnapshot,
  publishPackage3Notes,
  selectPackage3MeasureKey,
  selectPackage3NoteIndex,
} from '../package3MeasureBridge.js'
import {
  approveTeacherWorkspace,
  applyTeacherWorkspaceCorrection,
  createTeacherWorkspace,
  getTeacherWorkspaceApplicableApproval,
  getTeacherWorkspaceCurrentRevision,
} from '../src/services/teacherWorkspaceModel.js'
import { canonicalizeStageFRevision } from '../src/services/stageFCanonicalization.js'
import { stageS06SelectionMatchesRevision } from '../src/services/stageS06SelectionIdentity.js'
import { buildStageS07InlineInspectorModel } from '../src/services/stageS07InlineInspector.js'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixturePath = path.join(repoRoot, 'tests', 'fixtures', 'stage-s07-inline-inspector-browser-proof.html')

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
    durationValue: 4,
    divisions: 4,
    duration: 'quarter',
    beats: 1,
    dotCount: 0,
    midi: 60,
    frequency: 261.6256,
    noteName: 'Do',
    tieStart: false,
    tieStop: false,
    tieContinue: false,
    confidence: 0.99,
    verification: 'internal-only',
    ...overrides,
  }
}

function workspace(notes) {
  return createTeacherWorkspace({
    content: notes,
    actorId: 'teacher-s07-internal',
    sourceId: 'source-s07-internal',
    automaticRevisionId: 'automatic-s07-internal',
    historyId: 'history-s07-internal',
    createdAt: '2026-09-01T02:00:00.000Z',
  })
}

function bind(notes, revision) {
  return bindPackage3RevisionIdentity({
    notes,
    sourceId: revision.sourceId,
    sourceRevisionId: revision.sourceRevisionId,
    revisionId: revision.revisionId,
    contentFingerprint: revision.contentFingerprint,
  })
}

function exactSnapshot(notes, currentWorkspace) {
  publishPackage3Notes(notes)
  const revision = getTeacherWorkspaceCurrentRevision(currentWorkspace)
  assert.equal(bind(notes, revision), true)
  assert.equal(selectPackage3MeasureKey('P1:m0'), true)
  assert.equal(selectPackage3NoteIndex(0), true)
  return getPackage3MeasureSnapshot()
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
    '--allow-file-access-from-files', '--virtual-time-budget=7000', `--window-size=${viewport}`,
    '--dump-dom', pathToFileURL(fixturePath).href,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 35000,
    maxBuffer: 8 * 1024 * 1024,
  })
  assert.equal(result.status, 0, result.error?.message || result.stderr)
  return result.stdout || ''
}

test('S07 inspector exposes only the four normal teacher fields and no internal authority metadata', () => {
  const notes = [note()]
  const currentWorkspace = workspace(notes)
  const snapshot = exactSnapshot(notes, currentWorkspace)
  const model = buildStageS07InlineInspectorModel({ workspace: currentWorkspace, snapshot })

  assert.ok(model)
  assert.equal(model.selected, true)
  assert.deepEqual(model.fields.map((field) => field.field), ['step', 'alter', 'octave', 'durationValue'])
  const serialized = JSON.stringify(model).toLowerCase()
  for (const forbidden of ['revisionid', 'sourceid', 'actorid', 'midi', 'frequency', 'contentfingerprint', 'verification']) {
    assert.doesNotMatch(serialized, new RegExp(forbidden))
  }
  clearPackage3Notes()
})

test('S07 keeps rests fail-closed because S06 visual identity does not manufacture a selectable ScoreNoteRef for rests', () => {
  const rest = note({ isRest: true })
  delete rest.step
  delete rest.alter
  delete rest.octave
  delete rest.midi
  delete rest.frequency
  delete rest.noteName
  const notes = [rest]
  const currentWorkspace = workspace(notes)
  publishPackage3Notes(notes)
  const revision = getTeacherWorkspaceCurrentRevision(currentWorkspace)
  assert.equal(bind(notes, revision), true)
  assert.equal(selectPackage3MeasureKey('P1:m0'), true)
  assert.equal(selectPackage3NoteIndex(0), false)
  const model = buildStageS07InlineInspectorModel({ workspace: currentWorkspace, snapshot: getPackage3MeasureSnapshot() })
  assert.ok(model)
  assert.equal(model.selected, false)
  assert.deepEqual(model.fields, [])
  clearPackage3Notes()
})

test('S07 correction creates a new immutable revision, invalidates stale selection and does not inherit approval', () => {
  const notes = [note()]
  let currentWorkspace = workspace(notes)
  const snapshot = exactSnapshot(notes, currentWorkspace)

  currentWorkspace = approveTeacherWorkspace({
    workspace: currentWorkspace,
    approvalId: 'approval-s07-source',
    createdAt: '2026-09-01T02:01:00.000Z',
  })
  assert.ok(getTeacherWorkspaceApplicableApproval(currentWorkspace))

  const sourceRevision = getTeacherWorkspaceCurrentRevision(currentWorkspace)
  const corrected = applyTeacherWorkspaceCorrection({
    workspace: currentWorkspace,
    fieldKey: '0:step',
    value: 'D',
    revisionId: 'teacher-s07-corrected',
    eventId: 'event-s07-corrected',
    operationId: 'operation-s07-corrected',
    createdAt: '2026-09-01T02:02:00.000Z',
  })
  const correctedRevision = getTeacherWorkspaceCurrentRevision(corrected)

  assert.notEqual(correctedRevision.revisionId, sourceRevision.revisionId)
  assert.equal(sourceRevision.content[0].step, 'C')
  assert.equal(correctedRevision.content[0].step, 'D')
  assert.equal(getTeacherWorkspaceApplicableApproval(corrected), null)
  assert.equal(buildStageS07InlineInspectorModel({ workspace: corrected, snapshot }).selected, false)

  assert.equal(bind(notes, correctedRevision), true)
  const after = getPackage3MeasureSnapshot()
  assert.equal(after.selectedNoteIndex, null)
  assert.equal(after.selectedNoteIdentity, null)
  assert.equal(after.selectionNotes, notes)
  clearPackage3Notes()
})

test('S07 verified duration correction rebinds visual selection to shifted canonical timeline without replacing source notes', () => {
  const sourceNotes = [
    note({ startBeat: 0, durationValue: 4, beats: 1 }),
    note({ startBeat: 1, step: 'D', midi: 62, frequency: 293.6647679174076, noteName: 'Re' }),
  ]
  let currentWorkspace = workspace(sourceNotes)
  publishPackage3Notes(sourceNotes)
  assert.equal(bind(sourceNotes, getTeacherWorkspaceCurrentRevision(currentWorkspace)), true)

  currentWorkspace = applyTeacherWorkspaceCorrection({
    workspace: currentWorkspace,
    fieldKey: '0:durationValue',
    value: 8,
    revisionId: 'teacher-s07-duration',
    eventId: 'event-s07-duration',
    operationId: 'operation-s07-duration',
    createdAt: '2026-09-01T02:03:00.000Z',
  })
  const canonicalized = canonicalizeStageFRevision({
    history: currentWorkspace.history,
    expectation: currentWorkspace.expectation,
    revisionId: 'canonical-s07-duration',
    eventId: 'canonical-event-s07-duration',
    operationIdPrefix: 'canonical-operation-s07-duration',
    createdAt: '2026-09-01T02:04:00.000Z',
  })
  assert.equal(canonicalized.status, 'applied')
  const verifiedRevision = canonicalized.revision
  assert.equal(sourceNotes[1].startBeat, 1)
  assert.equal(verifiedRevision.content[1].startBeat, 2)

  // Revision transition clears any old corrected projection until Stage F proof
  // has completed. Binding the exact verified revision must not replace source.
  assert.equal(bind(sourceNotes, verifiedRevision), true)
  assert.equal(getPackage3MeasureSnapshot().selectionNotes, sourceNotes)
  assert.equal(bindPackage3SelectionProjection({
    notes: sourceNotes,
    selectionNotes: verifiedRevision.content,
    sourceId: verifiedRevision.sourceId,
    sourceRevisionId: verifiedRevision.sourceRevisionId,
    revisionId: verifiedRevision.revisionId,
    contentFingerprint: verifiedRevision.contentFingerprint,
  }), true)

  const projected = getPackage3MeasureSnapshot()
  assert.equal(projected.notes, sourceNotes)
  assert.equal(projected.notes[1].startBeat, 1)
  assert.equal(projected.selectionNotes, verifiedRevision.content)
  assert.equal(projected.selectionNotes[1].startBeat, 2)

  assert.equal(selectPackage3MeasureKey('P1:m0'), true)
  assert.equal(selectPackage3NoteIndex(1, {
    rendererTarget: { partId: 'P1', measureIndex: 0, noteIndex: 1, voice: 1 },
    interaction: 'score-hit-test',
  }), true)
  const selected = getPackage3MeasureSnapshot()
  assert.equal(stageS06SelectionMatchesRevision(selected, verifiedRevision), true)
  assert.equal(selected.selectedNoteIdentity.note, verifiedRevision.content[1])
  clearPackage3Notes()
})

test('S07 orchestration requires Stage F verification before a corrected score becomes verified', async () => {
  const source = await readFile(new URL('../src/stageS07InlineTeacherInspectorUi.js', import.meta.url), 'utf8')
  const correction = source.indexOf('applyTeacherUiCorrection(root)')
  const verification = source.indexOf('await verifyAndRerenderStageF(root)', correction)
  const verifiedState = source.indexOf('setScoreState(root, SCORE_STATE.VERIFIED)', verification)
  const blockedState = source.indexOf('setScoreState(root, SCORE_STATE.BLOCKED)', correction)

  assert.ok(correction >= 0)
  assert.ok(verification > correction)
  assert.ok(verifiedState > verification)
  assert.ok(blockedState > correction)
  assert.match(source, /getTeacherWorkspaceApplicableApproval\(next\)/)
  assert.match(source, /Düzeltme onay değildir/)
  assert.match(source, /undoTeacherUiRevision\(root\)/)
  assert.match(source, /approveTeacherUiCurrentRevision\(root\)/)
  assert.doesNotMatch(source, /\b(?:sourceNote|currentNote|note)\.(?:step|alter|octave|durationValue)\s*=/)
})

test('S07 verified-selection implementation remains tested while S14 retires its production inspector wiring', async () => {
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8')
  assert.doesNotMatch(main, /initStageS06ExactSelectionUi\(document\)/)
  assert.doesNotMatch(main, /initStageS07InlineTeacherInspectorUi\(document\)/)
  assert.doesNotMatch(main, /initStageS07VerifiedSelectionProjection\(document\)/)
  assert.doesNotMatch(main, /stageS07InlineTeacherInspector\.css/)
  assert.match(main, /initSmoosicEditorTab\(document\)/)

  const ui = await readFile(new URL('../src/stageS07InlineTeacherInspectorUi.js', import.meta.url), 'utf8')
  assert.doesNotMatch(ui, /textContent\s*=.*revisionId/)
  assert.doesNotMatch(ui, /textContent\s*=.*sourceId/)
  assert.doesNotMatch(ui, /textContent\s*=.*midi/i)
  assert.doesNotMatch(ui, /textContent\s*=.*frequency/i)

  const projectionSource = await readFile(new URL('../src/stageS07VerifiedSelectionProjection.js', import.meta.url), 'utf8')
  assert.match(projectionSource, /data-stage-s07-score-state/)
  assert.match(projectionSource, /bindPackage3SelectionProjection/)
  assert.match(projectionSource, /clearPackage3SelectionProjection/)
})

test('S07 real Chrome proof covers inline fields, hidden internals, stale selection, approval separation, coherence and undo', (t) => {
  const chrome = findChrome()
  if (!chrome) {
    t.skip('Chrome/Chromium not available in this environment')
    return
  }

  for (const viewport of ['1280,900', '390,844']) {
    const html = runBrowser(chrome, viewport)
    assert.match(html, /data-stage-s07-inline-pass="true"/)
    assert.match(html, /data-stage-s07-hidden-internals-pass="true"/)
    assert.match(html, /data-stage-s07-stale-pass="true"/)
    assert.match(html, /data-stage-s07-approval-separation-pass="true"/)
    assert.match(html, /data-stage-s07-coherence-pass="true"/)
    assert.match(html, /data-stage-s07-undo-pass="true"/)
    assert.match(html, /data-stage-s07-mobile-pass="true"/)
    assert.match(html, />PASS<\/div>/)
  }
})
