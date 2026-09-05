import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

import {
  CANONICAL_NOTE_SCHEMA_VERSION,
  CANONICAL_VERIFICATION_STATUS,
} from '../noteTheory.js'
import {
  registerQualityReportForNotes,
  unregisterQualityReportForNotes,
} from '../src/services/qualityGateIntegration.js'
import {
  buildStageS08ScoreQualityOverlayModel,
  STAGE_S08_NOTE_STATE,
} from '../src/services/stageS08ScoreQualityOverlay.js'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixturePath = path.join(repoRoot, 'tests', 'fixtures', 'stage-s08-score-quality-overlay-browser-proof.html')

function verificationState(status) {
  if (status === CANONICAL_VERIFICATION_STATUS.VERIFIED) {
    return {
      schemaVersion: CANONICAL_NOTE_SCHEMA_VERSION,
      status,
      pitch: { valid: true, status },
      time: { valid: true, status },
    }
  }
  if (status === CANONICAL_VERIFICATION_STATUS.PARTIAL) {
    return {
      schemaVersion: CANONICAL_NOTE_SCHEMA_VERSION,
      status,
      pitch: { valid: true, status: CANONICAL_VERIFICATION_STATUS.VERIFIED },
      time: { valid: true, status },
    }
  }
  return {
    schemaVersion: CANONICAL_NOTE_SCHEMA_VERSION,
    status: CANONICAL_VERIFICATION_STATUS.INVALID,
    pitch: { valid: false, status: CANONICAL_VERIFICATION_STATUS.INVALID },
    time: { valid: true, status: CANONICAL_VERIFICATION_STATUS.VERIFIED },
  }
}

function note(status = CANONICAL_VERIFICATION_STATUS.VERIFIED, overrides = {}) {
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
    sourceVerificationState: verificationState(status),
    ...overrides,
  }
}

function report(overrides = {}) {
  return Object.freeze({
    qualityState: 'source_verified',
    structurallyValid: true,
    sourceVerified: true,
    reviewRequired: false,
    reliable: true,
    summary: Object.freeze({ totalFindings: 0, errors: 0, warnings: 0, verifiedNotes: 1, unverifiedNotes: 0 }),
    findings: Object.freeze([]),
    ...overrides,
  })
}

function snapshot(notes, selectionNotes = notes) {
  return { notes, selectionNotes, selectedMeasureKey: null, selectedNoteIndex: null }
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
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
  })
  assert.equal(result.status, 0, result.error?.message || result.stderr)
  return result.stdout || ''
}

test('S08 keeps missing exact quality evidence UNKNOWN and never invents no-issue state', () => {
  const notes = [note()]
  const model = buildStageS08ScoreQualityOverlayModel(snapshot(notes))
  assert.equal(model.state, STAGE_S08_NOTE_STATE.UNKNOWN)
  assert.equal(model.exactSourceEvidence, false)
  assert.equal(model.markers.length, 0)
  assert.match(model.reason, /kayıtlı kalite raporu yok/)
})

test('S08 projects exact verified source notes as NO_ISSUE_FOUND only under exact PASS report', () => {
  const notes = [note()]
  registerQualityReportForNotes(notes, report())
  const model = buildStageS08ScoreQualityOverlayModel(snapshot(notes))
  assert.equal(model.state, STAGE_S08_NOTE_STATE.NO_ISSUE_FOUND)
  assert.equal(model.markers.length, 1)
  assert.equal(model.markers[0].state, STAGE_S08_NOTE_STATE.NO_ISSUE_FOUND)
  assert.deepEqual(model.markers[0].rendererTarget, { partId: 'P1', measureIndex: 0, noteIndex: 0, voice: 1 })
  assert.match(model.markers[0].reason, /müzikal doğruluk garantisi değildir/)
  unregisterQualityReportForNotes(notes)
})

test('S08 keeps an exact report UNKNOWN when no selectable renderer marker can be produced', () => {
  const rest = note(CANONICAL_VERIFICATION_STATUS.VERIFIED, {
    isRest: true,
    step: undefined,
    alter: undefined,
    octave: undefined,
    midi: undefined,
    frequency: undefined,
    noteName: undefined,
  })
  const notes = [rest]
  registerQualityReportForNotes(notes, report())
  const model = buildStageS08ScoreQualityOverlayModel(snapshot(notes))
  assert.equal(model.state, STAGE_S08_NOTE_STATE.UNKNOWN)
  assert.equal(model.markers.length, 0)
  assert.match(model.reason, /unknown olarak korunuyor/)
  unregisterQualityReportForNotes(notes)
})

test('S08 uses note-local canonical evidence for REVIEW and BLOCK without structural guesswork', () => {
  const partial = note(CANONICAL_VERIFICATION_STATUS.PARTIAL)
  const invalid = note(CANONICAL_VERIFICATION_STATUS.INVALID, { startBeat: 1 })
  const notes = [partial, invalid]
  registerQualityReportForNotes(notes, report({
    qualityState: 'review_required',
    sourceVerified: false,
    reviewRequired: true,
    summary: Object.freeze({ totalFindings: 2, errors: 1, warnings: 1, verifiedNotes: 0, unverifiedNotes: 2 }),
  }))
  const model = buildStageS08ScoreQualityOverlayModel(snapshot(notes))
  assert.equal(model.markers[0].state, STAGE_S08_NOTE_STATE.REVIEW)
  assert.equal(model.markers[1].state, STAGE_S08_NOTE_STATE.BLOCK)
  assert.match(model.markers[0].reason, /kaynak doğrulaması tamamlanmadı/)
  assert.match(model.markers[1].reason, /perdesi canonical doğrulamada tutarsız/)
  unregisterQualityReportForNotes(notes)
})

