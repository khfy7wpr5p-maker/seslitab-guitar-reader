import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SMOOSIC_CORRECTION_OVERLAY_REQUEST,
  SMOOSIC_CORRECTION_OVERLAY_RESULT,
  createSmoosicCorrectionOverlayCommand,
  validateSmoosicCorrectionOverlayResult,
} from '../src/services/smoosicCorrectionOverlayBridge.js'

function analysis(overrides = {}) {
  return {
    contract:
      'ST_OMR_CORRECTION_ENGINE_SUSPICIOUS_MEASURES_V1',
    mode: 'SHADOW_ONLY',
    sourceId: 'smoosic-source:7',
    sourceHash: 'a'.repeat(64),
    partId: 'P1',
    measureCount: 4,
    eventCount: 8,
    findings: [],
    suspiciousMeasures: [
      {
        measureKey: 'm2',
        measureNumber: '2',
        measureIndex: 1,
        codes: ['DURATION_MISMATCH'],
        errorClasses: ['DURATION'],
        findingIds: ['finding-1'],
      },
      {
        measureKey: 'm2-duplicate',
        measureNumber: '2',
        measureIndex: 1,
        codes: ['ONSET_MISMATCH'],
        errorClasses: ['ONSET'],
        findingIds: ['finding-2'],
      },
    ],
    unmappedFindingCount: 0,
    sourceGraphMutated: false,
    automaticApplyAuthority: false,
    musicXmlWriteBackAuthority: false,
    ...overrides,
  }
}

test('SES-120 creates a bounded exact source-bound Smoosic overlay replace command', () => {
  const command =
    createSmoosicCorrectionOverlayCommand(
      analysis(),
      {
        requestId: 'overlay-request-1',
        sourceRevision: 7,
        expectedSourceId:
          'smoosic-source:7',
      },
    )

  assert.deepEqual(command, {
    type: SMOOSIC_CORRECTION_OVERLAY_REQUEST,
    version: 1,
    action: 'replace',
    requestId: 'overlay-request-1',
    sourceRevision: 7,
    sourceHash: 'a'.repeat(64),
    targets: [
      {
        partId: 'P1',
        measureIndex: 1,
      },
    ],
  })
  assert.equal(Object.isFrozen(command), true)
  assert.equal(
    Object.isFrozen(command.targets),
    true,
  )
})

test('SES-120 rejects ambiguous CE mapping instead of guessing', () => {
  assert.throws(
    () =>
      createSmoosicCorrectionOverlayCommand(
        analysis({
          unmappedFindingCount: 1,
        }),
        {
          requestId: 'overlay-request-2',
          sourceRevision: 7,
          expectedSourceId:
            'smoosic-source:7',
        },
      ),
    /unmapped|mapping/i,
  )

  assert.throws(
    () =>
      createSmoosicCorrectionOverlayCommand(
        analysis(),
        {
          requestId: 'overlay-request-3',
          sourceRevision: 7,
          expectedSourceId:
            'smoosic-source:8',
        },
      ),
    /source identity/i,
  )
})

test('SES-120 validates exact iframe acknowledgement identity', () => {
  const ack = {
    type: SMOOSIC_CORRECTION_OVERLAY_RESULT,
    version: 1,
    requestId: 'overlay-request-4',
    sourceRevision: 11,
    ok: true,
    appliedCount: 2,
    sourceHash: 'b'.repeat(64),
  }

  assert.equal(
    validateSmoosicCorrectionOverlayResult(
      ack,
      {
        requestId: 'overlay-request-4',
        sourceRevision: 11,
        sourceHash: 'b'.repeat(64),
      },
    ),
    ack,
  )

  assert.throws(
    () =>
      validateSmoosicCorrectionOverlayResult(
        {
          ...ack,
          requestId: 'forged',
        },
        {
          requestId: 'overlay-request-4',
          sourceRevision: 11,
          sourceHash: 'b'.repeat(64),
        },
      ),
    /requestId/i,
  )

  assert.throws(
    () =>
      validateSmoosicCorrectionOverlayResult(
        {
          ...ack,
          sourceHash: 'c'.repeat(64),
        },
        {
          requestId: 'overlay-request-4',
          sourceRevision: 11,
          sourceHash: 'b'.repeat(64),
        },
      ),
    /source hash/i,
  )
})
