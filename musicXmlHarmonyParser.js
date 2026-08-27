import { inspectMusicXml } from './musicXmlSecurity.js'

export const HARMONY_SCHEMA_VERSION = 1

export const HARMONY_PARSE_STATE = Object.freeze({
  PARSED: 'PARSED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  INVALID: 'INVALID',
})

export const HARMONY_TIMING_STATE = Object.freeze({
  MEASURED: 'MEASURED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
})

export const SUPPORTED_HARMONY_KIND_SUFFIX = Object.freeze({
  major: '',
  minor: 'm',
  augmented: 'aug',
  diminished: 'dim',
  dominant: '7',
  'major-seventh': 'maj7',
  'minor-seventh': 'm7',
  'diminished-seventh': 'dim7',
  'augmented-seventh': 'aug7',
  'half-diminished': 'm7b5',
  'major-minor': 'm(maj7)',
  'major-sixth': '6',
  'minor-sixth': 'm6',
  'dominant-ninth': '9',
  'major-ninth': 'maj9',
  'minor-ninth': 'm9',
  'dominant-11th': '11',
  'major-11th': 'maj11',
  'minor-11th': 'm11',
  'dominant-13th': '13',
  'major-13th': 'maj13',
  'minor-13th': 'm13',
  'suspended-second': 'sus2',
  'suspended-fourth': 'sus4',
  power: '5',
  none: 'N.C.',
})

const SUPPORTED_DEGREE_TYPES = new Set(['add', 'alter', 'subtract'])
const VALID_STEPS = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
const ACCIDENTAL_TOKEN = Object.freeze({
  '-2': 'bb',
  '-1': 'b',
  '0': '',
  '1': '#',
  '2': '##',
})

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

function elementTag(node) {
  const tag = node?.tagName || node?.tag || null
  return typeof tag === 'string' ? tag.toLowerCase() : null
}

function childrenOf(node) {
  if (!node?.children) return []
  try {
    return Array.from(node.children)
  } catch {
    return []
  }
}

function directChildren(node, tagName) {
  const normalized = String(tagName).toLowerCase()
  return childrenOf(node).filter((child) => elementTag(child) === normalized)
}

function firstDirectChild(node, tagName) {
  return directChildren(node, tagName)[0] || null
}

function textOf(node) {
  if (!node || typeof node.textContent !== 'string') return null
  const text = node.textContent.trim()
  return text === '' ? null : text
}

function attrOf(node, name) {
  if (!node || typeof node.getAttribute !== 'function') return null
  const value = node.getAttribute(name)
  return value == null ? null : String(value)
}

