// Regression tests for the equal-time guitar TAB presentation layer.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Installs the minimal DOMParser used by the repository's Node tests.
import '../scripts/runOmrQualityReport.js'
import { parseMusicXmlToNotes } from '../src/services/musicEngine.js'
import {
  buildTimedTabLayout,
  renderTimedTabHtml,
} from '../src/services/timedTabLayout.js'

function note(overrides = {}) {
  return {
    measureNumber: 1,
    measureKey: 'P1:0',
    measureIndex: 0,
    partId: 'P1',
    startBeat: 0,
    beats: 1,
    stringNumber: 1,
    fret: 0,
    voice: 1,
    isRest: false,
    isGrace: false,
    duration: 'quarter',
    dotCount: 0,
    beams: [],
    ...overrides,
  }
}

describe('Equal-time TAB grid', () => {
  test('quarter notes occupy four equal slots', () => {
    const layout = buildTimedTabLayout([
      note({ startBeat: 0, stringNumber: 1, fret: 0 }),
      note({ startBeat: 1, stringNumber: 2, fret: 1 }),
      note({ startBeat: 2, stringNumber: 3, fret: 2 }),
      note({ startBeat: 3, stringNumber: 4, fret: 3 }),
    ])

    const measure = layout.measures[0]
    assert.equal(measure.gridStepBeats, 1)
    assert.equal(measure.slotCount, 4)
    assert.equal(measure.rows[0].cells[0][0].fret, 0)
    assert.equal(measure.rows[1].cells[1][0].fret, 1)
    assert.equal(measure.rows[2].cells[2][0].fret, 2)
    assert.equal(measure.rows[3].cells[3][0].fret, 3)
  })

  test('eighth notes create half-beat slots', () => {
    const layout = buildTimedTabLayout([
      note({ startBeat: 0, beats: 0.5, fret: 3 }),
      note({ startBeat: 0.5, beats: 0.5, fret: 5 }),
      note({ startBeat: 1, beats: 0.5, fret: 7 }),
      note({ startBeat: 1.5, beats: 0.5, fret: 8 }),
    ])

    assert.equal(layout.measures[0].gridStepBeats, 0.5)
    assert.equal(layout.measures[0].slotCount, 4)
    assert.deepEqual(
      layout.measures[0].rows[0].cells.map((cell) => cell[0]?.fret ?? null),
      [3, 5, 7, 8]
    )
  })

  test('chord members on different strings share the same time column', () => {
    const layout = buildTimedTabLayout([
      note({ startBeat: 0, stringNumber: 1, fret: 0 }),
      note({ startBeat: 0, stringNumber: 2, fret: 1, isChordNote: true }),
      note({ startBeat: 0, stringNumber: 3, fret: 0, isChordNote: true }),
    ])

    const measure = layout.measures[0]
    assert.equal(measure.rows[0].cells[0][0].fret, 0)
    assert.equal(measure.rows[1].cells[0][0].fret, 1)
    assert.equal(measure.rows[2].cells[0][0].fret, 0)
    assert.equal(layout.placedNoteCount, 3)
  })

  test('simultaneous voices are preserved instead of being overwritten', () => {
    const layout = buildTimedTabLayout([
      note({ startBeat: 0, stringNumber: 2, fret: 3, voice: 1 }),
      note({ startBeat: 0, stringNumber: 2, fret: 7, voice: 2 }),
    ])

    const cell = layout.measures[0].rows[1].cells[0]
    assert.deepEqual(cell.map((entry) => entry.fret), [3, 7])
    assert.equal(layout.placedNoteCount, 2)
    assert.match(layout.warnings[0], /aynı telde eşzamanlı perdeler/)
  })

  test('rests reserve time without drawing a fret', () => {
    const layout = buildTimedTabLayout([
      note({ startBeat: 0, beats: 1, isRest: true }),
      note({ startBeat: 1, beats: 1, stringNumber: 1, fret: 5 }),
    ])

    const measure = layout.measures[0]
    assert.equal(measure.slotCount, 2)
    assert.equal(measure.rows[0].cells[0].length, 0)
    assert.equal(measure.rows[0].cells[1][0].fret, 5)
    assert.equal(layout.pitchedNoteCount, 1)
  })

  test('stable measure keys keep repeated display numbers separate', () => {
    const layout = buildTimedTabLayout([
      note({ measureKey: 'P1:0', measureIndex: 0, measureNumber: 1, fret: 1 }),
      note({ measureKey: 'P1:1', measureIndex: 1, measureNumber: 1, fret: 2 }),
    ])

    assert.equal(layout.measures.length, 2)
    assert.equal(layout.measures[0].measureKey, 'P1:0')
    assert.equal(layout.measures[1].measureKey, 'P1:1')
  })

  test('invalid guitar positions are warned about and never invented', () => {
    const layout = buildTimedTabLayout([
      note({ stringNumber: 0, fret: 4 }),
      note({ stringNumber: 1, fret: 99 }),
    ])

    assert.equal(layout.pitchedNoteCount, 2)
    assert.equal(layout.placedNoteCount, 0)
    assert.equal(layout.warnings.length, 1)
    assert.match(layout.warnings[0], /2 nota için geçerli tel\/perde bulunamadı/)
  })

  test('triplets use an exact one-third-beat visual grid', () => {
    const layout = buildTimedTabLayout([
      note({ startBeat: 0, beats: 1 / 3, fret: 1 }),
      note({ startBeat: 1 / 3, beats: 1 / 3, fret: 2 }),
      note({ startBeat: 2 / 3, beats: 1 / 3, fret: 3 }),
    ])

    assert.ok(Math.abs(layout.measures[0].gridStepBeats - 1 / 3) < 1e-8)
    assert.equal(layout.measures[0].slotCount, 3)
  })

  test('pathological subdivisions are capped to a safe visual size', () => {
    const layout = buildTimedTabLayout([
      note({ startBeat: 0, beats: 1 / 59, fret: 1 }),
      note({ startBeat: 1 / 61, beats: 1 / 59, fret: 2 }),
    ])

    assert.ok(layout.measures[0].slotCount <= 96)
    assert.match(layout.warnings.join(' '), /sıkıştırıldı/)
  })

  test('explicit MusicXML beam states connect matching rhythm events', () => {
    const layout = buildTimedTabLayout([
      note({
        startBeat: 0,
        beats: 0.5,
        duration: 'eighth',
        fret: 3,
        beams: [{ number: 1, value: 'begin' }],
      }),
      note({
        startBeat: 0.5,
        beats: 0.5,
        duration: 'eighth',
        fret: 5,
        beams: [{ number: 1, value: 'end' }],
      }),
    ])

    const rhythmRow = layout.measures[0].rhythmRows[0]
    assert.deepEqual(rhythmRow.cells[0].beamSegments, [{ level: 1, span: 1 }])
    assert.equal(rhythmRow.cells[1].beamSegments.length, 0)
  })

  test('duration fallback uses flags without inventing beam connections', () => {
    const layout = buildTimedTabLayout([
      note({ beats: 0.25, duration: 'sixteenth', fret: 3 }),
      note({ startBeat: 0.25, beats: 0.25, duration: 'sixteenth', fret: 5 }),
    ])

    const rhythmRow = layout.measures[0].rhythmRows[0]
    assert.equal(rhythmRow.cells[0].fallbackFlagCount, 2)
    assert.equal(rhythmRow.cells[1].fallbackFlagCount, 2)
    assert.equal(rhythmRow.cells[0].beamSegments.length, 0)
  })

  test('MusicXML beam hooks remain directional and never become invented connections', () => {
    const layout = buildTimedTabLayout([
      note({
        beats: 0.25,
        duration: 'sixteenth',
        beams: [{ number: 2, value: 'backward hook' }],
      }),
    ])

    const event = layout.measures[0].rhythmRows[0].cells[0]
    assert.deepEqual(event.beamHooks, [
      { level: 2, direction: 'backward' },
    ])
    assert.equal(event.beamSegments.length, 0)
    assert.equal(event.fallbackFlagCount, 0)
  })

  test('conflicting simultaneous beam states stay suppressed after later notes', () => {
    const layout = buildTimedTabLayout([
      note({ fret: 3, beams: [{ number: 1, value: 'begin' }] }),
      note({
        fret: 5,
        stringNumber: 2,
        isChordNote: true,
        beams: [{ number: 1, value: 'end' }],
      }),
      note({
        fret: 7,
        stringNumber: 3,
        isChordNote: true,
        beams: [{ number: 1, value: 'begin' }],
      }),
    ])

    const event = layout.measures[0].rhythmRows[0].cells[0]
    assert.equal(event.beamStates.size, 0)
    assert.match(layout.warnings.join(' '), /çelişkili MusicXML kiriş bilgisi/)
  })
})

