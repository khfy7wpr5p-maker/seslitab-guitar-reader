import test from 'node:test'
import assert from 'node:assert/strict'
import '../scripts/runOmrQualityReport.js'
import { createSmoosicPaddingRestTracker } from '../experiments/smoosic-mobile/src/seslitab-padding-rest-provenance.js'

const pitched = (id, tickCount = 8) => ({ attrs: { id }, noteType: 'n', tickCount })
const sourceRest = (id, tickCount = 8) => ({ attrs: { id }, noteType: 'r', hidden: true, tickCount })
const xml = (notes) => `<score-partwise><part id="P1"><measure number="1">${notes.map((note) => `<note>${note.rest ? '<rest/>' : '<pitch><step>C</step><octave>4</octave></pitch>'}<duration>${note.duration ?? 8}</duration><voice>${note.voice ?? 1}</voice></note>`).join('')}</measure></part></score-partwise>`
const scoreOf = (...voices) => ({ staves: [{ partInfo: { stavesBefore: 0, stavesAfter: 0 }, measures: [{ voices: voices.map((notes) => ({ notes })) }] }] })
const factory = () => ({ createRestNoteWithDuration(duration) { return sourceRest(`pad-${duration}`, duration) } })
const manifest = (tracker, score, notes) => tracker.createExportManifest({ score, rawMusicXml: xml(notes), sourceRevision: 7 })

test('only factory objects created inside the import scope are certified, not authored or teacher rests', () => {
  const measure = factory()
  const original = measure.createRestNoteWithDuration
  const tracker = createSmoosicPaddingRestTracker(measure)
  const authored = sourceRest('authored')
  const before = measure.createRestNoteWithDuration(8)
  let generated
  const score = tracker.runDuringImport(() => {
    generated = measure.createRestNoteWithDuration(16)
    return scoreOf([pitched('pitch'), authored, generated])
  })
  const teacher = measure.createRestNoteWithDuration(8)
  assert.equal(measure.createRestNoteWithDuration, original)
  assert.equal(Object.getOwnPropertySymbols(authored).length, 0)
  assert.equal(Object.getOwnPropertySymbols(teacher).length, 0)
  assert.deepEqual(manifest(tracker, score, [
    { rest: false }, { rest: true }, { rest: true, duration: 16 },
  ]), {
    version: 1, sourceRevision: 7, rawNoteCount: 3,
    entries: [{ staffIndex: 0, measureIndex: 0, voiceIndex: 0, noteIndex: 2, rawNoteOrdinal: 2, noteIdentity: generated.attrs.id, durationTicks: 16 }],
  })
  assert.ok(Object.isFrozen(manifest(tracker, score, [{ rest: false }, { rest: true }, { rest: true, duration: 16 }]).entries[0]))
  assert.throws(() => manifest(tracker, scoreOf([before, teacher]), [{ rest: true }, { rest: true }]), /score|identity|locator/i)
})

test('manifest retains the numeric request revision and rejects non-protocol revisions', () => {
  const measure = factory()
  const tracker = createSmoosicPaddingRestTracker(measure)
  const score = tracker.runDuringImport(() => scoreOf([measure.createRestNoteWithDuration(8)]))
  assert.equal(manifest(tracker, score, [{ rest: true }]).sourceRevision, 7)
  for (const sourceRevision of ['7', -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => tracker.createExportManifest({ score, rawMusicXml: xml([{ rest: true }]), sourceRevision }), /source revision/i)
  }
})

test('factory is restored on conversion failure and a later import replaces the old registry', () => {
  const measure = factory()
  const original = measure.createRestNoteWithDuration
  const tracker = createSmoosicPaddingRestTracker(measure)
  const first = tracker.runDuringImport(() => scoreOf([measure.createRestNoteWithDuration(8)]))
  assert.throws(() => tracker.runDuringImport(() => { measure.createRestNoteWithDuration(8); throw new Error('bad import') }), /bad import/)
  assert.equal(measure.createRestNoteWithDuration, original)
  assert.throws(() => manifest(tracker, first, [{ rest: true }]), /score|import|registry/i)
  let secondPad
  const second = tracker.runDuringImport(() => {
    secondPad = measure.createRestNoteWithDuration(16)
    return scoreOf([secondPad])
  })
  assert.deepEqual(manifest(tracker, second, [{ rest: true, duration: 16 }]).entries.map((entry) => entry.rawNoteOrdinal), [0])
  assert.throws(() => manifest(tracker, first, [{ rest: true }]), /score|import|registry/i)
  tracker.clear()
  assert.throws(() => manifest(tracker, second, [{ rest: true, duration: 16 }]), /score|import|registry/i)
})

test('rejects duplicate identities, missing locators, and changed identity or duration', () => {
  const measure = factory()
  const tracker = createSmoosicPaddingRestTracker(measure)
  let a, b
  const score = tracker.runDuringImport(() => {
    a = measure.createRestNoteWithDuration(8)
    b = measure.createRestNoteWithDuration(8)
    return scoreOf([a, b])
  })
  assert.throws(() => manifest(tracker, score, [{ rest: true }, { rest: true }]), /duplicate|identity/i)
  b.attrs.id = 'pad-unique'
  assert.throws(() => manifest(tracker, score, [{ rest: true }, { rest: true }]), /identity/i)

  const next = tracker.runDuringImport(() => scoreOf([measure.createRestNoteWithDuration(8)]))
  const note = next.staves[0].measures[0].voices[0].notes[0]
  note.tickCount = 16
  assert.throws(() => manifest(tracker, next, [{ rest: true, duration: 16 }]), /duration/i)
  note.tickCount = 8
  next.staves[0].measures[0].voices[0].notes = []
  assert.throws(() => manifest(tracker, next, []), /locator|missing|identity|count/i)
})

test('maps two marked objects to sorted raw ordinals while retaining source and pitched notes', () => {
  const measure = factory()
  let left, right
  const tracker = createSmoosicPaddingRestTracker(measure)
  const score = tracker.runDuringImport(() => {
    left = measure.createRestNoteWithDuration(8)
    right = measure.createRestNoteWithDuration(16)
    return scoreOf([pitched('one'), sourceRest('authored'), right], [pitched('two'), left])
  })
  const raw = [
    { rest: false }, { rest: true }, { rest: true, duration: 16 },
    { rest: false, voice: 2 }, { rest: true, voice: 2 },
  ]
  const proof = manifest(tracker, score, raw)
  assert.deepEqual(proof.entries.map((entry) => entry.rawNoteOrdinal), [2, 4])
  assert.deepEqual(proof.entries.map((entry) => [entry.voiceIndex, entry.noteIndex]), [[0, 2], [1, 1]])
  assert.equal(proof.rawNoteCount, 5)
  assert.ok(Object.isFrozen(proof) && Object.isFrozen(proof.entries))
  assert.throws(() => manifest(tracker, score, raw.slice(1)), /count/i)
  assert.throws(() => manifest(tracker, score, [raw[0], raw[1], raw[3], raw[2], raw[4]]), /order|rest|duration/i)
  score.staves[0].measures[0].voices[0].notes[2] = sourceRest('replacement', 16)
  assert.throws(() => manifest(tracker, score, raw), /identity|locator|missing/i)
})
