import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const editorRoot = process.env.GTAB_EDITOR_ROOT

function score(attributes) {
  return `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Source</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions>${attributes}</attributes><note><pitch><step>C</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff><type>quarter</type></note></measure></part></score-partwise>`
}

test('SES-220 exact runtime treats clef octave as notation context, not physical transpose', {
  skip: !editorRoot,
}, async () => {
  const editor = await import(pathToFileURL(path.resolve(editorRoot, 'src/index.js')).href)
  const sourceXml = score('<clef number="1"><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>')

  const session = editor.createSourceSession(sourceXml)
  assert.equal(session.sourceXml, sourceXml)
  assert.equal(session.events.length, 1)
  assert.equal(session.events[0].pitch.midi, 61)
  assert.equal(session.events[0].soundingPitchMidi, 61)

  const document = editor.createTabAssignmentDocument(session)
  assert.throws(
    () => document.assignPosition(session.events[0].sourceEventId, { string: 5, fret: 4 }),
    /pitch/i,
  )
  assert.deepEqual(
    document.assignPosition(session.events[0].sourceEventId, { string: 2, fret: 2 }),
    { string: 2, fret: 2 },
  )
  assert.equal(document.canExport(), true)

  const output = editor.serializeGuitarTabMusicXml({ sourceSession: session, document })
  assert.match(output, /<technical><string>2<\/string><fret>2<\/fret><\/technical>/u)
  assert.match(output, /<clef number="1"><sign>G<\/sign><line>2<\/line><clef-octave-change>-1<\/clef-octave-change><\/clef>/u)
  assert.doesNotMatch(output, /<transpose>/u)
  assert.equal(session.sourceXml, sourceXml)
})

test('SES-220 exact runtime applies explicit source transpose once', {
  skip: !editorRoot,
}, async () => {
  const editor = await import(pathToFileURL(path.resolve(editorRoot, 'src/index.js')).href)
  const sourceXml = score('<transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>')
  const session = editor.createSourceSession(sourceXml)

  assert.equal(session.events[0].pitch.midi, 61)
  assert.equal(session.events[0].soundingPitchMidi, 49)
  const document = editor.createTabAssignmentDocument(session)
  document.assignPosition(session.events[0].sourceEventId, { string: 5, fret: 4 })
  const output = editor.serializeGuitarTabMusicXml({ sourceSession: session, document })
  assert.equal((output.match(/<transpose>/gu) ?? []).length, 1)
  assert.equal(session.sourceXml, sourceXml)
})
