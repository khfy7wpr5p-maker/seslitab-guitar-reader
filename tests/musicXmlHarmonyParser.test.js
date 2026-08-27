import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  HARMONY_PARSE_STATE,
  HARMONY_TIMING_STATE,
  SUPPORTED_HARMONY_KIND_SUFFIX,
  normalizeHarmonyDescriptor,
  extractHarmonyEventsFromDocument,
  parseMusicXmlHarmony,
} from '../musicXmlHarmonyParser.js'

function el(tagName, { text = null, attrs = {}, children = [] } = {}) {
  return {
    tagName,
    children,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null
    },
    get textContent() {
      if (text != null) return String(text)
      return children.map((child) => child.textContent || '').join('')
    },
  }
}

function documentOf(root) {
  return {
    documentElement: root,
    querySelector() {
      return null
    },
  }
}

function harmony({
  rootStep = 'C',
  rootAlter = null,
  kind = 'major',
  kindText = null,
  bassStep = null,
  bassAlter = null,
  inversion = null,
  staff = null,
  functionText = null,
  offset = null,
  degrees = [],
} = {}) {
  const children = []
  if (rootStep != null) {
    const rootChildren = [el('root-step', { text: rootStep })]
    if (rootAlter != null) rootChildren.push(el('root-alter', { text: rootAlter }))
    children.push(el('root', { children: rootChildren }))
  }
  if (functionText != null) children.push(el('function', { text: functionText }))
  if (kind != null) children.push(el('kind', { text: kind, attrs: kindText == null ? {} : { text: kindText } }))
  if (inversion != null) children.push(el('inversion', { text: inversion }))
  if (bassStep != null || bassAlter != null) {
    const bassChildren = []
    if (bassStep != null) bassChildren.push(el('bass-step', { text: bassStep }))
    if (bassAlter != null) bassChildren.push(el('bass-alter', { text: bassAlter }))
    children.push(el('bass', { children: bassChildren }))
  }
  for (const degree of degrees) {
    children.push(el('degree', {
      attrs: degree.printObject === false ? { 'print-object': 'no' } : {},
      children: [
        el('degree-value', { text: degree.value }),
        el('degree-alter', { text: degree.alter }),
        el('degree-type', { text: degree.type }),
      ],
    }))
  }
  if (offset != null) children.push(el('offset', { text: offset }))
  if (staff != null) children.push(el('staff', { text: staff }))
  return el('harmony', { children })
}

function note(duration = 4, { chord = false, grace = false } = {}) {
  const children = []
  if (chord) children.push(el('chord'))
  if (grace) children.push(el('grace'))
  if (duration != null) children.push(el('duration', { text: duration }))
  return el('note', { children })
}

function attributes(divisions) {
  return el('attributes', {
    children: divisions == null ? [] : [el('divisions', { text: divisions })],
  })
}

function partwiseDoc(parts) {
  return documentOf(el('score-partwise', { children: parts }))
}

function part(id, measures) {
  return el('part', { attrs: { id }, children: measures })
}

function measure(number, children) {
  return el('measure', { attrs: { number: String(number) }, children })
}

test('Package 6A supported chord kinds are immutable and explicit', () => {
  assert.equal(SUPPORTED_HARMONY_KIND_SUFFIX.major, '')
  assert.equal(SUPPORTED_HARMONY_KIND_SUFFIX['minor-seventh'], 'm7')
  assert.equal(SUPPORTED_HARMONY_KIND_SUFFIX['half-diminished'], 'm7b5')
  assert.equal(SUPPORTED_HARMONY_KIND_SUFFIX['suspended-fourth'], 'sus4')
  assert.equal(SUPPORTED_HARMONY_KIND_SUFFIX.none, 'N.C.')
  assert.equal(Object.isFrozen(SUPPORTED_HARMONY_KIND_SUFFIX), true)
})

test('Package 6A normalizes major, minor, seventh and slash chords without inventing notes', () => {
  assert.equal(normalizeHarmonyDescriptor({ rootStep: 'C', kindValue: 'major' }).symbol, 'C')
  assert.equal(normalizeHarmonyDescriptor({ rootStep: 'A', kindValue: 'minor' }).symbol, 'Am')
  assert.equal(normalizeHarmonyDescriptor({ rootStep: 'G', kindValue: 'dominant' }).symbol, 'G7')

  const slash = normalizeHarmonyDescriptor({
    rootStep: 'D',
    rootAlter: 1,
    kindValue: 'minor-seventh',
    bassStep: 'A',
    bassAlter: 1,
  })
  assert.equal(slash.state, HARMONY_PARSE_STATE.PARSED)
  assert.equal(slash.symbol, 'D#m7/A#')
  assert.deepEqual(slash.root, { step: 'D', alter: 1, token: 'D#' })
  assert.deepEqual(slash.bass, { step: 'A', alter: 1, token: 'A#' })
  assert.equal(slash.teacherApproved, false)
})

