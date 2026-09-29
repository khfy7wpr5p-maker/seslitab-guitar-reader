import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const moduleUrl = new URL('../experiments/smoosic-mobile/src/seslitab-structural-action-provenance.js', import.meta.url)

const pitched = (id, tickCount = 8) => ({
  attrs: { id },
  noteType: 'n',
  tickCount,
  pitches: [{ letter: 'c', octave: 4, accidental: 'n', cents: 0 }],
})
const rest = (id, tickCount = 8) => ({ attrs: { id }, noteType: 'r', tickCount })
const scoreOf = (...voices) => ({
  staves: [{
    partInfo: { stavesBefore: 0, stavesAfter: 0 },
    measures: [{ voices: voices.map((notes) => ({ notes })) }],
  }],
})

async function trackerFactory(options = {}) {
  assert.equal(existsSync(fileURLToPath(moduleUrl)), true)
  const module = await import(moduleUrl)
  return module.createSmoosicStructuralActionTracker(options)
}

test('explicit duration action produces a revision-bound structural action manifest', async () => {
  const tracker = await trackerFactory()
  const imported = scoreOf([pitched('source-a'), pitched('source-b')])
  tracker.beginImport({ score: imported, editorSessionId: 'session-1' })

  const rendered = structuredClone(imported)
  rendered.staves[0].measures[0].voices[0].notes[0].attrs.id = 'rendered-a'
  rendered.staves[0].measures[0].voices[0].notes[1].attrs.id = 'rendered-b'
  tracker.reconcileRenderedScore(rendered)

  const target = rendered.staves[0].measures[0].voices[0].notes[0]
  target.tickCount = 16
  tracker.recordDurationAction({ note: target, beforeDuration: 8, afterDuration: 16 })

  const manifest = tracker.createApplyManifest({ sourceRevision: 7, actionId: 'request-1' })
  assert.equal(manifest.version, 1)
  assert.equal(manifest.sourceRevision, 7)
  assert.equal(manifest.editorSessionId, 'session-1')
  assert.equal(manifest.actionId, 'request-1')
  assert.equal(manifest.createdFromExplicitTeacherApply, true)
  assert.match(manifest.baseMappingFingerprint, /^[0-9a-f]{16}$/)
  assert.deepEqual(manifest.operations, [{
    order: 0,
    operation: 'CHANGE_EVENT_DURATION',
    rawNoteOrdinal: 0,
    staffIndex: 0,
    measureIndex: 0,
    voiceIndex: 0,
    noteIndex: 0,
    noteIdentity: 'rendered-a',
    before: 8,
    after: 16,
  }])
  assert.ok(Object.isFrozen(manifest) && Object.isFrozen(manifest.operations))
  assert.ok(Object.isFrozen(manifest.operations[0]))
  assert.deepEqual([...tracker.authorizedDurationIdentitySet()], ['rendered-a'])
})

test('multiple explicit duration actions collapse to one net action and undo-to-base removes it', async () => {
  const tracker = await trackerFactory()
  const score = scoreOf([pitched('a')])
  tracker.beginImport({ score, editorSessionId: 'session-2' })
  const note = score.staves[0].measures[0].voices[0].notes[0]

  note.tickCount = 16
  tracker.recordDurationAction({ note, beforeDuration: 8, afterDuration: 16 })
  note.tickCount = 4
  tracker.recordDurationAction({ note, beforeDuration: 16, afterDuration: 4 })

  let manifest = tracker.createApplyManifest({ sourceRevision: 2, actionId: 'apply-2' })
  assert.equal(manifest.operations.length, 1)
  assert.equal(manifest.operations[0].before, 8)
  assert.equal(manifest.operations[0].after, 4)

  note.tickCount = 8
  tracker.reconcileRenderedScore(score)
  manifest = tracker.createApplyManifest({ sourceRevision: 2, actionId: 'apply-3' })
  assert.equal(manifest, null)
  assert.equal(tracker.authorizedDurationIdentitySet().size, 0)
})

test('unmarked duration mutation is never inferred as teacher structural intent', async () => {
  const tracker = await trackerFactory()
  const score = scoreOf([pitched('a')])
  tracker.beginImport({ score, editorSessionId: 'session-3' })
  score.staves[0].measures[0].voices[0].notes[0].tickCount = 16
  assert.throws(() => tracker.reconcileRenderedScore(score), /unrecorded|explicit|duration/i)
  assert.equal(tracker.createApplyManifest({ sourceRevision: 3, actionId: 'apply-4' }), null)
})

test('padding rests cannot become structural duration targets', async () => {
  const pad = rest('padding', 8)
  const tracker = await trackerFactory({ isPaddingRest: (note) => note === pad })
  const score = scoreOf([pad])
  tracker.beginImport({ score, editorSessionId: 'session-4' })
  pad.tickCount = 16
  assert.throws(
    () => tracker.recordDurationAction({ note: pad, beforeDuration: 8, afterDuration: 16 }),
    /padding/i,
  )
  assert.equal(tracker.createApplyManifest({ sourceRevision: 4, actionId: 'apply-5' }), null)
})

