import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { SmoosicTestDOMParser, SmoosicTestXMLSerializer } from './support/smoosicXmlDom.js'

globalThis.DOMParser = SmoosicTestDOMParser
globalThis.XMLSerializer = SmoosicTestXMLSerializer

async function api() {
  try { return await import('../src/services/musicXmlStaffToPartSplit.js') }
  catch { assert.fail('SES-248 staff-to-part split module must exist') }
}
const groupStart = '<part-group number="ensemble" type="start"><group-name>Ensemble</group-name><group-name-display><display-text>Ensemble</display-text></group-name-display><group-abbreviation>Ens.</group-abbreviation><group-symbol default-x="-5">bracket</group-symbol><group-barline>yes</group-barline><group-time/></part-group>'
const groupStop = '<part-group number="ensemble" type="stop"/>'
function groupedScore(before = groupStart, after = groupStop) {
  return score().replace('<part-list>', '<part-list>' + before).replace('</part-list>', after + '</part-list>')
}
for (const [name, before, after] of [
  ['named bracket and common barline', groupStart, groupStop],
  ['unnumbered brace', '<part-group type="start"><group-symbol>brace</group-symbol><group-barline>Mensurstrich</group-barline></part-group>', '<part-group type="stop"/>'],
  ['nested token-numbered groups', groupStart + '<part-group number="inner" type="start"><group-symbol>brace</group-symbol><group-barline>no</group-barline></part-group>', '<part-group number="inner" type="stop"/>' + groupStop],
]) test('preserves part-list ' + name + ' around both derived parts', async () => {
  const { prepareStaffToPartSplit } = await api()
  const source = groupedScore(before, after)
  const preview = await prepareStaffToPartSplit({ musicXml: source })
  const doc = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml)
  const list = doc.querySelector('part-list')
  const serializer = new SmoosicTestXMLSerializer()
  const parts = list.children.filter(node => node.tagName === 'score-part')
  assert.deepEqual(parts.map(part => part.getAttribute('id')), ['P1', 'P2'])
  const xml = serializer.serializeToString(list)
  assert.ok(xml.startsWith('<part-list>' + before), 'group starts and their complete metadata survive')
  assert.ok(xml.endsWith(after + '</part-list>'), 'both new parts stay inside the original groups')
  assert.equal(preview.sourceMusicXml, source)
  assert.deepEqual(events(preview.derivedMusicXml), [
    { partId: 'P1', notes: [['E', 0, 2, '1'], ['F', 2, 2, '1']] },
    { partId: 'P2', notes: [['C', 0, 2, '1'], ['G', 0, 2, '1'], ['D', 2, 2, '1']] },
  ])
})

for (const [name, corrupt] of [
  ['removed groups', xml => xml.replace(/<part-group\b[^>]*\/>|<part-group\b[^>]*>[\s\S]*?<\/part-group>/g, '')],
  ['changed barline', xml => xml.replace('<group-barline>yes</group-barline>', '<group-barline>no</group-barline>')],
  ['truncated membership', xml => xml.replace(groupStop, '').replace('<score-part id="P2">', groupStop + '<score-part id="P2">')],
]) test('rejects serialized part-list with ' + name, async () => {
  const { prepareStaffToPartSplit } = await api()
  let corrupted = false
  class CorruptedGroupSerializer extends SmoosicTestXMLSerializer {
    serializeToString(node) {
      const xml = super.serializeToString(node)
      if (node.tagName !== '#document') return xml
      const changed = corrupt(xml)
      corrupted = changed !== xml
      return changed
    }
  }
  globalThis.XMLSerializer = CorruptedGroupSerializer
  try {
    await assert.rejects(() => prepareStaffToPartSplit({ musicXml: groupedScore() }), /part-list-integrity/)
    assert.equal(corrupted, true)
  } finally { globalThis.XMLSerializer = SmoosicTestXMLSerializer }
})
import { note, score } from './support/staffSplitFixture.js'
test('retains measure IDs on the first part without rejecting the duplicate container', async () => {
  const source = score().replace('<measure number="1">', '<measure number="1" id="m1" implicit="no">')
  const preview = await (await api()).prepareStaffToPartSplit({ musicXml: source })
  const doc = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml)
  assert.deepEqual(doc.querySelectorAll('measure').map(m => m.getAttribute('id')), ['m1', null])
  assert.ok(doc.querySelectorAll('measure').every(m => m.getAttribute('implicit') === 'no'))
  assert.equal(preview.sourceMusicXml, source)
  assert.deepEqual(events(preview.derivedMusicXml), events((await (await api()).prepareStaffToPartSplit({ musicXml: score() })).derivedMusicXml))
})
for (const raw of ['01', '+1', ' 001 ', '02', '+2', ' 002 ']) test('accepts positive-integer staff spelling ' + JSON.stringify(raw), async () => {
  const staff = Number(raw)
  const direction = '<direction><direction-type><words>pizz.</words></direction-type><staff>' + raw + '</staff></direction>'
  const source = score().replaceAll('<staff>' + staff + '</staff>', '<staff>' + raw + '</staff>').replace('<note>', direction + '<note>')
  const preview = await (await api()).prepareStaffToPartSplit({ musicXml: source })
  const doc = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml)
  assert.deepEqual(doc.querySelectorAll('part').map(p => p.querySelectorAll('direction').length), staff === 1 ? [1, 0] : [0, 1])
  assert.ok(doc.querySelectorAll('staff').every(s => s.textContent === '1'))
  assert.equal(preview.sourceMusicXml, source)
})
test('rejects malformed out-of-range and empty staff values', async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const raw of ['', '0', '-1', '3', '1.0', '1e0', '0x1', '1 0']) {
    await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score().replace('<staff>1</staff>', '<staff>' + raw + '</staff>') }), /staff-ambiguous/)
  }
  const emptyDirection = '<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>90</per-minute></metronome></direction-type><staff/></direction>'
  await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score().replace('<note>', emptyDirection + '<note>') }), /staff-ambiguous/)
})
test('rejects loss of the retained measure ID during serialization', async () => {
  class MissingMeasureIdSerializer extends SmoosicTestXMLSerializer {
    serializeToString(node) {
      const xml = super.serializeToString(node)
      return node.tagName === '#document' ? xml.replace(' id="m1"', '') : xml
    }
  }
  globalThis.XMLSerializer = MissingMeasureIdSerializer
  try {
    await assert.rejects(() => api().then(({ prepareStaffToPartSplit }) => prepareStaffToPartSplit({ musicXml: score().replace('<measure number="1">', '<measure number="1" id="m1">') })), /semantic-integrity/)
  } finally { globalThis.XMLSerializer = SmoosicTestXMLSerializer }
})
function events(xml) {
  const doc = new SmoosicTestDOMParser().parseFromString(xml)
  return doc.querySelectorAll('part').map(part => {
    let cursor = 0, previous = 0
    const notes = []
    for (const child of part.querySelectorAll('measure')[0].children) {
      const duration = Number(child.querySelector('duration')?.textContent ?? 0)
      if (child.tagName === 'backup') cursor -= duration
      if (child.tagName === 'forward') cursor += duration
      if (child.tagName !== 'note') continue
      const chord = child.querySelector('chord') !== null
      const onset = chord ? previous : cursor
      if (!chord) { previous = cursor; cursor += duration }
      notes.push([child.querySelector('pitch step')?.textContent ?? 'rest', onset, duration, child.querySelector('voice')?.textContent])
    }
    return { partId: part.getAttribute('id'), notes }
  })
}

for (const [name, moves] of [
  ['forward', '<forward><duration>2</duration></forward>'],
  ['backup', '<backup><duration>2</duration></backup>'],
  ['round-trip cursor movement', '<backup><duration>2</duration></backup><forward><duration>2</duration></forward>'],
]) test('rejects a chord that reuses an anchor across ' + name, async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = note('G', 1, 4) + '<backup><duration>4</duration></backup>' +
    note('C', 2, 2) + moves + note('E', 2, 2, '<chord/>')
  await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(body) }), /chord-anchor/)
})