test('Package 6A preserves MusicXML degree semantics in source order', () => {
  const result = normalizeHarmonyDescriptor({
    rootStep: 'C',
    kindValue: 'dominant',
    degrees: [
      { type: 'alter', value: 5, alter: -1 },
      { type: 'add', value: 9, alter: 0 },
      { type: 'subtract', value: 3, alter: 0 },
    ],
  })

  assert.equal(result.state, HARMONY_PARSE_STATE.PARSED)
  assert.equal(result.symbol, 'C7(b5,add9,no3)')
  assert.deepEqual(result.degrees.map((degree) => degree.token), ['b5', 'add9', 'no3'])
})

test('Package 6A does not invent a slash bass from inversion alone', () => {
  const result = normalizeHarmonyDescriptor({
    rootStep: 'C',
    kindValue: 'major',
    inversion: 1,
  })

  assert.equal(result.state, HARMONY_PARSE_STATE.PARSED)
  assert.equal(result.inversion, 1)
  assert.equal(result.bass, null)
  assert.equal(result.symbol, 'C')
})

test('Package 6A preserves explicit no-chord without inventing a root', () => {
  const result = normalizeHarmonyDescriptor({ kindValue: 'none' })
  assert.equal(result.state, HARMONY_PARSE_STATE.PARSED)
  assert.equal(result.root, null)
  assert.equal(result.symbol, 'N.C.')
})

test('Package 6A unsupported or ambiguous harmony fails closed with no symbol', () => {
  const unknownKind = normalizeHarmonyDescriptor({ rootStep: 'C', kindValue: 'other' })
  assert.equal(unknownKind.state, HARMONY_PARSE_STATE.REVIEW_REQUIRED)
  assert.equal(unknownKind.symbol, null)
  assert.ok(unknownKind.reviewReasons.includes('kind-unsupported'))

  const microtone = normalizeHarmonyDescriptor({ rootStep: 'C', rootAlter: 0.5, kindValue: 'major' })
  assert.equal(microtone.state, HARMONY_PARSE_STATE.REVIEW_REQUIRED)
  assert.equal(microtone.symbol, null)
  assert.ok(microtone.reviewReasons.includes('root-alter-unsupported'))

  const functionHarmony = normalizeHarmonyDescriptor({
    rootStep: 'C',
    kindValue: 'major',
    functionText: 'V',
  })
  assert.equal(functionHarmony.state, HARMONY_PARSE_STATE.REVIEW_REQUIRED)
  assert.equal(functionHarmony.symbol, null)
  assert.ok(functionHarmony.reviewReasons.includes('functional-harmony-unsupported'))
})

test('Package 6A malformed degree evidence fails closed instead of returning a partial symbol', () => {
  const result = normalizeHarmonyDescriptor({
    rootStep: 'G',
    kindValue: 'dominant',
    degrees: [{ type: 'alter', value: 15, alter: -1 }],
  })
  assert.equal(result.state, HARMONY_PARSE_STATE.REVIEW_REQUIRED)
  assert.equal(result.symbol, null)
  assert.ok(result.reviewReasons.some((reason) => reason.includes('degree-value-unsupported')))
})

test('Package 6A output is deterministic, deeply frozen and source-only', () => {
  const input = {
    rootStep: 'F',
    rootAlter: 1,
    kindValue: 'major-seventh',
    bassStep: 'C',
    degrees: [{ type: 'add', value: 9, alter: 0 }],
  }
  const before = structuredClone(input)
  const first = normalizeHarmonyDescriptor(input)
  const second = normalizeHarmonyDescriptor(input)
  assert.deepEqual(first, second)
  assert.deepEqual(input, before)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.root), true)
  assert.equal(Object.isFrozen(first.degrees), true)
  assert.equal(Object.isFrozen(first.degrees[0]), true)
  assert.equal(first.provenance, 'musicxml-harmony-source')
  assert.equal(first.teacherApproved, false)
})