describe('Equal-time TAB HTML', () => {
  test('renders six strings and an equal CSS slot count', () => {
    const layout = buildTimedTabLayout([
      note({ startBeat: 0, stringNumber: 1, fret: 10 }),
      note({ startBeat: 1, stringNumber: 6, fret: 3 }),
    ])
    const html = renderTimedTabHtml(layout)

    assert.equal((html.match(/timed-tab-row/g) || []).length, 6)
    assert.match(html, /--tab-slot-count:2/)
    assert.match(html, />10</)
    assert.match(html, /Eşit aralıklı gitar TAB görünümü/)
  })

  test('renders rhythm stems and beams above the string rows', () => {
    const layout = buildTimedTabLayout([
      note({
        startBeat: 0,
        beats: 0.5,
        duration: 'eighth',
        fret: 3,
        beams: [{ number: 1, value: 'begin' }],
      }),
      note({
        startBeat: 0.5,
        beats: 0.5,
        duration: 'eighth',
        fret: 5,
        beams: [{ number: 1, value: 'end' }],
      }),
    ])
    const html = renderTimedTabHtml(layout)

    assert.ok(html.indexOf('timed-tab-rhythm') < html.indexOf('timed-tab-row'))
    assert.match(html, /timed-tab-stem/)
    assert.match(html, /timed-tab-beam level-1/)
  })

  test('renders MusicXML hook direction without adding a full beam', () => {
    const layout = buildTimedTabLayout([
      note({
        beats: 0.25,
        duration: 'sixteenth',
        beams: [{ number: 2, value: 'forward hook' }],
      }),
    ])
    const html = renderTimedTabHtml(layout)

    assert.match(html, /timed-tab-beam-hook forward level-2/)
    assert.doesNotMatch(html, /timed-tab-beam level-2/)
  })

  test('presentation CSS centers frets on strings and prevents collapsed measures', () => {
    const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
    const styleCss = readFileSync(path.join(repoRoot, 'src', 'style.css'), 'utf8')

    assert.match(styleCss, /--tab-measure-min-width:\s*18rem/)
    assert.match(
      styleCss,
      /\.timed-tab-cell\s*\{[^}]*background:\s*linear-gradient\(to bottom,\s*transparent 48%/s
    )
    assert.match(
      styleCss,
      /\.timed-tab-fret\s*\{[^}]*top:\s*50%[^}]*transform:\s*translate\(-50%,\s*-50%\)/s
    )
    assert.match(styleCss, /\.timed-tab-beam-hook\.backward/)
  })

  test('empty layouts return a readable message', () => {
    const html = renderTimedTabHtml(buildTimedTabLayout([]))
    assert.match(html, /Gösterilecek gitar TAB verisi bulunamadı/)
  })
})

