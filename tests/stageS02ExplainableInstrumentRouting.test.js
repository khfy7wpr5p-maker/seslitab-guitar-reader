import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Install the repository's minimal DOMParser for Node tests.
import '../scripts/runOmrQualityReport.js'

import { parseMusicXmlToNotes } from '../src/services/musicEngine.js'
import {
  CANONICAL_NOTE_SCHEMA_VERSION,
  CANONICAL_VERIFICATION_STATUS,
} from '../noteTheory.js'
import { prepareMusicXmlQualityGate } from '../src/services/appQualityGate.js'
import {
  resolveStageIInstrumentProducts,
  stageIReasonCopy,
  STAGE_I_PRODUCT_STATE,
} from '../src/services/stageIInstrumentProduct.js'

const VALID_4_4_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`

const gesiXml = readFileSync(
  new URL('./fixtures/real-omr/gesi-clean.xml', import.meta.url),
  'utf8',
)

function verifiedState() {
  return {
    schemaVersion: CANONICAL_NOTE_SCHEMA_VERSION,
    status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    pitch: {
      valid: true,
      status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    },
    time: {
      valid: true,
      status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    },
  }
}

function verifiedStructurallyValidNotes() {
  return unverifiedStructurallyValidNotes().map((note) => ({
    ...note,
    sourceVerificationState: verifiedState(),
  }))
}

function unverifiedStructurallyValidNotes() {
  return ['Do', 'Re', 'Mi', 'Fa'].map((noteName, index) => ({
    partId: 'P1',
    measureNumber: 1,
    measureKey: 'P1:0',
    measureIndex: 0,
    voice: 1,
    staff: 1,
    startBeat: index,
    beats: 1,
    noteName,
  }))
}


test('S02 full PASS path invokes both instrument builders with the exact quality-bound NoteObject[]', () => {
  const notes = verifiedStructurallyValidNotes()
  const report = prepareMusicXmlQualityGate(notes, VALID_4_4_XML)
  assert.equal(report.structurallyValid, true)
  assert.equal(report.reliable, true)
  assert.equal(report.sourceVerified, true)

  let guitarBuilderCalls = 0
  let violinBuilderCalls = 0
  let guitarNotes = null
  let violinNotes = null
  const products = resolveStageIInstrumentProducts(notes, {
    builders: {
      guitar(value) {
        guitarBuilderCalls += 1
        guitarNotes = value
        return {
          state: 'rendered',
          allowed: true,
          definitive: true,
          text: 'e|--0--|',
          mode: 'basic',
        }
      },
      violin(value) {
        violinBuilderCalls += 1
        violinNotes = value
        return {
          state: 'projected',
          allowed: true,
          definitive: true,
          teacherApproved: false,
          mode: 'basic',
        }
      },
    },
  })

  assert.equal(guitarBuilderCalls, 1)
  assert.equal(violinBuilderCalls, 1)
  assert.equal(guitarNotes, notes)
  assert.equal(violinNotes, notes)
  assert.equal(products.guitar.state, STAGE_I_PRODUCT_STATE.AVAILABLE)
  assert.equal(products.violin.state, STAGE_I_PRODUCT_STATE.AVAILABLE)
  assert.equal(products.guitar.actionAllowed, true)
  assert.equal(products.violin.actionAllowed, true)
  assert.equal(products.guitar.definitiveInstrumentOutput, true)
  assert.equal(products.violin.definitiveInstrumentOutput, true)
  assert.equal(products.teacherApproved, false)
  assert.equal(products.shareAuthorized, false)
  assert.equal(products.studentDeliveryAuthorized, false)
})

test('S02 exposes source-not-verified for a structurally valid REVIEW route without invoking solvers', () => {
  const notes = unverifiedStructurallyValidNotes()
  const report = prepareMusicXmlQualityGate(notes, VALID_4_4_XML)
  assert.equal(report.structurallyValid, true)
  assert.equal(report.reliable, true)
  assert.equal(report.sourceVerified, false)

  let guitarBuilderCalls = 0
  let violinBuilderCalls = 0
  const products = resolveStageIInstrumentProducts(notes, {
    builders: {
      guitar() {
        guitarBuilderCalls += 1
        throw new Error('Guitar solver must not run for REVIEW.')
      },
      violin() {
        violinBuilderCalls += 1
        throw new Error('Violin solver must not run for REVIEW.')
      },
    },
  })

  for (const model of [products.guitar, products.violin]) {
    assert.equal(model.state, STAGE_I_PRODUCT_STATE.REVIEW_REQUIRED)
    assert.equal(model.reason, 'source-not-verified')
    assert.equal(model.stageGRoute?.reason, model.reason)
    assert.equal(model.actionAllowed, false)
    assert.equal(model.definitiveInstrumentOutput, false)
    assert.equal(
      model.statusText,
      'İnceleme gerekiyor · Kaynak müzikal olarak doğrulanmadı.',
    )
  }

  assert.equal(guitarBuilderCalls, 0)
  assert.equal(violinBuilderCalls, 0)
})

test('S02 exposes the exact current BLOCK reason for real Gesi Guitar and Violin without invoking solvers', () => {
  const parsed = parseMusicXmlToNotes(gesiXml)
  assert.equal(parsed.error, undefined)
  assert.ok(parsed.notes.length > 0)

  const report = prepareMusicXmlQualityGate(parsed.notes, gesiXml)
  // Gesi is a reviewed raw Audiveris regression fixture, not teacher-verified
  // ground truth. In the current full app-quality path it also carries structural
  // findings, so the stronger fail-closed quality reason takes precedence over
  // source-not-verified.
  assert.equal(report.structurallyValid, false)
  assert.equal(report.reliable, false)
  assert.equal(report.sourceVerified, false)

  let guitarBuilderCalls = 0
  let violinBuilderCalls = 0
  const products = resolveStageIInstrumentProducts(parsed.notes, {
    builders: {
      guitar() {
        guitarBuilderCalls += 1
        throw new Error('Guitar solver must not run for BLOCK.')
      },
      violin() {
        violinBuilderCalls += 1
        throw new Error('Violin solver must not run for BLOCK.')
      },
    },
  })

  for (const model of [products.guitar, products.violin]) {
    assert.equal(model.state, STAGE_I_PRODUCT_STATE.BLOCKED)
    assert.equal(model.reason, 'quality-report-unreliable')
    assert.equal(model.stageGRoute?.reason, model.reason)
    assert.equal(model.actionAllowed, false)
    assert.equal(model.definitiveInstrumentOutput, false)
    assert.equal(
      model.statusText,
      'Kullanım engellendi · Kalite raporu güvenilir değil.',
    )
  }

  assert.equal(guitarBuilderCalls, 0)
  assert.equal(violinBuilderCalls, 0)
})

test('S02 reason copy is bounded and does not invent text for unknown internal reasons', () => {
  assert.equal(stageIReasonCopy('quality-report-missing'), 'Kalite raporu henüz hazır değil.')
  assert.equal(stageIReasonCopy('source-not-verified'), 'Kaynak müzikal olarak doğrulanmadı.')
  assert.equal(stageIReasonCopy('canonical-review-required'), 'Nota verisinin bir bölümü kesinleştirilmedi.')
  assert.equal(stageIReasonCopy('quality-report-unreliable'), 'Kalite raporu güvenilir değil.')
  assert.equal(stageIReasonCopy('stage-g-pass-permission-mismatch'), null)
  assert.equal(stageIReasonCopy('instrument-consumer-review-required'), null)
  assert.equal(stageIReasonCopy('not-a-real-stage-i-reason'), null)
  assert.equal(stageIReasonCopy(null), null)
})
