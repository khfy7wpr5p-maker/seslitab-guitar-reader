import { inspectMusicXml } from '../../musicXmlSecurity.js'

export const EDITOR_GUITAR_TAB_HANDOFF_SCHEMA_VERSION = '1.0.0'
export const EDITOR_GUITAR_TAB_MAX_FRET = 20
export const EDITOR_STANDARD_TUNING_MIDI = Object.freeze({
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

const STEP_TO_SEMITONE = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
})

function fail(code) {
  throw new Error(`editor-guitar-tab-handoff-${code}`)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function tagName(node) {
  return node?.tagName ?? node?.tag ?? null
}

function elementChildren(node) {
  return [...(node?.children ?? [])]
}

function directChild(node, name) {
  return elementChildren(node).find((child) => tagName(child) === name) ?? null
}

function directChildren(node, name) {
  return elementChildren(node).filter((child) => tagName(child) === name)
}

function descendants(node, name) {
  const result = []
  const visit = (parent) => {
    for (const child of elementChildren(parent)) {
      if (tagName(child) === name) result.push(child)
      visit(child)
    }
  }
  visit(node)
  return result
}

function textOf(node) {
  return typeof node?.textContent === 'string'
    ? node.textContent.trim()
    : ''
}

function integerText(node, code, { min = null, max = null } = {}) {
  const value = Number(textOf(node))
  if (!Number.isInteger(value)) fail(code)
  if (min !== null && value < min) fail(code)
  if (max !== null && value > max) fail(code)
  return value
}

function parseSafeDocument(xml, label) {
  if (!hasText(xml)) fail(`${label}-empty`)
  const inspection = inspectMusicXml(xml)
  if (!inspection.ok) {
    fail(`${label}-invalid-${inspection.code ?? 'structure'}`)
  }
  if (typeof DOMParser !== 'function') {
    fail('dom-parser-unavailable')
  }
  const document = new DOMParser().parseFromString(
    inspection.xmlForParsing,
    'application/xml',
  )
  if (!document || document.querySelector?.('parsererror')) {
    fail(`${label}-parse-failed`)
  }
  const root = document.documentElement
    ?? document.querySelector?.('score-partwise')
  if (tagName(root) !== 'score-partwise') {
    fail(`${label}-score-partwise-required`)
  }
  return root
}

function parsePitch(note) {
  if (directChild(note, 'unpitched')) {
    fail('unpitched-unsupported')
  }
  const pitch = directChild(note, 'pitch')
  if (!pitch) return null
  const step = textOf(directChild(pitch, 'step'))
  const octave = Number(textOf(directChild(pitch, 'octave')))
  const alterNode = directChild(pitch, 'alter')
  const alter = alterNode ? Number(textOf(alterNode)) : 0
  if (
    !Object.hasOwn(STEP_TO_SEMITONE, step)
    || !Number.isInteger(octave)
    || !Number.isFinite(alter)
  ) {
    fail('invalid-pitch')
  }
  const midi = ((octave + 1) * 12) + STEP_TO_SEMITONE[step] + alter
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
    fail('invalid-pitch-midi')
  }
  return Object.freeze({ step, alter, octave, midi })
}

function tieFlags(note) {
  let tieStart = false
  let tieStop = false
  for (const tie of directChildren(note, 'tie')) {
    const type = tie.getAttribute?.('type')
    if (type === 'start') tieStart = true
    if (type === 'stop') tieStop = true
  }
  for (const tied of descendants(note, 'tied')) {
    const type = tied.getAttribute?.('type')
    if (type === 'start') tieStart = true
    if (type === 'stop') tieStop = true
  }
  return { tieStart, tieStop }
}

function technicalPosition(note) {
  const technical = descendants(note, 'technical')[0] ?? null
  if (!technical) return null
  const stringNode = directChild(technical, 'string')
  const fretNode = directChild(technical, 'fret')
  if (!stringNode || !fretNode) return null
  return Object.freeze({
    string: integerText(stringNode, 'technical-string-invalid', { min: 1, max: 6 }),
    fret: integerText(fretNode, 'technical-fret-invalid', {
      min: 0,
      max: EDITOR_GUITAR_TAB_MAX_FRET,
    }),
  })
}

