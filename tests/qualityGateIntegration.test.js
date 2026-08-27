import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CANONICAL_NOTE_SCHEMA_VERSION,
  CANONICAL_VERIFICATION_STATUS,
} from '../noteTheory.js'
import { CANONICAL_CONSUMER_TYPE } from '../canonicalConsumerPolicy.js'
import {
  QUALITY_GATE_DECISION,
  QUALITY_GATE_REASON,
  getRegisteredQualityReport,
  registerQualityReportForNotes,
  resolveGuitarTabQualityGate,
  resolvePlaybackQualityGate,
  resolveQualityGateForConsumer,
  resolveTtsQualityGate,
  resolveViolinQualityGate,
  unregisterQualityReportForNotes,
} from '../src/services/qualityGateIntegration.js'
import { QUALITY_STATE } from '../src/services/qualityErrorReport.js'

function verificationState(status) {
  if (status === CANONICAL_VERIFICATION_STATUS.VERIFIED) {
    return {
      schemaVersion: CANONICAL_NOTE_SCHEMA_VERSION,
      status,
      pitch: { valid: true, status },
      time: { valid: true, status },
    }
  }
  if (status === CANONICAL_VERIFICATION_STATUS.PARTIAL) {
    return {
      schemaVersion: CANONICAL_NOTE_SCHEMA_VERSION,
      status,
      pitch: { valid: true, status: CANONICAL_VERIFICATION_STATUS.VERIFIED },
      time: { valid: true, status },
    }
  }
  return {
    schemaVersion: CANONICAL_NOTE_SCHEMA_VERSION,
    status: CANONICAL_VERIFICATION_STATUS.INVALID,
    pitch: { valid: false, status: CANONICAL_VERIFICATION_STATUS.INVALID },
    time: { valid: true, status: CANONICAL_VERIFICATION_STATUS.VERIFIED },
  }
}

function note(status = CANONICAL_VERIFICATION_STATUS.VERIFIED) {
  return {
    noteName: 'Mi',
    sourceVerificationState: verificationState(status),
  }
}

function report(overrides = {}) {
  return {
    qualityState: QUALITY_STATE.SOURCE_VERIFIED,
    structurallyValid: true,
    sourceVerified: true,
    reviewRequired: false,
    reliable: true,
    automaticPlaybackAllowed: true,
    findings: [],
    ...overrides,
  }
}

