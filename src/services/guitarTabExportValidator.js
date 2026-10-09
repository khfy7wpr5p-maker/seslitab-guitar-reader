import { inspectMusicXml } from '../../musicXmlSecurity.js'
import {
  analyzeGuitarTabCanonicalIdentity,
  resolveGuitarTabCanonicalTarget,
} from './guitarTabCanonicalIdentity.js'

export const GUITAR_TAB_MAX_FRET = 20
export const GUITAR_TAB_STANDARD_TUNING_MIDI = Object.freeze({
  1: 64,
  2: 59,
  3: 55,
  4: 50,
  5: 45,
  6: 40,
})

const EXPECTED_TUNING = Object.freeze([
  Object.freeze({ line: 1, step: 'E', octave: 2 }),
  Object.freeze({ line: 2, step: 'A', octave: 2 }),
  Object.freeze({ line: 3, step: 'D', octave: 3 }),
  Object.freeze({ line: 4, step: 'G', octave: 3 }),
  Object.freeze({ line: 5, step: 'B', octave: 3 }),
  Object.freeze({ line: 6, step: 'E', octave: 4 }),
])

const STEP_TO_SEMITONE = Object.freeze({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 })

function fail(category, code) {
  const error = new Error(`guitar-tab-export-validator-${category.toLowerCase()}-${code.toLowerCase().replaceAll('_', '-')}`)
  error.category = category
  error.code = code
  throw error
}

function localName(node) {
  return String(node?.localName ?? node?.tagName ?? node?.tag ?? '').replace(/^.*:/u, '')
}

function elementChildren(node) {
  return [...(node?.children ?? [])]
}

function directChildren(node, name) {
  return elementChildren(node).filter((child) => localName(child) === name)
}

function directChild(node, name) {
  return directChildren(node, name)[0] ?? null
}

function descendants(node, name) {
  const result = []
  const visit = (parent) => {
    for (const child of elementChildren(parent)) {
      if (localName(child) === name) result.push(child)
      visit(child)
    }
  }
  visit(node)
  return result
}

function textOf(node) {
  return typeof node?.textContent === 'string' ? node.textContent.trim() : ''
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
  try {
    documentNode = new DOMParserCtor().parseFromString(inspection.xmlForParsing, 'application/xml')
  } catch {
    fail('SECURITY', `${label}_PARSE_FAILED`)
  }
  if (!documentNode || descendants(documentNode, 'parsererror').length > 0) fail('SECURITY', `${label}_PARSE_FAILED`)
  const root = documentNode.documentElement
  if (localName(root) !== 'score-partwise') fail('SEMANTIC', `${label}_SCORE_PARTWISE_REQUIRED`)
  return root
}

function parsePitch(note) {
  const unpitched = directChildren(note, 'unpitched')
  if (unpitched.length > 0) fail('SEMANTIC', 'UNPITCHED_UNSUPPORTED')
  const pitchNodes = directChildren(note, 'pitch')
  if (pitchNodes.length === 0) return null
  if (pitchNodes.length !== 1) fail('SEMANTIC', 'PITCH_AMBIGUOUS')
  const pitch = pitchNodes[0]
  const stepNodes = directChildren(pitch, 'step')
  const octaveNodes = directChildren(pitch, 'octave')
  const alterNodes = directChildren(pitch, 'alter')
  if (stepNodes.length !== 1 || octaveNodes.length !== 1 || alterNodes.length > 1) fail('SEMANTIC', 'PITCH_AMBIGUOUS')
  const step = textOf(stepNodes[0])
  const octave = signedIntegerNode(octaveNodes[0], 'SEMANTIC', 'PITCH_INVALID')
  const alter = alterNodes.length === 1 ? signedIntegerNode(alterNodes[0], 'SEMANTIC', 'PITCH_INVALID') : 0
  if (!Object.hasOwn(STEP_TO_SEMITONE, step)) fail('SEMANTIC', 'PITCH_INVALID')
  const midi = ((octave + 1) * 12) + STEP_TO_SEMITONE[step] + alter
  if (!Number.isSafeInteger(midi) || midi < 0 || midi > 127) fail('SEMANTIC', 'PITCH_INVALID')
  return Object.freeze({ step, alter, octave, midi })
}

