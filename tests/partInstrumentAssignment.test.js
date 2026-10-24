import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { inspectMusicXml } from '../musicXmlSecurity.js'
import { SmoosicTestDOMParser, SmoosicTestXMLSerializer } from './support/smoosicXmlDom.js'
const assignment = await import('../src/services/musicXmlPartInstrumentAssignment.js').catch(() => ({}))

globalThis.DOMParser = SmoosicTestDOMParser
globalThis.XMLSerializer = SmoosicTestXMLSerializer
const xml = (ids = ['melody', 'bass']) => `<score-partwise version="4.0"><part-list>${ids.map(id => `<score-part id="${id}"><part-name>Voice</part-name><score-instrument id="${id}-I"><instrument-name>Voice Oohs</instrument-name></score-instrument><midi-instrument id="${id}-I"><midi-channel>1</midi-channel><midi-program>54</midi-program></midi-instrument></score-part>`).join('')}</part-list>${ids.map(id => `<part id="${id}"><measure number="1"><attributes><divisions>12</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>12</duration><instrument id="${id}-I"/></note></measure></part>`).join('')}</score-partwise>`
const map = (ids = ['melody', 'bass']) => ids.map((partId, i) => ({ partId, instrumentId: i ? 'GRAND_PIANO' : 'VIOLIN' }))
const body = value => new DOMParser().parseFromString(value).documentElement.children.filter(n => n.localName === 'part').map(n => new XMLSerializer().serializeToString(n))

test('explicit assignment previews correct declarations without altering any musical part body', async () => {
  assert.equal(typeof assignment.preparePartInstrumentAssignment, 'function', 'the approved part-assignment boundary must exist')
  const source = xml()
  const preview = await assignment.preparePartInstrumentAssignment({ musicXml: source, assignments: map() })
  assert.equal(preview.sourceFingerprint.length, 64)
  assert.deepEqual(body(preview.derivedMusicXml), body(source))
  assert.deepEqual(assignment.readMusicXmlPartInstrumentMap(preview.derivedMusicXml), { melody: 'VIOLIN', bass: 'GRAND_PIANO' })
  assert.equal(await assignment.confirmPartInstrumentAssignment({ musicXml: source, preview, confirmed: true }), preview.derivedMusicXml)
  assert.equal(source, xml())
})

test('preview confirmation rejects stale sources, changed assignments and forged derived bytes', async () => {
  const source = xml(), preview = await assignment.preparePartInstrumentAssignment({ musicXml: source, assignments: map() })
  for (const input of [
    { musicXml: source, preview, confirmed: false },
    { musicXml: source.replace('<step>C</step>', '<step>D</step>'), preview, confirmed: true },
    { musicXml: source, preview: { ...preview, derivedMusicXml: preview.derivedMusicXml.replace('<duration>12</duration>', '<duration>24</duration>') }, confirmed: true },
    { musicXml: source, preview: { ...preview, assignments: map().reverse().map(v => ({ ...v, instrumentId: 'CLASSICAL_GUITAR' })) }, confirmed: true },
  ]) await assert.rejects(assignment.confirmPartInstrumentAssignment(input))
})

for (const [name, assignments] of [
  ['missing', map().slice(0, 1)], ['extra', [...map(), { partId: 'unknown', instrumentId: 'VIOLIN' }]],
  ['duplicate', [map()[0], map()[0]]], ['unknown sound', map().map(v => ({ ...v, instrumentId: 'CELLO' }))],
]) test(`rejects ${name} assignments before producing a candidate`, async () => {
  await assert.rejects(assignment.preparePartInstrumentAssignment({ musicXml: xml(), assignments }))
})

test('different part IDs and reversed assignment order preserve exact identity', async () => {
  const ids = ['Piano-looking-ID', 'Violin-looking-ID']
  const p = await assignment.preparePartInstrumentAssignment({ musicXml: xml(ids), assignments: map(ids).reverse() })
  assert.deepEqual(assignment.readMusicXmlPartInstrumentMap(p.derivedMusicXml), { [ids[0]]: 'VIOLIN', [ids[1]]: 'GRAND_PIANO' })
})

test('unmarked scores retain the legacy route and malformed explicit markers fail closed', () => {
  assert.equal(assignment.readMusicXmlPartInstrumentMap(xml()), null)
  assert.throws(() => assignment.readMusicXmlPartInstrumentMap(xml().replace('<part-list>', '<identification><miscellaneous><miscellaneous-field name="seslitab-part-instruments-version">2</miscellaneous-field></miscellaneous></identification><part-list>')))
})

test('undeclared note instrument references and mid-score changes require correction rather than guessed routing', async () => {
  for (const source of [xml().replace('instrument id="melody-I"/>', 'instrument id="unknown"/>'), xml().replace('<duration>12</duration>', '<duration>12</duration><sound><midi-instrument id="melody-I"><midi-program>74</midi-program></midi-instrument></sound>')]) {
    await assert.rejects(assignment.preparePartInstrumentAssignment({ musicXml: source, assignments: map() }))
  }
})

