import { inspectMusicXml } from '../../musicXmlSecurity.js'
import { inspectSplitPart, splitChildren, splitChild, splitName, splitFailure } from './musicXmlStaffToPartTimeline.js'

const MAX_BYTES = 900 * 1024
const PARTS = Object.freeze([
  Object.freeze({ partId: 'P1', sourceStaff: 1, name: 'Keman', instrument: 'Violin', program: 41 }),
  Object.freeze({ partId: 'P2', sourceStaff: 2, name: 'Piyano', instrument: 'Piano', program: 1 }),
])
function remove(node) { node.parentNode.removeChild(node) }
function element(doc, tag, value = null) {
  const root = doc.documentElement
  const prefix = root.prefix ? root.prefix + ':' : ''
  const node = doc.createElementNS(root.namespaceURI, prefix + tag)
  if (value !== null) node.textContent = String(value)
  return node
}
function serialize(node) { return new globalThis.XMLSerializer().serializeToString(node) }
async function fingerprint(text) {
  if (!globalThis.crypto?.subtle) splitFailure('crypto-unavailable')
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}
function parse(xml) {
  const safe = inspectMusicXml(xml, { maxBytes: MAX_BYTES })
  if (!safe.ok) splitFailure('unsafe-xml')
  if (typeof globalThis.DOMParser !== 'function' || typeof globalThis.XMLSerializer !== 'function') splitFailure('dom-unavailable')
  const doc = new globalThis.DOMParser().parseFromString(safe.xmlForParsing, 'application/xml')
  if (splitName(doc.documentElement) !== 'score-partwise' || doc.getElementsByTagName('parsererror').length) splitFailure('unsupported-root')
  return doc
}
function sourceTopology(doc) {
  const root = doc.documentElement
  const lists = splitChildren(root, 'part-list')
  const bodies = splitChildren(root, 'part')
  if (lists.length !== 1 || bodies.length !== 1) splitFailure('topology')
  const parts = splitChildren(lists[0], 'score-part')
  const sourceId = bodies[0].getAttribute('id')
  if (parts.length !== 1 || !sourceId || parts[0].getAttribute('id') !== sourceId) splitFailure('topology')
  const staves = bodies[0].getElementsByTagName('staves')
  if (!staves.length || Number(staves[0].textContent) !== 2) splitFailure('staff-topology')
  // All instrument references must refer to the one source instrument.
  const instruments = splitChildren(parts[0], 'score-instrument')
  const sourceInstrument = instruments[0]?.getAttribute('id')
  if (instruments.length > 1) splitFailure('unsupported-instruments')
  for (const node of Array.from(bodies[0].getElementsByTagName('instrument'))) {
    if (!sourceInstrument || node.getAttribute('id') !== sourceInstrument) splitFailure('unsupported-instrument-reference')
  }
  return { root, list: lists[0], part: bodies[0], sourceId }
}
function normalizedNote(node, part) {
  const clone = node.cloneNode(true)
  for (const staff of splitChildren(clone, 'staff')) staff.textContent = '1'
  for (const instrument of splitChildren(clone, 'instrument')) instrument.setAttribute('id', part.partId + '-I1')
  return clone
}
function filteredAttributes(node, part) {
  const clone = node.cloneNode(true)
  for (const child of splitChildren(clone)) {
    const number = child.getAttribute('number') || (splitName(child) === 'clef' ? '1' : null)
    if (number && Number(number) !== part.sourceStaff) { remove(child); continue }
    if (number) child.setAttribute('number', '1')
    if (splitName(child) === 'staves') child.textContent = '1'
  }
  return clone
}
function appendMove(doc, measure, delta, divisions) {
  if (Math.abs(delta) < 1e-8) return
  const move = element(doc, delta > 0 ? 'forward' : 'backup')
  // Decimal durations are legal MusicXML divisions values, including tuplets.
  move.appendChild(element(doc, 'duration', Math.abs(delta) * divisions))
  measure.appendChild(move)
}
const rightBarline = record => record.kind === 'barline' &&
  (record.node.getAttribute('location') || 'right') === 'right'