function parseTieFlags(note) {
  let tieStart = false
  let tieStop = false
  for (const tie of directChildren(note, 'tie')) {
    const type = tie.getAttribute?.('type')
    if (type === 'start') tieStart = true
    else if (type === 'stop') tieStop = true
    else fail('SEMANTIC', 'TIE_INVALID')
  }
  for (const tied of descendants(note, 'tied')) {
    const type = tied.getAttribute?.('type')
    if (type === 'start') tieStart = true
    else if (type === 'stop') tieStop = true
    else fail('SEMANTIC', 'TIE_INVALID')
  }
  return Object.freeze({ tieStart, tieStop })
}

function parseTechnical(note) {
  const technicals = descendants(note, 'technical')
  if (technicals.length === 0) return null
  if (technicals.length !== 1) fail('PHYSICAL', 'TECHNICAL_EVIDENCE_AMBIGUOUS')
  const strings = directChildren(technicals[0], 'string')
  const frets = directChildren(technicals[0], 'fret')
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
  const chromatics = directChildren(transpose, 'chromatic')
  const octaves = directChildren(transpose, 'octave-change')
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
    const rawNumber = transpose.getAttribute?.('number')
    const key = rawNumber === null ? 'default' : `staff:${rawNumber}`
    if (seen.has(key)) fail('SEMANTIC', 'TRANSPOSE_AMBIGUOUS')
    seen.add(key)
    const value = parseTranspose(transpose)
    if (rawNumber === null) {
      state.default = value
    } else {
      if (!/^[1-9][0-9]*$/u.test(rawNumber)) fail('SEMANTIC', 'TRANSPOSE_NUMBER_INVALID')
      const staff = Number(rawNumber)
      if (!Number.isSafeInteger(staff)) fail('SEMANTIC', 'TRANSPOSE_NUMBER_INVALID')
      state.byStaff.set(staff, value)
    }
  }
}

function noteIdentity(note) {
  const voices = directChildren(note, 'voice')
  const staves = directChildren(note, 'staff')
  if (voices.length > 1 || staves.length > 1) fail('IDENTITY', 'NOTE_IDENTITY_AMBIGUOUS')
  const voice = voices.length === 0 ? 1 : integerNode(voices[0], 'IDENTITY', 'VOICE_IDENTITY_INVALID', { min: 0 })
  const staff = staves.length === 0 ? 1 : integerNode(staves[0], 'IDENTITY', 'STAFF_IDENTITY_INVALID', { min: 1, allowZero: false })
  return { voice, staff }
}

function parsePartTimeline(part, { targetSelection = null } = {}) {
  const measures = directChildren(part, 'measure')
  if (measures.length === 0) fail('SEMANTIC', 'MEASURE_REQUIRED')
  const events = []
  let currentDivisions = null
  const transposeState = { default: 0, byStaff: new Map() }

  measures.forEach((measure, measureIndex) => {
    const attributesNodes = directChildren(measure, 'attributes')
    const firstAttributes = attributesNodes[0] ?? null
    const divisionsNodes = firstAttributes ? directChildren(firstAttributes, 'divisions') : []
    if (divisionsNodes.length > 1) fail('SEMANTIC', 'DIVISIONS_AMBIGUOUS')
    if (divisionsNodes.length === 1) {
      currentDivisions = integerNode(divisionsNodes[0], 'SEMANTIC', 'DIVISIONS_INVALID', { min: 1, allowZero: false })
    }
    if (!Number.isInteger(currentDivisions) || currentDivisions <= 0) fail('SEMANTIC', 'DIVISIONS_REQUIRED')
    for (const attributes of attributesNodes) updateTransposeState(attributes, transposeState)

    let cursor = 0
    let lastNonChordOnset = null
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
      const selected = targetSelection === null
        || (staff === targetSelection.staff && voice === targetSelection.voice)
      if (directChildren(child, 'grace').length > 0) {
        if (selected) fail('SEMANTIC', 'GRACE_UNSUPPORTED')
        continue
      }

      const durationNodes = directChildren(child, 'duration')
      if (durationNodes.length !== 1) fail('SEMANTIC', 'NOTE_DURATION_INVALID')
      const duration = integerNode(durationNodes[0], 'SEMANTIC', 'NOTE_DURATION_INVALID', { min: 1, allowZero: false })
      const isChord = directChildren(child, 'chord').length > 0
      if (isChord && lastNonChordOnset === null) fail('SEMANTIC', 'CHORD_WITHOUT_BASE')
      const onset = isChord ? lastNonChordOnset : cursor

      if (selected) {
        const pitch = parsePitch(child)
        const isRest = directChildren(child, 'rest').length > 0
        if (!pitch && !isRest) fail('SEMANTIC', 'NOTE_PITCH_OR_REST_REQUIRED')
        if (pitch && !isRest) {
          const semitones = transposeState.byStaff.get(staff) ?? transposeState.default
          const soundingPitchMidi = pitch.midi + semitones
          if (!Number.isSafeInteger(soundingPitchMidi) || soundingPitchMidi < 0 || soundingPitchMidi > 127) {
            fail('SEMANTIC', 'SOUNDING_PITCH_INVALID')
          }
          const ties = parseTieFlags(child)
          events.push(Object.freeze({
            measureIndex,
            onset,
            duration,
            divisions: currentDivisions,
            voice,
            staff,
            pitch,
            soundingPitchMidi,
            tieStart: ties.tieStart,
            tieStop: ties.tieStop,
            technical: parseTechnical(child),
          }))
        }
      }
      if (!isChord) {
        lastNonChordOnset = onset
        cursor += duration
      }
    }
  })
  return Object.freeze(events)
}

