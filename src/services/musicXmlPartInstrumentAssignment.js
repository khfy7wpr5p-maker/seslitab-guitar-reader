import { inspectMusicXml } from '../../musicXmlSecurity.js'

export const PART_INSTRUMENT_MARKER = 'seslitab-part-instruments-version'
const PROGRAMS = Object.freeze({ GRAND_PIANO: 1, CLASSICAL_GUITAR: 25, VIOLIN: 41 })
const NAMES = Object.freeze({ GRAND_PIANO: 'Piano', CLASSICAL_GUITAR: 'Classical Guitar', VIOLIN: 'Violin' })
const fail = code => { throw new Error('part-instruments-' + code) }
const name = node => String(node?.localName ?? node?.nodeName ?? '').replace(/^.*:/u, '')
const children = (node, tag) => Array.from(node?.childNodes ?? []).filter(n => n.nodeType === 1 && (!tag || name(n) === tag))
const descendants = node => children(node).flatMap(child => [child, ...descendants(child)])
const serialize = node => new globalThis.XMLSerializer().serializeToString(node)
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 128 && id.trim() === id && !id.includes('\u0000')

function parse(musicXml) {
  const safe = inspectMusicXml(musicXml, { maxBytes: 900 * 1024 })
  if (!safe.ok || typeof globalThis.DOMParser !== 'function') fail('invalid-xml')
  const doc = new globalThis.DOMParser().parseFromString(safe.xmlForParsing, 'application/xml')
  const root = doc?.documentElement
  if (name(root) !== 'score-partwise' || doc.getElementsByTagName('parsererror').length) fail('unsupported-topology')
  const lists = children(root, 'part-list'), bodies = children(root, 'part')
  if (lists.length !== 1) fail('unsupported-topology')
  const entries = children(lists[0], 'score-part'), ids = entries.map(n => n.getAttribute('id'))
  if (!entries.length || entries.length > 128 || entries.length !== bodies.length || ids.some(id => !validId(id)) || new Set(ids).size !== ids.length) fail('invalid-parts')
  const byId = new Map(bodies.map(n => [n.getAttribute('id'), n]))
  if (byId.size !== bodies.length || ids.some(id => !byId.has(id))) fail('invalid-parts')
  const declarationIds = [...ids, ...entries.flatMap(entry => children(entry, 'score-instrument').map(n => n.getAttribute('id')))]
  if (new Set(declarationIds).size !== declarationIds.length) fail('invalid-instruments')
  return { doc, root, entries, ids, bodies: ids.map(id => byId.get(id)) }
}

function marker(root) {
  const fields = descendants(root).filter(n => name(n) === 'miscellaneous-field' && n.getAttribute('name') === PART_INSTRUMENT_MARKER)
  if (!fields.length) return false
  if (fields.length !== 1 || fields[0].textContent.trim() !== '1' || name(fields[0].parentNode) !== 'miscellaneous' || name(fields[0].parentNode.parentNode) !== 'identification' || fields[0].parentNode.parentNode.parentNode !== root) fail('unsupported-version')
  return true
}

function declaredIds(entry, body) {
  const ids = children(entry, 'score-instrument').map(n => n.getAttribute('id'))
  if (ids.some(id => !validId(id)) || new Set(ids).size !== ids.length) fail('invalid-instruments')
  for (const node of descendants(body)) {
    if (['midi-instrument', 'instrument-change', 'midi-device'].includes(name(node))) fail('unsupported-instrument-change')
    if (name(node) === 'instrument' && !ids.includes(node.getAttribute('id'))) fail('unknown-instrument-reference')
  }
  return ids
}

function instrumentOf(entry, body) {
  const ids = declaredIds(entry, body), midi = children(entry, 'midi-instrument')
  if (!ids.length || midi.length !== ids.length || new Set(midi.map(n => n.getAttribute('id'))).size !== midi.length) fail('incomplete-declarations')
  const instruments = midi.map(node => {
    if (!ids.includes(node.getAttribute('id'))) fail('unknown-instrument-reference')
    const programs = children(node, 'midi-program'), banks = children(node, 'midi-bank'), channels = children(node, 'midi-channel')
    if (programs.length !== 1 || banks.length > 1 || channels.length > 1 || banks.some(n => Number(n.textContent) !== 1) || channels.some(n => !Number.isInteger(Number(n.textContent)) || Number(n.textContent) < 1 || Number(n.textContent) > 16 || Number(n.textContent) === 10) || children(node, 'midi-unpitched').length) fail('unsupported-midi-profile')
    const result = Object.keys(PROGRAMS).find(id => PROGRAMS[id] === Number(programs[0].textContent))
    if (!result) fail('unsupported-instrument')
    return result
  })
  if (new Set(instruments).size !== 1) fail('ambiguous-instrument')
  return instruments[0]
}

export function listMusicXmlInstrumentParts(musicXml) {
  const { entries, ids } = parse(musicXml)
  return Object.freeze(entries.map((entry, i) => Object.freeze({ partId: ids[i], name: children(entry, 'part-name')[0]?.textContent.trim() || ids[i] })))
}

export function readMusicXmlPartInstrumentMap(musicXml) {
  const { root, entries, ids, bodies } = parse(musicXml)
  if (!marker(root)) return null
  return Object.freeze(Object.fromEntries(entries.map((entry, i) => [ids[i], instrumentOf(entry, bodies[i])])))
}

