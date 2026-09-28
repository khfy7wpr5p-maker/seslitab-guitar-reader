import { inspectMusicXml } from '../../musicXmlSecurity.js'

export const SMOOSIC_PADDING_PROVENANCE_VERSION = 1

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function directChildren(element, name) {
  return [...element.children].filter((child) => child.localName === name)
}

function explicitDuration(note) {
  const durations = directChildren(note, 'duration')
  if (durations.length !== 1) throw new Error('Certified padding rest requires one explicit duration')
  const text = durations[0].textContent.trim()
  const value = Number(text)
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Certified padding rest has invalid explicit duration')
  }
  return { element: durations[0], value }
}

function positiveXmlInteger(element, name) {
  const children = directChildren(element, name)
  if (children.length !== 1) throw new Error(`Ambiguous padding rest ${name} locator`)
  const value = children[0].textContent.trim()
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`Invalid padding rest ${name} locator`)
  }
  return Number(value)
}

// The exporter's raw ordinal follows part/measure/voice/note order. Only the
// single-part, single-staff representation can be reconstructed from v1 XML
// without guessing the model's staff indexes or its private note identities.
function rawLocators(document, notes) {
  const root = document.documentElement
  const parts = directChildren(root, 'part')
  if (root.localName !== 'score-partwise' || parts.length !== 1
    || [...root.querySelectorAll('staves')].some((staves) => staves.textContent.trim() !== '1')) {
    throw new Error('Unsupported padding rest part or staff locator mapping')
  }
  const locators = []
  for (const [measureIndex, measure] of directChildren(parts[0], 'measure').entries()) {
    const noteIndexes = new Map()
    let lastVoiceIndex = -1
    for (const note of directChildren(measure, 'note')) {
      const staff = directChildren(note, 'staff')
      if (staff.length && positiveXmlInteger(note, 'staff') !== 1) {
        throw new Error('Unsupported padding rest staff locator mapping')
      }
      const voiceIndex = positiveXmlInteger(note, 'voice') - 1
      if (voiceIndex < lastVoiceIndex) throw new Error('Ambiguous padding rest voice locator order')
      lastVoiceIndex = voiceIndex
      const noteIndex = noteIndexes.get(voiceIndex) ?? 0
      noteIndexes.set(voiceIndex, noteIndex + 1)
      locators.push({ note, staffIndex: 0, measureIndex, voiceIndex, noteIndex })
    }
  }
  if (locators.length !== notes.length || locators.some(({ note }, index) => note !== notes[index])) {
    throw new Error('Ambiguous padding rest raw note locator mapping')
  }
  return locators
}

/** Validate all certified raw ordinals before changing a cloned MusicXML document. */
export function normalizeSmoosicPaddingRests({ musicXml, provenance, sourceRevision } = {}) {
  if (!nonnegativeInteger(sourceRevision)) throw new Error('Invalid source revision')
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
    throw new Error('Missing padding rest provenance')
  }
  if (provenance.version !== SMOOSIC_PADDING_PROVENANCE_VERSION) {
    throw new Error('Unsupported padding rest provenance version')
  }
  if (!nonnegativeInteger(provenance.sourceRevision) || provenance.sourceRevision !== sourceRevision) {
    throw new Error('Stale padding rest provenance revision')
  }
  if (!nonnegativeInteger(provenance.rawNoteCount) || !Array.isArray(provenance.entries)
    || provenance.entries.length > provenance.rawNoteCount) {
    throw new Error('Invalid padding rest provenance note count or entry list')
  }

  const security = inspectMusicXml(musicXml)
  if (!security.ok) throw new Error(`Invalid MusicXML: ${security.code}`)
  if (typeof DOMParser !== 'function' || typeof XMLSerializer !== 'function') {
    throw new Error('MusicXML DOM parser and serializer are required')
  }
  let document
  try {
    document = new DOMParser().parseFromString(security.xmlForParsing, 'application/xml')
  } catch {
    throw new Error('Invalid MusicXML: parse failed')
  }
  if (!document?.documentElement || document.documentElement.localName !== security.rootName
    || document.querySelector('parsererror')) {
    throw new Error('Invalid MusicXML: parse failed')
  }

  const notes = [...document.querySelectorAll('note')]
  if (notes.length !== provenance.rawNoteCount) throw new Error('Padding rest raw note count mismatch')
  const locators = provenance.entries.length ? rawLocators(document, notes) : []
  let previousOrdinal = -1
  const identities = new Set()
  for (const entry of provenance.entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || !['staffIndex', 'measureIndex', 'voiceIndex', 'noteIndex', 'rawNoteOrdinal']
        .every((key) => nonnegativeInteger(entry[key]))
      || typeof entry.noteIdentity !== 'string' || !entry.noteIdentity.length
      || !Number.isSafeInteger(entry.durationTicks) || entry.durationTicks <= 0) {
      throw new Error('Invalid padding rest provenance entry or duration')
    }
    const ordinal = entry.rawNoteOrdinal
    if (ordinal <= previousOrdinal || ordinal >= notes.length) {
      throw new Error('Padding rest raw note ordinal is unsorted, duplicate or out of range')
    }
    previousOrdinal = ordinal
    if (identities.has(entry.noteIdentity)) throw new Error('Duplicate padding rest note identity')
    identities.add(entry.noteIdentity)
    if (['staffIndex', 'measureIndex', 'voiceIndex', 'noteIndex']
      .some((key) => entry[key] !== locators[ordinal][key])) {
      throw new Error('Padding rest raw note ordinal and locator mismatch')
    }
    const note = notes[ordinal]
    if (directChildren(note, 'rest').length !== 1 || directChildren(note, 'pitch').length) {
      throw new Error('Certified padding target is not a rest note')
    }
    if (explicitDuration(note).value !== entry.durationTicks) {
      throw new Error('Certified padding rest duration mismatch')
    }
    for (const name of ['voice', 'staff']) {
      if (directChildren(note, name).length > 1) {
        throw new Error(`Certified padding rest has duplicate ${name}`)
      }
    }
  }

  const clone = document.cloneNode(true)
  const clonedNotes = [...clone.querySelectorAll('note')]
  for (const { rawNoteOrdinal } of provenance.entries) {
    const note = clonedNotes[rawNoteOrdinal]
    const forward = clone.createElementNS(note.namespaceURI, 'forward')
    for (const name of ['duration', 'voice', 'staff']) {
      const child = directChildren(note, name)[0]
      if (child) forward.appendChild(child.cloneNode(true))
    }
    note.parentNode.replaceChild(forward, note)
  }
  return Object.freeze({
    musicXml: new XMLSerializer().serializeToString(clone),
    rawNoteCount: notes.length,
    normalizedNoteCount: notes.length - provenance.entries.length,
    convertedCount: provenance.entries.length,
  })
}
