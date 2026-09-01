// STI-10/11/12 — exact Editor Core notation rehydration/materialization bridge.
//
// This module never infers nearest notation objects. Product NoteObject index,
// projected Editor entity ids, revision-bound semantic addresses and direct
// MusicXML note order must agree exactly or the operation fails closed.

export const SESLITAB_EDITOR_PRD_NOTATION_BRIDGE_VERSION = '1.0.0'
export const EDITOR_ADVANCED_TARGET_VERSION = '1.0.0'

const SIMPLE_DURATIONS = Object.freeze([
  Object.freeze({ name: 'whole', numerator: 1n, denominator: 1n }),
  Object.freeze({ name: 'half', numerator: 1n, denominator: 2n }),
  Object.freeze({ name: 'quarter', numerator: 1n, denominator: 4n }),
  Object.freeze({ name: 'eighth', numerator: 1n, denominator: 8n }),
  Object.freeze({ name: '16th', numerator: 1n, denominator: 16n }),
  Object.freeze({ name: '32nd', numerator: 1n, denominator: 32n }),
])
const DOT_FACTORS = Object.freeze([
  Object.freeze({ numerator: 1n, denominator: 1n }),
  Object.freeze({ numerator: 3n, denominator: 2n }),
  Object.freeze({ numerator: 7n, denominator: 4n }),
  Object.freeze({ numerator: 15n, denominator: 8n }),
])
const BEAM_VALUES = new Set(['begin', 'continue', 'end', 'forward-hook', 'backward-hook'])
const NOTE_TYPE_TAGS_AFTER_ACCIDENTAL = new Set(['time-modification', 'stem', 'notehead', 'staff', 'beam', 'notations', 'lyric', 'play', 'listen'])
const NOTE_TAGS_AFTER_TIME_MODIFICATION = new Set(['stem', 'notehead', 'staff', 'beam', 'notations', 'lyric', 'play', 'listen'])

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function tagOf(element) {
  return element?.localName ?? element?.tagName ?? element?.tag ?? ''
}

function directChildren(element, name = null) {
  const children = [...(element?.children ?? [])]
  return name === null ? children : children.filter((item) => tagOf(item) === name)
}