function gcd(a, b) {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y !== 0) [x, y] = [y, x % y]
  return x || 1
}

function fractionKey(value, divisions) {
  const divisor = gcd(value, divisions)
  return `${value / divisor}/${divisions / divisor}`
}

function semanticKey(event) {
  return [
    event.measureIndex,
    fractionKey(event.onset, event.divisions),
    fractionKey(event.duration, event.divisions),
    event.voice,
    event.pitch.step,
    event.pitch.alter,
    event.pitch.octave,
    event.tieStart ? 1 : 0,
    event.tieStop ? 1 : 0,
  ].join('|')
}

function assertSemanticParity(expected, actual, code) {
  if (expected.length !== actual.length) fail('SEMANTIC', code)
  const expectedKeys = expected.map(semanticKey).sort()
  const actualKeys = actual.map(semanticKey).sort()
  for (let index = 0; index < expectedKeys.length; index += 1) {
    if (expectedKeys[index] !== actualKeys[index]) fail('SEMANTIC', code)
  }
}

function assertTabShape(root) {
  const parts = directChildren(root, 'part')
  if (parts.length !== 1) fail('TAB_SHAPE', 'TAB_ONE_PART_REQUIRED')
  const firstMeasure = directChildren(parts[0], 'measure')[0]
  const attributes = firstMeasure ? directChildren(firstMeasure, 'attributes')[0] : null
  if (!attributes) fail('TAB_SHAPE', 'TAB_ATTRIBUTES_REQUIRED')

  const stavesNodes = directChildren(attributes, 'staves')
  if (stavesNodes.length !== 1 || integerNode(stavesNodes[0], 'TAB_SHAPE', 'TAB_STAVES_INVALID', { min: 2, max: 2, allowZero: false }) !== 2) {
    fail('TAB_SHAPE', 'TAB_TWO_STAFF_SHAPE_REQUIRED')
  }

  const tabClefs = directChildren(attributes, 'clef').filter((clef) => clef.getAttribute?.('number') === '2')
  if (tabClefs.length !== 1 || textOf(directChild(tabClefs[0], 'sign')) !== 'TAB' || textOf(directChild(tabClefs[0], 'line')) !== '5') {
    fail('TAB_SHAPE', 'TAB_CLEF_REQUIRED')
  }

  const detailNodes = directChildren(attributes, 'staff-details').filter((entry) => entry.getAttribute?.('number') === '2')
  if (detailNodes.length !== 1) fail('TAB_SHAPE', 'TAB_STAFF_DETAILS_REQUIRED')
  const lines = directChildren(detailNodes[0], 'staff-lines')
  if (lines.length !== 1 || integerNode(lines[0], 'TAB_SHAPE', 'TAB_STAFF_LINES_INVALID', { min: 6, max: 6, allowZero: false }) !== 6) {
    fail('TAB_SHAPE', 'TAB_SIX_LINE_SHAPE_REQUIRED')
  }

  const tunings = directChildren(detailNodes[0], 'staff-tuning')
  if (tunings.length !== EXPECTED_TUNING.length) fail('TAB_SHAPE', 'TAB_STANDARD_TUNING_REQUIRED')
  const seenLines = new Set()
  for (const expected of EXPECTED_TUNING) {
    const matching = tunings.filter((entry) => entry.getAttribute?.('line') === String(expected.line))
    if (matching.length !== 1 || seenLines.has(expected.line)) fail('TAB_SHAPE', 'TAB_STANDARD_TUNING_REQUIRED')
    seenLines.add(expected.line)
    const actual = matching[0]
    if (textOf(directChild(actual, 'tuning-step')) !== expected.step || textOf(directChild(actual, 'tuning-octave')) !== String(expected.octave)) {
      fail('TAB_SHAPE', 'TAB_STANDARD_TUNING_REQUIRED')
    }
  }
  return parts[0]
}