for (const [name, moves, want] of [
  ['forward', '<forward><duration>2</duration></forward>', [['C', 0, 2, '1'], ['D', 4, 2, '1'], ['E', 4, 2, '1']]],
  ['backup', '<backup><duration>2</duration></backup>', [['C', 0, 2, '1'], ['D', 0, 2, '1'], ['E', 0, 2, '1']]],
]) test('preserves a chord with a fresh base note after ' + name, async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = note('G', 1, 4) + '<backup><duration>4</duration></backup>' +
    note('C', 2, 2) + moves + note('D', 2, 2) + note('E', 2, 2, '<chord/>')
  const source = score(body)
  const preview = await prepareStaffToPartSplit({ musicXml: source })
  assert.deepEqual(events(preview.derivedMusicXml)[1].notes, want)
  assert.equal(preview.sourceMusicXml, source)
})

test('splits exact two-staff notes and piano chord into independent parts without changing source', async () => {
  const { prepareStaffToPartSplit, confirmStaffToPartSplit } = await api()
  const source = score()
  const preview = await prepareStaffToPartSplit({ musicXml: source })
  assert.equal(preview.sourceMusicXml, source)
  assert.equal(preview.measureCount, 1)
  assert.deepEqual(preview.parts.map(p => [p.partId, p.sourceStaff, p.noteCount]), [['P1', 1, 2], ['P2', 2, 3]])
  assert.deepEqual(events(preview.derivedMusicXml), [
    { partId: 'P1', notes: [['E', 0, 2, '1'], ['F', 2, 2, '1']] },
    { partId: 'P2', notes: [['C', 0, 2, '1'], ['G', 0, 2, '1'], ['D', 2, 2, '1']] },
  ])
  const doc = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml)
  const parts = doc.querySelectorAll('part')
  assert.equal(parts[0].querySelector('clef sign').textContent, 'G')
  assert.equal(parts[1].querySelector('clef sign').textContent, 'F')
  assert.ok(doc.querySelectorAll('staff').every(s => s.textContent === '1'))
  assert.equal(Object.isFrozen(preview), true)
  assert.equal(Object.isFrozen(preview.parts[0]), true)
  assert.match(preview.sourceFingerprint, /^[a-f0-9]{64}$/)
  await assert.rejects(() => confirmStaffToPartSplit({ musicXml: source, preview }), /confirmation/)
  assert.equal(await confirmStaffToPartSplit({ musicXml: source, preview, confirmed: true }), preview.derivedMusicXml)
  assert.equal(source, preview.sourceMusicXml)
})

test('explicit preview cannot be applied to a stale source or tampered derived score', async () => {
  const { prepareStaffToPartSplit, confirmStaffToPartSplit } = await api()
  const musicXml = score()
  const preview = await prepareStaffToPartSplit({ musicXml })
  await assert.rejects(() => confirmStaffToPartSplit({ musicXml: score().replace('<step>E</step>', '<step>A</step>'), preview, confirmed: true }), /stale/)
  await assert.rejects(() => confirmStaffToPartSplit({ musicXml, preview: { ...preview, derivedMusicXml: '<score-partwise/>' }, confirmed: true }), /integrity/)
})

test('preserves second piano voice onsets rather than concatenating voices', async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = note('E', 1, 4) + '<backup><duration>4</duration></backup>' + note('C', 2, 4) + '<backup><duration>4</duration></backup><forward><duration>2</duration><voice>2</voice><staff>2</staff></forward>' + note('G', 2, 2, '', 2)
  const preview = await prepareStaffToPartSplit({ musicXml: score(body) })
  assert.deepEqual(events(preview.derivedMusicXml)[1].notes, [['C', 0, 4, '1'], ['G', 2, 2, '2']])
})

test('copies tuplets ties slurs tempo offsets rests key changes and repeat metadata', async () => {
  const { prepareStaffToPartSplit } = await api()
  const direction = '<direction><direction-type><words>dolce</words></direction-type><offset>1</offset><staff>1</staff><sound tempo="90"/></direction>'
  const notation = '<notations><slur type="start" number="1"/><slur type="stop" number="1"/><tuplet type="start"/><tuplet type="stop"/></notations><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><tie type="start"/><tie type="stop"/>'
  const source = score(direction + note('E', 1, 4).replace('</note>', notation + '</note>') + '<backup><duration>4</duration></backup><note><rest/><duration>4</duration><voice>1</voice><staff>2</staff></note><barline location="right"><repeat direction="backward"/></barline>', '<key><fifths>1</fifths></key>')
  const { derivedMusicXml } = await prepareStaffToPartSplit({ musicXml: source })
  for (const token of ['<actual-notes>3</actual-notes>', '<normal-notes>2</normal-notes>', '<offset>1</offset>', 'tempo="90"', '<rest/>', '<fifths>1</fifths>', '<tie type="start"/>']) assert.ok(derivedMusicXml.includes(token), token)
  const doc = new SmoosicTestDOMParser().parseFromString(derivedMusicXml)
  assert.equal(doc.querySelectorAll('repeat').length, 2)
  assert.equal(doc.querySelectorAll('direction').length, 1)
})

for (const [name, xml, error] of [
  ['negative source cursor', score(note('E', 1) + '<backup><duration>4</duration></backup>' + note('C', 2)), /negative-cursor/],
  ['cross staff chord', score(note('E', 1) + note('C', 2, 2, '<chord/>')), /cross-staff/],
  ['cross staff beam', score(note('E', 1).replace('</note>', '<beam number="1">begin</beam></note>') + note('C', 2).replace('</note>', '<beam number="1">end</beam></note>')), /cross-staff/],
  ['polyphonic violin', score(note('E', 1) + note('G', 1, 2, '<chord/>') + note('C', 2)), /polyphonic-violin/],
  ['unknown semantics', score('<figured-bass/>' + note('E', 1) + note('C', 2)), /unsupported/],
  ['missing staff', score(note('E', 1).replace('<staff>1</staff>', '') + note('C', 2)), /staff/],
  ['third staff', score(note('E', 1) + note('C', 3)), /staff/],
  ['already multipart', score().replace('</score-partwise>', '<part id="P2"/></score-partwise>'), /topology/],
  ['unsafe entities', '<!DOCTYPE score-partwise [<!ENTITY a SYSTEM "file:///tmp/x">]>' + score(), /unsafe/],
]) test('fails closed for ' + name, async () => {
  const { prepareStaffToPartSplit } = await api()
  await assert.rejects(() => prepareStaffToPartSplit({ musicXml: xml }), error)
})

test('original 24-measure pilot is rejected at measure 5 without guessing a musical correction', async () => {
  const { prepareStaffToPartSplit } = await api()
  const source = readFileSync(new URL('./fixtures/ses248/pilot-original.musicxml', import.meta.url), 'utf8')
  await assert.rejects(() => prepareStaffToPartSplit({ musicXml: source }), /measure-5.*negative-cursor/)
})


test('unnumbered clef belongs to staff one and does not replace the piano bass clef', async () => {
  const { prepareStaffToPartSplit } = await api()
  const source = score().replace('<clef number="1">', '<clef>')
  const preview = await prepareStaffToPartSplit({ musicXml: source })
  const doc = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml)
  assert.deepEqual(doc.querySelectorAll('part')[1].querySelectorAll('clef').map(c => c.querySelector('sign').textContent), ['F'])
})

test('cross-staff slur across different voices is not silently broken', async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = note('E', 1, 4).replace('</note>', '<notations><slur type="start" number="1"/></notations></note>') + '<backup><duration>4</duration></backup>' + note('C', 2, 4, '', 2).replace('</note>', '<notations><slur type="stop" number="1"/></notations></note>')
  await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(body) }), /cross-staff/)
})

test('global MusicXML IDs are never duplicated when copied to two parts', async () => {
  const { prepareStaffToPartSplit } = await api()
  const source = score().replace('<note>', '<direction id="shared"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>90</per-minute></metronome></direction-type><sound tempo="90"/></direction><note>')
  const preview = await prepareStaffToPartSplit({ musicXml: source })
  const doc = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml)
  assert.deepEqual(doc.querySelectorAll('direction').map(node => node.getAttribute('id')), ['shared', null])
  assert.deepEqual(doc.querySelectorAll('per-minute').map(node => node.textContent), ['90', '90'])
})