function child(element, name) {
  return directChildren(element, name)[0] ?? null
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required.`)
  return value.trim()
}

function positiveInteger(value, label, max = Number.MAX_SAFE_INTEGER) {
  const number = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  if (!Number.isSafeInteger(number) || number <= 0 || number > max) throw new Error(`${label} must be a positive integer.`)
  return number
}

function integerAttribute(element, name, fallback, label, max = 16) {
  const raw = element?.getAttribute?.(name)
  if (raw === null || raw === undefined || raw === '') return fallback
  return positiveInteger(raw, label, max)
}

function xmlDocument(musicXml, DOMParserCtor) {
  if (typeof musicXml !== 'string' || musicXml.trim() === '') throw new Error('Current MusicXML is required.')
  if (typeof DOMParserCtor !== 'function') throw new Error('DOMParser is required for exact MusicXML notation rehydration.')
  const doc = new DOMParserCtor().parseFromString(musicXml, 'application/xml')
  if (!doc || doc.querySelector?.('parsererror')) throw new Error('Current MusicXML could not be parsed exactly.')
  return doc
}

function createElementLike(doc, parent, name) {
  const namespace = parent?.namespaceURI ?? doc.documentElement?.namespaceURI ?? null
  return namespace && typeof doc.createElementNS === 'function'
    ? doc.createElementNS(namespace, name)
    : doc.createElement(name)
}

function insertBeforeFirstNamed(parent, element, names) {
  const next = directChildren(parent).find((item) => names.has(tagOf(item))) ?? null
  parent.insertBefore(element, next)
}

function removeDirectChildren(parent, name) {
  for (const element of directChildren(parent, name)) element.remove?.()
}

function normalizedBoundaryMarks(elements, label) {
  const marks = []
  for (const element of elements) {
    const rawType = String(element.getAttribute?.('type') ?? '').trim()
    const number = integerAttribute(element, 'number', 1, `${label} number`)
    if (rawType === 'start' || rawType === 'stop') {
      marks.push(Object.freeze({ number, type: rawType }))
    } else if (rawType === 'continue') {
      marks.push(Object.freeze({ number, type: 'stop' }))
      marks.push(Object.freeze({ number, type: 'start' }))
    } else {
      throw new Error(`${label} contains unsupported boundary type ${rawType || '(empty)'}.`)
    }
  }
  const seen = new Set()
  for (const mark of marks) {
    const key = `${mark.number}:${mark.type}`
    if (seen.has(key)) throw new Error(`${label} contains duplicate boundary mark ${key}.`)
    seen.add(key)
  }
  return Object.freeze(marks)
}

function notationContainer(note) {
  return child(note, 'notations')
}

function tieMarks(note) {
  const notations = notationContainer(note)
  const tied = notations ? directChildren(notations, 'tied') : []
  if (tied.length > 0) return normalizedBoundaryMarks(tied, 'MusicXML tied')
  return normalizedBoundaryMarks(directChildren(note, 'tie'), 'MusicXML tie')
}

function slurMarks(note) {
  const notations = notationContainer(note)
  return normalizedBoundaryMarks(notations ? directChildren(notations, 'slur') : [], 'MusicXML slur')
}

function accidentalDisplay(note) {
  const accidental = child(note, 'accidental')
  if (!accidental) return null
  const raw = String(accidental.textContent ?? '').trim()
  const mapped = ({
    sharp: 'sharp',
    flat: 'flat',
    natural: 'natural',
    'double-sharp': 'double-sharp',
    'sharp-sharp': 'double-sharp',
    'double-flat': 'double-flat',
    'flat-flat': 'double-flat',
  })[raw]
  if (!mapped) throw new Error(`Unsupported MusicXML accidental display: ${raw || '(empty)'}.`)
  return mapped
}

function beamSpecs(note) {
  return Object.freeze(directChildren(note, 'beam').map((beam, index) => {
    const number = integerAttribute(beam, 'number', 1, `MusicXML beam ${index + 1} number`, 8)
    const value = String(beam.textContent ?? '').trim().toLowerCase().replace(/\s+/g, '-')
    if (!BEAM_VALUES.has(value)) throw new Error(`Unsupported MusicXML beam value: ${value || '(empty)'}.`)
    return Object.freeze({ number, value })
  }))
}

function tupletSpec(note) {
  const modification = child(note, 'time-modification')
  const notations = notationContainer(note)
  const marks = normalizedBoundaryMarks(notations ? directChildren(notations, 'tuplet') : [], 'MusicXML tuplet')
  if (!modification) {
    if (marks.length > 0) throw new Error('MusicXML tuplet marks require time-modification evidence.')
    return null
  }
  if (directChildren(modification, 'normal-dot').length > 0) {
    throw new Error('Editor Core v1 cannot rehydrate dotted normal-type tuplet metadata.')
  }
  const actual = child(modification, 'actual-notes')
  const normal = child(modification, 'normal-notes')
  if (!actual || !normal) throw new Error('MusicXML time-modification requires actual-notes and normal-notes.')
  return Object.freeze({
    actualNotes: positiveInteger(actual.textContent, 'tuplet actual-notes', 32),
    normalNotes: positiveInteger(normal.textContent, 'tuplet normal-notes', 32),
    marks,
  })
}

function eventNotationForXmlNote(note) {
  return Object.freeze({
    dots: directChildren(note, 'dot').length,
    beams: beamSpecs(note),
    tuplet: tupletSpec(note),
  })
}

function noteNotationForXmlNote(note) {
  return Object.freeze({
    accidental: accidentalDisplay(note),
    ties: tieMarks(note),
    slurs: slurMarks(note),
  })
}

function dataEqual(left, right) {
  if (Object.is(left, right)) return true
  if (typeof left !== typeof right || left === null || right === null) return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => dataEqual(value, right[index]))
  }
  if (typeof left === 'object') {
    if (!isPlainObject(left) || !isPlainObject(right)) return false
    const leftKeys = Object.keys(left).sort()
    const rightKeys = Object.keys(right).sort()
    return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && dataEqual(left[key], right[key]))
  }
  return false
}

function revisionGroups(teacherRevision) {
  if (!teacherRevision || !Array.isArray(teacherRevision.content)) throw new Error('Current immutable teacher revision is required.')
  const groups = new Map()
  for (let index = 0; index < teacherRevision.content.length; index++) {
    const note = teacherRevision.content[index]
    if (!isPlainObject(note)) throw new Error(`Product note ${index} must be plain data.`)
    const partId = requiredText(note.partId, `Product note ${index} partId`)
    if (!Number.isSafeInteger(note.measureIndex) || note.measureIndex < 0) throw new Error(`Product note ${index} measureIndex is invalid.`)
    const key = `${partId}\u0000${note.measureIndex}`
    const list = groups.get(key) ?? []
    list.push(index)
    groups.set(key, list)
  }
  return groups
}

export function alignMusicXmlNotesToProductRevision(musicXml, teacherRevision, {
  DOMParserCtor = globalThis.DOMParser,
} = {}) {
  const doc = xmlDocument(musicXml, DOMParserCtor)
  const groups = revisionGroups(teacherRevision)
  const aligned = Array(teacherRevision.content.length).fill(null)
  const parts = directChildren(doc.documentElement, 'part')
  const partById = new Map(parts.map((part) => [part.getAttribute?.('id') ?? '', part]))

  for (const [key, indexes] of groups) {
    const [partId, rawMeasureIndex] = key.split('\u0000')
    const measureIndex = Number(rawMeasureIndex)
    const part = partById.get(partId)
    if (!part) throw new Error(`MusicXML part ${partId} is missing for current product revision.`)
    const measure = directChildren(part, 'measure')[measureIndex]
    if (!measure) throw new Error(`MusicXML measure ${partId}/${measureIndex} is missing for current product revision.`)
    const xmlNotes = directChildren(measure, 'note')
    if (xmlNotes.length !== indexes.length) {
      throw new Error(`MusicXML note cardinality mismatch at ${partId}/${measureIndex}: ${xmlNotes.length} vs ${indexes.length}.`)
    }
    for (let localIndex = 0; localIndex < indexes.length; localIndex++) aligned[indexes[localIndex]] = xmlNotes[localIndex]
  }
  if (aligned.some((item) => !item)) throw new Error('MusicXML note alignment is incomplete.')
  return Object.freeze({ doc, notes: Object.freeze(aligned) })
}

function originalPartOrder(teacherRevision) {
  const byIndex = new Map()
  for (const note of teacherRevision.content) {
    if (!Number.isSafeInteger(note.partIndex) || note.partIndex < 0) throw new Error('Product partIndex is invalid for Editor mapping.')
    const partId = requiredText(note.partId, 'Product partId')
    if (byIndex.has(note.partIndex) && byIndex.get(note.partIndex) !== partId) throw new Error('Product partIndex maps to multiple part ids.')
    byIndex.set(note.partIndex, partId)
  }
  return [...byIndex.entries()].sort((left, right) => left[0] - right[0])
}

function eventNotes(event) {
  if (event.kind === 'note') return [event.note]
  if (event.kind === 'chord') return event.notes
  return []
}

function semanticAddressMaps(score) {
  const events = new Map()
  const notes = new Map()
  const common = { contractVersion: '1.0.0', documentId: score.id, revisionId: score.revision.id }
  for (const part of score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const voice of measure.voices) {
          for (const event of voice.events) {
            const eventAddress = Object.freeze({
              ...common,
              kind: 'event',
              partId: part.id,
              staffId: staff.id,
              measureId: measure.id,
              voiceId: voice.id,
              eventId: event.id,
            })
            events.set(event.id, eventAddress)
            for (const note of eventNotes(event)) {
              notes.set(note.id, Object.freeze({
                ...common,
                kind: 'note',
                partId: part.id,
                staffId: staff.id,
                measureId: measure.id,
                voiceId: voice.id,
                eventId: event.id,
                noteId: note.id,
              }))
            }
          }
        }
      }
    }
  }
  return Object.freeze({ events, notes })
}

export function buildPrDProjectionMapping({ teacherRevision, score, noteIds } = {}) {
  if (!teacherRevision || !Array.isArray(teacherRevision.content) || !score || !Array.isArray(score.parts) || !Array.isArray(noteIds)) {
    throw new Error('STI-10 exact product/Editor projection evidence is required.')
  }
  if (noteIds.length !== teacherRevision.content.length) throw new Error('Editor note-id projection cardinality mismatch.')
  const productParts = originalPartOrder(teacherRevision)
  if (productParts.length !== score.parts.length) throw new Error('Editor projected part cardinality mismatch.')
  const partByProductIndex = new Map(productParts.map(([partIndex], order) => [partIndex, score.parts[order]]))
  const cursorByVoice = new Map()
  const lastEventByVoice = new Map()
  const eventIds = Array(teacherRevision.content.length).fill(null)

  for (let index = 0; index < teacherRevision.content.length; index++) {
    const source = teacherRevision.content[index]
    const part = partByProductIndex.get(source.partIndex)
    const staff = part?.staves?.find((item) => item.ordinal === source.staff)
    const measure = staff?.measures?.find((item) => item.ordinal === source.measureIndex + 1)
    const voice = measure?.voices?.find((item) => item.ordinal === source.voice)
    if (!part || !staff || !measure || !voice) throw new Error(`Editor structural mapping failed at product note ${index}.`)
    const voiceKey = voice.id
    let event
    if (source.isChordNote === true) {
      event = lastEventByVoice.get(voiceKey) ?? null
      if (!event || event.kind !== 'chord') throw new Error(`Chord continuation ${index} has no exact projected Editor chord owner.`)
    } else {
      const cursor = cursorByVoice.get(voiceKey) ?? 0
      event = voice.events[cursor] ?? null
      if (!event) throw new Error(`Product note ${index} has no exact projected Editor event.`)
      cursorByVoice.set(voiceKey, cursor + 1)
      lastEventByVoice.set(voiceKey, event)
    }
    eventIds[index] = event.id

    const noteId = noteIds[index]
    if (source.isRest === true) {
      if (noteId !== null || event.kind !== 'rest') throw new Error(`Rest note ${index} did not map to one exact Editor rest event.`)
    } else {
      if (typeof noteId !== 'string' || !eventNotes(event).some((note) => note.id === noteId)) {
        throw new Error(`Product note ${index} did not map to its exact Editor note atom.`)
      }
    }
  }

  const addresses = semanticAddressMaps(score)
  return Object.freeze({
    version: SESLITAB_EDITOR_PRD_NOTATION_BRIDGE_VERSION,
    eventIds: Object.freeze(eventIds),
    noteIds: Object.freeze([...noteIds]),
    eventAddresses: addresses.events,
    noteAddresses: addresses.notes,
  })
}

function nonDefaultEventNotation(value) {
  return value.dots !== 0 || value.beams.length > 0 || value.tuplet !== null
}

function nonDefaultNoteNotation(value) {
  return value.accidental !== null || value.ties.length > 0 || value.slurs.length > 0
}

export function buildPrDNotationInput({ musicXml, teacherRevision, score, mapping, DOMParserCtor = globalThis.DOMParser } = {}) {
  const aligned = alignMusicXmlNotesToProductRevision(musicXml, teacherRevision, { DOMParserCtor })
  const eventValues = new Map()
  const eventEntries = []
  const noteEntries = []

  for (let index = 0; index < aligned.notes.length; index++) {
    const xmlNote = aligned.notes[index]
    const eventId = mapping.eventIds[index]
    const eventAddress = mapping.eventAddresses.get(eventId)
    if (!eventAddress) throw new Error(`Current Editor event address is unavailable at product note ${index}.`)
    const eventNotation = eventNotationForXmlNote(xmlNote)
    if (eventValues.has(eventId)) {
      if (!dataEqual(eventValues.get(eventId), eventNotation)) throw new Error(`Chord event ${eventId} carries inconsistent MusicXML event notation.`)
    } else {
      eventValues.set(eventId, eventNotation)
      if (nonDefaultEventNotation(eventNotation)) eventEntries.push(Object.freeze({ target: eventAddress, notation: eventNotation }))
    }

    const noteId = mapping.noteIds[index]
    if (noteId !== null) {
      const noteAddress = mapping.noteAddresses.get(noteId)
      if (!noteAddress) throw new Error(`Current Editor note address is unavailable at product note ${index}.`)
      const noteNotation = noteNotationForXmlNote(xmlNote)
      if (nonDefaultNoteNotation(noteNotation)) noteEntries.push(Object.freeze({ target: noteAddress, notation: noteNotation }))
    }
  }

  return Object.freeze({
    contractVersion: '1.0.0',
    documentId: score.id,
    revisionId: score.revision.id,
    measures: Object.freeze([]),
    events: Object.freeze(eventEntries),
    notes: Object.freeze(noteEntries),
  })
}

export function createPrDValidatedNotationDocument({ runtime, musicXml, teacherRevision, score, mapping, DOMParserCtor = globalThis.DOMParser } = {}) {
  if (!runtime || typeof runtime.createNotationDocument !== 'function') throw new Error('Editor Core validated notation constructor is unavailable.')
  const input = buildPrDNotationInput({ musicXml, teacherRevision, score, mapping, DOMParserCtor })
  return runtime.createNotationDocument(score, input)
}

function exactManifestAddress(session, kind, entityId) {
  const entries = session?.renderRequest?.manifest?.entries
  if (!Array.isArray(entries)) throw new Error('Current Editor render manifest is unavailable.')
  const matches = entries.filter((entry) => {
    const address = entry?.address
    if (address?.kind !== kind) return false
    return kind === 'event' ? address.eventId === entityId : address.noteId === entityId
  })
  if (matches.length !== 1) throw new Error(`Expected one current Editor ${kind} manifest entry for ${entityId}, observed ${matches.length}.`)
  return matches[0].address
}

export function buildPrDAdvancedTarget({ session, mapping, actionId, productIndexes } = {}) {
  if (!Array.isArray(productIndexes) || productIndexes.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= mapping.eventIds.length)) {
    throw new Error('Advanced keypad target requires explicit current product indexes.')
  }
  if (actionId === 'tuplet.triplet') {
    if (productIndexes.length !== 3) throw new Error('Triplet requires exactly three explicitly selected product events.')
    const ids = productIndexes.map((index) => mapping.eventIds[index])
    if (new Set(ids).size !== 3) throw new Error('Triplet explicit range cannot contain two notes from the same Editor event.')
    return Object.freeze({
      version: EDITOR_ADVANCED_TARGET_VERSION,
      kind: 'EVENT_RANGE',
      targets: Object.freeze(ids.map((id) => exactManifestAddress(session, 'event', id))),
    })
  }
  if (actionId === 'tie.edit' || actionId === 'slur.edit') {
    if (productIndexes.length !== 2) throw new Error(`${actionId} requires exactly two explicit note endpoints.`)
    const ids = productIndexes.map((index) => mapping.noteIds[index])
    if (ids.some((id) => typeof id !== 'string') || ids[0] === ids[1]) throw new Error(`${actionId} endpoints must be two distinct pitched notes.`)
    return Object.freeze({
      version: EDITOR_ADVANCED_TARGET_VERSION,
      kind: 'NOTE_PAIR',
      start: exactManifestAddress(session, 'note', ids[0]),
      stop: exactManifestAddress(session, 'note', ids[1]),
    })
  }
  throw new Error(`Unsupported advanced keypad action ${actionId}.`)
}

function rationalToBig(value, label) {
  if (!value || !Number.isSafeInteger(value.numerator) || !Number.isSafeInteger(value.denominator) || value.denominator <= 0) {
    throw new Error(`${label} is not an exact Editor Rational.`)
  }
  return { numerator: BigInt(value.numerator), denominator: BigInt(value.denominator) }
}

function equalRational(left, right) {
  return left.numerator * right.denominator === right.numerator * left.denominator
}

function multiplyRational(value, numerator, denominator) {
  return { numerator: value.numerator * BigInt(numerator), denominator: value.denominator * BigInt(denominator) }
}

function durationDivisions(value, divisions, label) {
  const rational = rationalToBig(value, label)
  const numerator = rational.numerator * BigInt(divisions) * 4n
  if (numerator % rational.denominator !== 0n) throw new Error(`${label} cannot be represented exactly by current MusicXML divisions ${divisions}.`)
  const result = numerator / rational.denominator
  if (result < 0n || result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} exceeds MusicXML safe duration range.`)
  return Number(result)
}