function parseTimeline(root, label) {
  const parts = directChildren(root, 'part')
  if (parts.length !== 1) fail(`${label}-one-part-required`)
  const part = parts[0]
  const measures = directChildren(part, 'measure')
  if (measures.length === 0) fail(`${label}-measure-required`)

  const events = []
  let currentDivisions = null

  measures.forEach((measure, measureIndex) => {
    const attributes = directChild(measure, 'attributes')
    const divisionsNode = attributes ? directChild(attributes, 'divisions') : null
    if (divisionsNode) {
      currentDivisions = integerText(
        divisionsNode,
        `${label}-divisions-invalid`,
        { min: 1 },
      )
    }
    if (!Number.isInteger(currentDivisions) || currentDivisions <= 0) {
      fail(`${label}-divisions-required`)
    }

    let cursor = 0
    let lastNonChordOnset = 0

    for (const child of elementChildren(measure)) {
      const childTag = tagName(child)
      if (childTag === 'backup' || childTag === 'forward') {
        const duration = integerText(
          directChild(child, 'duration'),
          `${label}-${childTag}-duration-invalid`,
          { min: 0 },
        )
        cursor += childTag === 'backup' ? -duration : duration
        if (cursor < 0) fail(`${label}-negative-cursor`)
        continue
      }
      if (childTag !== 'note') continue

      const isChord = directChild(child, 'chord') !== null
      const isGrace = directChild(child, 'grace') !== null
      if (isGrace) fail('grace-unsupported')
      const duration = integerText(
        directChild(child, 'duration'),
        `${label}-note-duration-invalid`,
        { min: 1 },
      )
      const onset = isChord ? lastNonChordOnset : cursor
      const pitch = parsePitch(child)
      const isRest = directChild(child, 'rest') !== null
      const voice = textOf(directChild(child, 'voice')) || '1'
      const staffNode = directChild(child, 'staff')
      const staff = staffNode
        ? integerText(staffNode, `${label}-staff-invalid`, { min: 1 })
        : 1

      if (pitch && !isRest) {
        const ties = tieFlags(child)
        events.push(Object.freeze({
          measureIndex,
          onset,
          duration,
          divisions: currentDivisions,
          voice,
          staff,
          pitchMidi: pitch.midi,
          tieStart: ties.tieStart,
          tieStop: ties.tieStop,
          technical: technicalPosition(child),
        }))
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
  while (y !== 0) {
    const next = x % y
    x = y
    y = next
  }
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
    event.pitchMidi,
    event.tieStart ? 1 : 0,
    event.tieStop ? 1 : 0,
  ].join('|')
}

function sortedSemanticKeys(events) {
  return events.map(semanticKey).sort()
}

function assertSemanticParity(expected, actual, code) {
  if (expected.length !== actual.length) fail(code)
  const expectedKeys = sortedSemanticKeys(expected)
  const actualKeys = sortedSemanticKeys(actual)
  for (let index = 0; index < expectedKeys.length; index += 1) {
    if (expectedKeys[index] !== actualKeys[index]) fail(code)
  }
}

function assertTabShape(root) {
  const parts = directChildren(root, 'part')
  if (parts.length !== 1) fail('tab-one-part-required')
  const firstMeasure = directChildren(parts[0], 'measure')[0]
  const attributes = firstMeasure ? directChild(firstMeasure, 'attributes') : null
  if (!attributes) fail('tab-attributes-required')

  const staves = integerText(
    directChild(attributes, 'staves'),
    'tab-staves-invalid',
    { min: 2, max: 2 },
  )
  if (staves !== 2) fail('tab-two-staff-shape-required')

  const tabClef = directChildren(attributes, 'clef').find(
    (clef) => clef.getAttribute?.('number') === '2',
  )
  if (!tabClef || textOf(directChild(tabClef, 'sign')) !== 'TAB') {
    fail('tab-clef-required')
  }

  const details = directChildren(attributes, 'staff-details').find(
    (entry) => entry.getAttribute?.('number') === '2',
  )
  if (!details) fail('tab-staff-details-required')
  const lines = integerText(
    directChild(details, 'staff-lines'),
    'tab-staff-lines-invalid',
  )
  if (lines !== 6) fail('tab-six-line-shape-required')

  const tunings = directChildren(details, 'staff-tuning')
  if (tunings.length !== EXPECTED_TUNING.length) {
    fail('tab-standard-tuning-required')
  }
  for (const expected of EXPECTED_TUNING) {
    const actual = tunings.find(
      (entry) => Number(entry.getAttribute?.('line')) === expected.line,
    )
    if (
      !actual
      || textOf(directChild(actual, 'tuning-step')) !== expected.step
      || Number(textOf(directChild(actual, 'tuning-octave'))) !== expected.octave
    ) {
      fail('tab-standard-tuning-required')
    }
  }
}

function assertPhysicalTab(events) {
  const staff2 = events.filter((event) => event.staff === 2)
  if (staff2.length === 0) fail('tab-staff2-pitched-note-required')

  const groups = new Map()
  for (const event of staff2) {
    if (!event.technical) fail('technical-string-fret-required')
    const openMidi = EDITOR_STANDARD_TUNING_MIDI[event.technical.string]
    if (
      !Number.isInteger(openMidi)
      || openMidi + event.technical.fret !== event.pitchMidi
    ) {
      fail('technical-position-pitch-mismatch')
    }

    const groupKey = [
      event.measureIndex,
      fractionKey(event.onset, event.divisions),
    ].join('|')
    const group = groups.get(groupKey) ?? []
    group.push(event)
    groups.set(groupKey, group)
  }

  for (const group of groups.values()) {
    if (group.length > 6) fail('simultaneous-note-limit-exceeded')
    const strings = group.map((event) => event.technical.string)
    if (new Set(strings).size !== strings.length) {
      fail('simultaneous-string-collision')
    }
  }
}

function assertTabSemantics(scoreEvents, tabEvents) {
  const staff1 = tabEvents.filter((event) => event.staff === 1)
  const staff2 = tabEvents.filter((event) => event.staff === 2)
  assertSemanticParity(scoreEvents, staff1, 'score-tab-staff1-semantic-mismatch')
  assertSemanticParity(staff1, staff2, 'tab-staff-semantic-mismatch')
}

function hexFromBuffer(buffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256Utf8(value) {
  const subtle = globalThis.crypto?.subtle
  if (!subtle || typeof subtle.digest !== 'function') {
    fail('crypto-unavailable')
  }
  const digest = await subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return hexFromBuffer(digest)
}

export async function prepareEditorGuitarTabHandoff({
  scoreUpload,
  guitarTabMusicXml,
  draftId,
} = {}) {
  if (!isRecord(scoreUpload)) fail('score-upload-required')
  if (!hasText(draftId)) fail('draft-id-required')
  if (scoreUpload.draftId !== draftId) fail('draft-mismatch')
  if (!hasText(scoreUpload.musicXml)) fail('score-musicxml-required')
  if (
    typeof scoreUpload.musicXmlFingerprint !== 'string'
    || !/^[0-9a-f]{64}$/u.test(scoreUpload.musicXmlFingerprint)
  ) {
    fail('score-fingerprint-required')
  }
  if (!hasText(guitarTabMusicXml)) fail('tab-empty')

  const scoreRoot = parseSafeDocument(scoreUpload.musicXml, 'score')
  const tabRoot = parseSafeDocument(guitarTabMusicXml, 'tab')
  assertTabShape(tabRoot)

  const scoreEvents = parseTimeline(scoreRoot, 'score')
  const tabEvents = parseTimeline(tabRoot, 'tab')
  if (scoreEvents.length === 0) fail('score-pitched-note-required')

  assertTabSemantics(scoreEvents, tabEvents)
  assertPhysicalTab(tabEvents)

  const guitarTabMusicXmlFingerprint = await sha256Utf8(guitarTabMusicXml)

  return Object.freeze({
    schemaVersion: EDITOR_GUITAR_TAB_HANDOFF_SCHEMA_VERSION,
    draftId,
    scoreMusicXmlFingerprint: scoreUpload.musicXmlFingerprint,
    guitarTabMusicXmlFingerprint,
    guitarTabMusicXml,
    pitchedEventCount: scoreEvents.length,
  })
}
