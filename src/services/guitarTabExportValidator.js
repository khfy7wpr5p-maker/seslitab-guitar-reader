import { inspectMusicXml } from '../../musicXmlSecurity.js'
import {
  analyzeGuitarTabCanonicalIdentity,
  resolveGuitarTabCanonicalTarget,
} from './guitarTabCanonicalIdentity.js'
import {
  GUITAR_TAB_PITCH_POLICY,
  normalizeGuitarTabPitchPolicy,
} from './guitarTabPitchPolicy.js'

export const GUITAR_TAB_MAX_FRET = 20
export const GUITAR_TAB_STANDARD_TUNING_MIDI = Object.freeze({ 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 })

const EXPECTED_TUNING = Object.freeze([
  Object.freeze({ line: 1, step: 'E', octave: 2 }), Object.freeze({ line: 2, step: 'A', octave: 2 }),
  Object.freeze({ line: 3, step: 'D', octave: 3 }), Object.freeze({ line: 4, step: 'G', octave: 3 }),
  Object.freeze({ line: 5, step: 'B', octave: 3 }), Object.freeze({ line: 6, step: 'E', octave: 4 }),
])
const STEP_TO_SEMITONE = Object.freeze({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 })

function fail(category, code) {
  const error = new Error(`guitar-tab-export-validator-${category.toLowerCase()}-${code.toLowerCase().replaceAll('_', '-')}`)
  error.category = category
  error.code = code
  throw error
}
function normalizePitchPolicy(value) {
  try { return normalizeGuitarTabPitchPolicy(value) }
  catch { fail('PHYSICAL', 'GUITAR_PITCH_POLICY_INVALID') }
}
function localName(node) { return String(node?.localName ?? node?.tagName ?? node?.tag ?? '').replace(/^.*:/u, '') }
function elementChildren(node) { return [...(node?.children ?? [])] }
function directChildren(node, name) { return elementChildren(node).filter((child) => localName(child) === name) }
function directChild(node, name) { return directChildren(node, name)[0] ?? null }
function descendants(node, name) {
  const result = []
  const visit = (parent) => { for (const child of elementChildren(parent)) { if (localName(child) === name) result.push(child); visit(child) } }
  visit(node)
  return result
}
function textOf(node) { return typeof node?.textContent === 'string' ? node.textContent.trim() : '' }
function attributeEntries(node) {
  if (typeof node?.attributes === 'string') {
    return [...node.attributes.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/gu)]
      .map((match) => [match[1], match[2]])
  }
  try {
    return [...(node?.attributes ?? [])].map((attribute) => [attribute.name, attribute.value])
  } catch {
    return []
  }
}
function canonicalAttributeKey(node) {
  return attributeEntries(node)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}=${value}`)
    .join(',')
}
function canonicalNode(node, { defaultStaffNumber = false } = {}) {
  const tag = localName(node)
  const attributes = new Map(attributeEntries(node))
  if (defaultStaffNumber && !attributes.has('number')) attributes.set('number', '1')
  const attributeKey = [...attributes.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}=${value}`)
    .join(',')
  const children = elementChildren(node)
  const contents = children.length > 0
    ? children.map((child) => canonicalNode(child)).join('')
    : textOf(node)
  return `<${tag}[${attributeKey}]>${contents}</${tag}>`
}
function rootMetadataKey(root) {
  const rootAttributes = canonicalAttributeKey(root)
  const children = elementChildren(root)
    .filter((child) => localName(child) !== 'part')
    .map((child) => canonicalNode(child))
    .join('')
  return `${rootAttributes}|${children}`
}
function measureContextKeys(part, { appendedTabStaff = null, ignoreStaves = false } = {}) {
  return directChildren(part, 'measure').map((measure) => {
    const keys = [`measure:[${canonicalAttributeKey(measure)}]`]
    let cursor = 0
    let sourceNoteOrdinal = 0
    let contextOrdinal = 0

    const pushContext = (key) => {
      keys.push(`${sourceNoteOrdinal}@${cursor}@${contextOrdinal}:${key}`)
      contextOrdinal += 1
    }

    for (const child of elementChildren(measure)) {
      const tag = localName(child)
      if (tag === 'note') {
        const staffNode = directChild(child, 'staff')
        const staff = staffNode ? textOf(staffNode) : '1'
        const isAppendedTabNote = appendedTabStaff !== null && staff === String(appendedTabStaff)
        if (!isAppendedTabNote) {
          sourceNoteOrdinal += 1
          if (directChildren(child, 'chord').length === 0) {
            const durationNode = directChild(child, 'duration')
            const duration = durationNode ? Number(textOf(durationNode)) : NaN
            if (Number.isSafeInteger(duration)) cursor += duration
          }
        }
        continue
      }
      if (tag === 'backup' || tag === 'forward') {
        const durationNode = directChild(child, 'duration')
        const duration = durationNode ? Number(textOf(durationNode)) : NaN
        if (Number.isSafeInteger(duration)) cursor += tag === 'backup' ? -duration : duration
        continue
      }
      if (tag !== 'attributes') {
        pushContext(canonicalNode(child))
        continue
      }
      for (const attributeChild of elementChildren(child)) {
        const attributeTag = localName(attributeChild)
        if (attributeTag === 'staves' && ignoreStaves) continue
        if (appendedTabStaff !== null) {
          const number = attributeChild.getAttribute?.('number')
          if (number === String(appendedTabStaff) && (attributeTag === 'clef' || attributeTag === 'staff-details')) continue
        }
        pushContext(`attributes:${canonicalNode(attributeChild, {
          defaultStaffNumber: ['clef', 'staff-details'].includes(attributeTag),
        })}`)
      }
    }
    return keys
  })
}
function assertContextParity(expectedPart, actualPart, appendedTabStaff) {
  const ignoreStaves = appendedTabStaff !== null
  const expected = measureContextKeys(expectedPart, { ignoreStaves })
  const actual = measureContextKeys(actualPart, { appendedTabStaff, ignoreStaves })
  if (expected.length !== actual.length) fail('SEMANTIC', 'SOURCE_SCORE_SEMANTIC_MISMATCH')
  for (let measureIndex = 0; measureIndex < expected.length; measureIndex += 1) {
    if (expected[measureIndex].length !== actual[measureIndex].length) fail('SEMANTIC', 'SOURCE_SCORE_SEMANTIC_MISMATCH')
    for (let entryIndex = 0; entryIndex < expected[measureIndex].length; entryIndex += 1) {
      if (expected[measureIndex][entryIndex] !== actual[measureIndex][entryIndex]) {
        fail('SEMANTIC', 'SOURCE_SCORE_SEMANTIC_MISMATCH')
      }
    }
  }
}
function sourceRegionControls(part, { appendedTabStaff = null } = {}) {
  return directChildren(part, 'measure').map((measure) => {
    const children = elementChildren(measure)
    let sourceRegionEnd = children.length
    if (appendedTabStaff !== null) {
      const firstTabNoteIndex = children.findIndex((child) => {
        if (localName(child) !== 'note') return false
        const staffNode = directChild(child, 'staff')
        const staff = staffNode ? textOf(staffNode) : '1'
        return staff === String(appendedTabStaff)
      })
      if (firstTabNoteIndex >= 0) {
        sourceRegionEnd = firstTabNoteIndex
        for (let index = firstTabNoteIndex; index < children.length; index += 1) {
          const child = children[index]
          if (localName(child) !== 'note') continue
          const staffNode = directChild(child, 'staff')
          const staff = staffNode ? textOf(staffNode) : '1'
          if (staff !== String(appendedTabStaff)) fail('SEMANTIC', 'SOURCE_SCORE_SEMANTIC_MISMATCH')
        }
      }
    }

    const controls = []
    let cursor = 0
    let sourceNoteOrdinal = 0
    for (const child of children.slice(0, sourceRegionEnd)) {
      const tag = localName(child)
      if (tag === 'note') {
        sourceNoteOrdinal += 1
        if (directChildren(child, 'chord').length === 0) {
          const durationNode = directChild(child, 'duration')
          const duration = durationNode ? Number(textOf(durationNode)) : NaN
          if (Number.isSafeInteger(duration)) cursor += duration
        }
        continue
      }
      if (tag !== 'backup' && tag !== 'forward') continue
      const durationNode = directChild(child, 'duration')
      const duration = durationNode ? Number(textOf(durationNode)) : NaN
      controls.push(Object.freeze({
        key: `${sourceNoteOrdinal}@${cursor}:${canonicalNode(child)}`,
        tag,
        duration,
        cursorBefore: cursor,
      }))
      if (Number.isSafeInteger(duration)) cursor += tag === 'backup' ? -duration : duration
    }
    return controls
  })
}

