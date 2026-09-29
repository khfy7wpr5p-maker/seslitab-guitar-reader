import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import '../scripts/runOmrQualityReport.js'
import { createSmoosicStructuralActionTracker } from '../experiments/smoosic-mobile/src/seslitab-structural-action-provenance.js'

const moduleUrl = new URL('../src/services/smoosicCeStructIdentityBridge.js', import.meta.url)

async function api() {
  assert.equal(existsSync(fileURLToPath(moduleUrl)), true)
  return import(moduleUrl)
}

const xml = `<score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>8</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>
<note><pitch><step>D</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>
</measure></part></score-partwise>`

function revision() {
  return {
    revisionId: 'rev-1',
    sourceId: 'source-1',
    content: [
      {
        partId: 'P1', partIndex: 0, measureIndex: 0, measureKey: 'P1:0',
        voice: 1, staff: 1, isRest: false, isChordNote: false, durationValue: 8,
      },
      {
        partId: 'P1', partIndex: 0, measureIndex: 0, measureKey: 'P1:0',
        voice: 1, staff: 1, isRest: false, isChordNote: false, durationValue: 8,
      },
    ],
  }
}

function editorScore() {
  return {
    staves: [{
      partInfo: { stavesBefore: 0, stavesAfter: 0 },
      measures: [{ voices: [{ notes: [
        { attrs: { id: 'a' }, noteType: 'n', tickCount: 8, pitches: [{ letter: 'c' }] },
        { attrs: { id: 'b' }, noteType: 'n', tickCount: 8, pitches: [{ letter: 'd' }] },
      ] }] }],
    }],
  }
}

test('host independently reproduces the editor base mapping fingerprint', async () => {
  const { createSmoosicCeStructIdentityBridge } = await api()
  const bridge = createSmoosicCeStructIdentityBridge({
    currentRevision: revision(),
    currentMusicXml: xml,
  })

  const tracker = createSmoosicStructuralActionTracker()
  const score = editorScore()
  tracker.beginImport({ score, editorSessionId: 'session-1' })
  score.staves[0].measures[0].voices[0].notes[0].tickCount = 16
  tracker.recordDurationAction({
    note: score.staves[0].measures[0].voices[0].notes[0],
    beforeDuration: 8,
    afterDuration: 16,
  })
  const manifest = tracker.createApplyManifest({ sourceRevision: 1, actionId: 'apply-1' })

  assert.equal(bridge.baseMappingFingerprint, manifest.baseMappingFingerprint)
  assert.equal(bridge.eventIdForRawOrdinal(0), 'seslitab:rev-1:event:0')
  assert.equal(bridge.rawOrdinalForEventId('seslitab:rev-1:event:1'), 1)
  assert.equal(bridge.records.length, 2)
})

test('identity bridge validates exact raw ordinal and stable locator without fallback', async () => {
  const { createSmoosicCeStructIdentityBridge } = await api()
  const bridge = createSmoosicCeStructIdentityBridge({
    currentRevision: revision(),
    currentMusicXml: xml,
  })

  const target = bridge.resolveManifestOperation({
    order: 0,
    operation: 'CHANGE_EVENT_DURATION',
    rawNoteOrdinal: 0,
    staffIndex: 0,
    measureIndex: 0,
    voiceIndex: 0,
    noteIndex: 0,
    noteIdentity: 'editor-only-id',
    before: 8,
    after: 16,
  })
  assert.equal(target.revisionIndex, 0)
  assert.equal(target.eventId, 'seslitab:rev-1:event:0')

  for (const changed of [
    { rawNoteOrdinal: 9 },
    { staffIndex: 1 },
    { measureIndex: 1 },
    { voiceIndex: 1 },
    { noteIndex: 1 },
  ]) {
    assert.throws(
      () => bridge.resolveManifestOperation({ ...target.manifestOperation, ...changed }),
      /ambiguous|identity|locator/i,
    )
  }
})

test('identity bridge fails closed on revision/XML drift instead of remapping by pitch or order', async () => {
  const { createSmoosicCeStructIdentityBridge } = await api()
  const changed = revision()
  changed.content[1] = { ...changed.content[1], staff: 2 }
  assert.throws(
    () => createSmoosicCeStructIdentityBridge({
      currentRevision: changed,
      currentMusicXml: xml,
    }),
    /drift|identity|MusicXML/i,
  )
})
