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
  const source = score().replace('<note>', '<direction id="shared"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>90</per-minute></metronome></direction-type><sound tempo="90"/></direction><note>')
  await assert.rejects(() => prepareStaffToPartSplit({ musicXml: source }), /duplicate-id/)
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