for (const [name, metadata, tag] of [
  ['standalone tempo', '<sound tempo="90" id="tempo-1"/>', 'sound'],
  ['nested tempo', '<direction id="direction-1"><direction-type><metronome id="metronome-1"><beat-unit>quarter</beat-unit><per-minute>90</per-minute></metronome></direction-type><sound tempo="90" id="tempo-1"/></direction>', 'direction'],
]) test('retains global ' + name + ' with original IDs on one copy', async () => {
  const { prepareStaffToPartSplit } = await api()
  const source = score(metadata + note('E', 1, 4) + '<backup><duration>4</duration></backup>' + note('C', 2, 4))
  const preview = await prepareStaffToPartSplit({ musicXml: source })
  const doc = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml)
  const parts = doc.querySelectorAll('part')
  assert.deepEqual(parts.map(part => part.querySelectorAll('sound').map(sound => sound.getAttribute('tempo'))), [['90'], ['90']])
  assert.equal(parts[0].querySelector(tag).getAttribute('id'), tag === 'sound' ? 'tempo-1' : 'direction-1')
  assert.equal(parts[1].querySelector(tag).getAttribute('id'), null)
  assert.ok(parts[1].querySelectorAll('sound').every(node => node.getAttribute('id') === null))
  assert.ok(parts[1].querySelectorAll('metronome').every(node => node.getAttribute('id') === null))
  assert.equal(preview.sourceMusicXml, source)
})

function scoreWithPlaybackReference(id = 'P0-I1', allNotes = false) {
  let source = score().replace('</part-name>', '</part-name><score-instrument id="P0-I1"><instrument-name>Piano</instrument-name></score-instrument>')
  const play = '<play' + (id === null ? '' : ' id="' + id + '"') + '><other-play type="technique">pizzicato</other-play></play>'
  return allNotes ? source.replaceAll('</note>', play + '</note>') : source.replace('</note>', play + '</note>')
}
for (const control of ['<assess type="yes" player="source-player"/>', '<wait player="source-player"/>', '<other-listen type="custom" player="source-player">follow</other-listen>']) test('retains player declaration for note listening control ' + control.split(' ')[0], async () => {
  const source = score().replace('</part-name>', '</part-name><player id="source-player"><player-name>Original performer</player-name></player>').replaceAll('</note>', '<listen>' + control + '</listen></note>')
  const preview = await (await api()).prepareStaffToPartSplit({ musicXml: source })
  const doc = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml)
  const declarations = doc.querySelectorAll('score-part')
  const ids = declarations.map(entry => entry.querySelector('player')?.getAttribute('id'))
  assert.ok(ids.every(Boolean)); assert.equal(new Set(ids).size, 2)
  assert.ok(declarations.every(entry => entry.querySelector('player-name').textContent === 'Original performer'))
  doc.querySelectorAll('part').forEach((part, index) => assert.ok(part.querySelectorAll('listen').every(listen => listen.children[0].getAttribute('player') === ids[index])))
  assert.equal(preview.sourceMusicXml, source)
})
for (const id of ['P1', 'P2', 'P1-I1', 'P2-I1']) test('allocates generated IDs around retained ' + id, async () => {
  const source = score().replace('<note>', '<direction id="' + id + '"><direction-type><words>pizz.</words></direction-type><staff>2</staff></direction><note>')
  const preview = await (await api()).prepareStaffToPartSplit({ musicXml: source })
  const doc = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml)
  assert.equal(doc.querySelector('direction').getAttribute('id'), id)
  const generated = doc.querySelectorAll('score-part').flatMap(entry => [entry.getAttribute('id'), entry.querySelector('score-instrument').getAttribute('id')])
  assert.ok(!generated.includes(id));assert.equal(new Set(generated).size, 4)
  assert.deepEqual(doc.querySelectorAll('part').map(part => part.getAttribute('id')), preview.parts.map(part => part.partId))
  assert.deepEqual((await (await api()).prepareStaffToPartSplit({ musicXml: source })).parts, preview.parts)
})
test('rejects unknown source player references', async () => {
  await assert.rejects(() => api().then(({ prepareStaffToPartSplit }) => prepareStaffToPartSplit({ musicXml: score().replace('</note>', '<listen><wait player="missing"/></listen></note>') })), /player-reference/)
})
for (const child of ['<midi-device id="original-instrument" port="1">Device</midi-device>']) test('remaps staff-local sound instrument reference ' + child.split(' ')[0], async () => {
  const source = score().replace('</part-name>', '</part-name><score-instrument id="original-instrument"><instrument-name>Piano</instrument-name></score-instrument>')
    .replace('<note>', '<direction><direction-type><words>device</words></direction-type><staff>2</staff><sound>' + child + '</sound></direction><note>')
  const preview = await (await api()).prepareStaffToPartSplit({ musicXml: source })
  const doc = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml)
  const target = doc.querySelectorAll('part')[1].querySelector('sound').children[0]
  assert.equal(target.getAttribute('id'), doc.querySelectorAll('score-part')[1].querySelector('score-instrument').getAttribute('id'))
  assert.equal(preview.sourceMusicXml, source)
})
test('retains the unsupported mid-score instrument-change boundary', async () => {
  const source = score().replace('</part-name>', '</part-name><score-instrument id="original-instrument"><instrument-name>Piano</instrument-name></score-instrument>')
    .replace('<note>', '<direction><direction-type><words>device</words></direction-type><staff>2</staff><sound><midi-instrument id="original-instrument"><midi-program>1</midi-program></midi-instrument></sound></direction><note>')
  await assert.rejects(() => api().then(({ prepareStaffToPartSplit }) => prepareStaffToPartSplit({ musicXml: source })), /unsupported-instrument-change/)
})
test('rejects serialized dangling metadata instrument reference', async () => {
  class WrongMetadataInstrumentSerializer extends SmoosicTestXMLSerializer {
    serializeToString(node) {
      const xml = super.serializeToString(node)
      return node.tagName === '#document' ? xml.replace('<midi-device id="P2-I1"', '<midi-device id="missing"') : xml
    }
  }
  const source = score().replace('</part-name>', '</part-name><score-instrument id="original-instrument"><instrument-name>Piano</instrument-name></score-instrument>')
    .replace('<note>', '<direction><direction-type><words>device</words></direction-type><staff>2</staff><sound><midi-device id="original-instrument">Device</midi-device></sound></direction><note>')
  globalThis.XMLSerializer = WrongMetadataInstrumentSerializer
  try { await assert.rejects(() => api().then(({ prepareStaffToPartSplit }) => prepareStaffToPartSplit({ musicXml: source })), /instrument-reference/) }
  finally { globalThis.XMLSerializer = SmoosicTestXMLSerializer }
})
test('allocates player IDs outside source player spellings to keep normalization unambiguous', async () => {
  const source = score().replace('</part-name>', '</part-name><player id="P1-M2"><player-name>First</player-name></player><player id="P1-M1"><player-name>Second</player-name></player>')
    .replace('</note>', '<listen><wait player="P1-M2"/></listen></note>')
  const preview = await (await api()).prepareStaffToPartSplit({ musicXml: source })
  const doc = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml)
  const first = doc.querySelector('score-part').querySelector('player')
  assert.equal(first.querySelector('player-name').textContent, 'First')
  assert.equal(doc.querySelector('wait').getAttribute('player'), first.getAttribute('id'))
})
for (const wrong of ['missing-player', 'P2-M1']) test('rejects serialized player reference outside its part: ' + wrong, async () => {
  class WrongPlayerSerializer extends SmoosicTestXMLSerializer {
    serializeToString(node) {
      const xml = super.serializeToString(node)
      return node.tagName === '#document' ? xml.replace('player="P1-M1"', 'player="' + wrong + '"') : xml
    }
  }
  const source = score().replace('</part-name>', '</part-name><player id="source-player"><player-name>Original</player-name></player>').replace('</note>', '<listen><wait player="source-player"/></listen></note>')
  globalThis.XMLSerializer = WrongPlayerSerializer
  try { await assert.rejects(() => api().then(({ prepareStaffToPartSplit }) => prepareStaffToPartSplit({ musicXml: source })), /player-reference/) }
  finally { globalThis.XMLSerializer = SmoosicTestXMLSerializer }
})
for (const [tag, content] of [['key', '<fifths>0</fifths>'], ['time', '<beats>2</beats><beat-type>4</beat-type>'], ['transpose', '<chromatic>0</chromatic>']]) test('preserves global ' + tag + ' attributes with a single original ID', async () => {
  const attr = '<' + tag + ' id="global-attribute">' + content + '</' + tag + '>'
  const source = tag === 'time' ? score().replace('<time><beats>2</beats><beat-type>4</beat-type></time>', attr)
    : tag === 'key' ? score().replace('<time>', attr + '<time>') : score(undefined, attr)
  const preview = await (await api()).prepareStaffToPartSplit({ musicXml: source })
  const doc = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml)
  assert.deepEqual(doc.querySelectorAll(tag).map(n => n.getAttribute('id')), ['global-attribute', null])
  assert.ok(doc.querySelectorAll(tag).every(n => n.textContent === new SmoosicTestDOMParser().parseFromString(attr).documentElement.textContent))
  assert.equal(preview.sourceMusicXml, source)
})
test('retains staff-local attribute IDs on their sole destination', async () => {
  const source = score().replace('<time>', '<key number="1" id="violin-key"><fifths>1</fifths></key><key number="2" id="piano-key"><fifths>-1</fifths></key><time>')
  const preview = await (await api()).prepareStaffToPartSplit({ musicXml: source })
  const doc = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml)
  assert.deepEqual(doc.querySelectorAll('part').map(p => p.querySelector('key').getAttribute('id')), ['violin-key', 'piano-key'])
  assert.ok(doc.querySelectorAll('key').every(n => n.getAttribute('number') === '1'))
})
test('rejects serialized loss of a retained attribute ID', async () => {
  class MissingAttributeIdSerializer extends SmoosicTestXMLSerializer {
    serializeToString(node) {
      const xml = super.serializeToString(node)
      return node.tagName === '#document' ? xml.replace(' id="violin-key"', '') : xml
    }
  }
  globalThis.XMLSerializer = MissingAttributeIdSerializer
  try {
    await assert.rejects(() => api().then(({ prepareStaffToPartSplit }) => prepareStaffToPartSplit({ musicXml: score().replace('<time>', '<key number="1" id="violin-key"><fifths>1</fifths></key><time>') })), /semantic-attributes-integrity/)
  } finally { globalThis.XMLSerializer = SmoosicTestXMLSerializer }
})
for (const allNotes of [false, true]) test('remaps playback instrument references without treating them as ID declarations: ' + (allNotes ? 'repeated references' : 'one reference'), async () => {
  const { prepareStaffToPartSplit } = await api()
  const source = scoreWithPlaybackReference('P0-I1', allNotes)
  const preview = await prepareStaffToPartSplit({ musicXml: source })
  const doc = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml)
  for (const part of doc.querySelectorAll('part')) {
    const expected = part.getAttribute('id') + '-I1'
    assert.ok(part.querySelectorAll('play').every(play => play.getAttribute('id') === expected))
  }
  assert.equal(doc.querySelectorAll('other-play').length, allNotes ? 5 : 1)
  assert.equal(preview.sourceMusicXml, source)
})
test('rejects unknown playback references and preserves optional implicit references', async () => {
  const { prepareStaffToPartSplit } = await api()
  await assert.rejects(() => prepareStaffToPartSplit({ musicXml: scoreWithPlaybackReference('unknown') }), /instrument-reference/)
  const preview = await prepareStaffToPartSplit({ musicXml: scoreWithPlaybackReference(null, true) })
  const doc = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml)
  assert.ok(doc.querySelectorAll('play').every(play => play.getAttribute('id') === null))
})
for (const badId of ['missing-instrument', 'P2-I1']) test('rejects serialized playback reference outside its declared part: ' + badId, async () => {
  const { prepareStaffToPartSplit } = await api()
  let corrupted = false
  class WrongReferenceSerializer extends SmoosicTestXMLSerializer {
    serializeToString(node) {
      const xml = super.serializeToString(node)
      if (node.tagName !== '#document') return xml
      const changed = xml.replace('<play id="P1-I1">', '<play id="' + badId + '">')
      corrupted = changed !== xml
      return changed
    }
  }
  globalThis.XMLSerializer = WrongReferenceSerializer
  try {
    await assert.rejects(() => prepareStaffToPartSplit({ musicXml: scoreWithPlaybackReference() }), /instrument-reference/)
    assert.equal(corrupted, true)
  } finally { globalThis.XMLSerializer = SmoosicTestXMLSerializer }
})