function writtenType(eventDuration, eventNotation) {
  let value = rationalToBig(eventDuration, 'Editor event duration')
  if (eventNotation?.tuplet) value = multiplyRational(value, eventNotation.tuplet.actualNotes, eventNotation.tuplet.normalNotes)
  const dots = eventNotation?.dots ?? 0
  const factor = DOT_FACTORS[dots]
  if (!factor) throw new Error(`Editor dot count ${dots} is outside admitted range.`)
  value = multiplyRational(value, factor.denominator, factor.numerator)
  const match = SIMPLE_DURATIONS.find((item) => equalRational(value, item))
  if (!match) throw new Error('Editor event duration does not resolve to a supported written note type.')
  return match.name
}

function scoreEntityMaps(score) {
  const events = new Map()
  const notes = new Map()
  for (const part of score.parts) for (const staff of part.staves) for (const measure of staff.measures) for (const voice of measure.voices) for (const event of voice.events) {
    events.set(event.id, event)
    for (const note of eventNotes(event)) notes.set(note.id, note)
  }
  return { events, notes }
}

function notationMaps(notation) {
  return {
    events: new Map(notation.events.map((entry) => [entry.target.eventId, entry.notation])),
    notes: new Map(notation.notes.map((entry) => [entry.target.noteId, entry.notation])),
  }
}

