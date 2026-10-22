import { inspectMusicXml } from '../../musicXmlSecurity.js'

function localName(node) {
  return String(node?.localName ?? node?.tagName ?? '').replace(/^.*:/u, '')
}

function children(node, name) {
  return [...(node?.children ?? [])].filter((child) => localName(child) === name)
}

export function listViolinAssignmentParts(musicXml, DOMParserCtor = globalThis.DOMParser) {
  const safe = inspectMusicXml(musicXml)
  if (!safe.ok || typeof DOMParserCtor !== 'function') {
    throw new Error('violin-score-parts-unavailable')
  }

  let doc
  try {
    doc = new DOMParserCtor().parseFromString(safe.xmlForParsing, 'application/xml')
  } catch {
    throw new Error('violin-score-parts-unavailable')
  }
  const root = doc?.documentElement
  if (
    localName(root) !== 'score-partwise' ||
    doc.getElementsByTagName?.('parsererror')?.length > 0
  ) {
    throw new Error('violin-score-parts-unavailable')
  }

  const lists = children(root, 'part-list')
  const bodies = children(root, 'part')
  if (lists.length !== 1) throw new Error('violin-score-parts-unavailable')
  const listed = children(lists[0], 'score-part')
  if (listed.length === 0 || listed.length !== bodies.length) {
    throw new Error('violin-score-parts-unavailable')
  }

  const seen = new Set()
  return Object.freeze(listed.map((part, index) => {
    const partId = part.getAttribute?.('id')
    const nameNodes = children(part, 'part-name')
    const name = nameNodes[0]?.textContent?.trim()
    if (
      typeof partId !== 'string' || !partId || partId !== partId.trim() ||
      partId.length > 128 || seen.has(partId) ||
      bodies[index].getAttribute?.('id') !== partId ||
      nameNodes.length !== 1 || !name
    ) {
      throw new Error('violin-score-parts-unavailable')
    }
    seen.add(partId)
    return Object.freeze({ partId, name })
  }))
}

export function resolveViolinAssignmentTarget(musicXml, selectedPartId = null) {
  const parts = listViolinAssignmentParts(musicXml)
  if (parts.length > 1 && selectedPartId === null) {
    throw new Error('violin-target-selection-required')
  }
  const target = selectedPartId ?? parts[0].partId
  if (!parts.some((part) => part.partId === target)) {
    throw new Error('violin-target-part-mismatch')
  }
  return target
}