for (const [name, metadata] of [
  ['local words', '<direction><direction-type><words>pizz.</words></direction-type></direction>'],
  ['dynamics', '<direction><direction-type><dynamics><p/></dynamics></direction-type><sound dynamics="40"/></direction>'],
  ['chord symbol', '<harmony><root><root-step>C</root-step></root><kind>major</kind></harmony>'],
  ['tempo mixed with dynamics', '<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>90</per-minute></metronome></direction-type><sound tempo="90" dynamics="40"/></direction>'],
  ['tempo mixed with local words', '<direction><direction-type><words>pizz.</words><metronome><beat-unit>quarter</beat-unit><per-minute>90</per-minute></metronome></direction-type><sound tempo="90"/></direction>'],
  ['voice-local tempo', '<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>90</per-minute></metronome></direction-type><voice>1</voice><sound tempo="90"/></direction>'],
]) test('rejects ambiguous staffless ' + name + ' before producing a derived score', async () => {
  const { prepareStaffToPartSplit } = await api()
  const source = score(metadata + note('E', 1, 4) + '<backup><duration>4</duration></backup>' + note('C', 2, 4))
  await assert.rejects(() => prepareStaffToPartSplit({ musicXml: source }), /staff-ambiguous/)
})

test('standalone sound cannot bypass local metadata scope validation', async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const sound of ['<sound dynamics="40"/>', '<sound damper-pedal="yes"/>', '<sound tempo="90" dynamics="40"/>']) {
    await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(sound + note('E', 1, 4) +
      '<backup><duration>4</duration></backup>' + note('C', 2, 4)) }), /staff-ambiguous/)
  }
  const preview = await prepareStaffToPartSplit({ musicXml: score('<sound tempo="90"/>' + note('E', 1, 4) +
    '<backup><duration>4</duration></backup>' + note('C', 2, 4)) })
  const parts = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('part')
  assert.deepEqual(parts.map(part => part.querySelectorAll('sound').map(sound => sound.getAttribute('tempo'))), [['90'], ['90']])
})

test('preserves explicit staff-specific words dynamics and harmony on their target only', async () => {
  const { prepareStaffToPartSplit } = await api()
  const metadata = '<direction><direction-type><words>pizz.</words></direction-type><staff>1</staff></direction>' +
    '<direction><direction-type><dynamics><p/></dynamics></direction-type><staff>2</staff><sound dynamics="40"/></direction>' +
    '<harmony><root><root-step>C</root-step></root><kind>major</kind><staff>2</staff></harmony>'
  const preview = await prepareStaffToPartSplit({ musicXml: score(metadata + note('E', 1, 4) + '<backup><duration>4</duration></backup>' + note('C', 2, 4)) })
  const parts = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('part')
  assert.deepEqual(parts.map(part => part.querySelectorAll('words').length), [1, 0])
  assert.deepEqual(parts.map(part => part.querySelectorAll('dynamics').length), [0, 1])
  assert.deepEqual(parts.map(part => part.querySelectorAll('harmony').length), [0, 1])
})

