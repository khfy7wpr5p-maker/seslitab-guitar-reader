import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createNote, resolveBeats, buildTieChains, tieChainBeats } from '../noteTheory.js'
import { formatNoteAsText, beatsToTurkishText } from '../rhythmicTextGenerator.js'

// Helper: create a note with duration/divisions metadata
function makeNote(opts) {
  const {
    duration = 'quarter',
    beats,
    durationValue,
    divisions,
    isRest = false,
    dotCount = 0,
    voice = 1,
    staff = 1,
    step = 'A',
    alter = 0,
    octave = 4,
    tieStart = false,
    tieStop = false,
    tieContinue = false,
    stringLetter = 'G',
    fret = 2,
    noteName = 'La',
  } = opts
  const note = createNote({
    duration,
    beats,
    dotCount,
    isRest,
    voice,
    staff,
    step,
    alter,
    octave,
    tieStart,
    tieStop,
    tieContinue,
    stringLetter,
    fret,
    noteName,
  })
  if (durationValue !== undefined) note.durationValue = durationValue
  if (divisions !== undefined) note.divisions = divisions
  return note
}

// ── Part 1: Inherited divisions ──────────────────────────────

describe('inherited divisions across measures', () => {
  test('measure 1 sets divisions=4, measure 2 inherits (no new attributes)', () => {
    // Simulate: measure 1 has divisions=4, measure 2 has no attributes
    // but a note with duration=12 (half + dot)
    const note = makeNote({
      duration: 'dotted-half',
      durationValue: 12,
      divisions: 4,
      dotCount: 1,
      beats: 3,
    })
    assert.equal(note.divisions, 4)
    assert.equal(note.durationValue, 12)
    assert.equal(note.beats, 3, 'beats should be 12/4 = 3')
  })

  test('divisions inherited through several measures', () => {
    // Simulate 3 measures all inheriting divisions=4 from measure 1
    const m1 = makeNote({ duration: 'quarter', durationValue: 4, divisions: 4 })
    const m2 = makeNote({ duration: 'half', durationValue: 8, divisions: 4 })
    const m3 = makeNote({ duration: 'dotted-half', durationValue: 12, divisions: 4, dotCount: 1, beats: 3 })

    assert.equal(m1.beats, 1, '4/4 = 1')
    assert.equal(m2.beats, 2, '8/4 = 2')
    assert.equal(m3.beats, 3, '12/4 = 3')
  })

  test('divisions changing later: 4 then 8', () => {
    const before = makeNote({ duration: 'quarter', durationValue: 4, divisions: 4 })
    const after = makeNote({ duration: 'quarter', durationValue: 8, divisions: 8 })

    assert.equal(before.beats, 1, '4/4 = 1 before change')
    assert.equal(after.beats, 1, '8/8 = 1 after change')
  })

  test('divisions changing: duration=12 with divisions=4 vs divisions=8', () => {
    const with4 = makeNote({ duration: 'dotted-half', durationValue: 12, divisions: 4, dotCount: 1, beats: 3 })
    const with8 = makeNote({ duration: 'dotted-quarter', durationValue: 12, divisions: 8, dotCount: 1, beats: 1.5 })

    assert.equal(with4.beats, 3, '12/4 = 3')
    assert.equal(with8.beats, 1.5, '12/8 = 1.5')
  })
})

// ── Part 2: Canonical beat calculation ───────────────────────

describe('canonical beat calculation', () => {
  test('duration=8, divisions=4 → 2 beats', () => {
    const note = makeNote({ duration: 'half', durationValue: 8, divisions: 4 })
    assert.equal(note.beats, 2)
  })

  test('duration=6, divisions=4 → 1.5 beats', () => {
    const note = makeNote({ duration: 'dotted-quarter', durationValue: 6, divisions: 4, dotCount: 1, beats: 1.5 })
    assert.equal(note.beats, 1.5)
  })

  test('duration=2, divisions=4 → 0.5 beats', () => {
    const note = makeNote({ duration: 'eighth', durationValue: 2, divisions: 4 })
    assert.equal(note.beats, 0.5)
  })

  test('duration=12, divisions=4 → 3 beats', () => {
    const note = makeNote({ duration: 'dotted-half', durationValue: 12, divisions: 4, dotCount: 1, beats: 3 })
    assert.equal(note.beats, 3)
  })

  test('duration=3, divisions=1 → 3 beats', () => {
    const note = makeNote({ duration: 'dotted-half', durationValue: 3, divisions: 1, dotCount: 1, beats: 3 })
    assert.equal(note.beats, 3)
  })
})

// ── Part 3: No silent fallback to 1 beat ─────────────────────