function assertPhysicalTab(staff2Events) {
  if (staff2Events.length === 0) fail('PHYSICAL', 'TAB_STAFF2_PITCHED_NOTE_REQUIRED')
  const groups = new Map()
  for (const event of staff2Events) {
    if (!event.technical) fail('PHYSICAL', 'TECHNICAL_STRING_FRET_REQUIRED')
    const openMidi = GUITAR_TAB_STANDARD_TUNING_MIDI[event.technical.string]
    if (!Number.isInteger(openMidi) || openMidi + event.technical.fret !== event.soundingPitchMidi) {
      fail('PHYSICAL', 'TECHNICAL_POSITION_PITCH_MISMATCH')
    }
    const key = `${event.measureIndex}|${fractionKey(event.onset, event.divisions)}`
    const group = groups.get(key) ?? []
    group.push(event)
    groups.set(key, group)
  }
  for (const group of groups.values()) {
    if (group.length > 6) fail('PHYSICAL', 'SIMULTANEOUS_NOTE_LIMIT_EXCEEDED')
    const strings = group.map((event) => event.technical.string)
    if (new Set(strings).size !== strings.length) fail('PHYSICAL', 'SIMULTANEOUS_STRING_COLLISION')
  }
}

function validateInternal({ scoreMusicXml, guitarTabMusicXml, targetSelection, DOMParserCtor }) {
  const scoreRoot = parseSafeRoot(scoreMusicXml, 'SCORE', DOMParserCtor)
  const tabRoot = parseSafeRoot(guitarTabMusicXml, 'TAB', DOMParserCtor)
  const scoreAnalysis = analyzeGuitarTabCanonicalIdentity(scoreRoot)

  let scorePart
  let selectedTarget = null
  if (targetSelection === null || targetSelection === undefined) {
    if (scoreAnalysis.parts.length !== 1) fail('IDENTITY', 'TARGET_SELECTION_REQUIRED')
    scorePart = directChildren(scoreRoot, 'part')[0]
  } else {
    const target = resolveGuitarTabCanonicalTarget(scoreAnalysis, targetSelection)
    selectedTarget = target.targetSelection
    scorePart = directChildren(scoreRoot, 'part')[target.part.partIndex]
  }

  const tabPart = assertTabShape(tabRoot)
  const scoreEvents = parsePartTimeline(scorePart, { targetSelection: selectedTarget })
  if (scoreEvents.length === 0) fail('IDENTITY', 'TARGET_EMPTY')

  const tabEvents = parsePartTimeline(tabPart)
  const staff1 = tabEvents.filter((event) => event.staff === 1)
  const staff2 = tabEvents.filter((event) => event.staff === 2)
  assertSemanticParity(scoreEvents, staff1, 'SCORE_TAB_STAFF1_SEMANTIC_MISMATCH')
  assertSemanticParity(staff1, staff2, 'TAB_STAFF_SEMANTIC_MISMATCH')
  assertPhysicalTab(staff2)

  return Object.freeze({
    ok: true,
    category: null,
    code: null,
    facts: Object.freeze({
      scoreEventCount: scoreEvents.length,
      notationEventCount: staff1.length,
      tabEventCount: staff2.length,
      targetSelection: selectedTarget,
    }),
  })
}

export function validateGuitarTabExport({
  scoreMusicXml,
  guitarTabMusicXml,
  targetSelection = null,
  DOMParserCtor = globalThis.DOMParser,
} = {}) {
  try {
    return validateInternal({ scoreMusicXml, guitarTabMusicXml, targetSelection, DOMParserCtor })
  } catch (error) {
    const category = typeof error?.category === 'string' ? error.category : 'RUNTIME'
    const code = typeof error?.code === 'string' ? error.code : 'VALIDATION_EXCEPTION'
    return Object.freeze({ ok: false, category, code })
  }
}