function element(doc, parent, tag, value) {
  const root = doc.documentElement, prefix = root.prefix ? root.prefix + ':' : ''
  const node = doc.createElementNS(root.namespaceURI, prefix + tag)
  if (value !== undefined) node.textContent = String(value)
  parent?.appendChild(node)
  return node
}

async function fingerprint(value) {
  if (!globalThis.crypto?.subtle) fail('crypto-unavailable')
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function preparePartInstrumentAssignment({ musicXml, assignments } = {}) {
  const { doc, root, entries, ids, bodies } = parse(musicXml)
  marker(root)
  if (!Array.isArray(assignments) || assignments.length !== ids.length) fail('incomplete-assignment')
  const selected = new Map()
  for (const row of assignments) {
    if (!row || Object.keys(row).length !== 2 || !ids.includes(row.partId) || selected.has(row.partId) || !Object.hasOwn(PROGRAMS, row.instrumentId)) fail('invalid-assignment')
    selected.set(row.partId, row.instrumentId)
  }
  if (typeof globalThis.XMLSerializer !== 'function') fail('dom-unavailable')
  const musicalBodies = bodies.map(serialize)
  const usedIds = new Set(descendants(root).flatMap(node => [node.getAttribute('id'), node.getAttribute('xml:id')]).filter(Boolean))
  entries.forEach((entry, index) => {
    const instrumentId = selected.get(ids[index])
    let instrumentIds = declaredIds(entry, bodies[index])
    if (!instrumentIds.length) {
      const base = ids[index].slice(0, 110)
      let id = base + '-I1', suffix = 1
      while (usedIds.has(id)) id = base + '-I1-' + suffix++
      usedIds.add(id)
      const declaration = element(doc, entry, 'score-instrument')
      declaration.setAttribute('id', id)
      instrumentIds = [id]
    }
    const midi = children(entry, 'midi-instrument')
    if (midi.some(node => !instrumentIds.includes(node.getAttribute('id'))) || new Set(midi.map(node => node.getAttribute('id'))).size !== midi.length) fail('unknown-instrument-reference')
    for (const declaration of children(entry, 'score-instrument')) {
      const names = children(declaration, 'instrument-name')
      if (names.length > 1) fail('invalid-instruments')
      if (names.length) names[0].textContent = NAMES[instrumentId]
      else element(doc, declaration, 'instrument-name', NAMES[instrumentId])
    }
    for (const id of instrumentIds) {
      let node = midi.find(node => node.getAttribute('id') === id)
      if (!node) { node = element(doc, entry, 'midi-instrument');node.setAttribute('id', id) }
      const programs = children(node, 'midi-program')
      if (programs.length > 1 || children(node, 'midi-unpitched').length || children(node, 'midi-bank').some(n => Number(n.textContent) !== 1) || children(node, 'midi-channel').some(n => Number(n.textContent) === 10)) fail('unsupported-midi-profile')
      if (programs.length) programs[0].textContent = String(PROGRAMS[instrumentId])
      else {
        const program = element(doc, null, 'midi-program', PROGRAMS[instrumentId])
        node.insertBefore(program, children(node).find(n => !['midi-channel', 'midi-name', 'midi-bank'].includes(name(n))) ?? null)
      }
    }
  })
  if (!marker(root)) {
    const identifications = children(root, 'identification')
    if (identifications.length > 1) fail('invalid-identification')
    let identification = identifications[0]
    if (!identification) {
      identification = element(doc, null, 'identification')
      root.insertBefore(identification, children(root).find(n => !['work', 'movement-number', 'movement-title'].includes(name(n))) ?? null)
    }
    const miscellaneous = children(identification, 'miscellaneous')
    if (miscellaneous.length > 1) fail('invalid-identification')
    const parent = miscellaneous[0] ?? element(doc, identification, 'miscellaneous')
    const field = element(doc, parent, 'miscellaneous-field', '1')
    field.setAttribute('name', PART_INSTRUMENT_MARKER)
  }
  const derivedMusicXml = serialize(doc)
  const derived = parse(derivedMusicXml)
  if (JSON.stringify(derived.bodies.map(serialize)) !== JSON.stringify(musicalBodies)) fail('musical-integrity')
  const map = readMusicXmlPartInstrumentMap(derivedMusicXml)
  if (ids.some(id => map[id] !== selected.get(id))) fail('assignment-integrity')
  return Object.freeze({ schemaVersion: 1, sourceFingerprint: await fingerprint(musicXml), derivedFingerprint: await fingerprint(derivedMusicXml), derivedMusicXml,
    assignments: Object.freeze(ids.map(partId => Object.freeze({ partId, instrumentId: selected.get(partId) }))) })
}

export async function confirmPartInstrumentAssignment({ musicXml, preview, confirmed } = {}) {
  if (confirmed !== true || !preview || preview.schemaVersion !== 1) fail('confirmation-required')
  if (await fingerprint(musicXml) !== preview.sourceFingerprint) fail('stale-preview')
  const verified = await preparePartInstrumentAssignment({ musicXml, assignments: preview.assignments })
  if (verified.derivedMusicXml !== preview.derivedMusicXml || verified.derivedFingerprint !== preview.derivedFingerprint) fail('stale-preview')
  return verified.derivedMusicXml
}