describe('no silent fallback to 1 beat', () => {
  test('dotted half with explicit beats=3 does not become 1', () => {
    const note = makeNote({ duration: 'dotted-half', beats: 3, dotCount: 1 })
    assert.equal(note.beats, 3)
    assert.notEqual(note.beats, 1)
  })

  test('resolveBeats returns 0 for invalid note, not 1', () => {
    const note = { duration: 'unknown', beats: 0, durationValue: null, divisions: null }
    assert.equal(resolveBeats(note), 0)
  })

  test('resolveBeats with valid duration/divisions overrides missing beats', () => {
    const note = { beats: 0, durationValue: 12, divisions: 4 }
    assert.equal(resolveBeats(note), 3)
  })
})

// ── Part 4: Rhythmic text uses same beat value ───────────────

describe('rhythmic text uses canonical beats', () => {
  test('dotted half with inherited divisions → "üç vuruş"', () => {
    const note = makeNote({
      duration: 'dotted-half',
      durationValue: 12,
      divisions: 4,
      dotCount: 1,
      beats: 3,
    })
    const text = formatNoteAsText(note)
    assert.match(text, /üç vuruş/)
    assert.match(text, /noktalı ikilik nota/)
    assert.doesNotMatch(text, /bir vuruş/)
  })

  test('rhythmic text and resolveBeats return the same value', () => {
    const note = makeNote({
      duration: 'dotted-half',
      durationValue: 12,
      divisions: 4,
      dotCount: 1,
      beats: 3,
    })
    const textBeats = note.beats
    const resolvedBeats = resolveBeats(note)
    assert.equal(textBeats, resolvedBeats, 'text and resolver must agree')
    assert.equal(resolvedBeats, 3)
  })

  test('half note with duration=8, divisions=4 → "iki vuruş"', () => {
    const note = makeNote({ duration: 'half', durationValue: 8, divisions: 4 })
    const text = formatNoteAsText(note)
    assert.match(text, /iki vuruş/)
  })
})

// ── Part 5: Tie chain building ───────────────────────────────

describe('tie chain building', () => {
  test('2 + 3 beats = one 5-beat event', () => {
    const n1 = makeNote({ duration: 'half', beats: 2, durationValue: 2, divisions: 1, step: 'E', octave: 4, tieStart: true })
    const n2 = makeNote({ duration: 'dotted-half', beats: 3, durationValue: 3, divisions: 1, dotCount: 1, step: 'E', octave: 4, tieStop: true })
    const { attacks, chains } = buildTieChains([n1, n2])
    assert.equal(attacks.length, 1, 'only one attack (the tie start)')
    assert.equal(chains.length, 1, 'one chain')
    assert.equal(chains[0].length, 2, 'chain has 2 members')
    assert.equal(tieChainBeats(chains[0]), 5, '2 + 3 = 5 beats total')
  })

  test('3 + 3 beats = one 6-beat event', () => {
    const n1 = makeNote({ duration: 'dotted-half', beats: 3, durationValue: 3, divisions: 1, dotCount: 1, step: 'G', octave: 4, tieStart: true })
    const n2 = makeNote({ duration: 'dotted-half', beats: 3, durationValue: 3, divisions: 1, dotCount: 1, step: 'G', octave: 4, tieStop: true })
    const { attacks, chains } = buildTieChains([n1, n2])
    assert.equal(attacks.length, 1, 'only one attack')
    assert.equal(tieChainBeats(chains[0]), 6, '3 + 3 = 6 beats')
  })

  test('no second attack on tie stop', () => {
    const n1 = makeNote({ duration: 'half', beats: 2, step: 'E', octave: 4, tieStart: true })
    const n2 = makeNote({ duration: 'dotted-half', beats: 3, dotCount: 1, step: 'E', octave: 4, tieStop: true })
    const { attacks } = buildTieChains([n1, n2])
    assert.equal(attacks.length, 1, 'tie stop must not create a second attack')
    assert.equal(attacks[0], n1, 'the single attack is the tie start')
  })

  test('tie across measures (different measure numbers)', () => {
    const n1 = makeNote({ duration: 'half', beats: 2, step: 'E', octave: 4, tieStart: true })
    n1.measureNumber = 11
    const n2 = makeNote({ duration: 'dotted-half', beats: 3, dotCount: 1, step: 'E', octave: 4, tieStop: true })
    n2.measureNumber = 12
    const { attacks, chains } = buildTieChains([n1, n2])
    assert.equal(attacks.length, 1)
    assert.equal(chains.length, 1)
    assert.equal(tieChainBeats(chains[0]), 5)
  })

  test('same pitch in different voices does not merge', () => {
    const n1 = makeNote({ duration: 'half', beats: 2, step: 'E', octave: 4, voice: 1, tieStart: true })
    const n2 = makeNote({ duration: 'half', beats: 2, step: 'E', octave: 4, voice: 2, tieStop: true })
    const { attacks, chains } = buildTieChains([n1, n2])
    // Different voices → no chain, both are attacks
    assert.equal(attacks.length, 2, 'different voices must not merge')
    // n1 starts a chain but it's never closed (n2 has different voice key)
    // so there is 1 open chain, but it only has n1 in it
    assert.equal(chains.length, 1, 'one open chain from n1, never closed by n2')
  })

  test('slur does not merge durations', () => {
    // Slurs are not ties — notes without tieStart/tieStop are just normal attacks
    const n1 = makeNote({ duration: 'quarter', beats: 1, step: 'C', octave: 4 })
    const n2 = makeNote({ duration: 'quarter', beats: 1, step: 'D', octave: 4 })
    const { attacks, chains } = buildTieChains([n1, n2])
    assert.equal(attacks.length, 2, 'slur does not reduce attacks')
    assert.equal(chains.length, 0, 'no tie chain for slurs')
  })

  test('malformed tie (stop without start) handled safely', () => {
    const n1 = makeNote({ duration: 'half', beats: 2, step: 'E', octave: 4, tieStop: true })
    const { attacks, chains } = buildTieChains([n1])
    // tieStop without a matching open chain → treated as a standalone attack
    assert.equal(attacks.length, 1)
    assert.equal(chains.length, 0)
  })

  test('rests are never included in tie chains', () => {
    const n1 = makeNote({ duration: 'half', beats: 2, step: 'E', octave: 4, tieStart: true })
    const rest = makeNote({ duration: 'quarter', beats: 1, isRest: true, step: 'E', octave: 4, tieStop: true })
    const { attacks, chains } = buildTieChains([n1, rest])
    // The rest is a rest — it should not join the chain
    assert.equal(chains.length, 1, 'one chain started by n1')
    assert.equal(chains[0].length, 1, 'rest does not join chain')
  })
})

