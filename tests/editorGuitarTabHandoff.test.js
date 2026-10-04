import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SmoosicTestDOMParser,
  SmoosicTestXMLSerializer,
} from './support/smoosicXmlDom.js'
import {
  prepareTeacherAssignmentScoreUpload,
} from '../src/services/teacherAssignmentComposerScoreUpload.js'
import {
  prepareEditorGuitarTabHandoff,
} from '../src/services/editorGuitarTabHandoff.js'

globalThis.DOMParser = SmoosicTestDOMParser
globalThis.XMLSerializer = SmoosicTestXMLSerializer

const PITCHES = Object.freeze({
  C4: { step: 'C', octave: 4 },
  D4: { step: 'D', octave: 4 },
  E4: { step: 'E', octave: 4 },
  G4: { step: 'G', octave: 4 },
  B4: { step: 'B', octave: 4 },
})

function pitchXml(pitch) {
  return `<pitch><step>${pitch.step}</step>${pitch.alter ? `<alter>${pitch.alter}</alter>` : ''}<octave>${pitch.octave}</octave></pitch>`
}

function scoreNote(event, staff = null, technical = null) {
  const staffXml = staff === null ? '' : `<staff>${staff}</staff>`
  const technicalXml = technical === null
    ? ''
    : `<notations><technical><string>${technical.string}</string><fret>${technical.fret}</fret></technical></notations>`
  return `<note>${pitchXml(event.pitch)}<duration>${event.duration ?? 1}</duration><voice>${event.voice}</voice><type>quarter</type>${staffXml}${technicalXml}</note>`
}

function voiceTracks(events, staff, technicalById = null) {
  const voices = [...new Set(events.map((event) => event.voice))]
    .sort((a, b) => Number(a) - Number(b))
  const extent = Math.max(...events.map((event) => (event.onset ?? 0) + (event.duration ?? 1)))
  let xml = ''
  voices.forEach((voice, index) => {
    let cursor = 0
    const inVoice = events
      .filter((event) => event.voice === voice)
      .sort((a, b) => (a.onset ?? 0) - (b.onset ?? 0))
    for (const event of inVoice) {
      const onset = event.onset ?? 0
      if (onset > cursor) {
        xml += `<forward><duration>${onset - cursor}</duration></forward>`
      }
      xml += scoreNote(
        event,
        staff,
        technicalById === null ? null : technicalById[event.id],
      )
      cursor = onset + (event.duration ?? 1)
    }
    if (cursor < extent) {
      xml += `<forward><duration>${extent - cursor}</duration></forward>`
    }
    if (index < voices.length - 1) {
      xml += `<backup><duration>${extent}</duration></backup>`
    }
  })
  return { xml, extent }
}

function sourceScore(events) {
  const { xml } = voiceTracks(events, null)
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Source</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      ${xml}
    </measure>
  </part>
</score-partwise>`
}

function editorTab(events, technicalById, { staffLines = 6 } = {}) {
  const staff1 = voiceTracks(events, 1)
  const staff2 = voiceTracks(events, 2, technicalById)
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar TAB</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>TAB</sign><line>5</line></clef>
        <staff-details number="2" show-frets="numbers">
          <staff-type>alternate</staff-type>
          <staff-lines>${staffLines}</staff-lines>
          <staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
          <staff-tuning line="2"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
          <staff-tuning line="3"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="5"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
          <staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>
        </staff-details>
      </attributes>
      ${staff1.xml}
      <backup><duration>${staff1.extent}</duration></backup>
      ${staff2.xml}
    </measure>
  </part>
</score-partwise>`
}

async function preparedScore(events, draftId = 'draft-a') {
  return prepareTeacherAssignmentScoreUpload({
    musicXml: sourceScore(events),
    teacherId: 'teacher-a',
    draftId,
    now: () => '2026-10-04T10:00:00Z',
  })
}

const SINGLE = Object.freeze([
  Object.freeze({ id: 'n1', pitch: PITCHES.C4, voice: '1', onset: 0, duration: 1 }),
])

const SINGLE_POSITION = Object.freeze({
  n1: Object.freeze({ string: 2, fret: 1 }),
})

test('GTAB-04 accepts Editor direct-pitch C4 as string 2 fret 1 and preserves exact bytes', async () => {
  const scoreUpload = await preparedScore(SINGLE)
  const tabXml = editorTab(SINGLE, SINGLE_POSITION)

  const result = await prepareEditorGuitarTabHandoff({
    scoreUpload,
    guitarTabMusicXml: tabXml,
    draftId: 'draft-a',
  })

  assert.equal(result.schemaVersion, '1.0.0')
  assert.equal(result.draftId, 'draft-a')
  assert.equal(result.scoreMusicXmlFingerprint, scoreUpload.musicXmlFingerprint)
  assert.match(result.guitarTabMusicXmlFingerprint, /^[0-9a-f]{64}$/u)
  assert.equal(result.guitarTabMusicXml, tabXml)
  assert.equal(result.pitchedEventCount, 1)
})

