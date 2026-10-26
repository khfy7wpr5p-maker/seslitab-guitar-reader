import { inspectMusicXml } from '../../musicXmlSecurity.js'
import {
  analyzeGuitarTabCanonicalIdentity,
  resolveGuitarTabCanonicalTarget,
} from './guitarTabCanonicalIdentity.js'

function fail(code) {
  throw new Error(`guitar-tab-score-inventory-${code}`)
}

function localName(node) {
  return String(node?.localName ?? node?.tagName ?? node?.tag ?? '')
    .replace(/^.*:/u, '')
}

function descendants(node, name) {
  if (typeof node?.getElementsByTagNameNS === 'function') return [...node.getElementsByTagNameNS('*', name)]
  if (typeof node?.getElementsByTagName === 'function') return [...node.getElementsByTagName(name)]
  if (typeof node?.querySelectorAll === 'function') return [...node.querySelectorAll(name)]
  return []
}

function parseDocument(musicXml, DOMParserCtor) {
  const inspection = inspectMusicXml(musicXml)
  if (!inspection.ok) fail(`unsafe-${inspection.code ?? 'structure'}`)
  if (typeof DOMParserCtor !== 'function') fail('dom-parser-unavailable')

  let documentNode
  try {
    documentNode = new DOMParserCtor().parseFromString(inspection.xmlForParsing, 'application/xml')
  } catch {
    fail('parse-failed')
  }
  if (!documentNode || descendants(documentNode, 'parsererror').length > 0) fail('parse-failed')
  if (localName(documentNode.documentElement) !== 'score-partwise') fail('score-partwise-required')
  return documentNode
}

function publicPartInventory(part) {
  return Object.freeze({
    partId: part.partId,
    partIndex: part.partIndex,
    name: part.name,
    staves: Object.freeze(part.staves.map((staff) => Object.freeze({
      staff: staff.staff,
      voices: Object.freeze(staff.voices.map((voice) => Object.freeze({
        voice: voice.voice,
        pitchedEventCount: voice.pitchedEventCount,
      }))),
    }))),
  })
}

function createIdentityElement(documentNode, note, root, name, value) {
  const element = documentNode.createElementNS?.(note.namespaceURI ?? root.namespaceURI ?? null, name)
    ?? documentNode.createElement?.(name)
  if (!element) fail(`${name}-default-unavailable`)
  element.textContent = String(value)
  note.appendChild(element)
}

export function extractGuitarTabScoreInventory(
  musicXml,
  { DOMParserCtor = globalThis.DOMParser } = {},
) {
  const documentNode = parseDocument(musicXml, DOMParserCtor)
  const analysis = analyzeGuitarTabCanonicalIdentity(documentNode.documentElement)
  return Object.freeze({
    parts: Object.freeze(analysis.parts.map(publicPartInventory)),
  })
}

export function prepareGuitarTabEditorSourceXml(
  musicXml,
  targetSelection,
  { DOMParserCtor = globalThis.DOMParser, XMLSerializerCtor = globalThis.XMLSerializer } = {},
) {
  if (typeof musicXml !== 'string') fail('source-invalid')
  const documentNode = parseDocument(musicXml, DOMParserCtor)
  const root = documentNode.documentElement
  const analysis = analyzeGuitarTabCanonicalIdentity(root)
  const target = resolveGuitarTabCanonicalTarget(analysis, targetSelection)

  let changed = false
  for (const noteEvidence of target.pitchedNotes) {
    if (noteEvidence.implicitVoice) {
      createIdentityElement(documentNode, noteEvidence.node, root, 'voice', noteEvidence.voice)
      changed = true
    }
    if (noteEvidence.implicitStaff) {
      createIdentityElement(documentNode, noteEvidence.node, root, 'staff', noteEvidence.staff)
      changed = true
    }
  }

  if (!changed) return musicXml
  if (typeof XMLSerializerCtor !== 'function') fail('xml-serializer-unavailable')
  try {
    return new XMLSerializerCtor().serializeToString(documentNode)
  } catch {
    fail('serialize-failed')
  }
}