function buildPart(doc, sourcePart, timeline, part) {
  const target = sourcePart.cloneNode(false)
  target.setAttribute('id', part.partId)
  for (const measure of timeline) {
    const output = measure.node.cloneNode(false)
    const rightBarlines = []
    let cursor = 0
    let divisions = null
    for (const record of measure.records) {
      if (record.kind === 'attributes') {
        divisions = record.divisions
        output.appendChild(filteredAttributes(record.node, part))
        continue
      }
      if (record.staff !== null && record.staff !== undefined && record.staff !== part.sourceStaff) continue
      if (rightBarline(record)) {
        rightBarlines.push(record.node.cloneNode(true))
        continue
      }
      if (record.kind === 'note' && record.chord) {
        output.appendChild(normalizedNote(record.node, part))
        continue
      }
      // Left/right barlines describe a boundary; middle barlines have an onset.
      const boundary = record.kind === 'barline' && record.node.getAttribute('location') !== 'middle'
      if (record.kind !== 'print' && !boundary) {
        appendMove(doc, output, record.onset - cursor, divisions ?? measure.divisions)
        cursor = record.onset
      }
      const clone = record.kind === 'note' ? normalizedNote(record.node, part) : record.node.cloneNode(true)
      for (const staff of splitChildren(clone, 'staff')) staff.textContent = '1'
      output.appendChild(clone)
      if (record.kind === 'note') cursor += record.duration
    }
    appendMove(doc, output, measure.extent - cursor, divisions ?? measure.divisions)
    rightBarlines.forEach(barline => output.appendChild(barline))
    target.appendChild(output)
  }
  return target
}
function scorePart(doc, part) {
  const node = element(doc, 'score-part')
  node.setAttribute('id', part.partId)
  node.appendChild(element(doc, 'part-name', part.name))
  const instrument = element(doc, 'score-instrument')
  instrument.setAttribute('id', part.partId + '-I1')
  instrument.appendChild(element(doc, 'instrument-name', part.instrument))
  node.appendChild(instrument)
  const midi = element(doc, 'midi-instrument')
  midi.setAttribute('id', part.partId + '-I1')
  midi.appendChild(element(doc, 'midi-channel', part.sourceStaff))
  midi.appendChild(element(doc, 'midi-program', part.program))
  node.appendChild(midi)
  return node
}
function signatures(records, part, source) {
  return records.filter(record => record.kind === 'note' && (!source || record.staff === part.sourceStaff))
    .map(record => ({ onset: record.onset, duration: record.duration, xml: serialize(normalizedNote(record.node, part)) }))
}
function verify(source, target, part) {
  const derived = inspectSplitPart(target, [1])
  if (derived.length !== source.length) splitFailure('semantic-integrity')
  source.forEach((measure, index) => {
    const before = signatures(measure.records, part, true)
    const after = signatures(derived[index].records, part, false)
    if (Math.abs(measure.extent - derived[index].extent) > 1e-8 || before.length !== after.length) splitFailure('semantic-integrity', measure.number)
    before.forEach((note, n) => {
      if (note.xml !== after[n].xml || Math.abs(note.onset - after[n].onset) > 1e-8 || Math.abs(note.duration - after[n].duration) > 1e-8) splitFailure('semantic-integrity', measure.number)
    })
    const expectedMetadata = metadataSignatures(measure, part, true)
    const actualMetadata = metadataSignatures(derived[index], part, false)
    if (expectedMetadata.length !== actualMetadata.length) splitFailure('semantic-metadata-integrity', measure.number)
    expectedMetadata.forEach((item, n) => {
      const actual = actualMetadata[n]
      if (item.xml !== actual.xml || Math.abs(item.onset - actual.onset) > 1e-8) splitFailure('semantic-metadata-integrity', measure.number)
    })
  })
}
function metadataSignatures(measure, part, source) {
  // Boundary semantics do not depend on the source's staff/voice XML order.
  // Inspect the derived order as emitted, so padding after a right barline fails.
  const records = source ? [...measure.records.filter(record => !rightBarline(record)),
    ...measure.records.filter(rightBarline)] : measure.records
  return records.filter(record => ['direction', 'sound', 'harmony', 'barline'].includes(record.kind) &&
    (!source || record.staff === null || record.staff === part.sourceStaff)).map(record => {
    const clone = record.node.cloneNode(true)
    for (const staff of splitChildren(clone, 'staff')) staff.textContent = '1'
    const boundary = record.kind === 'barline' && record.node.getAttribute('location') !== 'middle'
    const boundaryOnset = record.node.getAttribute('location') === 'left' ? 0 : measure.extent
    return { xml: serialize(clone), onset: source && boundary ? boundaryOnset : record.onset }
  })
}
function assertUniqueIds(root) {
  const ids = new Set()
  const visit = node => {
    // MusicXML part/instrument references are IDREF, not ID declarations.
    const id = ['part', 'midi-instrument', 'instrument'].includes(splitName(node))
      ? node.getAttribute('xml:id') : node.getAttribute('id') || node.getAttribute('xml:id')
    if (id) {
      if (ids.has(id)) splitFailure('duplicate-id')
      ids.add(id)
    }
    splitChildren(node).forEach(visit)
  }
  visit(root)
}
export async function prepareStaffToPartSplit({ musicXml } = {}) {
  const doc = parse(musicXml)
  const { root, list, part, sourceId } = sourceTopology(doc)
  const timeline = inspectSplitPart(part, [1, 2])
  const outputs = PARTS.map(spec => buildPart(doc, part, timeline, spec))
  outputs.forEach((output, i) => verify(timeline, output, PARTS[i]))
  // Replace only the source entry: surrounding part-groups must still enclose
  // both derived parts, with their names, symbols and barline settings intact.
  const sourceEntry = splitChild(list, 'score-part')
  PARTS.forEach(spec => list.insertBefore(scorePart(doc, spec), sourceEntry))
  remove(sourceEntry)
  const expectedPartList = serialize(list)
  outputs.forEach(output => root.insertBefore(output, part))
  remove(part)
  assertUniqueIds(root)
  const derivedMusicXml = serialize(doc)
  const accepted = parse(derivedMusicXml)
  if (serialize(splitChild(accepted.documentElement, 'part-list')) !== expectedPartList) splitFailure('part-list-integrity')
  splitChildren(accepted.documentElement, 'part').forEach((output, i) => verify(timeline, output, PARTS[i]))
  const parts = PARTS.map(spec => Object.freeze({ partId: spec.partId, sourceStaff: spec.sourceStaff, name: spec.name,
    noteCount: timeline.flatMap(m => m.records).filter(r => r.kind === 'note' && r.pitched && r.staff === spec.sourceStaff).length }))
  return Object.freeze({ schemaVersion: 1, sourcePartId: sourceId, sourceMusicXml: musicXml,
    sourceFingerprint: await fingerprint(musicXml), derivedMusicXml, derivedFingerprint: await fingerprint(derivedMusicXml),
    measureCount: timeline.length, parts: Object.freeze(parts) })
}
export async function confirmStaffToPartSplit({ musicXml, preview, confirmed } = {}) {
  if (confirmed !== true) splitFailure('confirmation-required')
  if (preview?.sourceMusicXml !== musicXml) splitFailure('stale-source')
  const fresh = await prepareStaffToPartSplit({ musicXml })
  if (preview.derivedMusicXml !== fresh.derivedMusicXml || preview.sourceFingerprint !== fresh.sourceFingerprint || preview.derivedFingerprint !== fresh.derivedFingerprint) splitFailure('preview-integrity')
  return fresh.derivedMusicXml
}