function ensureChild(doc, parent, name, beforeNames = null) {
  let element = child(parent, name)
  if (element) return element
  element = createElementLike(doc, parent, name)
  if (beforeNames) insertBeforeFirstNamed(parent, element, beforeNames)
  else parent.appendChild(element)
  return element
}

function setPitch(doc, xmlNote, atom) {
  if (child(xmlNote, 'rest')) throw new Error('Editor v1 does not admit rest-to-note conversion through the current keypad.')
  const pitch = child(xmlNote, 'pitch')
  if (!pitch) throw new Error('Current pitched MusicXML note has no pitch element.')
  const step = ensureChild(doc, pitch, 'step')
  const octave = ensureChild(doc, pitch, 'octave')
  step.textContent = atom.pitch.step
  octave.textContent = String(atom.pitch.octave)
  let alter = child(pitch, 'alter')
  if (atom.pitch.alter === 0) alter?.remove?.()
  else {
    if (!alter) {
      alter = createElementLike(doc, pitch, 'alter')
      pitch.insertBefore(alter, octave)
    }
    alter.textContent = String(atom.pitch.alter)
  }
}

function removeTechnicalForRest(notations) {
  if (!notations) return
  for (const technical of directChildren(notations, 'technical')) technical.remove?.()
  for (const tied of directChildren(notations, 'tied')) tied.remove?.()
  for (const slur of directChildren(notations, 'slur')) slur.remove?.()
}