describe('Package 2D quality gate contract', () => {
  test('verified + structurally valid + source verified data is ACCEPT for mapped consumers', () => {
    const notes = [note(), note()]
    const qualityReport = report()

    for (const resolver of [resolveTtsQualityGate, resolvePlaybackQualityGate, resolveGuitarTabQualityGate]) {
      const result = resolver(notes, { report: qualityReport })
      assert.equal(result.decision, QUALITY_GATE_DECISION.ACCEPT)
      assert.equal(result.reason, QUALITY_GATE_REASON.ACCEPT_VERIFIED)
      assert.equal(result.allowed, true)
      assert.equal(result.definitive, true)
      assert.equal(result.automaticAllowed, true)
    }
  })

  test('missing quality report is REVIEW and never authorizes definitive consumption', () => {
    const notes = [note()]
    const result = resolveTtsQualityGate(notes)

    assert.equal(result.decision, QUALITY_GATE_DECISION.REVIEW)
    assert.equal(result.reason, QUALITY_GATE_REASON.REPORT_MISSING)
    assert.equal(result.allowed, false)
    assert.equal(result.definitive, false)
    assert.equal(result.automaticAllowed, false)
  })

  test('source-unverified report is REVIEW even when structure and canonical notes are valid', () => {
    const notes = [note()]
    const result = resolvePlaybackQualityGate(notes, {
      report: report({
        qualityState: QUALITY_STATE.REVIEW_REQUIRED,
        sourceVerified: false,
        reviewRequired: true,
        automaticPlaybackAllowed: false,
      }),
    })

    assert.equal(result.decision, QUALITY_GATE_DECISION.REVIEW)
    assert.equal(result.reason, QUALITY_GATE_REASON.SOURCE_NOT_VERIFIED)
    assert.equal(result.allowed, false)
  })

  test('partial or legacy canonical notes remain REVIEW even with an optimistic report', () => {
    for (const notes of [
      [note(CANONICAL_VERIFICATION_STATUS.PARTIAL)],
      [{ noteName: 'Mi' }],
    ]) {
      const result = resolveTtsQualityGate(notes, { report: report() })
      assert.equal(result.decision, QUALITY_GATE_DECISION.REVIEW)
      assert.equal(result.reason, QUALITY_GATE_REASON.CANONICAL_REVIEW)
      assert.equal(result.allowed, false)
    }
  })

  test('invalid canonical data is BLOCK before source report can elevate it', () => {
    const notes = [note(CANONICAL_VERIFICATION_STATUS.INVALID)]
    const result = resolvePlaybackQualityGate(notes, { report: report() })

    assert.equal(result.decision, QUALITY_GATE_DECISION.BLOCK)
    assert.equal(result.reason, QUALITY_GATE_REASON.CANONICAL_BLOCKED)
    assert.equal(result.allowed, false)
  })

  test('unreliable or structurally invalid report is BLOCK', () => {
    const notes = [note()]
    const unreliable = resolveTtsQualityGate(notes, {
      report: report({
        qualityState: QUALITY_STATE.UNRELIABLE,
        reliable: false,
        structurallyValid: false,
        reviewRequired: true,
        automaticPlaybackAllowed: false,
      }),
    })
    assert.equal(unreliable.decision, QUALITY_GATE_DECISION.BLOCK)
    assert.equal(unreliable.reason, QUALITY_GATE_REASON.REPORT_UNRELIABLE)

    const invalidStructure = resolveTtsQualityGate(notes, {
      report: report({ structurallyValid: false }),
    })
    assert.equal(invalidStructure.decision, QUALITY_GATE_DECISION.BLOCK)
    assert.equal(invalidStructure.reason, QUALITY_GATE_REASON.STRUCTURE_NOT_VALID)
  })

  test('Guitar TAB uses the same mapped fail-closed quality gate contract', () => {
    const notes = [note()]

    const accepted = resolveGuitarTabQualityGate(notes, { report: report() })
    assert.equal(accepted.decision, QUALITY_GATE_DECISION.ACCEPT)
    assert.equal(accepted.reason, QUALITY_GATE_REASON.ACCEPT_VERIFIED)
    assert.equal(accepted.allowed, true)
    assert.equal(accepted.boundary.status, 'mapped')

    const review = resolveGuitarTabQualityGate(notes, {
      report: report({
        qualityState: QUALITY_STATE.REVIEW_REQUIRED,
        sourceVerified: false,
        reviewRequired: true,
        automaticPlaybackAllowed: false,
      }),
    })
    assert.equal(review.decision, QUALITY_GATE_DECISION.REVIEW)
    assert.equal(review.reason, QUALITY_GATE_REASON.SOURCE_NOT_VERIFIED)
    assert.equal(review.allowed, false)
  })

  test('Package 5D violin helper blocks while the production consumer boundary is pending', () => {
    const notes = [note()]
    const result = resolveViolinQualityGate(notes, { report: report() })

    assert.equal(result.consumerType, CANONICAL_CONSUMER_TYPE.VIOLIN)
    assert.equal(result.decision, QUALITY_GATE_DECISION.BLOCK)
    assert.equal(result.reason, QUALITY_GATE_REASON.CONSUMER_BOUNDARY_PENDING)
    assert.equal(result.allowed, false)
    assert.equal(result.definitive, false)
    assert.equal(result.automaticAllowed, false)
    assert.equal(result.boundary.status, 'pending')
    assert.equal(result.boundary.enforcementReady, false)
  })

  test('pending violin boundary blocks before a missing report could be mistaken for review authorization', () => {
    const notes = [note()]
    const result = resolveViolinQualityGate(notes)

    assert.equal(result.decision, QUALITY_GATE_DECISION.BLOCK)
    assert.equal(result.reason, QUALITY_GATE_REASON.CONSUMER_BOUNDARY_PENDING)
    assert.equal(result.report, null)
  })

  test('report registration is exact-array identity and does not transfer to clones', () => {
    const notes = [note()]
    const clone = [...notes]
    const qualityReport = report()

    registerQualityReportForNotes(notes, qualityReport)
    assert.equal(getRegisteredQualityReport(notes), qualityReport)
    assert.equal(getRegisteredQualityReport(clone), null)

    assert.equal(resolveTtsQualityGate(notes).decision, QUALITY_GATE_DECISION.ACCEPT)
    assert.equal(resolveTtsQualityGate(clone).decision, QUALITY_GATE_DECISION.REVIEW)

    assert.equal(unregisterQualityReportForNotes(notes), true)
    assert.equal(getRegisteredQualityReport(notes), null)
  })

  test('explicit report option is read-only and does not mutate notes or report', () => {
    const notes = [note()]
    const qualityReport = report()
    const beforeNotes = structuredClone(notes)
    const beforeReport = structuredClone(qualityReport)

    resolvePlaybackQualityGate(notes, { report: qualityReport })

    assert.deepEqual(notes, beforeNotes)
    assert.deepEqual(qualityReport, beforeReport)
  })

  test('unsupported consumer and malformed inputs fail closed', () => {
    const notes = [note()]
    assert.throws(
      () => resolveQualityGateForConsumer(notes, 'unknown', { report: report() }),
      /Unsupported canonical consumer type/,
    )
    assert.throws(() => resolveTtsQualityGate(null), /NoteObject array/)
    assert.throws(() => registerQualityReportForNotes(notes, null), /Quality report/)
  })

  test('consumer-specific helpers resolve the expected consumer types', () => {
    const notes = [note()]
    const qualityReport = report()
    assert.equal(resolveTtsQualityGate(notes, { report: qualityReport }).consumerType, CANONICAL_CONSUMER_TYPE.TTS)
    assert.equal(resolvePlaybackQualityGate(notes, { report: qualityReport }).consumerType, CANONICAL_CONSUMER_TYPE.PLAYBACK)
    assert.equal(resolveGuitarTabQualityGate(notes, { report: qualityReport }).consumerType, CANONICAL_CONSUMER_TYPE.GUITAR_TAB)
    assert.equal(resolveViolinQualityGate(notes, { report: qualityReport }).consumerType, CANONICAL_CONSUMER_TYPE.VIOLIN)
  })
})