function parseFiniteNumber(raw) {
  if (raw == null || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function parsePositiveInteger(raw) {
  if (raw == null || raw === '') return null
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : null
}

function parseNonNegativeInteger(raw) {
  if (raw == null || raw === '') return null
  const value = Number(raw)
  return Number.isInteger(value) && value >= 0 ? value : null
}

function normalizeStep(rawStep, reasons, label) {
  if (typeof rawStep !== 'string' || rawStep.trim() === '') {
    reasons.push(`${label}-step-missing`)
    return null
  }
  const step = rawStep.trim().toUpperCase()
  if (!VALID_STEPS.has(step)) {
    reasons.push(`${label}-step-invalid`)
    return null
  }
  return step
}

function normalizeAlter(rawAlter, reasons, label) {
  if (rawAlter == null || rawAlter === '') return 0
  const alter = parseFiniteNumber(rawAlter)
  if (alter == null || !Number.isInteger(alter) || alter < -2 || alter > 2) {
    reasons.push(`${label}-alter-unsupported`)
    return null
  }
  return alter
}

function pitchToken(step, alter) {
  if (!step || alter == null) return null
  const accidental = ACCIDENTAL_TOKEN[String(alter)]
  return accidental == null ? null : `${step}${accidental}`
}

function normalizeDegree(input, index, reasons) {
  const degreeReasons = []
  const type = typeof input?.type === 'string' ? input.type.trim().toLowerCase() : ''
  const value = parsePositiveInteger(input?.value)
  const alter = parseFiniteNumber(input?.alter)
  const printObject = input?.printObject !== false

  if (!SUPPORTED_DEGREE_TYPES.has(type)) degreeReasons.push('degree-type-unsupported')
  if (value == null || value > 13) degreeReasons.push('degree-value-unsupported')
  if (alter == null || !Number.isInteger(alter) || alter < -2 || alter > 2) {
    degreeReasons.push('degree-alter-unsupported')
  }
  if (type === 'subtract' && alter !== 0) {
    degreeReasons.push('subtract-degree-must-be-natural')
  }

  const valid = degreeReasons.length === 0
  let token = null
  if (valid && printObject) {
    const accidental = ACCIDENTAL_TOKEN[String(alter)]
    if (type === 'add') token = `add${accidental}${value}`
    if (type === 'alter') token = `${alter === 0 ? 'nat' : accidental}${value}`
    if (type === 'subtract') token = `no${value}`
  }

  if (!valid) reasons.push(...degreeReasons.map((reason) => `degree-${index}-${reason}`))

  return {
    type: type || null,
    value,
    alter,
    token,
    printObject,
    state: valid ? HARMONY_PARSE_STATE.PARSED : HARMONY_PARSE_STATE.REVIEW_REQUIRED,
  }
}

export function normalizeHarmonyDescriptor(input = {}) {
  const reasons = []
  const functionText = typeof input.functionText === 'string' && input.functionText.trim()
    ? input.functionText.trim()
    : null
  const kindValue = typeof input.kindValue === 'string' && input.kindValue.trim()
    ? input.kindValue.trim().toLowerCase()
    : null
  const kindText = typeof input.kindText === 'string' && input.kindText.trim()
    ? input.kindText.trim()
    : null

  if (functionText) reasons.push('functional-harmony-unsupported')
  if (!kindValue) reasons.push('kind-missing')

  const kindSuffix = kindValue && Object.prototype.hasOwnProperty.call(SUPPORTED_HARMONY_KIND_SUFFIX, kindValue)
    ? SUPPORTED_HARMONY_KIND_SUFFIX[kindValue]
    : null
  if (kindValue && kindSuffix == null) reasons.push('kind-unsupported')

  let root = null
  if (kindValue === 'none') {
    if (input.rootStep != null && String(input.rootStep).trim() !== '') {
      reasons.push('no-chord-must-not-have-root')
    }
  } else {
    const rootStep = normalizeStep(input.rootStep, reasons, 'root')
    const rootAlter = normalizeAlter(input.rootAlter, reasons, 'root')
    root = {
      step: rootStep,
      alter: rootAlter,
      token: pitchToken(rootStep, rootAlter),
    }
  }

  let bass = null
  const bassRequested = input.bassStep != null && String(input.bassStep).trim() !== ''
  if (bassRequested) {
    const bassStep = normalizeStep(input.bassStep, reasons, 'bass')
    const bassAlter = normalizeAlter(input.bassAlter, reasons, 'bass')
    bass = {
      step: bassStep,
      alter: bassAlter,
      token: pitchToken(bassStep, bassAlter),
    }
  } else if (input.bassAlter != null && String(input.bassAlter).trim() !== '') {
    reasons.push('bass-step-missing')
  }

  let inversion = null
  if (input.inversion != null && String(input.inversion).trim() !== '') {
    inversion = parseNonNegativeInteger(input.inversion)
    if (inversion == null) reasons.push('inversion-invalid')
  }

  let staff = null
  if (input.staff != null && String(input.staff).trim() !== '') {
    staff = parsePositiveInteger(input.staff)
    if (staff == null) reasons.push('staff-invalid')
  }

  const degreesInput = Array.isArray(input.degrees) ? input.degrees : []
  const degrees = degreesInput.map((degree, index) => normalizeDegree(degree, index, reasons))

  const state = reasons.length === 0
    ? HARMONY_PARSE_STATE.PARSED
    : HARMONY_PARSE_STATE.REVIEW_REQUIRED

  let symbol = null
  if (state === HARMONY_PARSE_STATE.PARSED) {
    if (kindValue === 'none') {
      symbol = 'N.C.'
    } else {
      const degreeTokens = degrees.filter((degree) => degree.printObject && degree.token).map((degree) => degree.token)
      symbol = `${root.token}${kindSuffix}${degreeTokens.length ? `(${degreeTokens.join(',')})` : ''}${bass ? `/${bass.token}` : ''}`
    }
  }

  return deepFreeze({
    schemaVersion: HARMONY_SCHEMA_VERSION,
    state,
    symbol,
    root,
    kind: {
      value: kindValue,
      text: kindText,
      suffix: kindSuffix,
    },
    bass,
    inversion,
    degrees,
    staff,
    functionText,
    reviewReasons: [...new Set(reasons)],
    provenance: 'musicxml-harmony-source',
    teacherApproved: false,
  })
}

function descriptorFromHarmonyElement(harmonyEl) {
  const rootEl = firstDirectChild(harmonyEl, 'root')
  const bassEl = firstDirectChild(harmonyEl, 'bass')
  const kindEl = firstDirectChild(harmonyEl, 'kind')
  const functionEl = firstDirectChild(harmonyEl, 'function')
  const inversionEl = firstDirectChild(harmonyEl, 'inversion')
  const staffEl = firstDirectChild(harmonyEl, 'staff')

  const degreeEls = directChildren(harmonyEl, 'degree')
  const degrees = degreeEls.map((degreeEl) => ({
    value: textOf(firstDirectChild(degreeEl, 'degree-value')),
    alter: textOf(firstDirectChild(degreeEl, 'degree-alter')),
    type: textOf(firstDirectChild(degreeEl, 'degree-type')),
    printObject: attrOf(degreeEl, 'print-object') !== 'no',
  }))

  return {
    rootStep: textOf(firstDirectChild(rootEl, 'root-step')),
    rootAlter: textOf(firstDirectChild(rootEl, 'root-alter')),
    kindValue: textOf(kindEl),
    kindText: attrOf(kindEl, 'text'),
    bassStep: textOf(firstDirectChild(bassEl, 'bass-step')),
    bassAlter: textOf(firstDirectChild(bassEl, 'bass-alter')),
    inversion: textOf(inversionEl),
    staff: textOf(staffEl),
    functionText: textOf(functionEl),
    degrees,
  }
}

function parseDurationFromNote(noteEl) {
  const isChord = firstDirectChild(noteEl, 'chord') !== null
  const isGrace = firstDirectChild(noteEl, 'grace') !== null
  if (isChord || isGrace) return 0
  const duration = parseFiniteNumber(textOf(firstDirectChild(noteEl, 'duration')))
  return duration != null && duration >= 0 ? duration : null
}

function parseDurationElement(element) {
  const duration = parseFiniteNumber(textOf(firstDirectChild(element, 'duration')))
  return duration != null && duration >= 0 ? duration : null
}

function parseVisibleMeasureNumber(rawNumber, fallback) {
  if (rawNumber == null || rawNumber === '') return fallback
  const parsed = Number.parseInt(rawNumber, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function createMeasureKey(partId, measureIndex) {
  return `${partId}:${measureIndex}`
}

function buildPartMeasureSequences(doc) {
  const root = doc?.documentElement
  const rootTag = elementTag(root)
  if (rootTag !== 'score-partwise' && rootTag !== 'score-timewise') {
    return { ok: false, reason: 'unsupported-score-root', parts: [] }
  }

  if (rootTag === 'score-partwise') {
    const seenPartIds = new Set()
    const parts = []
    const partElements = directChildren(root, 'part')
    for (let partIndex = 0; partIndex < partElements.length; partIndex++) {
      const partEl = partElements[partIndex]
      const partId = attrOf(partEl, 'id')
      if (!partId || seenPartIds.has(partId)) {
        return { ok: false, reason: 'part-identity-invalid', parts: [] }
      }
      seenPartIds.add(partId)
      parts.push({
        partId,
        partIndex,
        measures: directChildren(partEl, 'measure').map((measureEl, measureIndex) => ({
          contentEl: measureEl,
          outerMeasureEl: measureEl,
          measureIndex,
        })),
      })
    }
    return { ok: true, parts }
  }

  const byId = new Map()
  let nextPartIndex = 0
  const outerMeasures = directChildren(root, 'measure')
  for (let outerMeasureIndex = 0; outerMeasureIndex < outerMeasures.length; outerMeasureIndex++) {
    const outerMeasureEl = outerMeasures[outerMeasureIndex]
    const seenInMeasure = new Set()
    for (const partEl of directChildren(outerMeasureEl, 'part')) {
      const partId = attrOf(partEl, 'id')
      if (!partId || seenInMeasure.has(partId)) {
        return { ok: false, reason: 'part-identity-invalid', parts: [] }
      }
      seenInMeasure.add(partId)
      if (!byId.has(partId)) {
        byId.set(partId, {
          partId,
          partIndex: nextPartIndex,
          measures: [],
        })
        nextPartIndex++
      }
      const entry = byId.get(partId)
      entry.measures.push({
        contentEl: partEl,
        outerMeasureEl,
        measureIndex: outerMeasureIndex,
      })
    }
  }
  return { ok: true, parts: [...byId.values()].sort((a, b) => a.partIndex - b.partIndex) }
}

function parsePartMeasureSequence(partSequence) {
  const harmonies = []
  let currentDivisions = null
  let previousMeasureNumber = 0
  let partReviewRequired = false

  for (const measureRecord of partSequence.measures) {
    const { contentEl, outerMeasureEl, measureIndex } = measureRecord
    const rawMeasureNumber = attrOf(outerMeasureEl, 'number')
    const measureNumber = parseVisibleMeasureNumber(rawMeasureNumber, previousMeasureNumber + 1)
    previousMeasureNumber = measureNumber
    const measureNumberText = rawMeasureNumber || String(measureNumber)
    const measureKey = createMeasureKey(partSequence.partId, measureIndex)

    let cursorDivisions = 0
    let timelineReliable = true
    let sequenceIndex = 0

    for (const child of childrenOf(contentEl)) {
      const tag = elementTag(child)

      if (tag === 'attributes') {
        const divisionsValue = parseFiniteNumber(textOf(firstDirectChild(child, 'divisions')))
        if (divisionsValue != null) {
          if (divisionsValue > 0) currentDivisions = divisionsValue
          else {
            timelineReliable = false
            partReviewRequired = true
          }
        }
        sequenceIndex++
        continue
      }

      if (tag === 'harmony') {
        const normalized = normalizeHarmonyDescriptor(descriptorFromHarmonyElement(child))
        const offsetEl = firstDirectChild(child, 'offset')
        const offsetRaw = textOf(offsetEl)
        let offsetDivisions = 0
        if (offsetRaw != null) {
          const parsedOffset = parseFiniteNumber(offsetRaw)
          if (parsedOffset == null) {
            timelineReliable = false
            partReviewRequired = true
          } else {
            offsetDivisions = parsedOffset
          }
        }

        let startDivisions = timelineReliable ? cursorDivisions + offsetDivisions : null
        if (startDivisions != null && startDivisions < 0) {
          startDivisions = null
          timelineReliable = false
          partReviewRequired = true
        }
        const startBeat = timelineReliable && Number.isFinite(currentDivisions) && currentDivisions > 0
          ? startDivisions / currentDivisions
          : null
        const timingState = startBeat == null
          ? HARMONY_TIMING_STATE.REVIEW_REQUIRED
          : HARMONY_TIMING_STATE.MEASURED

        if (normalized.state !== HARMONY_PARSE_STATE.PARSED || timingState !== HARMONY_TIMING_STATE.MEASURED) {
          partReviewRequired = true
        }

        harmonies.push(deepFreeze({
          ...normalized,
          partId: partSequence.partId,
          partIndex: partSequence.partIndex,
          measureNumber,
          measureNumberText,
          measureIndex,
          measureKey,
          sequenceIndex,
          divisions: Number.isFinite(currentDivisions) && currentDivisions > 0 ? currentDivisions : null,
          offsetDivisions: offsetRaw == null ? 0 : offsetDivisions,
          startDivisions,
          startBeat,
          timingState,
        }))
        sequenceIndex++
        continue
      }

      if (tag === 'note') {
        const duration = parseDurationFromNote(child)
        if (duration == null) {
          timelineReliable = false
          partReviewRequired = true
        } else {
          cursorDivisions += duration
        }
        sequenceIndex++
        continue
      }

      if (tag === 'backup' || tag === 'forward') {
        const duration = parseDurationElement(child)
        if (duration == null) {
          timelineReliable = false
          partReviewRequired = true
        } else if (timelineReliable) {
          const next = cursorDivisions + (tag === 'backup' ? -duration : duration)
          if (next < 0) {
            timelineReliable = false
            partReviewRequired = true
          } else {
            cursorDivisions = next
          }
        }
        sequenceIndex++
      }
    }
  }

  return {
    harmonies,
    partReviewRequired,
  }
}

export function extractHarmonyEventsFromDocument(doc) {
  const sequences = buildPartMeasureSequences(doc)
  if (!sequences.ok) {
    return deepFreeze({
      state: HARMONY_PARSE_STATE.INVALID,
      harmonies: [],
      parts: [],
      reason: sequences.reason,
    })
  }

  const harmonies = []
  const parts = []
  let reviewRequired = false

  for (const partSequence of sequences.parts) {
    const result = parsePartMeasureSequence(partSequence)
    harmonies.push(...result.harmonies)
    reviewRequired ||= result.partReviewRequired
    parts.push({
      partId: partSequence.partId,
      partIndex: partSequence.partIndex,
      measureCount: partSequence.measures.length,
      harmonyCount: result.harmonies.length,
    })
  }

  return deepFreeze({
    state: reviewRequired ? HARMONY_PARSE_STATE.REVIEW_REQUIRED : HARMONY_PARSE_STATE.PARSED,
    harmonies,
    parts,
    reason: harmonies.length === 0 ? 'no-harmony-elements' : null,
  })
}

export function parseMusicXmlHarmony(musicXmlString) {
  const security = inspectMusicXml(musicXmlString)
  if (!security.ok) {
    return deepFreeze({
      state: HARMONY_PARSE_STATE.INVALID,
      harmonies: [],
      parts: [],
      reason: 'unsafe-or-invalid-musicxml',
      error: security.message,
    })
  }

  if (typeof DOMParser !== 'function') {
    return deepFreeze({
      state: HARMONY_PARSE_STATE.INVALID,
      harmonies: [],
      parts: [],
      reason: 'dom-parser-unavailable',
    })
  }

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(security.xmlForParsing, 'application/xml')
    if (typeof doc?.querySelector === 'function' && doc.querySelector('parsererror')) {
      return deepFreeze({
        state: HARMONY_PARSE_STATE.INVALID,
        harmonies: [],
        parts: [],
        reason: 'xml-parse-error',
      })
    }
    return extractHarmonyEventsFromDocument(doc)
  } catch {
    return deepFreeze({
      state: HARMONY_PARSE_STATE.INVALID,
      harmonies: [],
      parts: [],
      reason: 'musicxml-harmony-parse-failed',
    })
  }
}