function setRest(doc, xmlNote) {
  if (child(xmlNote, 'chord')) throw new Error('Chord-to-rest conversion is not admitted by the SesliTab PR-D materializer.')
  child(xmlNote, 'pitch')?.remove?.()
  child(xmlNote, 'accidental')?.remove?.()
  removeDirectChildren(xmlNote, 'tie')
  removeTechnicalForRest(notationContainer(xmlNote))
  if (!child(xmlNote, 'rest')) {
    const rest = createElementLike(doc, xmlNote, 'rest')
    const duration = child(xmlNote, 'duration')
    xmlNote.insertBefore(rest, duration ?? xmlNote.firstChild ?? null)
  }
}

function setDots(doc, xmlNote, count) {
  if (!Number.isSafeInteger(count) || count < 0 || count > 3) throw new Error('Editor dot count is outside admitted range.')
  removeDirectChildren(xmlNote, 'dot')
  const type = child(xmlNote, 'type')
  if (!type && count > 0) throw new Error('Cannot materialize augmentation dots without a written type.')
  let next = type
  for (let index = 0; index < count; index++) {
    const dot = createElementLike(doc, xmlNote, 'dot')
    const children = directChildren(xmlNote)
    const position = children.indexOf(next)
    const before = position >= 0 ? children[position + 1] ?? null : null
    xmlNote.insertBefore(dot, before)
    next = dot
  }
}