test('preserves pure global tempo and explicit system text without guessing local scope', async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const metadata of [
    '<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>90</per-minute></metronome></direction-type><sound tempo="90"/></direction>',
    '<direction system="only-top"><direction-type><words>Andantino</words></direction-type></direction>',
  ]) {
    const source = score(metadata + note('E', 1, 4) + '<backup><duration>4</duration></backup>' + note('C', 2, 4))
    const preview = await prepareStaffToPartSplit({ musicXml: source })
    const parts = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('part')
    assert.deepEqual(parts.map(part => part.querySelectorAll('direction').length), [1, 1])
    assert.equal(preview.sourceMusicXml, source)
  }
})

test('valid four-measure pilot excerpt preserves 8 melody notes and 20 piano notes', async () => {
  const { prepareStaffToPartSplit } = await api()
  const source = readFileSync(new URL('./fixtures/ses248/pilot-original.musicxml', import.meta.url), 'utf8')
  const doc = new SmoosicTestDOMParser().parseFromString(source)
  for (const measure of doc.querySelectorAll('measure').slice(4)) measure.parentNode.removeChild(measure)
  const preview = await prepareStaffToPartSplit({ musicXml: new SmoosicTestXMLSerializer().serializeToString(doc) })
  assert.equal(preview.measureCount, 4)
  assert.deepEqual(preview.parts.map(p => p.noteCount), [8, 20])
})

test('tie and slur remain on the same violin part across measure boundaries', async () => {
  const { prepareStaffToPartSplit } = await api()
  const first = note('E', 1, 4).replace('</note>', '<tie type="start"/><notations><slur type="start" number="1"/></notations></note>') + '<backup><duration>4</duration></backup>' + note('C', 2, 4)
  const second = '<measure number="2">' + note('E', 1, 4).replace('</note>', '<tie type="stop"/><notations><slur type="stop" number="1"/></notations></note>') + '<backup><duration>4</duration></backup>' + note('D', 2, 4) + '</measure>'
  const source = score(first).replace('</part></score-partwise>', second + '</part></score-partwise>')
  const preview = await prepareStaffToPartSplit({ musicXml: source })
  assert.equal(preview.measureCount, 2)
  const doc = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml)
  assert.equal(doc.querySelectorAll('part')[0].querySelectorAll('tie').length, 2)
  assert.equal(doc.querySelectorAll('part')[1].querySelectorAll('tie').length, 0)
})

test('unsupported cross-staff glissando fails closed instead of creating orphan endpoints', async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = note('E', 1, 4).replace('</note>', '<notations><glissando type="start" number="1"/></notations></note>') +
    '<backup><duration>4</duration></backup>' + note('C', 2, 4).replace('</note>', '<notations><glissando type="stop" number="1"/></notations></note>')
  await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(body) }), /unsupported-note-span/)
})

const wedge = (type, staff, number = 1) => '<direction><direction-type><wedge type="' + type + '"' +
  (number === null ? '' : ' number="' + number + '"') + '/></direction-type><staff>' + staff + '</staff></direction>'

const tremoloNote = (type, staff, duration = 2, voice = 1) => note('E', staff, duration, '', voice)
  .replace('<type>quarter</type>', '<type>half</type>' + (['start', 'stop'].includes(type)
    ? '<time-modification><actual-notes>2</actual-notes><normal-notes>1</normal-notes></time-modification>' : ''))
  .replace('</note>', '<notations><ornaments><tremolo' + (type ? ' type="' + type + '"' : '') + '>' +
    (type === 'unmeasured' ? 0 : 3) + '</tremolo></ornaments></notations></note>')
const arpeggioNote = (staff, attributes = '', duration = 4) => note('E', staff, duration)
  .replace('</note>', '<notations><arpeggiate' + attributes + '/></notations></note>')

test('rejects cross-staff double tremolos in both endpoint document orientations', async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const startStaff of [1, 2]) for (const reverse of [false, true]) {
    const stopStaff = 3 - startStaff
    const body = reverse ? '<forward><duration>2</duration></forward>' + tremoloNote('stop', stopStaff) +
      '<backup><duration>4</duration></backup>' + tremoloNote('start', startStaff) + note('D', startStaff) :
      tremoloNote('start', startStaff) + tremoloNote('stop', stopStaff)
    await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(body) }), /cross-staff/)
  }
})

test('rejects an unmatched double-tremolo endpoint', async () => {
  const { prepareStaffToPartSplit } = await api()
  await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(tremoloNote('start', 1) + note('C', 2)) }), /unsupported.*span/)
})

test('preserves same-staff double tremolos without changing note timing', async () => {
  const { prepareStaffToPartSplit } = await api()
  const source = score(note('G', 1, 4) + '<backup><duration>4</duration></backup>' + tremoloNote('start', 2) + tremoloNote('stop', 2))
  const preview = await prepareStaffToPartSplit({ musicXml: source })
  assert.equal(preview.sourceMusicXml, source)
  assert.deepEqual(events(preview.derivedMusicXml)[1].notes, [['E', 0, 2, '1'], ['E', 2, 2, '1']])
  const parts = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('part')
  assert.deepEqual(parts.map(p => p.querySelectorAll('tremolo').map(t => t.getAttribute('type'))), [[], ['start', 'stop']])
})

test('preserves independent double tremolos in separate piano voices', async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = note('G', 1, 4) + '<backup><duration>4</duration></backup>' + tremoloNote('start', 2) + tremoloNote('stop', 2) +
    '<backup><duration>4</duration></backup>' + tremoloNote('start', 2, 2, 2) + tremoloNote('stop', 2, 2, 2)
  const preview = await prepareStaffToPartSplit({ musicXml: score(body) })
  assert.deepEqual(events(preview.derivedMusicXml)[1].notes, [['E', 0, 2, '1'], ['E', 2, 2, '1'], ['E', 0, 2, '2'], ['E', 2, 2, '2']])
})

test('preserves single default and unmeasured tremolos', async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const type of ['single', '', 'unmeasured']) {
    const body = tremoloNote(type, 1, 4) +
      '<backup><duration>4</duration></backup>' + note('C', 2, 4)
    const preview = await prepareStaffToPartSplit({ musicXml: score(body) })
    const tremolos = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('tremolo')
    assert.equal(tremolos.length, 1)
    assert.equal(tremolos[0].getAttribute('type'), type || null)
  }
})

test('rejects arpeggios crossing staves with or without the optional unbroken hint', async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const firstStaff of [1, 2]) for (const attributes of [' unbroken="yes"', '', ' number="1"']) {
    const body = arpeggioNote(firstStaff, attributes) + '<backup><duration>4</duration></backup>' + arpeggioNote(3 - firstStaff, attributes)
    await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(body) }), /cross-staff/)
  }
})

test('rejects an explicit cross-staff arpeggio even without a second marker', async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const value of ['yes', ' yes ']) {
    const body = arpeggioNote(1, ' unbroken="' + value + '"') + '<backup><duration>4</duration></backup>' + note('C', 2, 4)
    await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(body) }), /cross-staff/)
  }
})

test('does not treat lexical spellings of the same arpeggio number as independent groups', async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const number of ['01', ' 1 ', '+1']) {
    const body = arpeggioNote(1, ' number="' + number + '"') + '<backup><duration>4</duration></backup>' + arpeggioNote(2)
    await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(body) }), /cross-staff/)
  }
})

test('preserves independent simultaneous arpeggios with distinct numbers', async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = arpeggioNote(1, ' number="1"') + '<backup><duration>4</duration></backup>' + arpeggioNote(2, ' number="2"')
  const preview = await prepareStaffToPartSplit({ musicXml: score(body) })
  const parts = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('part')
  assert.deepEqual(parts.map(p => p.querySelectorAll('arpeggiate').map(a => a.getAttribute('number'))), [['1'], ['2']])
})

test('preserves same-number arpeggios on different staves at different musical times', async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = arpeggioNote(1, '', 2) + arpeggioNote(2, '', 2)
  const preview = await prepareStaffToPartSplit({ musicXml: score(body) })
  assert.deepEqual(events(preview.derivedMusicXml).map(p => p.notes.map(n => n.slice(0, 3))), [[['E', 0, 2]], [['E', 2, 2]]])
})