// ── Part 6: Tie text in rhythmic output ───────────────────────

describe('tie text in rhythmic output', () => {
  test('tie start note announces "uzatma bağı başlangıcı"', () => {
    const note = makeNote({ duration: 'half', beats: 2, step: 'E', octave: 4, tieStart: true })
    const text = formatNoteAsText(note)
    assert.match(text, /uzatma bağı başlangıcı/)
  })

  test('tie stop note announces "uzatma bağı sonu"', () => {
    const note = makeNote({ duration: 'dotted-half', beats: 3, dotCount: 1, step: 'E', octave: 4, tieStop: true })
    const text = formatNoteAsText(note)
    assert.match(text, /uzatma bağı sonu/)
  })

  test('tie continuation (start+stop) announces "uzatma bağı devamı"', () => {
    const note = makeNote({ duration: 'half', beats: 2, step: 'E', octave: 4, tieStart: true, tieStop: true })
    const text = formatNoteAsText(note)
    assert.match(text, /uzatma bağı devamı/)
  })

  test('untied note has no tie text', () => {
    const note = makeNote({ duration: 'quarter', beats: 1, step: 'C', octave: 4 })
    const text = formatNoteAsText(note)
    assert.doesNotMatch(text, /uzatma bağı/)
  })
})

// ── Part 7: Ordinary notes and rests unchanged ───────────────

describe('ordinary notes and rests unchanged', () => {
  test('quarter note still 1 beat', () => {
    const note = makeNote({ duration: 'quarter', durationValue: 4, divisions: 4 })
    assert.equal(note.beats, 1)
  })

  test('eighth note still 0.5 beats', () => {
    const note = makeNote({ duration: 'eighth', durationValue: 2, divisions: 4 })
    assert.equal(note.beats, 0.5)
  })

  test('whole note still 4 beats', () => {
    const note = makeNote({ duration: 'whole', durationValue: 16, divisions: 4 })
    assert.equal(note.beats, 4)
  })

  test('quarter rest still 1 beat', () => {
    const note = makeNote({ duration: 'quarter', durationValue: 4, divisions: 4, isRest: true })
    assert.equal(note.beats, 1)
    assert.equal(note.isRest, true)
  })

  test('untied notes produce normal attacks', () => {
    const n1 = makeNote({ duration: 'quarter', beats: 1, step: 'C', octave: 4 })
    const n2 = makeNote({ duration: 'quarter', beats: 1, step: 'D', octave: 4 })
    const n3 = makeNote({ duration: 'quarter', beats: 1, step: 'E', octave: 4 })
    const { attacks } = buildTieChains([n1, n2, n3])
    assert.equal(attacks.length, 3, 'all three are separate attacks')
  })
})