function setAccidental(doc, xmlNote, display) {
  let accidental = child(xmlNote, 'accidental')
  if (display === null || display === undefined) {
    accidental?.remove?.()
    return
  }
  const xmlValue = display === 'double-flat' ? 'flat-flat' : display
  if (!accidental) {
    accidental = createElementLike(doc, xmlNote, 'accidental')
    insertBeforeFirstNamed(xmlNote, accidental, NOTE_TYPE_TAGS_AFTER_ACCIDENTAL)
  }
  accidental.textContent = xmlValue
}

function setTimeModification(doc, xmlNote, tuplet) {
  let modification = child(xmlNote, 'time-modification')
  if (!tuplet) {
    modification?.remove?.()
    return
  }
  if (!modification) {
    modification = createElementLike(doc, xmlNote, 'time-modification')
    insertBeforeFirstNamed(xmlNote, modification, NOTE_TAGS_AFTER_TIME_MODIFICATION)
  }
  modification.replaceChildren?.()
  if (directChildren(modification).length) {
    for (const item of directChildren(modification)) item.remove?.()
  }
  const actual = createElementLike(doc, modification, 'actual-notes')
  actual.textContent = String(tuplet.actualNotes)
  const normal = createElementLike(doc, modification, 'normal-notes')
  normal.textContent = String(tuplet.normalNotes)
  modification.appendChild(actual)
  modification.appendChild(normal)
}

function ensureNotations(doc, xmlNote) {
  let notations = notationContainer(xmlNote)
  if (!notations) {
    notations = createElementLike(doc, xmlNote, 'notations')
    xmlNote.appendChild(notations)
  }
  return notations
}

