import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildPrDAdvancedTarget,
  buildPrDProjectionMapping,
} from '../src/services/editorPrDNotationBridge.js'
import {
  PRD_PRODUCT_MUSICXML_PROVENANCE,
  registerPrDProductMusicXml,
  resolvePrDProductMusicXml,
} from '../src/services/editorPrDRevisionMusicXmlRegistry.js'
import { resolveMusicXmlSourceForNotes } from '../src/services/musicXmlSourceRegistry.js'

function revision() {
  return {
    revisionId: 'rev-1',
    content: [
      { partId: 'P1', partIndex: 0, measureIndex: 0, measureKey: 'P1:0', voice: 1, staff: 1, isRest: false, isChordNote: false },
      { partId: 'P1', partIndex: 0, measureIndex: 0, measureKey: 'P1:0', voice: 1, staff: 1, isRest: false, isChordNote: false },
      { partId: 'P1', partIndex: 0, measureIndex: 0, measureKey: 'P1:0', voice: 1, staff: 1, isRest: false, isChordNote: false },
    ],
  }
}

function score() {
  const common = (id, onset) => ({
    id,
    kind: 'note',
    onset,
    duration: { numerator: 1, denominator: 12 },
    note: { id: id.replace('event', 'note'), pitch: { step: 'C', alter: 0, octave: 4 } },
  })
  return {
    id: 'doc-1',
    revision: { id: 'rev-1', parentId: null },
    parts: [{ id: 'editor-part', staves: [{ id: 'staff-1', ordinal: 1, measures: [{ id: 'measure-1', ordinal: 1, voices: [{ id: 'voice-1', ordinal: 1, events: [
      common('event-1', { numerator: 0, denominator: 1 }),
      common('event-2', { numerator: 1, denominator: 12 }),
      common('event-3', { numerator: 1, denominator: 6 }),
    ] }] }] }] }],
  }
}

function manifestSession(mapping) {
  const entries = []
  for (const address of mapping.eventAddresses.values()) entries.push({ token: `token:${address.eventId}`, address })
  for (const address of mapping.noteAddresses.values()) entries.push({ token: `token:${address.noteId}`, address })
  return { renderRequest: { manifest: { entries } } }
}

test('STI-10 projection maps product order to exact Editor event/note ids without pitch or proximity inference', () => {
  const product = revision()
  const editorScore = score()
  const noteIds = ['note-1', 'note-2', 'note-3']
  const mapping = buildPrDProjectionMapping({ teacherRevision: product, score: editorScore, noteIds })
  assert.deepEqual(mapping.eventIds, ['event-1', 'event-2', 'event-3'])
  assert.deepEqual(mapping.noteIds, noteIds)
  assert.equal(mapping.eventAddresses.get('event-2').revisionId, 'rev-1')
  assert.equal(mapping.noteAddresses.get('note-3').eventId, 'event-3')
})

test('STI-10 advanced targets contain only explicit current manifest semantic addresses', () => {
  const mapping = buildPrDProjectionMapping({ teacherRevision: revision(), score: score(), noteIds: ['note-1', 'note-2', 'note-3'] })
  const session = manifestSession(mapping)
  const triplet = buildPrDAdvancedTarget({ session, mapping, actionId: 'tuplet.triplet', productIndexes: [0, 1, 2] })
  assert.equal(triplet.kind, 'EVENT_RANGE')
  assert.deepEqual(triplet.targets.map((target) => target.eventId), ['event-1', 'event-2', 'event-3'])
  assert.equal(Object.hasOwn(triplet, 'clientX'), false)
  assert.equal(Object.hasOwn(triplet, 'pitch'), false)

  const tie = buildPrDAdvancedTarget({ session, mapping, actionId: 'tie.edit', productIndexes: [0, 1] })
  assert.equal(tie.kind, 'NOTE_PAIR')
  assert.equal(tie.start.noteId, 'note-1')
  assert.equal(tie.stop.noteId, 'note-2')

  assert.throws(
    () => buildPrDAdvancedTarget({ session, mapping, actionId: 'tuplet.triplet', productIndexes: [0, 1] }),
    /exactly three/,
  )
  assert.throws(
    () => buildPrDAdvancedTarget({ session, mapping, actionId: 'tie.edit', productIndexes: [1, 1] }),
    /distinct pitched notes/,
  )
})

test('STI-11 corrected product MusicXML registry is deliberately separate from Package 7 raw source provenance', () => {
  const product = { revisionId: 'rev-product-2', content: Object.freeze([{ value: 1 }]) }
  const xml = '<score-partwise version="4.0"></score-partwise>'
  const record = registerPrDProductMusicXml(product, xml)
  assert.equal(record.provenance, PRD_PRODUCT_MUSICXML_PROVENANCE)
  assert.equal(resolvePrDProductMusicXml(product)?.musicXml, xml)
  assert.equal(resolveMusicXmlSourceForNotes(product.content), null)
})

test('STI-11/12 production init order keeps PR-B exact selection before PR-D keypad and S12 mobile presentation after it', () => {
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')
  const prB = main.indexOf('initStagePrBEditorSelectionUi(document)')
  const prD = main.indexOf('initStagePrDKeypadIntegrationUi(document)')
  const s12 = main.indexOf('initStageS12MobileProductionAcceptanceUi(document)')
  assert.ok(prB >= 0 && prD > prB && s12 > prD)
})

test('STI-12 production orchestration does not navigate Editor history to an old revision id', () => {
  const source = readFileSync(new URL('../src/stagePrDKeypadIntegrationUi.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /navigateSessionHistory|navigateEditorHistory/)
  assert.match(source, /restorePrDProductRevision/)
  assert.match(source, /revisionId:\s*secureId\(root, `editor-keypad-\$\{kind\}-revision`\)/)
})