test('Package 6B source-order extraction preserves physical measure identity and timing', () => {
  const doc = partwiseDoc([
    part('P1', [
      measure(1, [
        attributes(4),
        harmony({ rootStep: 'C', kind: 'major' }),
        note(4),
        harmony({ rootStep: 'G', kind: 'dominant', offset: 2 }),
        note(4),
      ]),
      measure(1, [
        harmony({ rootStep: 'A', kind: 'minor' }),
      ]),
    ]),
  ])

  const result = extractHarmonyEventsFromDocument(doc)
  assert.equal(result.state, HARMONY_PARSE_STATE.PARSED)
  assert.equal(result.harmonies.length, 3)
  assert.deepEqual(
    result.harmonies.map(({ symbol, measureKey, measureIndex, measureNumber, startDivisions, startBeat }) => ({
      symbol, measureKey, measureIndex, measureNumber, startDivisions, startBeat,
    })),
    [
      { symbol: 'C', measureKey: 'P1:0', measureIndex: 0, measureNumber: 1, startDivisions: 0, startBeat: 0 },
      { symbol: 'G7', measureKey: 'P1:0', measureIndex: 0, measureNumber: 1, startDivisions: 6, startBeat: 1.5 },
      { symbol: 'Am', measureKey: 'P1:1', measureIndex: 1, measureNumber: 1, startDivisions: 0, startBeat: 0 },
    ],
  )
})

test('Package 6B chord and grace notes do not advance harmony cursor', () => {
  const doc = partwiseDoc([
    part('P1', [
      measure(1, [
        attributes(4),
        note(4),
        note(4, { chord: true }),
        note(null, { grace: true }),
        harmony({ rootStep: 'F', kind: 'major' }),
      ]),
    ]),
  ])
  const result = extractHarmonyEventsFromDocument(doc)
  assert.equal(result.harmonies[0].startDivisions, 4)
  assert.equal(result.harmonies[0].startBeat, 1)
})

test('Package 6B backup and forward timing follows MusicXML source order', () => {
  const doc = partwiseDoc([
    part('P1', [
      measure(1, [
        attributes(4),
        note(8),
        el('backup', { children: [el('duration', { text: 4 })] }),
        harmony({ rootStep: 'D', kind: 'minor' }),
        el('forward', { children: [el('duration', { text: 2 })] }),
        harmony({ rootStep: 'E', kind: 'minor' }),
      ]),
    ]),
  ])
  const result = extractHarmonyEventsFromDocument(doc)
  assert.deepEqual(result.harmonies.map((entry) => entry.startBeat), [1, 1.5])
})

test('Package 6B missing divisions preserves harmony semantics but marks timing for review', () => {
  const doc = partwiseDoc([
    part('P1', [measure(1, [harmony({ rootStep: 'C', kind: 'major' })])]),
  ])
  const result = extractHarmonyEventsFromDocument(doc)
  assert.equal(result.state, HARMONY_PARSE_STATE.REVIEW_REQUIRED)
  assert.equal(result.harmonies[0].symbol, 'C')
  assert.equal(result.harmonies[0].startBeat, null)
  assert.equal(result.harmonies[0].timingState, HARMONY_TIMING_STATE.REVIEW_REQUIRED)
})

test('Package 6B invalid timeline manipulation never fabricates later harmony onset', () => {
  const doc = partwiseDoc([
    part('P1', [
      measure(1, [
        attributes(4),
        el('backup', { children: [el('duration', { text: 4 })] }),
        harmony({ rootStep: 'C', kind: 'major' }),
      ]),
    ]),
  ])
  const result = extractHarmonyEventsFromDocument(doc)
  assert.equal(result.state, HARMONY_PARSE_STATE.REVIEW_REQUIRED)
  assert.equal(result.harmonies[0].startDivisions, null)
  assert.equal(result.harmonies[0].startBeat, null)
})

test('Package 6B parses score-timewise into stable per-part physical measure identities', () => {
  const root = el('score-timewise', {
    children: [
      el('measure', {
        attrs: { number: '1' },
        children: [
          el('part', { attrs: { id: 'P1' }, children: [attributes(4), harmony({ rootStep: 'C', kind: 'major' })] }),
          el('part', { attrs: { id: 'P2' }, children: [attributes(2), harmony({ rootStep: 'F', kind: 'major' })] }),
        ],
      }),
      el('measure', {
        attrs: { number: '2' },
        children: [
          el('part', { attrs: { id: 'P1' }, children: [harmony({ rootStep: 'G', kind: 'dominant' })] }),
          el('part', { attrs: { id: 'P2' }, children: [harmony({ rootStep: 'C', kind: 'major' })] }),
        ],
      }),
    ],
  })
  const result = extractHarmonyEventsFromDocument(documentOf(root))
  assert.equal(result.state, HARMONY_PARSE_STATE.PARSED)
  assert.deepEqual(result.parts, [
    { partId: 'P1', partIndex: 0, measureCount: 2, harmonyCount: 2 },
    { partId: 'P2', partIndex: 1, measureCount: 2, harmonyCount: 2 },
  ])
  assert.deepEqual(result.harmonies.map((item) => item.measureKey), ['P1:0', 'P1:1', 'P2:0', 'P2:1'])
})