describe('Reviewed real OMR fixtures', () => {
  const fixtureDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'fixtures',
    'real-omr'
  )

  for (const fileName of [
    'django-clean.xml',
    'fikriminincegulu-clean.xml',
    'fug1001-clean.xml',
    'gesi-clean.xml',
    'karayip-korsanlari-clean.xml',
    'samanyolu-clean.xml',
    'shostywaltz-clean.xml',
  ]) {
    test(`${fileName} keeps every pitched playback note in the TAB model`, () => {
      const xml = readFileSync(path.join(fixtureDir, fileName), 'utf8')
      const parsed = parseMusicXmlToNotes(xml)
      assert.equal(parsed.error, undefined)

      const layout = buildTimedTabLayout(parsed.notes)
      const pitchedCount = parsed.notes.filter((entry) => !entry.isRest).length

      assert.equal(layout.pitchedNoteCount, pitchedCount)
      assert.equal(layout.placedNoteCount, pitchedCount)
      assert.ok(layout.measures.length > 0)
      assert.ok(layout.measures.every((measure) => measure.rows.length === 6))
    })
  }
})

test('frontend exposes the equal-time TAB result tab without replacing existing outputs', () => {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const indexHtml = readFileSync(path.join(repoRoot, 'index.html'), 'utf8')
  const appJs = readFileSync(path.join(repoRoot, 'src', 'app.js'), 'utf8')

  assert.match(indexHtml, /data-tab="timed-tab"/)
  assert.match(indexHtml, /id="timed-tab-output"/)
  assert.match(appJs, /buildTimedTabLayout/)
  assert.match(appJs, /renderTimedTabHtml/)
  assert.match(appJs, /tab-timed-tab/)
})

test('MusicXML beam metadata reaches the equal-time TAB model unchanged', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <score-partwise version="4.0">
      <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
      <part id="P1">
        <measure number="1">
          <attributes><divisions>2</divisions></attributes>
          <note>
            <pitch><step>E</step><octave>4</octave></pitch>
            <duration>1</duration><voice>1</voice><type>eighth</type>
            <notations><technical><string>1</string><fret>0</fret></technical></notations>
            <beam number="1">begin</beam>
          </note>
          <note>
            <pitch><step>F</step><octave>4</octave></pitch>
            <duration>1</duration><voice>1</voice><type>eighth</type>
            <notations><technical><string>1</string><fret>1</fret></technical></notations>
            <beam number="1">end</beam>
          </note>
        </measure>
      </part>
    </score-partwise>`

  const parsed = parseMusicXmlToNotes(xml)
  assert.equal(parsed.error, undefined)
  assert.deepEqual(parsed.notes[0].beams, [{ number: 1, value: 'begin' }])
  assert.deepEqual(parsed.notes[1].beams, [{ number: 1, value: 'end' }])

  // The repository's intentionally minimal Node DOM shim does not retain
  // measure-level <divisions> for this inline XML. Beam transport is verified
  // above; provide deterministic onsets here to test the visual connection.
  const layout = buildTimedTabLayout(
    parsed.notes.map((note, index) => ({
      ...note,
      startBeat: index * 0.5,
    }))
  )
  assert.deepEqual(
    layout.measures[0].rhythmRows[0].cells[0].beamSegments,
    [{ level: 1, span: 1 }]
  )
})
