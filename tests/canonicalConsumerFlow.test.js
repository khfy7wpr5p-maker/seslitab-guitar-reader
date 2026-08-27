import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import '../scripts/runOmrQualityReport.js'

import {
  parseMusicXmlToNotes,
  notesToRhythmicText,
  notesToRhythmicHtml,
  notesToSpokenText,
  notesToCardData,
} from '../src/services/musicEngine.js'
import { buildRhythmSchedule } from '../src/services/voiceService.js'


describe('Package 2A canonical consumer flow', () => {
  test('one canonical MusicXML NoteObject set feeds every current note consumer without mutation', () => {
    const fixtureUrl = new URL(
      './fixtures/real-omr/karayip-korsanlari-clean.xml',
      import.meta.url,
    )
    const xml = readFileSync(fixtureUrl, 'utf8')
    const parsed = parseMusicXmlToNotes(xml)

    assert.equal(parsed.error, undefined)
    assert.ok(parsed.notes.length > 0)
    assert.ok(
      parsed.notes.every(
        (note) =>
          note.sourceVerificationState &&
          typeof note.sourceVerificationState.status === 'string' &&
          note._raw,
      ),
    )

    const notes = parsed.notes.slice(0, 32)
    const before = structuredClone(notes)

    const rhythmicText = notesToRhythmicText(notes)
    const rhythmicHtml = notesToRhythmicHtml(notes)
    const spokenText = notesToSpokenText(notes)
    const cards = notesToCardData(notes)
    const schedule = buildRhythmSchedule(notes)

    assert.ok(rhythmicText.length > 0)
    assert.ok(rhythmicHtml.length > 0)
    assert.ok(spokenText.length > 0)
    assert.ok(cards.length > 0)
    assert.ok(schedule.events.length > 0)

    assert.deepEqual(notes, before)
    assert.ok(
      schedule.events.every((event) =>
        notes.includes(event.note)
      ),
    )
  })

  test('canonical verification state survives all current consumer projections unchanged', () => {
    const fixtureUrl = new URL(
      './fixtures/real-omr/gesi-clean.xml',
      import.meta.url,
    )
    const xml = readFileSync(fixtureUrl, 'utf8')
    const parsed = parseMusicXmlToNotes(xml)

    assert.equal(parsed.error, undefined)
    assert.ok(parsed.notes.length > 0)

    const notes = parsed.notes.slice(0, 24)
    const verificationBefore = notes.map((note) =>
      structuredClone(note.sourceVerificationState)
    )

    notesToRhythmicText(notes)
    notesToRhythmicHtml(notes)
    notesToSpokenText(notes)
    notesToCardData(notes)
    buildRhythmSchedule(notes)

    assert.deepEqual(
      notes.map((note) => note.sourceVerificationState),
      verificationBefore,
    )
  })
})