function cleanupNotations(notations) {
  if (notations && directChildren(notations).length === 0) notations.remove?.()
}

function setTupletMarks(doc, xmlNote, marks) {
  const current = notationContainer(xmlNote)
  if (!marks || marks.length === 0) {
    if (current) {
      for (const item of directChildren(current, 'tuplet')) item.remove?.()
      cleanupNotations(current)
    }
    return
  }
  const notations = ensureNotations(doc, xmlNote)
  for (const item of directChildren(notations, 'tuplet')) item.remove?.()
  for (const mark of marks) {
    const element = createElementLike(doc, notations, 'tuplet')
    element.setAttribute('type', mark.type)
    element.setAttribute('number', String(mark.number))
    notations.appendChild(element)
  }
}

function setTies(doc, xmlNote, marks) {
  removeDirectChildren(xmlNote, 'tie')
  const existing = notationContainer(xmlNote)
  if (existing) for (const item of directChildren(existing, 'tied')) item.remove?.()
  if (!marks || marks.length === 0) {
    cleanupNotations(existing)
    return
  }
  const voice = child(xmlNote, 'voice')
  for (const mark of marks) {
    const tie = createElementLike(doc, xmlNote, 'tie')
    tie.setAttribute('type', mark.type)
    xmlNote.insertBefore(tie, voice ?? child(xmlNote, 'type') ?? null)
  }
  const notations = ensureNotations(doc, xmlNote)
  for (const mark of marks) {
    const tied = createElementLike(doc, notations, 'tied')
    tied.setAttribute('type', mark.type)
    tied.setAttribute('number', String(mark.number))
    notations.appendChild(tied)
  }
}

function setSlurs(doc, xmlNote, marks) {
  const existing = notationContainer(xmlNote)
  if (existing) for (const item of directChildren(existing, 'slur')) item.remove?.()
  if (!marks || marks.length === 0) {
    cleanupNotations(existing)
    return
  }
  const notations = ensureNotations(doc, xmlNote)
  for (const mark of marks) {
    const slur = createElementLike(doc, notations, 'slur')
    slur.setAttribute('type', mark.type)
    slur.setAttribute('number', String(mark.number))
    notations.appendChild(slur)
  }
}

function eventNotationOrDefault(map, eventId) {
  return map.get(eventId) ?? Object.freeze({ dots: 0, beams: Object.freeze([]), tuplet: null })
}

function noteNotationOrDefault(map, noteId) {
  return map.get(noteId) ?? Object.freeze({ accidental: null, ties: Object.freeze([]), slurs: Object.freeze([]) })
}

function measureGroups(teacherRevision) {
  const groups = new Map()
  for (let index = 0; index < teacherRevision.content.length; index++) {
    const note = teacherRevision.content[index]
    const key = `${note.partId}\u0000${note.measureIndex}`
    const list = groups.get(key) ?? []
    list.push(index)
    groups.set(key, list)
  }
  return groups
}

function movementElement(doc, measure, tag, duration) {
  const movement = createElementLike(doc, measure, tag)
  const value = createElementLike(doc, movement, 'duration')
  value.textContent = String(duration)
  movement.appendChild(value)
  return movement
}