function generatedTabControlsAreBounded(controls) {
  if (controls.length < 1 || controls.length > 2) return false
  const [rewind, leadingRestAdvance] = controls
  if (
    rewind.tag !== 'backup' ||
    !Number.isSafeInteger(rewind.duration) ||
    rewind.duration <= 0 ||
    rewind.cursorBefore !== rewind.duration
  ) return false
  if (leadingRestAdvance === undefined) return true
  return (
    leadingRestAdvance.tag === 'forward' &&
    Number.isSafeInteger(leadingRestAdvance.duration) &&
    leadingRestAdvance.duration > 0 &&
    leadingRestAdvance.cursorBefore === 0 &&
    leadingRestAdvance.duration < rewind.duration
  )
}

function assertControlParity(expectedPart, actualPart, appendedTabStaff) {
  const expected = sourceRegionControls(expectedPart)
  const actual = sourceRegionControls(actualPart, { appendedTabStaff })
  if (expected.length !== actual.length) fail('SEMANTIC', 'SOURCE_SCORE_SEMANTIC_MISMATCH')
  for (let measureIndex = 0; measureIndex < expected.length; measureIndex += 1) {
    const expectedControls = expected[measureIndex]
    const actualControls = actual[measureIndex]
    if (actualControls.length < expectedControls.length) fail('SEMANTIC', 'SOURCE_SCORE_SEMANTIC_MISMATCH')
    for (let index = 0; index < expectedControls.length; index += 1) {
      if (expectedControls[index].key !== actualControls[index].key) fail('SEMANTIC', 'SOURCE_SCORE_SEMANTIC_MISMATCH')
    }
    const generatedControls = actualControls.slice(expectedControls.length)
    if (
      generatedControls.length > 0 &&
      (appendedTabStaff === null || !generatedTabControlsAreBounded(generatedControls))
    ) {
      fail('SEMANTIC', 'SOURCE_SCORE_SEMANTIC_MISMATCH')
    }
  }
}
function assertStavesParity(expectedPart, actualPart, appendedTabStaff) {
  const expectedMeasures = directChildren(expectedPart, 'measure')
  const actualMeasures = directChildren(actualPart, 'measure')
  if (expectedMeasures.length !== actualMeasures.length) fail('SEMANTIC', 'SOURCE_SCORE_SEMANTIC_MISMATCH')
  for (let measureIndex = 0; measureIndex < expectedMeasures.length; measureIndex += 1) {
    const expected = directChildren(expectedMeasures[measureIndex], 'attributes')
      .flatMap((attributes) => directChildren(attributes, 'staves'))
    const actual = directChildren(actualMeasures[measureIndex], 'attributes')
      .flatMap((attributes) => directChildren(attributes, 'staves'))
    const expectedCount = measureIndex === 0 && expected.length === 0 ? 1 : expected.length
    if (actual.length !== expectedCount) fail('SEMANTIC', 'SOURCE_SCORE_SEMANTIC_MISMATCH')
    for (const staves of actual) {
      if (integerNode(staves, 'SEMANTIC', 'STAVES_INVALID', { min: 1, allowZero: false }) !== appendedTabStaff) {
        fail('SEMANTIC', 'SOURCE_SCORE_SEMANTIC_MISMATCH')
      }
    }
  }
}
function maxDeclaredSourceStaff(part) {
  let maximum = 1
  for (const measure of directChildren(part, 'measure')) {
    for (const attributes of directChildren(measure, 'attributes')) {
      for (const staves of directChildren(attributes, 'staves')) {
        maximum = Math.max(maximum, integerNode(staves, 'SEMANTIC', 'STAVES_INVALID', { min: 1, allowZero: false }))
      }
    }
    for (const note of directChildren(measure, 'note')) {
      const staff = directChild(note, 'staff')
      if (staff) maximum = Math.max(maximum, integerNode(staff, 'IDENTITY', 'STAFF_IDENTITY_INVALID', { min: 1, allowZero: false }))
    }
  }
  return maximum
}
function integerNode(node, category, code, { min = null, max = null, allowZero = true } = {}) {
  const value = textOf(node)
  const pattern = allowZero ? /^(0|[1-9][0-9]*)$/u : /^[1-9][0-9]*$/u
  if (!pattern.test(value)) fail(category, code)
  const number = Number(value)
  if (!Number.isSafeInteger(number)) fail(category, code)
  if (min !== null && number < min) fail(category, code)
  if (max !== null && number > max) fail(category, code)
  return number
}
function signedIntegerNode(node, category, code) {
  const value = textOf(node)
  if (!/^-?(0|[1-9][0-9]*)$/u.test(value)) fail(category, code)
  const number = Number(value)
  if (!Number.isSafeInteger(number)) fail(category, code)
  return number
}
function parseSafeRoot(xml, label, DOMParserCtor) {
  if (typeof xml !== 'string' || xml.trim() === '') fail('SECURITY', `${label}_EMPTY`)
  const inspection = inspectMusicXml(xml)
  if (!inspection.ok) fail('SECURITY', `${label}_INVALID_${String(inspection.code ?? 'STRUCTURE').toUpperCase().replaceAll('-', '_')}`)
  if (typeof DOMParserCtor !== 'function') fail('RUNTIME', 'DOM_PARSER_UNAVAILABLE')
  let documentNode
  try { documentNode = new DOMParserCtor().parseFromString(inspection.xmlForParsing, 'application/xml') } catch { fail('SECURITY', `${label}_PARSE_FAILED`) }
  if (!documentNode || descendants(documentNode, 'parsererror').length > 0) fail('SECURITY', `${label}_PARSE_FAILED`)
  const root = documentNode.documentElement
  if (localName(root) !== 'score-partwise') fail('SEMANTIC', `${label}_SCORE_PARTWISE_REQUIRED`)
  return root
}
function parsePitch(note) {
  if (directChildren(note, 'unpitched').length > 0) fail('SEMANTIC', 'UNPITCHED_UNSUPPORTED')
  const pitchNodes = directChildren(note, 'pitch')
  if (pitchNodes.length === 0) return null
  if (pitchNodes.length !== 1) fail('SEMANTIC', 'PITCH_AMBIGUOUS')
  const pitch = pitchNodes[0]
  const stepNodes = directChildren(pitch, 'step'), octaveNodes = directChildren(pitch, 'octave'), alterNodes = directChildren(pitch, 'alter')
  if (stepNodes.length !== 1 || octaveNodes.length !== 1 || alterNodes.length > 1) fail('SEMANTIC', 'PITCH_AMBIGUOUS')
  const step = textOf(stepNodes[0]), octave = signedIntegerNode(octaveNodes[0], 'SEMANTIC', 'PITCH_INVALID')
  const alter = alterNodes.length === 1 ? signedIntegerNode(alterNodes[0], 'SEMANTIC', 'PITCH_INVALID') : 0
  if (!Object.hasOwn(STEP_TO_SEMITONE, step)) fail('SEMANTIC', 'PITCH_INVALID')
  const midi = ((octave + 1) * 12) + STEP_TO_SEMITONE[step] + alter
  if (!Number.isSafeInteger(midi) || midi < 0 || midi > 127) fail('SEMANTIC', 'PITCH_INVALID')
  return Object.freeze({ step, alter, octave, midi })
}
function parseTieFlags(note) {
  let tieStart = false, tieStop = false
  for (const tie of directChildren(note, 'tie')) { const type = tie.getAttribute?.('type'); if (type === 'start') tieStart = true; else if (type === 'stop') tieStop = true; else fail('SEMANTIC', 'TIE_INVALID') }
  for (const tied of descendants(note, 'tied')) { const type = tied.getAttribute?.('type'); if (type === 'start') tieStart = true; else if (type === 'stop') tieStop = true; else fail('SEMANTIC', 'TIE_INVALID') }
  return Object.freeze({ tieStart, tieStop })
}
function noteStructureKey(note) {
  const voices = directChildren(note, 'voice')
  const staves = directChildren(note, 'staff')
  const voice = voices.length === 0 ? '1' : textOf(voices[0])
  const staff = staves.length === 0 ? '1' : textOf(staves[0])
  const attributes = attributeEntries(note)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}=${value}`)
    .join(',')
  const contents = elementChildren(note)
    .filter((child) => !['voice', 'staff'].includes(localName(child)))
    .map((child) => canonicalNode(child))
    .join('')
  return `<note[${attributes}] voice=${voice} staff=${staff}>${contents}</note>`
}
function parseTechnical(note) {
  const technicals = descendants(note, 'technical')
    .filter((technical) => directChildren(technical, 'string').length > 0 || directChildren(technical, 'fret').length > 0)
  if (technicals.length === 0) return null
  if (technicals.length !== 1) fail('PHYSICAL', 'TECHNICAL_EVIDENCE_AMBIGUOUS')
  const strings = directChildren(technicals[0], 'string'), frets = directChildren(technicals[0], 'fret')
  if (strings.length !== 1 || frets.length !== 1) {
    if (strings.length > 1 || frets.length > 1) fail('PHYSICAL', 'TECHNICAL_EVIDENCE_AMBIGUOUS')
    fail('PHYSICAL', 'TECHNICAL_STRING_FRET_REQUIRED')
  }
  return Object.freeze({
    string: integerNode(strings[0], 'PHYSICAL', 'TECHNICAL_STRING_INVALID', { min: 1, max: 6, allowZero: false }),
    fret: integerNode(frets[0], 'PHYSICAL', 'TECHNICAL_FRET_INVALID', { min: 0, max: GUITAR_TAB_MAX_FRET }),
  })
}
function parseTranspose(transpose) {
  if (directChildren(transpose, 'double').length > 0) fail('SEMANTIC', 'TRANSPOSE_DOUBLE_UNSUPPORTED')
  const chromatics = directChildren(transpose, 'chromatic'), octaves = directChildren(transpose, 'octave-change')
  if (chromatics.length !== 1 || octaves.length > 1) fail('SEMANTIC', 'TRANSPOSE_AMBIGUOUS')
  const chromatic = signedIntegerNode(chromatics[0], 'SEMANTIC', 'TRANSPOSE_INVALID')
  const octave = octaves.length === 1 ? signedIntegerNode(octaves[0], 'SEMANTIC', 'TRANSPOSE_INVALID') : 0
  const semitones = chromatic + (12 * octave)
  if (!Number.isSafeInteger(semitones)) fail('SEMANTIC', 'TRANSPOSE_INVALID')
  return semitones
}
function updateTransposeState(attributes, state) {
  if (!attributes) return
  const seen = new Set()
  for (const transpose of directChildren(attributes, 'transpose')) {
    const rawNumber = transpose.getAttribute?.('number'), key = rawNumber === null ? 'default' : `staff:${rawNumber}`
    if (seen.has(key)) fail('SEMANTIC', 'TRANSPOSE_AMBIGUOUS')
    seen.add(key)
    const value = parseTranspose(transpose)
    if (rawNumber === null) state.default = value
    else {
      if (!/^[1-9][0-9]*$/u.test(rawNumber)) fail('SEMANTIC', 'TRANSPOSE_NUMBER_INVALID')
      const staff = Number(rawNumber)
      if (!Number.isSafeInteger(staff)) fail('SEMANTIC', 'TRANSPOSE_NUMBER_INVALID')
      state.byStaff.set(staff, value)
    }
  }
}
function noteIdentity(note) {
  const voices = directChildren(note, 'voice'), staves = directChildren(note, 'staff')
  if (voices.length > 1 || staves.length > 1) fail('IDENTITY', 'NOTE_IDENTITY_AMBIGUOUS')
  const voice = voices.length === 0 ? 1 : integerNode(voices[0], 'IDENTITY', 'VOICE_IDENTITY_INVALID', { min: 0 })
  const staff = staves.length === 0 ? 1 : integerNode(staves[0], 'IDENTITY', 'STAFF_IDENTITY_INVALID', { min: 1, allowZero: false })
  return { voice, staff }
}
function parsePartTimeline(
  part,
  {
    targetSelection = null,
    includeRests = false,
    parseTechnicalEvidence = false,
    technicalStaff = null,
  } = {},
) {
  const measures = directChildren(part, 'measure')
  if (measures.length === 0) fail('SEMANTIC', 'MEASURE_REQUIRED')
  const events = []
  let currentDivisions = null
  const transposeState = { default: 0, byStaff: new Map() }
  measures.forEach((measure, measureIndex) => {
    const attributesNodes = directChildren(measure, 'attributes'), firstAttributes = attributesNodes[0] ?? null
    const divisionsNodes = firstAttributes ? directChildren(firstAttributes, 'divisions') : []
    if (divisionsNodes.length > 1) fail('SEMANTIC', 'DIVISIONS_AMBIGUOUS')
    if (divisionsNodes.length === 1) currentDivisions = integerNode(divisionsNodes[0], 'SEMANTIC', 'DIVISIONS_INVALID', { min: 1, allowZero: false })
    if (!Number.isInteger(currentDivisions) || currentDivisions <= 0) fail('SEMANTIC', 'DIVISIONS_REQUIRED')
    for (const attributes of attributesNodes) updateTransposeState(attributes, transposeState)
    let cursor = 0, lastNonChordOnset = null
    for (const child of elementChildren(measure)) {
      const tag = localName(child)
      if (tag === 'backup' || tag === 'forward') {
        const durationNodes = directChildren(child, 'duration')
        if (durationNodes.length !== 1) fail('SEMANTIC', `${tag.toUpperCase()}_DURATION_INVALID`)
        const duration = integerNode(durationNodes[0], 'SEMANTIC', `${tag.toUpperCase()}_DURATION_INVALID`, { min: 0 })
        cursor += tag === 'backup' ? -duration : duration
        if (cursor < 0) fail('SEMANTIC', 'NEGATIVE_CURSOR')
        continue
      }
      if (tag !== 'note') continue
      const { voice, staff } = noteIdentity(child)
      const selected = targetSelection === null || (
        staff === targetSelection.staff
        && (targetSelection.scope === 'staff' || voice === targetSelection.voice)
      )
      if (directChildren(child, 'grace').length > 0) { if (selected) fail('SEMANTIC', 'GRACE_UNSUPPORTED'); continue }
      const durationNodes = directChildren(child, 'duration')
      if (durationNodes.length !== 1) fail('SEMANTIC', 'NOTE_DURATION_INVALID')
      const duration = integerNode(durationNodes[0], 'SEMANTIC', 'NOTE_DURATION_INVALID', { min: 1, allowZero: false })
      const isChord = directChildren(child, 'chord').length > 0
      if (isChord && lastNonChordOnset === null) fail('SEMANTIC', 'CHORD_WITHOUT_BASE')
      const onset = isChord ? lastNonChordOnset : cursor
      if (selected) {
        const pitch = parsePitch(child), isRest = directChildren(child, 'rest').length > 0
        if (!pitch && !isRest) fail('SEMANTIC', 'NOTE_PITCH_OR_REST_REQUIRED')
        if (pitch && !isRest) {
          const semitones = transposeState.byStaff.get(staff) ?? transposeState.default
          const soundingPitchMidi = pitch.midi + semitones
          if (!Number.isSafeInteger(soundingPitchMidi) || soundingPitchMidi < 0 || soundingPitchMidi > 127) fail('SEMANTIC', 'SOUNDING_PITCH_INVALID')
          const ties = parseTieFlags(child)
          const technical = parseTechnicalEvidence && (technicalStaff === null || technicalStaff === staff)
            ? parseTechnical(child)
            : null
          events.push(Object.freeze({ measureIndex, onset, duration, divisions: currentDivisions, voice, staff, pitch, soundingPitchMidi, tieStart: ties.tieStart, tieStop: ties.tieStop, technical, isRest: false, noteStructure: noteStructureKey(child) }))
        } else if (isRest && includeRests) {
          events.push(Object.freeze({ measureIndex, onset, duration, divisions: currentDivisions, voice, staff, pitch: null, soundingPitchMidi: null, tieStart: false, tieStop: false, technical: null, isRest: true, noteStructure: noteStructureKey(child) }))
        }
      }
      if (!isChord) { lastNonChordOnset = onset; cursor += duration }
    }
  })
  return Object.freeze(events)
}
function gcd(a, b) { let x = Math.abs(a), y = Math.abs(b); while (y !== 0) [x, y] = [y, x % y]; return x || 1 }
function fractionKey(value, divisions) { const divisor = gcd(value, divisions); return `${value / divisor}/${divisions / divisor}` }
function semanticKey(event, { includeStructure = false } = {}) {
  const pitch = event.pitch
    ? `${event.pitch.step}|${event.pitch.alter}|${event.pitch.octave}`
    : 'REST'
  const fields = [event.measureIndex, fractionKey(event.onset, event.divisions), fractionKey(event.duration, event.divisions), event.voice, pitch, event.tieStart ? 1 : 0, event.tieStop ? 1 : 0]
  if (includeStructure) fields.push(event.noteStructure ?? '')
  return fields.join('|')
}
function assertSemanticParity(expected, actual, code, { includeStaff = false, includeStructure = false } = {}) {
  if (expected.length !== actual.length) fail('SEMANTIC', code)
  const keyFor = includeStaff
    ? (event) => `${event.staff}|${semanticKey(event, { includeStructure })}`
    : (event) => semanticKey(event, { includeStructure })
  const expectedKeys = expected.map(keyFor).sort(), actualKeys = actual.map(keyFor).sort()
  for (let index = 0; index < expectedKeys.length; index += 1) if (expectedKeys[index] !== actualKeys[index]) fail('SEMANTIC', code)
}
function voiceSort(left, right) {
  const leftNumber = Number(left), rightNumber = Number(right)
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber
  return String(left).localeCompare(String(right))
}
function createTabVoiceMap(events) {
  const sourceVoices = [...new Set(events.map((event) => event.voice))].sort(voiceSort)
  const occupiedVoices = new Set(sourceVoices
    .map((voice) => Number.parseInt(String(voice), 10))
    .filter((voice) => Number.isSafeInteger(voice) && voice >= 0))
  const tabVoiceBySource = new Map()
  let nextVoice = 5
  for (const sourceVoice of sourceVoices) {
    while (occupiedVoices.has(nextVoice)) nextVoice += 1
    if (!Number.isSafeInteger(nextVoice)) fail('TAB_SHAPE', 'TAB_VOICE_STAFF_RANGE_INVALID')
    tabVoiceBySource.set(sourceVoice, String(nextVoice))
    occupiedVoices.add(nextVoice)
    nextVoice += 1
  }
  return tabVoiceBySource
}
function assertTabVoiceParity(notationEvents, tabEvents) {
  const notationVoices = new Set(notationEvents.map((event) => event.voice))
  const tabVoices = new Set(tabEvents.map((event) => event.voice))
  if ([...tabVoices].some((voice) => notationVoices.has(voice))) fail('TAB_SHAPE', 'TAB_VOICE_NAMESPACE_COLLISION')
  if ([...tabVoices].some((voice) => !Number.isSafeInteger(Number(voice)) || Number(voice) < 5)) fail('TAB_SHAPE', 'TAB_VOICE_STAFF_RANGE_INVALID')
  const tabVoiceBySource = createTabVoiceMap(notationEvents)
  const expectedKeys = notationEvents
    .map((event) => semanticKey({ ...event, voice: tabVoiceBySource.get(event.voice) }))
    .sort()
  const actualKeys = tabEvents.map(semanticKey).sort()
  if (expectedKeys.length !== actualKeys.length) fail('SEMANTIC', 'TAB_STAFF_SEMANTIC_MISMATCH')
  for (let index = 0; index < expectedKeys.length; index += 1) if (expectedKeys[index] !== actualKeys[index]) fail('SEMANTIC', 'TAB_STAFF_SEMANTIC_MISMATCH')
  return tabVoiceBySource
}
function assertTabShape(root, targetPartIndex) {
  const parts = directChildren(root, 'part')
  const part = parts[targetPartIndex]
  if (!part) fail('IDENTITY', 'TARGET_PART_MISMATCH')
  const firstMeasure = directChildren(part, 'measure')[0], attributes = firstMeasure ? directChildren(firstMeasure, 'attributes')[0] : null
  if (!attributes) fail('TAB_SHAPE', 'TAB_ATTRIBUTES_REQUIRED')
  const stavesNodes = directChildren(attributes, 'staves')
  if (stavesNodes.length !== 1) fail('TAB_SHAPE', 'TAB_STAVES_INVALID')
  const tabStaff = integerNode(stavesNodes[0], 'TAB_SHAPE', 'TAB_STAVES_INVALID', { min: 2, allowZero: false })
  const tabClefs = directChildren(attributes, 'clef').filter((clef) => clef.getAttribute?.('number') === String(tabStaff))
  if (tabClefs.length !== 1 || textOf(directChild(tabClefs[0], 'sign')) !== 'TAB' || textOf(directChild(tabClefs[0], 'line')) !== '5') fail('TAB_SHAPE', 'TAB_CLEF_REQUIRED')
  const detailNodes = directChildren(attributes, 'staff-details').filter((entry) => entry.getAttribute?.('number') === String(tabStaff))
  if (detailNodes.length !== 1) fail('TAB_SHAPE', 'TAB_STAFF_DETAILS_REQUIRED')
  const lines = directChildren(detailNodes[0], 'staff-lines')
  if (lines.length !== 1 || integerNode(lines[0], 'TAB_SHAPE', 'TAB_STAFF_LINES_INVALID', { min: 6, max: 6, allowZero: false }) !== 6) fail('TAB_SHAPE', 'TAB_SIX_LINE_SHAPE_REQUIRED')
  const tunings = directChildren(detailNodes[0], 'staff-tuning')
  if (tunings.length !== EXPECTED_TUNING.length) fail('TAB_SHAPE', 'TAB_STANDARD_TUNING_REQUIRED')
  const seenLines = new Set()
  for (const expected of EXPECTED_TUNING) {
    const matching = tunings.filter((entry) => entry.getAttribute?.('line') === String(expected.line))
    if (matching.length !== 1 || seenLines.has(expected.line)) fail('TAB_SHAPE', 'TAB_STANDARD_TUNING_REQUIRED')
    seenLines.add(expected.line)
    const actual = matching[0]
    if (textOf(directChild(actual, 'tuning-step')) !== expected.step || textOf(directChild(actual, 'tuning-octave')) !== String(expected.octave)) fail('TAB_SHAPE', 'TAB_STANDARD_TUNING_REQUIRED')
  }
  return { part, tabStaff }
}
function positionMidi(technical) {
  const openMidi = GUITAR_TAB_STANDARD_TUNING_MIDI[technical?.string]
  if (!Number.isInteger(openMidi) || !Number.isSafeInteger(technical?.fret)) fail('PHYSICAL', 'TECHNICAL_POSITION_PITCH_MISMATCH')
  return openMidi + technical.fret
}
function expectedGuitarPhysicalMidi(sourceEvent, guitarPitchPolicy) {
  if (sourceEvent.technical) return positionMidi(sourceEvent.technical)
  if (guitarPitchPolicy === GUITAR_TAB_PITCH_POLICY.SOURCE_SOUNDING) return sourceEvent.soundingPitchMidi
  const physicalMidi = sourceEvent.pitch.midi - 12
  if (!Number.isSafeInteger(physicalMidi) || physicalMidi < 0 || physicalMidi > 127) fail('PHYSICAL', 'GUITAR_PHYSICAL_PITCH_INVALID')
  return physicalMidi
}
function physicalAuthorityBySemanticKey(sourceEvents, guitarPitchPolicy, tabVoiceBySource) {
  const buckets = new Map()
  for (const event of sourceEvents) {
    const tabVoice = tabVoiceBySource.get(event.voice)
    if (tabVoice === undefined) fail('SEMANTIC', 'TAB_STAFF_SEMANTIC_MISMATCH')
    const key = semanticKey({ ...event, voice: tabVoice }), values = buckets.get(key) ?? []
    values.push(expectedGuitarPhysicalMidi(event, guitarPitchPolicy)); buckets.set(key, values)
  }
  const authority = new Map()
  for (const [key, values] of buckets) { const unique = new Set(values); if (unique.size !== 1) fail('PHYSICAL', 'SOURCE_PHYSICAL_AUTHORITY_AMBIGUOUS'); authority.set(key, values[0]) }
  return authority
}
function assertPhysicalTab(sourceEvents, staff2Events, guitarPitchPolicy, tabVoiceBySource) {
  if (staff2Events.length === 0) fail('PHYSICAL', 'TAB_STAFF2_PITCHED_NOTE_REQUIRED')
  const sourceAuthority = physicalAuthorityBySemanticKey(sourceEvents, guitarPitchPolicy, tabVoiceBySource), groups = new Map()
  for (const event of staff2Events) {
    if (!event.technical) fail('PHYSICAL', 'TECHNICAL_STRING_FRET_REQUIRED')
    const expectedMidi = sourceAuthority.get(semanticKey(event))
    if (!Number.isSafeInteger(expectedMidi) || positionMidi(event.technical) !== expectedMidi) fail('PHYSICAL', 'TECHNICAL_POSITION_PITCH_MISMATCH')
    const key = `${event.measureIndex}|${fractionKey(event.onset, event.divisions)}`, group = groups.get(key) ?? []
    group.push(event); groups.set(key, group)
  }
  for (const group of groups.values()) {
    if (group.length > 6) fail('PHYSICAL', 'SIMULTANEOUS_NOTE_LIMIT_EXCEEDED')
    const strings = group.map((event) => event.technical.string)
    if (new Set(strings).size !== strings.length) fail('PHYSICAL', 'SIMULTANEOUS_STRING_COLLISION')
  }
}
function validateInternal({ scoreMusicXml, guitarTabMusicXml, targetSelection, guitarPitchPolicy, DOMParserCtor }) {
  const normalizedGuitarPitchPolicy = normalizePitchPolicy(guitarPitchPolicy)
  const scoreRoot = parseSafeRoot(scoreMusicXml, 'SCORE', DOMParserCtor), tabRoot = parseSafeRoot(guitarTabMusicXml, 'TAB', DOMParserCtor)
  const scoreAnalysis = analyzeGuitarTabCanonicalIdentity(scoreRoot)
  let scorePart, selectedTarget = null
  if (targetSelection === null || targetSelection === undefined) {
    if (scoreAnalysis.parts.length !== 1) fail('IDENTITY', 'TARGET_SELECTION_REQUIRED')
    scorePart = directChildren(scoreRoot, 'part')[0]
  } else {
    const target = resolveGuitarTabCanonicalTarget(scoreAnalysis, targetSelection)
    selectedTarget = target.targetSelection
    scorePart = directChildren(scoreRoot, 'part')[target.part.partIndex]
  }
  if (rootMetadataKey(scoreRoot) !== rootMetadataKey(tabRoot)) fail('SEMANTIC', 'SOURCE_SCORE_SEMANTIC_MISMATCH')
  const scoreParts = directChildren(scoreRoot, 'part'), tabParts = directChildren(tabRoot, 'part')
  if (scoreParts.length !== tabParts.length) fail('SEMANTIC', 'SOURCE_SCORE_SEMANTIC_MISMATCH')
  for (let index = 0; index < scoreParts.length; index += 1) {
    if (scoreParts[index].getAttribute?.('id') !== tabParts[index].getAttribute?.('id')) {
      fail('IDENTITY', 'TARGET_PART_MISMATCH')
    }
  }
  const targetPartIndex = selectedTarget?.partIndex ?? 0
  const staffTarget = selectedTarget === null ? null : { ...selectedTarget, scope: 'staff' }
  const { part: tabPart, tabStaff } = assertTabShape(tabRoot, targetPartIndex)
  if (tabStaff !== maxDeclaredSourceStaff(scorePart) + 1) fail('TAB_SHAPE', 'TAB_STAVES_INVALID')
  assertStavesParity(scorePart, tabPart, tabStaff)
  for (let index = 0; index < scoreParts.length; index += 1) {
    const appendedTabStaff = index === targetPartIndex ? tabStaff : null
    assertContextParity(scoreParts[index], tabParts[index], appendedTabStaff)
    assertControlParity(scoreParts[index], tabParts[index], appendedTabStaff)
    const expected = parsePartTimeline(scoreParts[index], { includeRests: true })
    const actual = parsePartTimeline(tabParts[index], { includeRests: true })
      .filter((event) => index !== targetPartIndex || event.staff !== tabStaff)
    assertSemanticParity(expected, actual, 'SOURCE_SCORE_SEMANTIC_MISMATCH', { includeStaff: true, includeStructure: true })
  }
  const physicalSourceStaff = selectedTarget?.staff ?? 1
  const scoreEvents = parsePartTimeline(scorePart, {
    targetSelection: staffTarget,
    parseTechnicalEvidence: true,
    technicalStaff: physicalSourceStaff,
  })
  if (scoreEvents.length === 0) fail('IDENTITY', 'TARGET_EMPTY')
  const tabEvents = parsePartTimeline(tabPart, {
    parseTechnicalEvidence: true,
    technicalStaff: tabStaff,
  })
  const notationEvents = tabEvents.filter((event) => event.staff === physicalSourceStaff)
  const tabStaffEvents = tabEvents.filter((event) => event.staff === tabStaff)
  assertSemanticParity(scoreEvents, notationEvents, 'SCORE_TAB_STAFF1_SEMANTIC_MISMATCH', { includeStructure: true })
  const tabVoiceBySource = assertTabVoiceParity(notationEvents, tabStaffEvents)
  assertPhysicalTab(scoreEvents, tabStaffEvents, normalizedGuitarPitchPolicy, tabVoiceBySource)
  return Object.freeze({ ok: true, category: null, code: null, facts: Object.freeze({ scoreEventCount: scoreEvents.length, notationEventCount: notationEvents.length, tabEventCount: tabStaffEvents.length, targetSelection: selectedTarget, guitarPitchPolicy: normalizedGuitarPitchPolicy }) })
}
export function validateGuitarTabExport({ scoreMusicXml, guitarTabMusicXml, targetSelection = null, guitarPitchPolicy = GUITAR_TAB_PITCH_POLICY.SOURCE_SOUNDING, DOMParserCtor = globalThis.DOMParser } = {}) {
  try { return validateInternal({ scoreMusicXml, guitarTabMusicXml, targetSelection, guitarPitchPolicy, DOMParserCtor }) }
  catch (error) { const category = typeof error?.category === 'string' ? error.category : 'RUNTIME'; const code = typeof error?.code === 'string' ? error.code : 'VALIDATION_EXCEPTION'; return Object.freeze({ ok: false, category, code }) }
}
