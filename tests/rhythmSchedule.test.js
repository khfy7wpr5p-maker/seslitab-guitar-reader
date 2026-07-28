import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { buildRhythmSchedule } from '../src/services/voiceService.js'

function note(overrides = {}) {
  return {
    measureNumber: 1,
    measureKey: 'P1:0',
    startBeat: 0,
    beats: 1,
    frequency: 440,
    isRest: false,
    isGrace: false,
    isChord: false,
    isChordNote: false,
    ...overrides,
  }
}

describe('Rhythm playback schedule', () => {
  test('grace note is audible but does not delay the following beat', () => {
    const grace = note({ isGrace: true, beats: 0, duration: 'eighth' })
    const main = note({ startBeat: 0, beats: 1 })
    const schedule = buildRhythmSchedule([grace, main], 1, 120)

    assert.equal(schedule.events.length, 2)
    assert.equal(schedule.events[0].startSeconds, 0)
    assert.ok(schedule.events[0].durationSeconds > 0)
    assert.equal(schedule.events[1].startSeconds, 0)
    assert.equal(schedule.totalSeconds, 0.5)
  })

  test('MusicXML chord continuation starts with the first chord note', () => {
    const first = note({ frequency: 440 })
    const continuation = note({ frequency: 550, isChordNote: true })
    const schedule = buildRhythmSchedule([first, continuation], 1, 120)

    assert.equal(schedule.events[0].startSeconds, 0)
    assert.equal(schedule.events[1].startSeconds, 0)
    assert.equal(schedule.totalSeconds, 0.5)
  })

  test('long scores produce a deterministic plan without pre-creating audio nodes', () => {
    const notes = Array.from({ length: 2000 }, (_, index) =>
      note({
        measureNumber: Math.floor(index / 4) + 1,
        measureKey: `P1:${Math.floor(index / 4)}`,
        startBeat: index % 4,
      })
    )
    const schedule = buildRhythmSchedule(notes, 1, 120)

    assert.equal(schedule.events.length, 2000)
    assert.equal(schedule.totalSeconds, 1000)
  })
})