export function materializePrDEditorSessionMusicXml({
  session,
  teacherRevision,
  musicXml,
  mapping,
  DOMParserCtor = globalThis.DOMParser,
  XMLSerializerCtor = globalThis.XMLSerializer,
} = {}) {
  const present = session?.history?.present
  if (!present?.score || !present?.notation) throw new Error('Current Editor session snapshot is required for materialization.')
  if (typeof XMLSerializerCtor !== 'function') throw new Error('XMLSerializer is required for Editor materialization.')
  const aligned = alignMusicXmlNotesToProductRevision(musicXml, teacherRevision, { DOMParserCtor })
  const doc = aligned.doc
  const entity = scoreEntityMaps(present.score)
  const notation = notationMaps(present.notation)
  const eventIndexes = new Map()
  for (let index = 0; index < mapping.eventIds.length; index++) {
    const id = mapping.eventIds[index]
    const list = eventIndexes.get(id) ?? []
    list.push(index)
    eventIndexes.set(id, list)
  }

  for (let index = 0; index < aligned.notes.length; index++) {
    const xmlNote = aligned.notes[index]
    const eventId = mapping.eventIds[index]
    const event = entity.events.get(eventId)
    if (!event) throw new Error(`Editor event ${eventId} disappeared during materialization.`)
    const eventNotation = eventNotationOrDefault(notation.events, eventId)
    const sameEventIndexes = eventIndexes.get(eventId) ?? []

    let noteId = mapping.noteIds[index]
    if (event.kind === 'rest') {
      if (sameEventIndexes.length !== 1) throw new Error('Chord-to-rest conversion is ambiguous and fails closed.')
      setRest(doc, xmlNote)
      noteId = null
    } else {
      if (typeof noteId !== 'string') throw new Error('Rest-to-note conversion is not admitted by the current keypad.')
      const atom = entity.notes.get(noteId)
      if (!atom) throw new Error(`Editor note ${noteId} disappeared without an admitted rest conversion.`)
      setPitch(doc, xmlNote, atom)
    }

    const divisions = positiveInteger(teacherRevision.content[index].divisions, `Product note ${index} divisions`)
    if (teacherRevision.content[index].isGrace !== true) {
      const duration = child(xmlNote, 'duration')
      if (!duration) throw new Error(`MusicXML note ${index} has no duration element.`)
      duration.textContent = String(durationDivisions(event.duration, divisions, `Editor event ${eventId} duration`))
    }
    const type = child(xmlNote, 'type')
    if (type) type.textContent = writtenType(event.duration, eventNotation)
    else if (teacherRevision.content[index].isGrace !== true) throw new Error(`MusicXML note ${index} has no written type element.`)
    setDots(doc, xmlNote, eventNotation.dots)
    setTimeModification(doc, xmlNote, eventNotation.tuplet)
    setTupletMarks(doc, xmlNote, eventNotation.tuplet?.marks ?? [])

    if (noteId !== null) {
      const noteNotation = noteNotationOrDefault(notation.notes, noteId)
      setAccidental(doc, xmlNote, noteNotation.accidental)
      setTies(doc, xmlNote, noteNotation.ties)
      setSlurs(doc, xmlNote, noteNotation.slurs)
    }
  }

  // Reconstruct direct backup/forward movements from Editor onsets. This keeps
  // onset identity exact after a duration change instead of silently shifting
  // later events as a side effect of XML note order.
  const groups = measureGroups(teacherRevision)
  for (const [key, indexes] of groups) {
    const [partId, rawMeasureIndex] = key.split('\u0000')
    const measureIndex = Number(rawMeasureIndex)
    const part = directChildren(doc.documentElement, 'part').find((item) => item.getAttribute?.('id') === partId)
    const measure = part ? directChildren(part, 'measure')[measureIndex] : null
    if (!measure) throw new Error(`Cannot reconstruct MusicXML cursor for ${partId}/${measureIndex}.`)
    for (const movement of directChildren(measure).filter((item) => tagOf(item) === 'backup' || tagOf(item) === 'forward')) movement.remove?.()

    let cursor = 0
    let lastOnset = null
    for (const index of indexes) {
      const xmlNote = aligned.notes[index]
      const event = entity.events.get(mapping.eventIds[index])
      const divisions = positiveInteger(teacherRevision.content[index].divisions, `Product note ${index} divisions`)
      const onset = durationDivisions(event.onset, divisions, `Editor event ${event.id} onset`)
      const duration = teacherRevision.content[index].isGrace === true ? 0 : durationDivisions(event.duration, divisions, `Editor event ${event.id} duration`)
      if (teacherRevision.content[index].isChordNote === true) {
        if (lastOnset === null || onset !== lastOnset) throw new Error(`Chord continuation ${index} no longer shares its exact Editor onset.`)
        continue
      }
      const delta = onset - cursor
      if (delta !== 0) {
        const movement = movementElement(doc, measure, delta > 0 ? 'forward' : 'backup', Math.abs(delta))
        measure.insertBefore(movement, xmlNote)
      }
      cursor = onset + duration
      lastOnset = onset
    }
  }

  return new XMLSerializerCtor().serializeToString(doc)
}

export function extractPrDProductNotationByIndex(musicXml, teacherRevision, {
  DOMParserCtor = globalThis.DOMParser,
} = {}) {
  const aligned = alignMusicXmlNotesToProductRevision(musicXml, teacherRevision, { DOMParserCtor })
  return Object.freeze(aligned.notes.map((note) => Object.freeze({
    event: eventNotationForXmlNote(note),
    note: child(note, 'rest') ? null : noteNotationForXmlNote(note),
  })))
}
