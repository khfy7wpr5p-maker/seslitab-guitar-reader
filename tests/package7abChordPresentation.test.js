import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  HARMONY_PARSE_STATE,
  HARMONY_TIMING_STATE,
  normalizeHarmonyDescriptor,
} from '../musicXmlHarmonyParser.js'
import {
  CHORD_PRESENTATION_STATE,
  TURKISH_KIND_NAMES,
  TURKISH_PITCH_NAMES,
  buildChordPresentationModel,
  chordPresentationInternals,
} from '../src/services/chordPresentation.js'

function eventFromDescriptor(descriptor, overrides = {}) {
  const divisions = overrides.divisions ?? 4
  const startBeat = overrides.startBeat ?? 0
  const startDivisions = overrides.startDivisions ?? (startBeat * divisions)
  return Object.freeze({
    ...descriptor,
    partId: 'P1',
    partIndex: 0,
    measureNumber: 1,
    measureNumberText: '1',
    measureIndex: 0,
    measureKey: 'P1:0',
    sequenceIndex: 0,
    divisions,
    offsetDivisions: 0,
    startDivisions,
    startBeat,
    timingState: HARMONY_TIMING_STATE.MEASURED,
    ...overrides,
  })
}

function parseResult(harmonies, state = HARMONY_PARSE_STATE.PARSED) {
  return Object.freeze({ state, harmonies: Object.freeze(harmonies), parts: Object.freeze([]) })
}

function readyEvent(descriptor, overrides = {}) {
  return eventFromDescriptor(normalizeHarmonyDescriptor(descriptor), overrides)
}

test('Package 7A Turkish pitch and kind vocabularies are explicit and immutable', () => {
  assert.equal(TURKISH_PITCH_NAMES.C, 'Do')
  assert.equal(TURKISH_PITCH_NAMES.B, 'Si')
  assert.equal(TURKISH_KIND_NAMES.major, 'majör')
  assert.equal(TURKISH_KIND_NAMES['minor-seventh'], 'minör yedi')
  assert.equal(TURKISH_KIND_NAMES['suspended-fourth'], 'sus dört')
  assert.equal(Object.isFrozen(TURKISH_PITCH_NAMES), true)
  assert.equal(Object.isFrozen(TURKISH_KIND_NAMES), true)
})

test('Package 7A presents C major from structured Package 6 evidence', () => {
  const model = buildChordPresentationModel(parseResult([
    readyEvent({ rootStep: 'C', kindValue: 'major' }),
  ]))

  assert.equal(model.state, CHORD_PRESENTATION_STATE.READY)
  assert.equal(model.items.length, 1)
  assert.equal(model.items[0].symbol, 'C')
  assert.equal(model.displayText, 'Ölçü 1, ölçü başlangıcı: C')
  assert.equal(model.spokenText, 'Ölçü 1, ölçü başlangıcı, kaynak akor işareti: Do majör akoru.')
  assert.equal(model.teacherApproved, false)
})

test('Package 7B pronounces minor, dominant seventh and supported accidentals deterministically', () => {
  const events = [
    readyEvent({ rootStep: 'A', kindValue: 'minor' }, { sequenceIndex: 0 }),
    readyEvent({ rootStep: 'G', kindValue: 'dominant' }, { sequenceIndex: 1, startBeat: 1 }),
    readyEvent({ rootStep: 'F', rootAlter: -1, kindValue: 'major' }, { sequenceIndex: 2, startBeat: 2 }),
  ]
  const model = buildChordPresentationModel(parseResult(events))

  assert.equal(model.state, CHORD_PRESENTATION_STATE.READY)
  assert.match(model.spokenText, /La minör akoru/)
  assert.match(model.spokenText, /Sol dominant yedi akoru/)
  assert.match(model.spokenText, /Fa bemol majör akoru/)
  assert.match(model.displayText, /ölçü başlangıcından 1 vuruş sonra: G7/)
})