test('preserves same-number crescendo pairs overlapping in score time but separate in XML order', async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const firstStaff of [1, 2]) for (const defaultNumber of [false, true]) {
    const hairpin = staff => wedge(staff === 1 ? 'crescendo' : 'diminuendo', staff, defaultNumber ? null : 1) +
      note('E', staff, 4) + wedge('stop', staff, defaultNumber ? null : 1)
    const body = hairpin(firstStaff) + '<backup><duration>4</duration></backup>' + hairpin(3 - firstStaff)
    const preview = await prepareStaffToPartSplit({ musicXml: score(body) })
    const parts = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('part')
    assert.deepEqual(parts.map(p => p.querySelectorAll('wedge').map(w => w.getAttribute('type'))), [['crescendo', 'stop'], ['diminuendo', 'stop']])
    assert.deepEqual(events(preview.derivedMusicXml).map(p => p.notes), [[['E', 0, 4, '1']], [['E', 0, 4, '1']]])
  }
})

test('preserves a piano wedge whose stop appears before its start in voice document order', async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = note('G', 1, 4) + '<backup><duration>4</duration></backup>' + note('C', 2, 4) + wedge('stop', 2) +
    '<backup><duration>4</duration></backup>' + wedge('crescendo', 2) + note('E', 2, 4, '', 2)
  const preview = await prepareStaffToPartSplit({ musicXml: score(body) })
  assert.deepEqual(events(preview.derivedMusicXml)[1].notes, [['C', 0, 4, '1'], ['E', 0, 4, '2']])
})

test('preserves a deferred piano wedge continuation with one unambiguous span', async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = wedge('crescendo', 1) + note('G', 1, 4) + wedge('stop', 1) + '<backup><duration>4</duration></backup>' +
    wedge('crescendo', 2, 2) + note('C', 2, 4) + wedge('stop', 2, 2) + '<backup><duration>4</duration></backup><forward><duration>2</duration></forward>' + wedge('continue', 2, 2)
  // Distinct numbers keep the deferred continuation's score-time owner unique.
  const preview = await prepareStaffToPartSplit({ musicXml: score(body) })
  const parts = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('part')
  assert.deepEqual(parts.map(p => p.querySelectorAll('wedge').length), [2, 3])
})

test('does not reassign a cross-staff wedge continuation to a same-number local span', async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = wedge('crescendo', 1) + note('G', 1) + '<backup><duration>1</duration></backup>' + wedge('continue', 2) +
    '<forward><duration>3</duration></forward>' + wedge('stop', 1) + '<backup><duration>4</duration></backup>' +
    wedge('crescendo', 2) + note('C', 2, 4) + wedge('stop', 2)
  await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(body) }), /cross-staff/)
})

test('cross-staff crescendo endpoints fail closed including reverse XML staff order', async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const body of [
    wedge('crescendo', 1) + note('E', 1, 4) + '<backup><duration>4</duration></backup>' + note('C', 2, 4) + wedge('stop', 2),
    note('E', 1, 4) + wedge('stop', 1) + '<backup><duration>4</duration></backup>' + wedge('crescendo', 2) + note('C', 2, 4),
  ]) await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(body) }), /cross-staff/)
})

test('a piano crescendo stays entirely on the piano part', async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = note('E', 1, 4) + '<backup><duration>4</duration></backup>' + wedge('crescendo', 2) + note('C', 2, 4) + wedge('stop', 2)
  const preview = await prepareStaffToPartSplit({ musicXml: score(body) })
  const parts = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('part')
  assert.equal(parts[0].querySelectorAll('wedge').length, 0)
  assert.equal(parts[1].querySelectorAll('wedge').length, 2)
})

test('middle barline remains at beat one in both output parts', async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = note('E', 1, 2) + '<barline location="middle"><bar-style>dashed</bar-style></barline>' + note('F', 1, 2) + '<backup><duration>4</duration></backup>' + note('C', 2, 4)
  const preview = await prepareStaffToPartSplit({ musicXml: score(body) })
  const parts = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('part')
  for (const part of parts) {
    let cursor = 0
    for (const child of part.querySelectorAll('measure')[0].children) {
      const duration = Number(child.querySelector('duration')?.textContent ?? 0)
      if (child.tagName === 'forward') cursor += duration
      if (child.tagName === 'backup') cursor -= duration
      if (child.tagName === 'note' && !child.querySelector('chord')) cursor += duration
      if (child.tagName === 'barline') assert.equal(cursor, 2, part.getAttribute('id'))
    }
  }
})

test('right and default repeat barlines follow trailing silence on either derived staff', async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const shortStaff of [1, 2]) for (const location of [' location="right"', '']) {
    const padding = '<forward><duration>2</duration></forward>'
    const body = note('E', 1, shortStaff === 1 ? 2 : 4) + (shortStaff === 1 ? padding : '') +
      '<backup><duration>4</duration></backup>' + note('C', 2, shortStaff === 2 ? 2 : 4) +
      (shortStaff === 2 ? padding : '') + '<barline' + location + '><repeat direction="backward"/></barline>'
    const source = score(body)
    const preview = await prepareStaffToPartSplit({ musicXml: source })
    assert.equal(preview.sourceMusicXml, source)
    const parts = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('part')
    for (const part of parts) {
      const children = part.querySelector('measure').children
      assert.equal(children.at(-1).tagName, 'barline', part.getAttribute('id') + location)
      let cursor = 0
      for (const child of children) {
        const duration = Number(child.querySelector('duration')?.textContent ?? 0)
        if (child.tagName === 'forward' || child.tagName === 'note') cursor += duration
        if (child.tagName === 'backup') cursor -= duration
        if (child.tagName === 'barline') assert.equal(cursor, 4, 'repeat belongs at the two-beat measure end')
      }
      assert.equal(part.querySelectorAll('repeat').length, 1)
    }
  }
})

test('semantic verification rejects a serialized right barline moved ahead of trailing silence', async () => {
  const { prepareStaffToPartSplit } = await api()
  let corrupted = false
  class ReorderedBoundarySerializer extends SmoosicTestXMLSerializer {
    serializeToString(node) {
      const xml = super.serializeToString(node)
      if (node.tagName !== '#document') return xml
      const changed = xml.replace(/(<forward><duration>2<\/duration><\/forward>)(<barline[^>]*>.*?<\/barline>)/, '$2$1')
      corrupted = changed !== xml
      return changed
    }
  }
  const source = score(note('E', 1, 2) + '<forward><duration>2</duration></forward>' +
    '<backup><duration>4</duration></backup>' + note('C', 2, 4) + '<barline><repeat direction="backward"/></barline>')
  globalThis.XMLSerializer = ReorderedBoundarySerializer
  try {
    await assert.rejects(() => prepareStaffToPartSplit({ musicXml: source }), /semantic-metadata-integrity/)
    assert.equal(corrupted, true, 'the final serialized score must actually be reordered')
  } finally { globalThis.XMLSerializer = SmoosicTestXMLSerializer }
})

const spanNote = (kind, type, staff, duration = 2, voice = 1) => {
  const marker = kind === 'beam' ? '<beam number="1">' + type + '</beam>' :
    kind === 'tie' ? '<tie type="' + type + '"/>' : '<notations><' + kind + ' type="' + type + '" number="1"/></notations>'
  return note('E', staff, duration, '', voice).replace('</note>', marker + '</note>')
}

for (const kind of ['slur', 'tuplet', 'tie', 'beam']) test('rejects reverse-document cross-staff ' + kind + ' endpoints', async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const stopStaff of [1, 2]) {
    const startStaff = 3 - stopStaff
    const body = '<forward><duration>2</duration></forward>' + spanNote(kind, kind === 'beam' ? 'end' : 'stop', stopStaff) +
      '<backup><duration>4</duration></backup>' + spanNote(kind, kind === 'beam' ? 'begin' : 'start', startStaff) + note('D', startStaff)
    await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(body) }), /cross-staff/)
  }
})

