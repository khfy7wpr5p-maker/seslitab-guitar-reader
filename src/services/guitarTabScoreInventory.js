import { inspectMusicXml } from '../../musicXmlSecurity.js'

function fail(code) {
  throw new Error(`guitar-tab-score-inventory-${code}`)
}

function localName(node) {
  return String(node?.localName ?? node?.tagName ?? node?.tag ?? '')
    .replace(/^.*:/u, '')
}

function directChildren(node, name) {
  return [...(node?.children ?? [])]
    .filter((child) => localName(child) === name)
}

function descendants(node, name) {
  if (typeof node?.getElementsByTagNameNS === 'function') {
    return [...node.getElementsByTagNameNS('*', name)]
  }
  if (typeof node?.getElementsByTagName === 'function') {
    return [...node.getElementsByTagName(name)]
  }
  if (typeof node?.querySelectorAll === 'function') {
    return [...node.querySelectorAll(name)]
  }
  return []
}

function requiredTrimmedText(value, code) {
  if (typeof value !== 'string') fail(code)
  const trimmed = value.trim()
  if (!trimmed || trimmed !== value) fail(code)
  return trimmed
}

function positiveIntegerText(node) {
  const text = String(node?.textContent ?? '').trim()
  if (!/^[1-9]\d*$/u.test(text)) return null
  const value = Number(text)
  return Number.isSafeInteger(value) && value >= 1
    ? value
    : null
}

function nonNegativeIntegerText(node) {
  const text = String(node?.textContent ?? '').trim()
  if (!/^(0|[1-9]\d*)$/u.test(text)) return null
  const value = Number(text)
  return Number.isSafeInteger(value) && value >= 0
    ? value
    : null
}

function parseDocument(musicXml, DOMParserCtor) {
  const inspection = inspectMusicXml(musicXml)
  if (!inspection.ok) {
    fail(`unsafe-${inspection.code ?? 'structure'}`)
  }
  if (typeof DOMParserCtor !== 'function') {
    fail('dom-parser-unavailable')
  }

  let documentNode
  try {
    documentNode = new DOMParserCtor().parseFromString(
      inspection.xmlForParsing,
      'application/xml',
    )
  } catch {
    fail('parse-failed')
  }

  if (
    !documentNode ||
    descendants(documentNode, 'parsererror').length > 0
  ) {
    fail('parse-failed')
  }

  const root = documentNode.documentElement
  if (localName(root) !== 'score-partwise') {
    fail('score-partwise-required')
  }
  return root
}

function exactPartEvidence(root) {
  const partLists = directChildren(root, 'part-list')
  if (partLists.length !== 1) {
    fail('part-list-count')
  }

  const scoreParts = directChildren(partLists[0], 'score-part')
  if (scoreParts.length === 0) {
    fail('part-list-empty')
  }

  const seen = new Set()
  const listed = scoreParts.map((scorePart, partIndex) => {
    const partId = requiredTrimmedText(
      scorePart.getAttribute?.('id'),
      `part-id-invalid-${partIndex}`,
    )
    if (seen.has(partId)) {
      fail(`duplicate-part-id-${partId}`)
    }
    seen.add(partId)

    const name = String(directChildren(scorePart, 'part-name')[0]?.textContent ?? '').trim() || partId
    return Object.freeze({ partId, partIndex, name })
  })

  const bodyParts = directChildren(root, 'part')
  if (bodyParts.length !== listed.length) {
    fail('part-list-body-count-mismatch')
  }

  for (let index = 0; index < listed.length; index += 1) {
    const bodyId = requiredTrimmedText(
      bodyParts[index].getAttribute?.('id'),
      `body-part-id-invalid-${index}`,
    )
    if (bodyId !== listed[index].partId) {
      fail(`part-list-body-mismatch-${index}`)
    }
  }

  return Object.freeze({ listed: Object.freeze(listed), bodyParts })
}

function buildPartInventory(partEvidence, bodyPart) {
  const staffOrder = []
  const staffMap = new Map()

  for (const note of descendants(bodyPart, 'note')) {
    if (directChildren(note, 'pitch').length !== 1) continue

    const staffNodes = directChildren(note, 'staff')
    const voiceNodes = directChildren(note, 'voice')
    if (staffNodes.length !== 1 || voiceNodes.length !== 1) continue

    const staff = positiveIntegerText(staffNodes[0])
    const voice = nonNegativeIntegerText(voiceNodes[0])
    if (staff === null || voice === null) continue

    let staffRecord = staffMap.get(staff)
    if (!staffRecord) {
      staffRecord = {
        staff,
        voiceOrder: [],
        voices: new Map(),
      }
      staffMap.set(staff, staffRecord)
      staffOrder.push(staff)
    }

    let count = staffRecord.voices.get(voice)
    if (count === undefined) {
      count = 0
      staffRecord.voices.set(voice, count)
      staffRecord.voiceOrder.push(voice)
    }
    staffRecord.voices.set(voice, count + 1)
  }

  const staves = staffOrder.map((staff) => {
    const record = staffMap.get(staff)
    const voices = record.voiceOrder.map((voice) =>
      Object.freeze({
        voice,
        pitchedEventCount: record.voices.get(voice),
      }))
    return Object.freeze({
      staff,
      voices: Object.freeze(voices),
    })
  })

  return Object.freeze({
    partId: partEvidence.partId,
    partIndex: partEvidence.partIndex,
    name: partEvidence.name,
    staves: Object.freeze(staves),
  })
}

export function extractGuitarTabScoreInventory(
  musicXml,
  { DOMParserCtor = globalThis.DOMParser } = {},
) {
  const root = parseDocument(musicXml, DOMParserCtor)
  const { listed, bodyParts } = exactPartEvidence(root)
  const parts = listed.map((partEvidence, index) =>
    buildPartInventory(partEvidence, bodyParts[index]))

  return Object.freeze({
    parts: Object.freeze(parts),
  })
}