test('pitch-only mutation creates no structural manifest', async () => {
  const tracker = await trackerFactory()
  const score = scoreOf([pitched('a')])
  tracker.beginImport({ score, editorSessionId: 'session-5' })
  score.staves[0].measures[0].voices[0].notes[0].pitches[0].letter = 'd'
  tracker.reconcileRenderedScore(score)
  assert.equal(tracker.createApplyManifest({ sourceRevision: 5, actionId: 'apply-6' }), null)
})


test('explicit duration manifest converts Smoosic ticks into source MusicXML duration units', async () => {
  const tracker = await trackerFactory()
  const score = scoreOf([pitched('duration-unit-a', 8)])
  tracker.beginImport({
    score,
    editorSessionId: 'session-duration-units',
    sourceDurationByRawOrdinal: [1],
  })
  const note = score.staves[0].measures[0].voices[0].notes[0]

  note.tickCount = 16
  tracker.recordDurationAction({ note, beforeDuration: 8, afterDuration: 16 })

  const manifest = tracker.createApplyManifest({ sourceRevision: 8, actionId: 'apply-duration-units' })
  assert.equal(manifest.operations[0].before, 1)
  assert.equal(manifest.operations[0].after, 2)
})


test('explicit duration action remains exact when Smoosic replaces the rendered note object', async () => {
  const tracker = await trackerFactory()
  const original = pitched('replace-a', 8)
  const score = scoreOf([original])
  tracker.beginImport({
    score,
    editorSessionId: 'session-replaced-object',
    sourceDurationByRawOrdinal: [1],
  })

  const replacement = pitched('replace-a', 16)
  score.staves[0].measures[0].voices[0].notes[0] = replacement
  tracker.recordDurationAction({
    note: original,
    renderedNote: replacement,
    beforeDuration: 8,
    afterDuration: 16,
  })

  const manifest = tracker.createApplyManifest({ sourceRevision: 9, actionId: 'apply-replaced-object' })
  assert.equal(manifest.operations[0].noteIdentity, 'replace-a')
  assert.equal(manifest.operations[0].before, 1)
  assert.equal(manifest.operations[0].after, 2)
  assert.deepEqual([...tracker.authorizedDurationIdentitySet()], ['replace-a'])
})


test('explicit duration action preserves imported identity when Smoosic replaces the note with a new internal id', async () => {
  const tracker = await trackerFactory()
  const original = pitched('source-stable-id', 8)
  const score = scoreOf([original])
  tracker.beginImport({
    score,
    editorSessionId: 'session-replaced-id',
    sourceDurationByRawOrdinal: [1],
  })

  const replacement = pitched('smoosic-generated-replacement-id', 16)
  score.staves[0].measures[0].voices[0].notes[0] = replacement
  tracker.recordDurationAction({
    note: original,
    renderedNote: replacement,
    beforeDuration: 8,
    afterDuration: 16,
  })

  const manifest = tracker.createApplyManifest({ sourceRevision: 10, actionId: 'apply-replaced-id' })
  assert.equal(manifest.operations[0].noteIdentity, 'source-stable-id')
  assert.equal(manifest.operations[0].before, 1)
  assert.equal(manifest.operations[0].after, 2)
  assert.deepEqual([...tracker.authorizedDurationIdentitySet()], ['source-stable-id'])
})


test('explicit duration action accepts Smoosic post-action id replacement only through the exact pre-action target', async () => {
  const tracker = await trackerFactory()
  const original = pitched('pre-action-id', 8)
  const score = scoreOf([original])
  tracker.beginImport({
    score,
    editorSessionId: 'session-post-id',
    sourceDurationByRawOrdinal: [1],
  })

  const replacement = pitched('post-action-id', 16)
  score.staves[0].measures[0].voices[0].notes[0] = replacement
  tracker.recordDurationAction({
    note: original,
    renderedNote: replacement,
    beforeDuration: 8,
    afterDuration: 16,
  })

  const manifest = tracker.createApplyManifest({ sourceRevision: 10, actionId: 'apply-post-id' })
  assert.equal(manifest.operations[0].noteIdentity, 'post-action-id')
  assert.equal(manifest.operations[0].before, 1)
  assert.equal(manifest.operations[0].after, 2)
  assert.deepEqual([...tracker.authorizedDurationIdentitySet()], ['post-action-id'])
})

test('certified padding rests are outside structural identity and may disappear after explicit duration action', async () => {
  const original = pitched('real-a', 8)
  const pad = rest('padding-rest', 8)
  const second = pitched('real-b', 16)
  const tracker = await trackerFactory({ isPaddingRest: (note) => note?.attrs?.id === 'padding-rest' })
  const score = scoreOf([original, pad, second])
  tracker.beginImport({
    score,
    editorSessionId: 'session-padding-excluded',
    sourceDurationByRawOrdinal: [1, 2],
  })

  const replacement = pitched('real-a-after', 16)
  score.staves[0].measures[0].voices[0].notes = [replacement, second]
  tracker.recordDurationAction({
    note: original,
    renderedNote: replacement,
    beforeDuration: 8,
    afterDuration: 16,
  })
  assert.doesNotThrow(() => tracker.reconcileRenderedScore(score))

  const manifest = tracker.createApplyManifest({ sourceRevision: 11, actionId: 'apply-padding-excluded' })
  assert.equal(manifest.operations.length, 1)
  assert.equal(manifest.operations[0].rawNoteOrdinal, 0)
  assert.equal(manifest.operations[0].before, 1)
  assert.equal(manifest.operations[0].after, 2)
})