test('GTAB-04 rejects malformed TAB shape and missing technical data', async () => {
  const scoreUpload = await preparedScore(SINGLE)
  const noTechnical = editorTab(SINGLE, { n1: null })
  const wrongLines = editorTab(SINGLE, SINGLE_POSITION, { staffLines: 5 })

  await assert.rejects(
    prepareEditorGuitarTabHandoff({ scoreUpload, guitarTabMusicXml: noTechnical, draftId: 'draft-a' }),
    /technical/i,
  )
  await assert.rejects(
    prepareEditorGuitarTabHandoff({ scoreUpload, guitarTabMusicXml: wrongLines, draftId: 'draft-a' }),
    /staff-lines|six-line|shape/i,
  )
})

test('GTAB-04 rejects wrong physical position and fret above Editor ceiling', async () => {
  const scoreUpload = await preparedScore(SINGLE)

  await assert.rejects(
    prepareEditorGuitarTabHandoff({
      scoreUpload,
      guitarTabMusicXml: editorTab(SINGLE, { n1: { string: 1, fret: 0 } }),
      draftId: 'draft-a',
    }),
    /position|pitch|physical/i,
  )

  await assert.rejects(
    prepareEditorGuitarTabHandoff({
      scoreUpload,
      guitarTabMusicXml: editorTab(SINGLE, { n1: { string: 6, fret: 21 } }),
      draftId: 'draft-a',
    }),
    /fret/i,
  )
})

test('GTAB-04 rejects stale or semantically mismatched TAB', async () => {
  const scoreUpload = await preparedScore(SINGLE)
  const changed = [
    { ...SINGLE[0], pitch: PITCHES.D4 },
  ]

  await assert.rejects(
    prepareEditorGuitarTabHandoff({
      scoreUpload,
      guitarTabMusicXml: editorTab(changed, { n1: { string: 2, fret: 3 } }),
      draftId: 'draft-a',
    }),
    /semantic|score|mismatch/i,
  )

  await assert.rejects(
    prepareEditorGuitarTabHandoff({
      scoreUpload,
      guitarTabMusicXml: editorTab(SINGLE, SINGLE_POSITION),
      draftId: 'draft-other',
    }),
    /draft/i,
  )
})

test('GTAB-04 preserves Voice 1-4 and accepts a cross-voice four-note simultaneous group', async () => {
  const events = [
    { id: 'v1', pitch: PITCHES.C4, voice: '1', onset: 0, duration: 1 },
    { id: 'v2', pitch: PITCHES.E4, voice: '2', onset: 0, duration: 1 },
    { id: 'v3', pitch: PITCHES.G4, voice: '3', onset: 0, duration: 1 },
    { id: 'v4', pitch: PITCHES.B4, voice: '4', onset: 0, duration: 1 },
  ]
  const positions = {
    v1: { string: 2, fret: 1 },
    v2: { string: 1, fret: 0 },
    v3: { string: 4, fret: 17 },
    v4: { string: 3, fret: 16 },
  }
  const scoreUpload = await preparedScore(events, 'draft-poly')

  const result = await prepareEditorGuitarTabHandoff({
    scoreUpload,
    guitarTabMusicXml: editorTab(events, positions),
    draftId: 'draft-poly',
  })

  assert.equal(result.pitchedEventCount, 4)
})

test('GTAB-04 rejects same-string collision across different voices at one onset', async () => {
  const events = [
    { id: 'v1', pitch: PITCHES.C4, voice: '1', onset: 0, duration: 1 },
    { id: 'v2', pitch: PITCHES.G4, voice: '2', onset: 0, duration: 1 },
  ]
  const scoreUpload = await preparedScore(events, 'draft-collision')

  await assert.rejects(
    prepareEditorGuitarTabHandoff({
      scoreUpload,
      guitarTabMusicXml: editorTab(events, {
        v1: { string: 2, fret: 1 },
        v2: { string: 2, fret: 8 },
      }),
      draftId: 'draft-collision',
    }),
    /collision|string/i,
  )
})

test('GTAB-04 rejects altered voice identity even when pitch and onset match', async () => {
  const scoreEvents = [
    { id: 'n1', pitch: PITCHES.C4, voice: '1', onset: 0, duration: 1 },
  ]
  const tabEvents = [
    { id: 'n1', pitch: PITCHES.C4, voice: '2', onset: 0, duration: 1 },
  ]
  const scoreUpload = await preparedScore(scoreEvents, 'draft-voice')

  await assert.rejects(
    prepareEditorGuitarTabHandoff({
      scoreUpload,
      guitarTabMusicXml: editorTab(tabEvents, SINGLE_POSITION),
      draftId: 'draft-voice',
    }),
    /voice|semantic|mismatch/i,
  )
})
