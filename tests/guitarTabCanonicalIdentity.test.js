import assert from 'node:assert/strict'
import test from 'node:test'

import { SmoosicTestDOMParser } from './support/smoosicXmlDom.js'
import {
  analyzeGuitarTabCanonicalIdentity,
  normalizeGuitarTabTargetSelection,
  resolveGuitarTabCanonicalTarget,
} from '../src/services/guitarTabCanonicalIdentity.js'

function root(xml) {
  return new SmoosicTestDOMParser().parseFromString(xml, 'application/xml').documentElement
}

function score(notes, { staves = null, partListId = 'P1', bodyId = 'P1' } = {}) {
  const stavesXml = staves === null ? '' : `<staves>${staves}</staves>`
  return `<?xml version="1.0"?><score-partwise version="4.0">
    <part-list><score-part id="${partListId}"><part-name>Source</part-name></score-part></part-list>
    <part id="${bodyId}"><measure number="1"><attributes><divisions>1</divisions>${stavesXml}</attributes>${notes}</measure></part>
  </score-partwise>`
}

function pitched({ staff = '1', voice = '1', step = 'C', octave = 4 } = {}) {
  const staffXml = staff === null ? '' : `<staff>${staff}</staff>`
  const voiceXml = voice === null ? '' : `<voice>${voice}</voice>`
  return `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>1</duration>${voiceXml}${staffXml}</note>`
}

function assertIdentityError(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error?.category, 'IDENTITY')
    assert.equal(error?.code, code)
    return true
  })
}

test('normalizes exact target identity without coercing ambiguous values', () => {
  assert.deepEqual(normalizeGuitarTabTargetSelection({ partId: 'P1', partIndex: 0, staff: 1, voice: 0 }), {
    partId: 'P1', partIndex: 0, staff: 1, voice: 0,
  })
  assert.equal(normalizeGuitarTabTargetSelection(null, { allowNull: true }), null)
  assertIdentityError(
    () => normalizeGuitarTabTargetSelection({ partId: ' P1 ', partIndex: 0, staff: 1, voice: 1 }),
    'TARGET_SELECTION_INVALID',
  )
})

test('preserves exact part-list and body identity evidence', () => {
  const analysis = analyzeGuitarTabCanonicalIdentity(root(score(pitched())))
  assert.equal(analysis.parts.length, 1)
  assert.equal(analysis.parts[0].partId, 'P1')
  assert.equal(analysis.parts[0].partIndex, 0)
  assert.deepEqual(analysis.parts[0].staves, [{ staff: 1, voices: [{ voice: 1, pitchedEventCount: 1 }] }])

  assertIdentityError(
    () => analyzeGuitarTabCanonicalIdentity(root(score(pitched(), { bodyId: 'P9' }))),
    'PART_IDENTITY_MISMATCH',
  )
})

test('rejects duplicate part identity instead of selecting by order', () => {
  const xml = `<?xml version="1.0"?><score-partwise version="4.0"><part-list>
    <score-part id="P1"><part-name>A</part-name></score-part><score-part id="P1"><part-name>B</part-name></score-part>
    </part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>${pitched()}</measure></part>
    <part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>${pitched()}</measure></part></score-partwise>`
  assertIdentityError(() => analyzeGuitarTabCanonicalIdentity(root(xml)), 'PART_IDENTITY_DUPLICATE')
})

test('materializes implicit Staff 1 only when score evidence is single-staff', () => {
  const analysis = analyzeGuitarTabCanonicalIdentity(root(score(pitched({ staff: null }), { staves: 1 })))
  const note = analysis.parts[0].pitchedNotes[0]
  assert.equal(note.staff, 1)
  assert.equal(note.implicitStaff, true)

  const ambiguous = score(`${pitched({ staff: null })}${pitched({ staff: '2', step: 'D' })}`, { staves: 2 })
  assertIdentityError(() => analyzeGuitarTabCanonicalIdentity(root(ambiguous)), 'STAFF_IDENTITY_AMBIGUOUS')
})

test('materializes implicit Voice 1 only when no contradictory voice evidence exists', () => {
  const analysis = analyzeGuitarTabCanonicalIdentity(root(score(pitched({ voice: null }))))
  const note = analysis.parts[0].pitchedNotes[0]
  assert.equal(note.voice, 1)
  assert.equal(note.implicitVoice, true)

  const ambiguous = score(`${pitched({ voice: null })}${pitched({ voice: '2', step: 'D' })}`)
  assertIdentityError(() => analyzeGuitarTabCanonicalIdentity(root(ambiguous)), 'VOICE_IDENTITY_AMBIGUOUS')
})

test('rejects duplicate staff or voice elements on a pitched note', () => {
  const duplicateStaff = pitched().replace('</note>', '<staff>1</staff></note>')
  assertIdentityError(() => analyzeGuitarTabCanonicalIdentity(root(score(duplicateStaff))), 'NOTE_IDENTITY_AMBIGUOUS')
  const duplicateVoice = pitched().replace('</note>', '<voice>1</voice></note>')
  assertIdentityError(() => analyzeGuitarTabCanonicalIdentity(root(score(duplicateVoice))), 'NOTE_IDENTITY_AMBIGUOUS')
})

test('resolves only an exact existing Part Staff Voice target', () => {
  const analysis = analyzeGuitarTabCanonicalIdentity(root(score(pitched())))
  const target = resolveGuitarTabCanonicalTarget(analysis, { partId: 'P1', partIndex: 0, staff: 1, voice: 1 })
  assert.equal(target.pitchedEventCount, 1)
  assert.equal(target.part.partId, 'P1')
  assert.equal(target.staff.staff, 1)
  assert.equal(target.voice.voice, 1)

  assertIdentityError(
    () => resolveGuitarTabCanonicalTarget(analysis, { partId: 'P1', partIndex: 1, staff: 1, voice: 1 }),
    'TARGET_PART_MISMATCH',
  )
})

test('fails closed when an exact target contains no pitched events', () => {
  const xml = score('<note><rest/><duration>1</duration><voice>1</voice><staff>1</staff></note>')
  const analysis = analyzeGuitarTabCanonicalIdentity(root(xml))
  assertIdentityError(
    () => resolveGuitarTabCanonicalTarget(analysis, { partId: 'P1', partIndex: 0, staff: 1, voice: 1 }),
    'TARGET_EMPTY',
  )
})
