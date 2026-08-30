import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildCanonicalNoteControlModels,
  deriveCanonicalNoteSelection,
} from '../src/services/canonicalNoteSelection.js'
import {
  clearPackage3Notes,
  getPackage3MeasureSnapshot,
  publishPackage3Notes,
  selectPackage3MeasureKey,
  selectPackage3NoteIndex,
} from '../package3MeasureBridge.js'

function note(measureKey, measureIndex, extra = {}) {
  return {
    measureKey,
    partId: 'P1',
    partIndex: 0,
    measureIndex,
    measureNumber: measureIndex + 1,
    voice: 1,
    staff: 1,
    startBeat: 0,
    isRest: false,
    ...extra,
  }
}

test('Stage C binds selection to the exact canonical NoteObject reference and renderer locator', () => {
  const first = note('P1:m0', 0, { step: 'C', startBeat: 0 })
  const second = note('P1:m0', 0, { step: 'D', startBeat: 1 })
  const notes = [first, second, note('P1:m1', 1, { step: 'E' })]

  const selection = deriveCanonicalNoteSelection(notes, 'P1:m0', 1)
  assert.equal(selection.selected, true)
  assert.equal(selection.note, second)
  assert.equal(selection.noteIndex, 1)
  assert.equal(selection.measureNoteOrdinal, 1)
  assert.deepEqual(selection.rendererTarget, { partId: 'P1', measureIndex: 0, noteIndex: 1, voice: 1 })
})

test('Stage C refuses stale, cross-measure, and out-of-range note indexes', () => {
  const notes = [note('P1:m0', 0), note('P1:m1', 1)]
  assert.equal(deriveCanonicalNoteSelection(notes, 'P1:m0', 1).selected, false)
  assert.equal(deriveCanonicalNoteSelection(notes, 'P1:m0', 99).selected, false)
  assert.equal(deriveCanonicalNoteSelection(notes, 'missing', 0).selected, false)
})

test('Stage C note control models preserve canonical array indexes, exact references and renderer targets', () => {
  const first = note('P1:m0', 0, { startBeat: 0 })
  const second = note('P1:m0', 0, { startBeat: 1 })
  const notes = [first, second, note('P1:m1', 1)]
  const models = buildCanonicalNoteControlModels(notes, 'P1:m0', 1)

  assert.deepEqual(models.map((model) => model.noteIndex), [0, 1])
  assert.equal(models[0].note, first)
  assert.equal(models[1].note, second)
  assert.equal(models[1].selected, true)
  assert.equal(models[0].ariaLabel, 'Seçili ölçüde nota 1 seç')
  assert.deepEqual(models[1].rendererTarget, { partId: 'P1', measureIndex: 0, noteIndex: 1, voice: 1 })
})

test('Stage C fails closed when one exact note object is ambiguously repeated', () => {
  const repeated = note('P1:m0', 0)
  const notes = [repeated, repeated]
  assert.equal(deriveCanonicalNoteSelection(notes, 'P1:m0', 0).selected, false)
  assert.deepEqual(buildCanonicalNoteControlModels(notes, 'P1:m0'), [])
})

test('Stage C keeps canonical selection but withholds renderer identity when structure is incomplete', () => {
  const incomplete = note('P1:m0', 0, { voice: undefined })
  const selection = deriveCanonicalNoteSelection([incomplete], 'P1:m0', 0)
  assert.equal(selection.selected, true)
  assert.equal(selection.rendererTarget, null)
})

test('Stage C bridge clears note selection when measure or score identity changes', () => {
  const notes = [note('P1:m0', 0), note('P1:m1', 1)]
  publishPackage3Notes(notes)
  assert.equal(selectPackage3MeasureKey('P1:m0'), true)
  assert.equal(selectPackage3NoteIndex(0), true)
  assert.equal(getPackage3MeasureSnapshot().selectedNoteIndex, 0)

  assert.equal(selectPackage3MeasureKey('P1:m1'), true)
  assert.equal(getPackage3MeasureSnapshot().selectedNoteIndex, null)
  assert.equal(selectPackage3NoteIndex(0), false)
  assert.equal(selectPackage3NoteIndex(1), true)

  publishPackage3Notes([...notes])
  const refreshed = getPackage3MeasureSnapshot()
  assert.equal(refreshed.selectedMeasureKey, null)
  assert.equal(refreshed.selectedNoteIndex, null)
  clearPackage3Notes()
})

test('Stage C UI remains accessible and describes fail-closed visual linking', async () => {
  const source = await readFile(new URL('../src/stageCNoteSelectionUi.js', import.meta.url), 'utf8')
  assert.match(source, /Nota seçimi/)
  assert.match(source, /aria-pressed/)
  assert.match(source, /Düzeltilecek notayı seç/)
  assert.match(source, /görsel üzerinde de vurgulanır/)
  assert.match(source, /kesin eşleme yoksa sistem seçim üretmez/)
  assert.doesNotMatch(source, /opensheetmusicdisplay|OSMD/)
})

test('Stage C is wired after Package 3 measure UI', async () => {
  const source = await readFile(new URL('../main.js', import.meta.url), 'utf8')
  const measureUi = source.indexOf("import './src/package3Ui.js'")
  const noteUi = source.indexOf("import './src/stageCNoteSelectionUi.js'")
  assert.ok(measureUi >= 0)
  assert.ok(noteUi > measureUi)
})
