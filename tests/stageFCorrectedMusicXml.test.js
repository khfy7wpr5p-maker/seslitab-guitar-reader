import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  applyTeacherWorkspaceCorrection,
  createTeacherWorkspace,
} from '../src/services/teacherWorkspaceModel.js'
import { registerMusicXmlSourceForNotes } from '../src/services/musicXmlSourceRegistry.js'
import {
  canonicalizeStageFRevision,
} from '../src/services/stageFCanonicalization.js'
import {
  STAGE_F_CORRECTED_MUSICXML_STATUS,
  materializeAndRevalidateStageFCorrectedMusicXml,
} from '../src/services/stageFCorrectedMusicXml.js'

function note(overrides = {}) {
  return {
    measureKey: 'P1:0',
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
    frequency: 261.6255653005986,
    noteName: 'Do',
    string: 'A',
    fret: 3,
    tieStart: false,
    tieStop: false,
    tieContinue: false,
    ...overrides,
  }
}

function prepared() {
  const sourceNotes = [note()]
  registerMusicXmlSourceForNotes(sourceNotes, `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note></measure></part>
</score-partwise>`)
  const root = createTeacherWorkspace({
    content: sourceNotes,
    actorId: 'teacher-stage-f',
    sourceId: 'source-stage-f-materialization',
    automaticRevisionId: 'automatic-stage-f-materialization',
    historyId: 'history-stage-f-materialization',
    createdAt: '2026-08-30T18:30:00.000Z',
  })
  const corrected = applyTeacherWorkspaceCorrection({
    workspace: root,
    fieldKey: '0:step',
    value: 'D',
    revisionId: 'teacher-revision-materialization',
    eventId: 'teacher-event-materialization',
    operationId: 'teacher-operation-materialization',
    createdAt: '2026-08-30T18:31:00.000Z',
  })
  const canonicalized = canonicalizeStageFRevision({
    history: corrected.history,
    expectation: corrected.expectation,
    revisionId: 'canonical-revision-materialization',
    eventId: 'canonical-event-materialization',
    operationIdPrefix: 'canonical-operation-materialization',
    createdAt: '2026-08-30T18:32:00.000Z',
  })
  return { sourceNotes, canonicalized }
}

test('Stage F corrected MusicXML refuses to pretend success without a browser XML runtime', () => {
  const { sourceNotes, canonicalized } = prepared()
  const originalParser = globalThis.DOMParser
  const originalSerializer = globalThis.XMLSerializer
  try {
    Object.defineProperty(globalThis, 'DOMParser', { value: undefined, configurable: true, writable: true })
    Object.defineProperty(globalThis, 'XMLSerializer', { value: undefined, configurable: true, writable: true })
    const result = materializeAndRevalidateStageFCorrectedMusicXml({
      history: canonicalized.history,
      sourceNotes,
      canonicalizationEvidence: canonicalized.evidence,
    })
    assert.equal(result.ok, false)
    assert.equal(result.status, STAGE_F_CORRECTED_MUSICXML_STATUS.DOM_RUNTIME_UNAVAILABLE)
    assert.equal(result.musicXml, null)
  } finally {
    Object.defineProperty(globalThis, 'DOMParser', { value: originalParser, configurable: true, writable: true })
    Object.defineProperty(globalThis, 'XMLSerializer', { value: originalSerializer, configurable: true, writable: true })
  }
})

test('Stage F corrected MusicXML binds canonicalization evidence to the exact current revision', () => {
  const { sourceNotes, canonicalized } = prepared()
  const staleEvidence = Object.freeze({
    ...canonicalized.evidence,
    resultRevisionId: 'different-revision',
  })
  const result = materializeAndRevalidateStageFCorrectedMusicXml({
    history: canonicalized.history,
    sourceNotes,
    canonicalizationEvidence: staleEvidence,
  })
  assert.equal(result.ok, false)
  assert.equal(result.status, STAGE_F_CORRECTED_MUSICXML_STATUS.CANONICALIZATION_NOT_APPLICABLE)
})

test('Stage F corrected MusicXML requires the exact root source NoteObject array', () => {
  const { canonicalized } = prepared()
  const clonedNotes = [note()]
  const result = materializeAndRevalidateStageFCorrectedMusicXml({
    history: canonicalized.history,
    sourceNotes: clonedNotes,
    canonicalizationEvidence: canonicalized.evidence,
  })
  assert.equal(result.ok, false)
  assert.equal(result.status, STAGE_F_CORRECTED_MUSICXML_STATUS.SOURCE_EVIDENCE_MISSING)
})

test('Stage F product materialization does not import Package 12 sharing eligibility as its revalidation authority', async () => {
  const source = await readFile(new URL('../src/services/stageFCorrectedMusicXml.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /teacherShareEligibility|teacherCorrectionRevalidation|teacherStructuralCorrectionRevalidation|teacherShareAuthorization/)
  assert.match(source, /resolveMusicXmlSourceForNotes/)
  assert.match(source, /parseMusicXmlWithStructure/)
  assert.match(source, /extractMusicXmlStructuralEvidence/)
  assert.match(source, /validateStructuralRhythm/)
  assert.match(source, /canonicalizationEvidence/)
})
