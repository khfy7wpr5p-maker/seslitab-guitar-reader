import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const editorRoot = process.env.GTAB_EDITOR_ROOT
if (!editorRoot) throw new Error('GTAB_EDITOR_ROOT is required.')

const editor = await import(pathToFileURL(path.resolve(editorRoot, 'src/index.js')).href)
const sourceXml = `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Source</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions></attributes><note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note></measure></part></score-partwise>`

const session = editor.createSourceSession(sourceXml, { guitarOctaveTransposition: true })
assert.equal(session.sourceXml, sourceXml)
assert.equal(session.events.length, 1)
assert.equal(session.events[0].pitch.midi, 69)
assert.equal(session.events[0].guitarSoundingMidi, 57)

const document = editor.createTabAssignmentDocument(session)
assert.throws(
  () => document.assignPosition(session.events[0].sourceEventId, { string: 1, fret: 5 }),
  /pitch/i,
)
assert.deepEqual(
  document.assignPosition(session.events[0].sourceEventId, { string: 3, fret: 2 }),
  { string: 3, fret: 2 },
)
assert.equal(document.canExport(), true)

const output = editor.serializeGuitarTabMusicXml({ sourceSession: session, document })
assert.match(output, /<pitch><step>A<\/step><octave>4<\/octave><\/pitch>/u)
assert.match(output, /<technical><string>3<\/string><fret>2<\/fret><\/technical>/u)
assert.match(output, /<transpose><diatonic>0<\/diatonic><chromatic>0<\/chromatic><octave-change>-1<\/octave-change><\/transpose>/u)

console.log('GTAB-OCTAVE-01 exact-runtime contract: PASS')
