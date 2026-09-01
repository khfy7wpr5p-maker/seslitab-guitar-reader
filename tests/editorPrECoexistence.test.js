import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  bindPackage3RevisionIdentity,
  bindPackage3SelectionProjection,
  clearPackage3Notes,
  getPackage3MeasureSnapshot,
  publishPackage3Notes,
  selectPackage3ExactNote,
  subscribePackage3Measures,
} from '../package3MeasureBridge.js'
import { stageICurrentRoutingNotes } from '../src/stageIInstrumentProductUi.js'

function note(overrides = {}) {
  return Object.freeze({
    measureKey: 'P1:m0',
    partId: 'P1',
    partIndex: 0,
    measureIndex: 0,
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
    divisions: 1,
    duration: 'quarter',
    beats: 1,
    ...overrides,
  })
}

test('STI-13 exact quality navigation publishes measure+note selection once', () => {
  clearPackage3Notes()
  const source = Object.freeze([note()])
  publishPackage3Notes(source)
  assert.equal(bindPackage3RevisionIdentity({
    notes: source,
    sourceId: 'source-1',
    sourceRevisionId: 'source-revision-1',
    revisionId: 'revision-1',
    contentFingerprint: 'fingerprint-1',
  }), true)

  let notifications = 0
  const unsubscribe = subscribePackage3Measures(() => { notifications += 1 })
  notifications = 0

  assert.equal(selectPackage3ExactNote(0, {
    measureKey: 'P1:m0',
    rendererTarget: Object.freeze({ partId: 'P1', measureIndex: 0, noteIndex: 0, voice: 1 }),
    interaction: 'quality-marker',
  }), true)
  assert.equal(notifications, 1)

  const snapshot = getPackage3MeasureSnapshot()
  assert.equal(snapshot.selectedMeasureKey, 'P1:m0')
  assert.equal(snapshot.selectedNoteIndex, 0)
  assert.equal(snapshot.selectedNoteIdentity?.interaction, 'quality-marker')
  unsubscribe()
  clearPackage3Notes()
})

test('STI-14 Stage I uses the exact current editor projection without replacing source identity', () => {
  const source = Object.freeze([note()])
  const corrected = Object.freeze([note({ durationValue: 2, duration: 'half', beats: 2 })])
  assert.equal(stageICurrentRoutingNotes({ notes: source, selectionNotes: source, revisionIdentity: null }), source)
  assert.equal(stageICurrentRoutingNotes({
    notes: source,
    selectionNotes: corrected,
    revisionIdentity: Object.freeze({ revisionId: 'revision-2' }),
  }), corrected)
  assert.equal(stageICurrentRoutingNotes({ notes: source, selectionNotes: corrected, revisionIdentity: null }), source)
})

test('STI-14 verified selection projection stays separate from source quality array', () => {
  clearPackage3Notes()
  const source = Object.freeze([note()])
  const corrected = Object.freeze([note({ durationValue: 2, duration: 'half', beats: 2 })])
  publishPackage3Notes(source)
  assert.equal(bindPackage3RevisionIdentity({
    notes: source,
    sourceId: 'source-1',
    sourceRevisionId: 'source-revision-1',
    revisionId: 'revision-2',
    contentFingerprint: 'fingerprint-2',
  }), true)
  assert.equal(bindPackage3SelectionProjection({
    notes: source,
    selectionNotes: corrected,
    sourceId: 'source-1',
    sourceRevisionId: 'source-revision-1',
    revisionId: 'revision-2',
    contentFingerprint: 'fingerprint-2',
  }), true)
  const snapshot = getPackage3MeasureSnapshot()
  assert.equal(snapshot.notes, source)
  assert.equal(snapshot.selectionNotes, corrected)
  assert.equal(stageICurrentRoutingNotes(snapshot), corrected)
  clearPackage3Notes()
})

test('STI-13/15 source contracts coalesce observers, keep corrected recovery fail-closed, and do not couple playback to renderer/editor readiness', async () => {
  const overlay = await readFile(new URL('../src/stageS08ScoreQualityOverlayUi.js', import.meta.url), 'utf8')
  const stageI = await readFile(new URL('../src/stageIInstrumentProductUi.js', import.meta.url), 'utf8')
  const recovery = await readFile(new URL('../src/stageS12RendererSessionRecoveryUi.js', import.meta.url), 'utf8')

  assert.match(overlay, /selectPackage3ExactNote/)
  assert.match(overlay, /queueMicrotask/)
  assert.match(overlay, /renderScheduled/)
  assert.doesNotMatch(overlay, /selectPackage3MeasureKey|selectPackage3NoteIndex/)

  assert.match(stageI, /stageICurrentRoutingNotes/)
  assert.match(stageI, /selectionNotes/)
  assert.match(stageI, /renderGuitarTabPanel/)
  assert.match(stageI, /renderViolinPanel/)
  assert.match(stageI, /queueMicrotask/)

  assert.match(recovery, /resolvePrDProductMusicXml/)
  assert.match(recovery, /current-product-revision-musicxml-unavailable/)
  assert.match(recovery, /bindStagePrBEditorSelection/)
  assert.match(recovery, /syncScoreNoteHighlight/)
  assert.match(recovery, /queueMicrotask/)
  assert.doesNotMatch(recovery, /Audiveris|OMR|OmrProvider|gatewayProvider|runOmr|getUserMedia|AudioContext/i)

  const prEModules = `${overlay}\n${stageI}\n${recovery}`
  assert.doesNotMatch(prEModules, /rhythm-btn|Müziği Dinle|playSelectedMeasure|resolvePlaybackQualityGate/)
})