test('Package 6C harmony element attributes and degrees normalize without presentation/TTS coupling', () => {
  const doc = partwiseDoc([
    part('P1', [
      measure(8, [
        attributes(4),
        harmony({
          rootStep: 'B',
          rootAlter: -1,
          kind: 'major-seventh',
          kindText: 'maj7',
          bassStep: 'D',
          bassAlter: 1,
          inversion: 1,
          staff: 2,
          degrees: [
            { type: 'add', value: 9, alter: 0 },
            { type: 'alter', value: 11, alter: 1, printObject: false },
          ],
        }),
      ]),
    ]),
  ])
  const event = extractHarmonyEventsFromDocument(doc).harmonies[0]
  assert.equal(event.symbol, 'Bbmaj7(add9)/D#')
  assert.equal(event.kind.text, 'maj7')
  assert.equal(event.inversion, 1)
  assert.equal(event.staff, 2)
  assert.equal(event.degrees[1].printObject, false)
  assert.equal(event.degrees[1].token, null)
})

test('Package 6C unsupported functional harmony remains review-required with zero finalized symbol bytes', () => {
  const doc = partwiseDoc([
    part('P1', [
      measure(1, [
        attributes(4),
        harmony({ rootStep: 'G', kind: 'major', functionText: 'V' }),
      ]),
    ]),
  ])
  const result = extractHarmonyEventsFromDocument(doc)
  assert.equal(result.state, HARMONY_PARSE_STATE.REVIEW_REQUIRED)
  assert.equal(result.harmonies[0].state, HARMONY_PARSE_STATE.REVIEW_REQUIRED)
  assert.equal(result.harmonies[0].symbol, null)
})

test('Package 6D raw MusicXML wrapper applies shared security before DOM parsing', () => {
  const original = globalThis.DOMParser
  let called = false
  globalThis.DOMParser = class {
    parseFromString() {
      called = true
      throw new Error('must not execute')
    }
  }
  try {
    const unsafe = '<!DOCTYPE score-partwise [<!ENTITY x SYSTEM "file:///etc/passwd">]><score-partwise>&x;</score-partwise>'
    const result = parseMusicXmlHarmony(unsafe)
    assert.equal(result.state, HARMONY_PARSE_STATE.INVALID)
    assert.equal(result.reason, 'unsafe-or-invalid-musicxml')
    assert.equal(called, false)
  } finally {
    globalThis.DOMParser = original
  }
})

test('Package 6D raw MusicXML wrapper returns extracted harmony through DOMParser boundary', () => {
  const fakeDoc = partwiseDoc([
    part('P1', [measure(1, [attributes(4), harmony({ rootStep: 'C', kind: 'major' })])]),
  ])
  const original = globalThis.DOMParser
  globalThis.DOMParser = class {
    parseFromString() {
      return fakeDoc
    }
  }
  try {
    const xml = '<?xml version="1.0"?><score-partwise version="4.0"><part-list></part-list><part id="P1"><measure number="1"></measure></part></score-partwise>'
    const result = parseMusicXmlHarmony(xml)
    assert.equal(result.state, HARMONY_PARSE_STATE.PARSED)
    assert.equal(result.harmonies[0].symbol, 'C')
    assert.equal(result.harmonies[0].measureKey, 'P1:0')
  } finally {
    globalThis.DOMParser = original
  }
})

test('Package 6D empty harmony source remains a valid empty result and never invents chords', () => {
  const result = extractHarmonyEventsFromDocument(partwiseDoc([
    part('P1', [measure(1, [attributes(4), note(4)])]),
  ]))
  assert.equal(result.state, HARMONY_PARSE_STATE.PARSED)
  assert.deepEqual(result.harmonies, [])
  assert.equal(result.reason, 'no-harmony-elements')
})

test('Package 6D parser result is deterministic, deeply frozen and does not mutate document input', () => {
  const sourceDoc = partwiseDoc([
    part('P1', [measure(1, [attributes(4), harmony({ rootStep: 'F', kind: 'minor-seventh' })])]),
  ])
  const first = extractHarmonyEventsFromDocument(sourceDoc)
  const second = extractHarmonyEventsFromDocument(sourceDoc)
  assert.deepEqual(first, second)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.harmonies), true)
  assert.equal(Object.isFrozen(first.harmonies[0]), true)
  assert.equal(Object.isFrozen(first.harmonies[0].kind), true)
})

test('Package 6D source stays isolated from OMR, quality-gate, UI and TTS production boundaries', async () => {
  const source = await readFile(new URL('../musicXmlHarmonyParser.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /AudiverisProvider|omrWorker|omrProvider|gatewayProvider|omrService/)
  assert.doesNotMatch(source, /qualityGateIntegration|canonicalConsumerBindings/)
  assert.doesNotMatch(source, /package[345]Ui|speechSynthesis|generateTurkish|innerHTML/)
  assert.doesNotMatch(source, /node:fs|writeFile|appendFile|createWriteStream/)
})