test('S08 leaves structural-only BLOCK evidence UNKNOWN at note level instead of assigning it by measure/voice/staff', () => {
  const notes = [note()]
  registerQualityReportForNotes(notes, report({
    qualityState: 'unreliable',
    structurallyValid: false,
    reliable: false,
    reviewRequired: true,
    findings: Object.freeze([Object.freeze({
      errorCode: 'MEASURE_DURATION_MISMATCH',
      severity: 'error',
      classification: 'structural_error',
      partId: 'P1',
      measureKey: 'P1:m0',
      measureIndex: 0,
      voice: 1,
      staff: 1,
      explanation: 'fixture structural finding',
    })]),
  }))
  const model = buildStageS08ScoreQualityOverlayModel(snapshot(notes))
  assert.equal(model.markers.length, 1)
  assert.equal(model.markers[0].state, STAGE_S08_NOTE_STATE.UNKNOWN)
  assert.match(model.markers[0].reason, /bu notaya exact olarak atanamıyor/)
  unregisterQualityReportForNotes(notes)
})

test('S08 clears stale source markers during revalidation and never transfers report identity to corrected selectionNotes', () => {
  const notes = [note()]
  const corrected = [structuredClone(notes[0])]
  registerQualityReportForNotes(notes, report())

  const pending = buildStageS08ScoreQualityOverlayModel(snapshot(notes), { scoreState: 'revalidating' })
  assert.equal(pending.stale, true)
  assert.equal(pending.markers.length, 0)

  const verifiedCorrected = buildStageS08ScoreQualityOverlayModel(snapshot(notes, corrected), { scoreState: 'verified' })
  assert.equal(verifiedCorrected.stale, true)
  assert.equal(verifiedCorrected.exactSourceEvidence, false)
  assert.equal(verifiedCorrected.markers.length, 0)
  assert.match(verifiedCorrected.reason, /miras almaz/)
  unregisterQualityReportForNotes(notes)
})

test('S08 source/UI remain exact-identity, coalesced, non-color-only and inference-free', async () => {
  const service = await readFile(new URL('../src/services/stageS08ScoreQualityOverlay.js', import.meta.url), 'utf8')
  const ui = await readFile(new URL('../src/stageS08ScoreQualityOverlayUi.js', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/stageS08ScoreQualityOverlay.css', import.meta.url), 'utf8')

  assert.match(service, /deriveCanonicalNoteSelection/)
  assert.match(service, /selectionNotes !== notes/)
  assert.match(service, /markers\.length === 0/)
  assert.match(service, /müzikal doğruluk garantisi değildir/)
  assert.match(ui, /selectPackage3ExactNote/)
  assert.doesNotMatch(ui, /selectPackage3MeasureKey|selectPackage3NoteIndex/)
  assert.match(ui, /rendererTarget: marker\.rendererTarget/)
  assert.match(ui, /interaction: 'quality-marker'/)
  assert.match(ui, /queueMicrotask/)
  assert.match(ui, /renderScheduled/)
  assert.match(ui, /aria-label/)
  assert.match(ui, /stage-s08-quality-marker-icon/)
  assert.match(ui, /rail\.setAttribute\('role', 'group'\)/)
  assert.doesNotMatch(ui, /button\.setAttribute\('role', 'listitem'\)/)
  assert.match(css, /min-height:\s*44px/)

  const combined = `${service}\n${ui}`
  assert.doesNotMatch(combined, /hitTestNote|nearest|proximity|querySelector\([^)]*svg|pitch[- ]?label|opensheetmusicdisplay|OSMD/i)
  assert.doesNotMatch(combined, /registerQualityReportForNotes|buildQualityErrorReport|teacher.*approv|share.*eligib|fetch\(|getUserMedia/i)
})

test('S08 implementation remains tested while S14 retires its production rail without changing Stage D authority', async () => {
  const source = await readFile(new URL('../main.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /initStageS07VerifiedSelectionProjection\(document\)/)
  assert.doesNotMatch(source, /initStageS08ScoreQualityOverlay\(document\)/)
  assert.doesNotMatch(source, /stageS08ScoreQualityOverlay\.css/)
  assert.match(source, /stageDQualityOverlayUi\.js/)
  assert.match(source, /initSmoosicEditorTab\(document\)/)
})

test('S08 real Chrome proof covers exact marker -> inspector flow, accessibility, stale clearing and 390px layout', (t) => {
  const chrome = findChrome()
  if (!chrome) {
    t.skip('Chrome/Chromium not available in this environment')
    return
  }

  for (const viewport of ['1280,900', '390,844']) {
    const html = runBrowser(chrome, viewport)
    assert.match(html, /data-stage-s08-exact-pass="true"/)
    assert.match(html, /data-stage-s08-accessible-pass="true"/)
    assert.match(html, /data-stage-s08-inspector-pass="true"/)
    assert.match(html, /data-stage-s08-stale-pass="true"/)
    assert.match(html, /data-stage-s08-mobile-pass="true"/)
    assert.match(html, />PASS<\/div>/)
  }
})