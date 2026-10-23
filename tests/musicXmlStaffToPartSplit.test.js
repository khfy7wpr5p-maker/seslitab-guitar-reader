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
import { note, score } from './support/staffSplitFixture.js'
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
  const source = score().replace('<note>', '<direction id="shared"><direction-type><words>dolce</words></direction-type></direction><note>')
  await assert.rejects(() => prepareStaffToPartSplit({ musicXml: source }), /duplicate-id/)
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

const wedge = (type, staff) => '<direction><direction-type><wedge type="' + type + '" number="1"/></direction-type><staff>' + staff + '</staff></direction>'

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
