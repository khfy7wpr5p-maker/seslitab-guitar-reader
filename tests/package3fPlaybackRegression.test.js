// Package 3F — regression shield for Package 3 measure selection and playback.
//
// This package is deliberately test-only. It cross-checks Package 3C–3E
// contracts against reviewed real-OMR fixtures without modifying, repairing or
// promoting those source-unverified fixtures to musical ground truth.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The repository's diagnostic runner installs the same minimal DOMParser shim
// used by the existing real-OMR Node regression tests. Browser production has
// a native DOMParser; this import is test-harness bootstrap only.
import '../scripts/runOmrQualityReport.js'

import {
  clearPackage3Notes,
  getPackage3MeasureSnapshot,
  publishPackage3Notes,
  selectPackage3MeasureKey,
} from '../package3MeasureBridge.js'
import { buildMeasureControlModels } from '../src/package3Ui.js'
import { buildMeasureIndex } from '../src/services/measureIdentity.js'
import {
  playSelectedMeasure,
  resolveSelectedMeasureConsumption,
  SELECTED_MEASURE_CONSUMER,
} from '../src/services/selectedMeasureConsumer.js'
import { parseMusicXmlToNotes } from '../src/services/musicEngine.js'
import { buildRhythmSchedule } from '../src/services/voiceService.js'

const fixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'real-omr',
)

function readFixture(name) {
  return readFileSync(path.join(fixtureDir, name), 'utf8')
}

function realNotes(name) {
  return parseMusicXmlToNotes(readFixture(name)).notes
}

function acceptPlaybackGate() {
  return { decision: 'ACCEPT' }
}

test('Package 3F real OMR duplicate visible numbers remain distinct canonical selectable measures', () => {
  const notes = realNotes('shostywaltz-clean.xml')
  const groups = buildMeasureIndex(notes)

  for (const displayedNumber of [33, 37, 176, 203]) {
    const duplicates = groups.filter((group) => group.displayNumber === displayedNumber)
    assert.equal(duplicates.length, 2)
    assert.equal(duplicates.every((group) => group.selectable), true)
    assert.notEqual(duplicates[0].measureKey, duplicates[1].measureKey)
    assert.notEqual(duplicates[0].measureIndex, duplicates[1].measureIndex)
  }
})

test('Package 3F real OMR duplicate measure controls keep distinct accessible physical identities', () => {
  const notes = realNotes('shostywaltz-clean.xml')
  const models = buildMeasureControlModels(notes)

  for (const displayedNumber of [33, 37, 176, 203]) {
    const duplicates = models.filter((model) => model.visibleLabel === `Ölçü ${displayedNumber}`)
    assert.equal(duplicates.length, 2)
    assert.notEqual(duplicates[0].measureKey, duplicates[1].measureKey)
    assert.notEqual(duplicates[0].ariaLabel, duplicates[1].ariaLabel)
    assert.match(duplicates[0].ariaLabel, /fiziksel ölçü/)
    assert.match(duplicates[1].ariaLabel, /fiziksel ölçü/)
  }
})

test('Package 3F selected real OMR measure returns exact original NoteObject references', () => {
  const notes = realNotes('shostywaltz-clean.xml')
  const target = buildMeasureIndex(notes).find(
    (group) => group.displayNumber === 33 && group.selectable,
  )
  assert.ok(target)

  const resolved = resolveSelectedMeasureConsumption({
    notes,
    measureKey: target.measureKey,
    consumer: SELECTED_MEASURE_CONSUMER.PLAYBACK,
    gateOverrides: { resolvePlaybackGate: acceptPlaybackGate },
  })

  assert.equal(resolved.ok, true)
  assert.equal(resolved.measureKey, target.measureKey)
  assert.equal(resolved.notes.length, target.notes.length)
  for (let index = 0; index < target.notes.length; index += 1) {
    assert.equal(resolved.notes[index], target.notes[index])
    assert.equal(resolved.notes[index].measureKey, target.measureKey)
  }
})

test('Package 3F source-unverified real OMR cannot start selected playback without an ACCEPT gate', async () => {
  const notes = realNotes('django-clean.xml')
  const target = buildMeasureIndex(notes).find((group) => group.selectable)
  assert.ok(target)

  const calls = []
  const result = await playSelectedMeasure({
    notes,
    measureKey: target.measureKey,
    adapters: {
      async playRhythm() {
        calls.push('play')
      },
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'quality-gate-not-accepted')
  assert.deepEqual(calls, [])
})

test('Package 3F stale real OMR measureKey fails closed after an ACCEPT gate', async () => {
  const notes = realNotes('django-clean.xml')
  const calls = []
  const result = await playSelectedMeasure({
    notes,
    measureKey: '0:999999',
    gateOverrides: { resolvePlaybackGate: acceptPlaybackGate },
    adapters: {
      async playRhythm() {
        calls.push('play')
      },
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'canonical-measure-not-selected')
  assert.deepEqual(calls, [])
})

test('Package 3F publishing a new canonical array invalidates the prior measure selection', () => {
  clearPackage3Notes()
  const first = realNotes('django-clean.xml')
  const second = realNotes('gesi-clean.xml')
  const firstKey = buildMeasureIndex(first).find((group) => group.selectable)?.measureKey
  assert.ok(firstKey)

  publishPackage3Notes(first)
  assert.equal(selectPackage3MeasureKey(firstKey), true)
  assert.equal(getPackage3MeasureSnapshot().selectedMeasureKey, firstKey)

  publishPackage3Notes(second)
  const snapshot = getPackage3MeasureSnapshot()
  assert.equal(snapshot.notes, second)
  assert.equal(snapshot.selectedMeasureKey, null)
  clearPackage3Notes()
})

test('Package 3F selected-measure schedule is deterministic and preserves source note timing data', () => {
  const notes = realNotes('fug1001-clean.xml')
  const target = buildMeasureIndex(notes).find(
    (group) => group.selectable && group.notes.some((note) => note.isGrace),
  )
  assert.ok(target)

  const before = JSON.stringify(target.notes)
  const first = buildRhythmSchedule(target.notes, 1, 120)
  const second = buildRhythmSchedule(target.notes, 1, 120)

  assert.deepEqual(first, second)
  assert.equal(JSON.stringify(target.notes), before)
  assert.equal(target.notes.some((note) => note.isGrace), true)
})

test('Package 3F remains a regression-only package with no production integration edits', () => {
  const source = readFileSync(new URL('../src/package3Ui.js', import.meta.url), 'utf8')
  const consumer = readFileSync(
    new URL('../src/services/selectedMeasureConsumer.js', import.meta.url),
    'utf8',
  )

  assert.doesNotMatch(source, /AudiverisProvider|omrWorker|gatewayProvider|omrService/)
  assert.doesNotMatch(consumer, /AudiverisProvider|omrWorker|gatewayProvider|omrService/)
  assert.doesNotMatch(consumer, /stopSpeech|stopRhythm/)
})
