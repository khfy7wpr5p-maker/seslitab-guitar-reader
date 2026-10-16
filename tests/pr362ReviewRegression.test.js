import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clearPackage3Notes,
  getPackage3MeasureSnapshot,
  publishPackage3Notes,
  selectPackage3MeasureKey,
  selectPackage3NoteIndex,
} from '../package3MeasureBridge.js'
import {
  beginScorePlaybackHighlight,
  endScorePlaybackHighlight,
  syncScoreNoteHighlight,
  syncScorePlaybackNoteHighlight,
} from '../src/scoreViewUi.js'
import { validateGuitarTabExport } from '../src/services/guitarTabExportValidator.js'
import { GUITAR_TAB_PITCH_POLICY } from '../src/services/guitarTabPitchPolicy.js'
import { SmoosicTestDOMParser } from './support/smoosicXmlDom.js'

const TARGET = Object.freeze({ partId: 'P1', partIndex: 0, staff: 1, voice: 1 })

function note(step = 'A') {
  return {
    partId: 'P1',
    partIndex: 0,
    measureIndex: 0,
    measureKey: 'P1:0',
    voice: 1,
    staff: 1,
    startBeat: 0,
    step,
    isRest: false,
  }
}

function sourceXml({ measureNumber = '1', directionBefore = false } = {}) {
  const direction = '<direction><direction-type><words>dolce</words></direction-type></direction>'
  return `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Source</part-name></score-part></part-list><part id="P1"><measure number="${measureNumber}"><attributes><divisions>1</divisions><clef><sign>G</sign><line>2</line></clef></attributes>${directionBefore ? direction : ''}<note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>${directionBefore ? '' : direction}</measure></part></score-partwise>`
}

function tabXml({ measureNumber = '1', directionBefore = false } = {}) {
  const direction = '<direction><direction-type><words>dolce</words></direction-type></direction>'
  return `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Source</part-name></score-part></part-list><part id="P1"><measure number="${measureNumber}"><attributes><divisions>1</divisions><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>TAB</sign><line>5</line></clef><staff-details number="2"><staff-type>alternate</staff-type><staff-lines>6</staff-lines><staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning><staff-tuning line="2"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning><staff-tuning line="3"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning><staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning><staff-tuning line="5"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning><staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning></staff-details></attributes>${directionBefore ? direction : ''}<note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>${directionBefore ? '' : direction}<backup><duration>1</duration></backup><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>5</voice><staff>2</staff><notations><technical><string>3</string><fret>2</fret></technical></notations></note></measure></part></score-partwise>`
}

function validate(scoreMusicXml, guitarTabMusicXml) {
  return validateGuitarTabExport({
    scoreMusicXml,
    guitarTabMusicXml,
    targetSelection: TARGET,
    guitarPitchPolicy: GUITAR_TAB_PITCH_POLICY.STANDARD_GUITAR_WRITTEN,
    DOMParserCtor: SmoosicTestDOMParser,
  })
}

test('PR362 restores the cached static score highlight after playback clears the renderer', async () => {
  const notes = [note()]
  publishPackage3Notes(notes)
  assert.equal(selectPackage3MeasureKey('P1:0'), true)
  assert.equal(selectPackage3NoteIndex(0), true)

  const status = { dataset: {}, textContent: '' }
  const root = { getElementById: (id) => id === 'score-view-note-sync' ? status : null }
  const calls = []
  const runtime = {
    async clearHighlights() { calls.push('clear') },
    async highlight(payload) { calls.push(payload) },
  }

  try {
    assert.equal(await syncScoreNoteHighlight(root, getPackage3MeasureSnapshot(), runtime), true)
    const token = beginScorePlaybackHighlight(root, notes, runtime)
    assert.equal(await syncScorePlaybackNoteHighlight(root, 0, token, runtime), true)
    assert.equal(await endScorePlaybackHighlight(root, token, runtime), true)

    const highlightCalls = calls.filter((entry) => typeof entry === 'object')
    assert.equal(highlightCalls.length, 3)
    assert.deepEqual(highlightCalls.at(-1), {
      target: { partId: 'P1', measureIndex: 0, noteIndex: 0, voice: 1 },
      className: 'seslitab-note-focus',
    })
  } finally {
    clearPackage3Notes()
  }
})

test('PR362 rejects source measure attribute drift', () => {
  const result = validate(sourceXml({ measureNumber: '1' }), tabXml({ measureNumber: '99' }))
  assert.deepEqual(
    { ok: result.ok, category: result.category, code: result.code },
    { ok: false, category: 'SEMANTIC', code: 'SOURCE_SCORE_SEMANTIC_MISMATCH' },
  )
})

test('PR362 rejects moving a context element across a note onset', () => {
  const result = validate(sourceXml({ directionBefore: true }), tabXml({ directionBefore: false }))
  assert.deepEqual(
    { ok: result.ok, category: result.category, code: result.code },
    { ok: false, category: 'SEMANTIC', code: 'SOURCE_SCORE_SEMANTIC_MISMATCH' },
  )
})