test('Package 7B pronounces explicit slash bass but does not add inversion-only speech absent from the symbol', () => {
  const slash = readyEvent({
    rootStep: 'D',
    rootAlter: 1,
    kindValue: 'minor-seventh',
    bassStep: 'A',
    bassAlter: 1,
  })
  const inversionOnly = readyEvent({
    rootStep: 'C',
    kindValue: 'major',
    inversion: 1,
  }, { sequenceIndex: 1, startBeat: 1 })

  const model = buildChordPresentationModel(parseResult([slash, inversionOnly]))
  assert.equal(model.state, CHORD_PRESENTATION_STATE.READY)
  assert.match(model.spokenText, /Re diyez minör yedi akoru, bas La diyez/)
  assert.match(model.spokenText, /Do majör akoru/)
  assert.doesNotMatch(model.spokenText, /çevrim/)
  assert.doesNotMatch(model.items[1].displayText, /\//)
})

test('Package 7B preserves visible degree semantics from structured fields instead of parsing symbol text', () => {
  const event = readyEvent({
    rootStep: 'C',
    kindValue: 'dominant',
    degrees: [
      { type: 'alter', value: 5, alter: -1 },
      { type: 'add', value: 9, alter: 0 },
      { type: 'subtract', value: 3, alter: 0 },
    ],
  })
  const model = buildChordPresentationModel(parseResult([event]))

  assert.equal(event.symbol, 'C7(b5,add9,no3)')
  assert.match(model.spokenText, /bemol beş/)
  assert.match(model.spokenText, /dokuz eklendi/)
  assert.match(model.spokenText, /üç çıkarıldı/)
})

test('Package 7B does not speak a degree hidden by MusicXML print-object=no', () => {
  const event = readyEvent({
    rootStep: 'C',
    kindValue: 'dominant',
    degrees: [{ type: 'add', value: 9, alter: 0, printObject: false }],
  })
  const model = buildChordPresentationModel(parseResult([event]))
  assert.equal(event.symbol, 'C7')
  assert.match(model.spokenText, /Do dominant yedi akoru/)
  assert.doesNotMatch(model.spokenText, /dokuz eklendi/)
})

test('Package 7A presents explicit no-chord as source evidence without inventing a root', () => {
  const model = buildChordPresentationModel(parseResult([
    readyEvent({ kindValue: 'none' }),
  ]))
  assert.equal(model.state, CHORD_PRESENTATION_STATE.READY)
  assert.equal(model.displayText, 'Ölçü 1, ölçü başlangıcı: N.C.')
  assert.match(model.spokenText, /akor yok/)
  assert.doesNotMatch(model.spokenText, /Do|Re|Mi|Fa|Sol|La|Si/)
})

test('Package 7A preserves physical measure order and exact measureKey per item', () => {
  const first = readyEvent({ rootStep: 'C', kindValue: 'major' })
  const second = readyEvent({ rootStep: 'F', kindValue: 'major' }, {
    measureNumber: 1,
    measureNumberText: '1',
    measureIndex: 1,
    measureKey: 'P1:1',
    sequenceIndex: 0,
  })
  const model = buildChordPresentationModel(parseResult([first, second]))

  assert.equal(model.items[0].measureKey, 'P1:0')
  assert.equal(model.items[1].measureKey, 'P1:1')
  assert.match(model.items[0].displayText, /^Ölçü 1,/)
  assert.match(model.items[1].displayText, /^Ölçü 2,/)
})

test('Package 7A fractional timing is exposed as source-relative timing, not a guessed beat number', () => {
  const event = readyEvent({ rootStep: 'G', kindValue: 'dominant' }, { startBeat: 1.5 })
  const model = buildChordPresentationModel(parseResult([event]))
  assert.match(model.displayText, /ölçü başlangıcından 1,5 vuruş sonra/)
  assert.match(model.spokenText, /ölçü başlangıcından 1,5 vuruş sonra/)
})

test('Package 7A aggregate REVIEW_REQUIRED emits no partial display or speech bytes', () => {
  const good = readyEvent({ rootStep: 'C', kindValue: 'major' })
  const model = buildChordPresentationModel(parseResult([good], HARMONY_PARSE_STATE.REVIEW_REQUIRED))

  assert.equal(model.state, CHORD_PRESENTATION_STATE.REVIEW_REQUIRED)
  assert.equal(model.items.length, 0)
  assert.equal(model.displayText, '')
  assert.equal(model.spokenText, '')
})

test('Package 7A INVALID and malformed top-level input emit no chord output', () => {
  const invalid = buildChordPresentationModel(parseResult([], HARMONY_PARSE_STATE.INVALID))
  const malformed = buildChordPresentationModel(null)
  for (const model of [invalid, malformed]) {
    assert.equal(model.state, CHORD_PRESENTATION_STATE.INVALID)
    assert.equal(model.displayText, '')
    assert.equal(model.spokenText, '')
  }
})

test('Package 7A valid empty harmony source remains EMPTY and invents no chord', () => {
  const model = buildChordPresentationModel(parseResult([]))
  assert.equal(model.state, CHORD_PRESENTATION_STATE.EMPTY)
  assert.equal(model.items.length, 0)
  assert.equal(model.displayText, '')
  assert.equal(model.spokenText, '')
})

test('Package 7A contradictory physical identity fails closed without partial presentation', () => {
  const bad = readyEvent({ rootStep: 'C', kindValue: 'major' }, { measureKey: 'P1:9' })
  const model = buildChordPresentationModel(parseResult([bad]))
  assert.equal(model.state, CHORD_PRESENTATION_STATE.INVALID)
  assert.equal(model.items.length, 0)
})

test('Package 7A contradictory pitch token, symbol, or teacher approval fails closed', () => {
  const base = readyEvent({ rootStep: 'D', rootAlter: 1, kindValue: 'major' })
  const badToken = Object.freeze({ ...base, root: Object.freeze({ ...base.root, token: 'Db' }) })
  const badSymbol = Object.freeze({ ...base, symbol: 'Eb' })
  const approved = Object.freeze({ ...base, teacherApproved: true })

  for (const event of [badToken, badSymbol, approved]) {
    const model = buildChordPresentationModel(parseResult([event]))
    assert.equal(model.state, CHORD_PRESENTATION_STATE.INVALID)
    assert.equal(model.spokenText, '')
  }
})

test('Package 7A inconsistent aggregate timing evidence fails closed', () => {
  const event = readyEvent({ rootStep: 'C', kindValue: 'major' }, {
    timingState: HARMONY_TIMING_STATE.REVIEW_REQUIRED,
    startBeat: null,
  })
  const model = buildChordPresentationModel(parseResult([event]))
  assert.equal(model.state, CHORD_PRESENTATION_STATE.INVALID)
  assert.equal(model.displayText, '')
})

test('Package 7A output is deterministic, deeply frozen and never mutates Package 6 input', () => {
  const event = readyEvent({ rootStep: 'C', kindValue: 'major' })
  const source = parseResult([event])
  const before = JSON.stringify(source)
  const a = buildChordPresentationModel(source)
  const b = buildChordPresentationModel(source)

  assert.deepEqual(a, b)
  assert.equal(JSON.stringify(source), before)
  assert.equal(Object.isFrozen(a), true)
  assert.equal(Object.isFrozen(a.items), true)
  assert.equal(Object.isFrozen(a.items[0]), true)
})

test('Package 7B structured pronunciation helpers reject unsupported evidence', () => {
  assert.equal(chordPresentationInternals.pitchSpeech({ step: 'H', alter: 0, token: 'H' }), null)
  assert.equal(chordPresentationInternals.degreeSpeech({ type: 'subtract', value: 3, alter: 1 }), null)
  assert.equal(chordPresentationInternals.timingSpeech(-1), null)
})

test('Package 7A/B source remains pure and does not activate UI, TTS, OMR, gateway, worker or network', async () => {
  const source = await readFile(new URL('../src/services/chordPresentation.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /voiceService|SpeechSynthesis|speechSynthesis/)
  assert.doesNotMatch(source, /Audiveris|omrService|gateway|worker/i)
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket/)
  assert.doesNotMatch(source, /document\.|window\./)
})