test('the full 108-measure Vals retains every original note and musical part body', async () => {
  const original = await readFile(new URL('./fixtures/ses249/vals-original.musicxml', import.meta.url), 'utf8')
  const preview = await assignment.preparePartInstrumentAssignment({ musicXml: original, assignments: map(['P1', 'P2']) })
  assert.equal(preview.sourceFingerprint, '8acf6da23b8f1825185e83fb9d4e3e8ebd89d3dbef10609a31bbd5c312133b5b')
  assert.deepEqual(body(preview.derivedMusicXml), body(inspectMusicXml(original).xmlForParsing))
  const parts = new DOMParser().parseFromString(preview.derivedMusicXml).getElementsByTagName('part')
  assert.deepEqual(parts.map(p => p.getElementsByTagName('measure').length), [108, 108])
  assert.deepEqual(parts.map(p => p.getElementsByTagName('note').length), [315, 524])
  assert.equal(parts[0].getElementsByTagName('chord').length, 47, 'polyphonic target notes are preserved, never reduced to a guessed melody')
})

for (const ids of [['solo'], ['a', 'b', 'c']]) test(`supports ${ids.length} explicitly assigned parts without inferring from display labels`, async () => {
  const assignments = ids.map((partId, i) => ({ partId, instrumentId: ['CLASSICAL_GUITAR', 'GRAND_PIANO', 'VIOLIN'][i] }))
  const p = await assignment.preparePartInstrumentAssignment({ musicXml: xml(ids), assignments })
  assert.deepEqual(assignment.readMusicXmlPartInstrumentMap(p.derivedMusicXml), Object.fromEntries(assignments.map(r => [r.partId, r.instrumentId])))
})

test('missing static declarations can be assigned without adding instrument references to any note', async () => {
  const source = xml().replace(/<score-instrument[\s\S]*?<\/score-instrument>/g, '').replace(/<midi-instrument[\s\S]*?<\/midi-instrument>/g, '').replace(/<instrument[^>]*\/>/g, '')
  const preview = await assignment.preparePartInstrumentAssignment({ musicXml: source, assignments: map() })
  assert.deepEqual(body(preview.derivedMusicXml), body(source))
  assert.deepEqual(assignment.readMusicXmlPartInstrumentMap(preview.derivedMusicXml), { melody: 'VIOLIN', bass: 'GRAND_PIANO' })
})

test('adding an omitted MIDI program preserves MusicXML child ordering before volume and pan', async () => {
  const source = xml().replace(/<midi-program>54<\/midi-program>/g, '<volume>78</volume><pan>0</pan>')
  const preview = await assignment.preparePartInstrumentAssignment({ musicXml: source, assignments: map() })
  const nodes = new DOMParser().parseFromString(preview.derivedMusicXml).getElementsByTagName('midi-instrument')
  for (const node of nodes) assert.deepEqual(node.children.map(n => n.localName), ['midi-channel', 'midi-program', 'volume', 'pan'])
})

test('duplicate global instrument identities are rejected rather than emitted as ambiguous IDREFs', async () => {
  await assert.rejects(assignment.preparePartInstrumentAssignment({ musicXml: xml().replaceAll('bass-I', 'melody-I'), assignments: map() }))
})

test('reassignment of a previously approved map has one marker and remains reversible to its source', async () => {
  const first = await assignment.preparePartInstrumentAssignment({ musicXml: xml(), assignments: map() })
  const second = await assignment.preparePartInstrumentAssignment({ musicXml: first.derivedMusicXml, assignments: map().map(r => ({ ...r, instrumentId: 'CLASSICAL_GUITAR' })) })
  assert.equal(second.derivedMusicXml.split('name="seslitab-part-instruments-version"').length - 1, 1)
  assert.deepEqual(body(second.derivedMusicXml), body(first.derivedMusicXml))
  assert.deepEqual(assignment.readMusicXmlPartInstrumentMap(second.derivedMusicXml), { melody: 'CLASSICAL_GUITAR', bass: 'CLASSICAL_GUITAR' })
})

for (const [label, transform] of [
  ['duplicate declarations', s => s.replace('</part-list>', s.match(/<score-part id="melody">[\s\S]*?<\/score-part>/)[0] + '</part-list>')],
  ['unknown part body', s => s.replace('<part id="bass">', '<part id="unknown">')],
  ['ambiguous MIDI IDs', s => s.replace('</score-part>', '<midi-instrument id="melody-I"><midi-program>1</midi-program></midi-instrument></score-part>')],
  ['percussion profile', s => s.replace('<midi-channel>1</midi-channel>', '<midi-channel>10</midi-channel>')],
  ['external entity', s => '<!DOCTYPE score-partwise [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + s],
]) test(`rejects ${label} without offering an unverified candidate`, async () => {
  await assert.rejects(assignment.preparePartInstrumentAssignment({ musicXml: transform(xml()), assignments: map() }))
})