test('preserves independent same-number slurs that overlap in musical time on separate staves', async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = spanNote('slur', 'start', 1) + spanNote('slur', 'stop', 1) + '<backup><duration>4</duration></backup>' +
    spanNote('slur', 'start', 2) + spanNote('slur', 'stop', 2)
  const preview = await prepareStaffToPartSplit({ musicXml: score(body) })
  const parts = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('part')
  assert.deepEqual(parts.map(p => p.querySelectorAll('slur').map(s => s.getAttribute('type'))), [['start', 'stop'], ['start', 'stop']])
})

test('preserves a same-staff slur whose stop precedes its start in piano voice document order', async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = note('G', 1, 4) + '<backup><duration>4</duration></backup><forward><duration>2</duration></forward>' +
    spanNote('slur', 'stop', 2) + '<backup><duration>4</duration></backup>' + spanNote('slur', 'start', 2, 2, 2)
  const preview = await prepareStaffToPartSplit({ musicXml: score(body) })
  assert.deepEqual(events(preview.derivedMusicXml)[1].notes, [['E', 2, 2, '1'], ['E', 0, 2, '2']])
  const parts = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('part')
  assert.deepEqual(parts.map(p => p.querySelectorAll('slur').length), [0, 2])
})

test('rejects unmatched note span endpoints instead of exporting orphan notation', async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const type of ['start', 'stop', 'continue']) {
    const body = spanNote('slur', type, 1, 4) + '<backup><duration>4</duration></backup>' + note('C', 2, 4)
    await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(body) }), /unsupported.*span/)
  }
})

test('rejects cross-staff visual tied endpoints in either document orientation', async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const reverse of [false, true]) {
    const body = reverse ? '<forward><duration>2</duration></forward>' + spanNote('tied', 'stop', 1) +
      '<backup><duration>4</duration></backup>' + spanNote('tied', 'start', 2) + note('D', 2) :
      spanNote('tied', 'start', 1) + note('G', 1) + '<backup><duration>4</duration></backup><forward><duration>2</duration></forward>' + spanNote('tied', 'stop', 2)
    await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(body) }), /cross-staff/)
  }
})

test('preserves same-staff visual ties and standalone let-ring notation', async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = spanNote('tied', 'let-ring', 1, 4) + '<backup><duration>4</duration></backup>' +
    spanNote('tied', 'start', 2) + spanNote('tied', 'stop', 2)
  const preview = await prepareStaffToPartSplit({ musicXml: score(body) })
  const parts = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('part')
  assert.deepEqual(parts.map(p => p.querySelectorAll('tied').map(s => s.getAttribute('type'))), [['let-ring'], ['start', 'stop']])
})

test('rejects orphan visual tie notation without a sounding tie', async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = spanNote('tied', 'start', 1, 4) + '<backup><duration>4</duration></backup>' + note('C', 2, 4)
  await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(body) }), /unsupported.*span/)
})

test('preserves a piano slur continuation after both endpoints in XML voice order', async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = note('G', 1, 4) + '<backup><duration>4</duration></backup>' + spanNote('slur', 'start', 2) +
    spanNote('slur', 'stop', 2) + '<backup><duration>4</duration></backup><forward><duration>1</duration></forward>' + spanNote('slur', 'continue', 2, 1, 2)
  const preview = await prepareStaffToPartSplit({ musicXml: score(body) })
  assert.deepEqual(events(preview.derivedMusicXml)[1].notes, [['E', 0, 2, '1'], ['E', 2, 2, '1'], ['E', 1, 1, '2']])
  const parts = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('part')
  assert.deepEqual(parts.map(p => p.querySelectorAll('slur').length), [0, 3])
})

test('preserves independent same-pitch sounding ties across piano voices and measures', async () => {
  const { prepareStaffToPartSplit } = await api()
  const measure = type => note('G', 1, 4) + '<backup><duration>4</duration></backup>' + spanNote('tie', type, 2, 4, 1) +
    '<backup><duration>4</duration></backup>' + spanNote('tie', type, 2, 4, 2)
  const source = score(measure('start')).replace('</part></score-partwise>', '<measure number="2">' + measure('stop') + '</measure></part></score-partwise>')
  const preview = await prepareStaffToPartSplit({ musicXml: source })
  const parts = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('part')
  assert.deepEqual(parts.map(p => p.querySelectorAll('tie').length), [0, 4])
  assert.deepEqual(parts[1].querySelectorAll('note voice').map(v => v.textContent), ['1', '2', '1', '2'])
})

test('preserves enharmonic visual ties across piano voices without respelling pitches', async () => {
  const { prepareStaffToPartSplit } = await api()
  const first = spanNote('tied', 'start', 2).replace('<step>E</step>', '<step>F</step><alter>1</alter>')
  const second = spanNote('tied', 'stop', 2, 2, 2).replace('<step>E</step>', '<step>G</step><alter>-1</alter>')
  const source = score(note('C', 1, 4) + '<backup><duration>4</duration></backup>' + first + second)
  const preview = await prepareStaffToPartSplit({ musicXml: source })
  const parts = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('part')
  assert.deepEqual(parts[1].querySelectorAll('pitch').map(p => [p.querySelector('step').textContent, p.querySelector('alter').textContent]), [['F', '1'], ['G', '-1']])
  assert.equal(parts[1].querySelectorAll('tied').length, 2)
})

test('rejects a cross-staff continuation even when its paired endpoints were already read', async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = spanNote('slur', 'start', 1) + spanNote('slur', 'stop', 1) +
    '<backup><duration>4</duration></backup><forward><duration>1</duration></forward>' + spanNote('slur', 'continue', 2)
  await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(body) }), /cross-staff/)
})

test('rejects cross-voice cross-staff sounding ties rather than exporting unmatched endpoints', async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = spanNote('tie', 'start', 1) + note('G', 1) + '<backup><duration>4</duration></backup><forward><duration>2</duration></forward>' +
    spanNote('tie', 'stop', 2, 2, 2)
  await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(body) }), /cross-staff|unsupported.*span/)
})

test('does not reassign a cross-staff continuation to an overlapping same-number local span', async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = spanNote('slur', 'start', 1) + '<backup><duration>1</duration></backup>' + spanNote('slur', 'continue', 2, 1) +
    spanNote('slur', 'stop', 1) + '<backup><duration>4</duration></backup>' + spanNote('slur', 'start', 2) + spanNote('slur', 'stop', 2)
  await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(body) }), /cross-staff|unsupported.*span/)
})

const wavyNote = (type, staff, duration = 2, number = '1', voice = 1) => note('E', staff, duration, '', voice)
  .replace('</note>', '<notations><ornaments><wavy-line type="' + type + '" number="' + number + '"/></ornaments></notations></note>')
const bracketNote = (type, staff, chord = false, number = '1', voice = 1) => note(type === 'top' ? 'E' : 'C', staff, 4, chord ? '<chord/>' : '', voice)
  .replace('</note>', '<notations><non-arpeggiate type="' + type + '" number="' + number + '"/></notations></note>')

test('rejects cross-staff wavy-line endpoints in either document orientation', async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const startStaff of [1, 2]) for (const reverse of [false, true]) {
    const stopStaff = 3 - startStaff
    const body = reverse ? '<forward><duration>2</duration></forward>' + wavyNote('stop', stopStaff) +
      '<backup><duration>4</duration></backup>' + wavyNote('start', startStaff) + note('D', startStaff) :
      wavyNote('start', startStaff) + wavyNote('stop', stopStaff)
    await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(body) }), /cross-staff/)
  }
})

test('preserves same-staff wavy lines and their original number spelling', async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const staff of [1, 2]) {
    const pair = wavyNote('start', staff, 2, '+01') + wavyNote('stop', staff)
    const body = staff === 1 ? pair + '<backup><duration>4</duration></backup>' + note('C', 2, 4)
      : note('G', 1, 4) + '<backup><duration>4</duration></backup>' + pair
    const source = score(body)
    const preview = await prepareStaffToPartSplit({ musicXml: source })
    assert.equal(preview.sourceMusicXml, source)
    const parts = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('part')
    assert.deepEqual(parts[staff - 1].querySelectorAll('wavy-line').map(w => [w.getAttribute('type'), w.getAttribute('number')]), [['start', '+01'], ['stop', '1']])
    assert.equal(parts[2 - staff].querySelectorAll('wavy-line').length, 0)
  }
})

