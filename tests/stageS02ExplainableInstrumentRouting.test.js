import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Install the repository's minimal DOMParser for Node tests.
import '../scripts/runOmrQualityReport.js'

import { parseMusicXmlToNotes } from '../src/services/musicEngine.js'
import { prepareMusicXmlQualityGate } from '../src/services/appQualityGate.js'
import {
  resolveStageIInstrumentProducts,
  stageIReasonCopy,
  STAGE_I_PRODUCT_STATE,
} from '../src/services/stageIInstrumentProduct.js'

const gesiXml = readFileSync(
  new URL('./fixtures/real-omr/gesi-clean.xml', import.meta.url),
  'utf8',
)

test('S02 exposes the exact source-not-verified reason for real Gesi Guitar and Violin routes without invoking solvers', () => {
  const parsed = parseMusicXmlToNotes(gesiXml)
  assert.equal(parsed.error, undefined)
  assert.ok(parsed.notes.length > 0)

  const report = prepareMusicXmlQualityGate(parsed.notes, gesiXml)
  assert.equal(report.structurallyValid, true)
  assert.equal(report.sourceVerified, false)

  let guitarBuilderCalls = 0
  let violinBuilderCalls = 0
  const products = resolveStageIInstrumentProducts(parsed.notes, {
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
    assert.equal(model.actionAllowed, false)
    assert.equal(model.definitiveInstrumentOutput, false)
    assert.match(model.statusText, /^İnceleme gerekiyor · /)
    assert.match(model.statusText, /Kaynak müzikal olarak doğrulanmadı\./)
  }

  assert.equal(guitarBuilderCalls, 0)
  assert.equal(violinBuilderCalls, 0)
})

test('S02 reason copy is bounded and does not invent text for unknown internal reasons', () => {
  assert.equal(stageIReasonCopy('quality-report-missing'), 'Kalite raporu henüz hazır değil.')
  assert.equal(stageIReasonCopy('canonical-review-required'), 'Nota verisinin bir bölümü kesinleştirilmedi.')
  assert.equal(stageIReasonCopy('quality-report-unreliable'), 'Kalite raporu güvenilir değil.')
  assert.equal(stageIReasonCopy('not-a-real-stage-i-reason'), null)
  assert.equal(stageIReasonCopy(null), null)
})