test('rejects a cross-staff wavy-line continuation even with same-staff endpoints', async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = wavyNote('start', 1) + '<backup><duration>1</duration></backup>' + wavyNote('continue', 2, 1) + wavyNote('stop', 1)
  await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(body) }), /cross-staff/)
})

test('preserves an unambiguous deferred same-staff wavy-line continuation', async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = note('G', 1, 4) + '<backup><duration>4</duration></backup>' + wavyNote('start', 2) + wavyNote('stop', 2) +
    '<backup><duration>4</duration></backup><forward><duration>1</duration></forward>' + wavyNote('continue', 2, 1, '01', 2)
  const preview = await prepareStaffToPartSplit({ musicXml: score(body) })
  const parts = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('part')
  assert.deepEqual(parts.map(p => p.querySelectorAll('wavy-line').length), [0, 3])
})

test('does not duplicate a staff-sensitive wavy-line continuation inside a global barline', async () => {
  const { prepareStaffToPartSplit } = await api()
  const first = wavyNote('start', 1, 4) + '<backup><duration>4</duration></backup>' + note('C', 2, 4) +
    '<barline><wavy-line type="continue" number="1"/></barline>'
  const second = wavyNote('stop', 1, 4) + '<backup><duration>4</duration></backup>' + note('C', 2, 4)
  const source = score(first).replace('</part></score-partwise>', '<measure number="2">' + second + '</measure></part></score-partwise>')
  await assert.rejects(() => prepareStaffToPartSplit({ musicXml: source }), /unsupported-barline-span/)
})

test('rejects cross-staff non-arpeggiate ranges in either staff document order', async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const reverse of [false, true]) {
    const top = bracketNote('top', 1, false, '+01'), bottom = bracketNote('bottom', 2)
    const body = reverse ? bottom + '<backup><duration>4</duration></backup>' + top : top + '<backup><duration>4</duration></backup>' + bottom
    await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(body) }), /cross-staff/)
  }
})

test('preserves a complete same-staff non-arpeggiate bracket on a piano chord', async () => {
  const { prepareStaffToPartSplit } = await api()
  const source = score(note('G', 1, 4) + '<backup><duration>4</duration></backup>' + bracketNote('bottom', 2, false, '01') + bracketNote('top', 2, true))
  const preview = await prepareStaffToPartSplit({ musicXml: source })
  assert.equal(preview.sourceMusicXml, source)
  const parts = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('part')
  assert.deepEqual(parts.map(p => p.querySelectorAll('non-arpeggiate').map(n => n.getAttribute('type'))), [[], ['bottom', 'top']])
  assert.deepEqual(events(preview.derivedMusicXml)[1].notes, [['C', 0, 4, '1'], ['E', 0, 4, '1']])
})

test('rejects incomplete duplicate and invalid non-arpeggiate range markers', async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const range of [bracketNote('top', 2), bracketNote('bottom', 2),
    bracketNote('top', 2) + bracketNote('top', 2, true), bracketNote('start', 2)]) {
    await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(note('G', 1, 4) + '<backup><duration>4</duration></backup>' + range) }), /unsupported.*non-arpeggiate/)
  }
})

test('does not pair non-arpeggiate endpoints at different onsets', async () => {
  const { prepareStaffToPartSplit } = await api()
  const body = note('G', 1, 4) + '<backup><duration>4</duration></backup>' + bracketNote('bottom', 2) + bracketNote('top', 2)
  await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(body) }), /unsupported.*non-arpeggiate/)
})

for (const kind of ['slur', 'tuplet', 'tied']) test('matches equivalent numeric spellings for ' + kind, async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const number of ['01', '+1', ' 1 ']) {
    const first = spanNote(kind, 'start', 2).replace('number="1"', 'number="' + number + '"')
    const source = score(note('G', 1, 4) + '<backup><duration>4</duration></backup>' + first + spanNote(kind, 'stop', 2))
    const preview = await prepareStaffToPartSplit({ musicXml: source })
    assert.equal(preview.sourceMusicXml, source)
    const parts = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('part')
    assert.deepEqual(parts[1].querySelectorAll(kind).map(n => n.getAttribute('number')), [number, '1'])
  }
})

test('matches equivalent wedge numbers while preserving source attributes', async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const number of ['01', '+1', ' 1 ']) {
    const source = score(note('G', 1, 4) + '<backup><duration>4</duration></backup>' + wedge('crescendo', 2, number) + note('E', 2, 4) + wedge('stop', 2))
    const preview = await prepareStaffToPartSplit({ musicXml: source })
    const parts = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('part')
    assert.deepEqual(parts[1].querySelectorAll('wedge').map(n => n.getAttribute('number')), [number, '1'])
  }
})

test('canonical span numbers cannot hide a cross-staff link', async () => {
  const { prepareStaffToPartSplit } = await api()
  const first = spanNote('slur', 'start', 1).replace('number="1"', 'number="01"')
  await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(first + spanNote('slur', 'stop', 2)) }), /cross-staff/)
})

test('validates number-level lexical syntax and range before matching', async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const number of ['', '0', '17', '-1', '1.0', '1e0']) {
    const source = score(note('G', 1, 4) + '<backup><duration>4</duration></backup>' +
      wedge('crescendo', 2, number) + note('E', 2, 4) + wedge('stop', 2, number))
    await assert.rejects(() => prepareStaffToPartSplit({ musicXml: source }), /unsupported.*number/)
  }
  const source = score(note('G', 1, 4) + '<backup><duration>4</duration></backup>' + wedge('crescendo', 2, '+016') + note('E', 2, 4) + wedge('stop', 2, '16'))
  const preview = await prepareStaffToPartSplit({ musicXml: source })
  assert.equal(preview.parts[1].noteCount, 1)
})

test('normalizes beam levels with their own upper bound of eight', async () => {
  const { prepareStaffToPartSplit } = await api()
  const pair = number => spanNote('beam', 'begin', 2).replace('number="1"', 'number="' + number + '"') + spanNote('beam', 'end', 2)
  await prepareStaffToPartSplit({ musicXml: score(note('G', 1, 4) + '<backup><duration>4</duration></backup>' + pair('+01')) })
  const invalid = (spanNote('beam', 'begin', 2) + spanNote('beam', 'end', 2)).replaceAll('number="1"', 'number="9"')
  await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(note('G', 1, 4) + '<backup><duration>4</duration></backup>' + invalid) }), /unsupported.*number/)
})

test('unknown endpoint-bearing notation is rejected instead of treated as a local decoration', async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const type of ['start', 'stop', 'continue']) {
    const body = note('E', 1, 4).replace('</note>', '<notations><other-notation type="' + type + '">custom</other-notation></notations></note>') +
      '<backup><duration>4</duration></backup>' + note('C', 2, 4)
    await assert.rejects(() => prepareStaffToPartSplit({ musicXml: score(body) }), /unsupported-note-span/)
  }
})

test('preserves local playback labels that happen to use endpoint words', async () => {
  const { prepareStaffToPartSplit } = await api()
  for (const type of ['start', 'stop', 'continue']) {
    const source = score(note('E', 1, 4).replace('</note>', '<play><other-play type="' + type + '">custom sound</other-play></play></note>') +
      '<backup><duration>4</duration></backup>' + note('C', 2, 4))
    const preview = await prepareStaffToPartSplit({ musicXml: source })
    assert.equal(preview.sourceMusicXml, source)
    const parts = new SmoosicTestDOMParser().parseFromString(preview.derivedMusicXml).querySelectorAll('part')
    assert.deepEqual(parts.map(p => p.querySelectorAll('other-play').map(n => [n.getAttribute('type'), n.textContent])), [[[type, 'custom sound']], []])
  }
})
