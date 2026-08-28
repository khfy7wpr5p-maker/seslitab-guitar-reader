// Package 8B-T1 — read-only repository training-candidate inventory.
//
// The existing owner-approved Plan 0 chain is valuable evidence, but its
// APPROVAL.md approves golden-reference use, not explicit Audiveris training
// use. The repository also does not currently preserve a separate page image,
// glyph image, shape label or symbol coordinates for this chain. Therefore the
// chain remains an incomplete candidate and is never promoted to a dataset
// sample by this inventory.

import {
  createAudiverisTrainingCandidate,
  evaluateAudiverisTrainingCandidate,
} from './audiverisTrainingDatasetContract.js'

const BASE = 'tests/fixtures/golden-reference/plan0-owner-approved-3-8'

export const AUDIVERIS_8B_REPOSITORY_CANDIDATES = Object.freeze([
  createAudiverisTrainingCandidate({
    candidateId: 'plan0-owner-approved-3-8-evidence-chain',
    provenanceId: 'plan0-owner-approved-3-8',
    split: null,
    sourcePdf: {
      path: `${BASE}/source.pdf`,
      sha256: 'df4b8ea20b6420ebdf6b3e1d625016090105fed0c2f60a4e03874d3c3be2b9b9',
    },
    pageImage: null,
    omrArtifact: {
      path: `${BASE}/project.omr`,
      sha256: '7424e684825b51e8fd31596c94acd5ef008a84fbaecb5c0524222aaec8f8a21a',
    },
    musicXml: {
      path: `${BASE}/expected.musicxml`,
      sha256: '009dd2fd4439a4138ed62cd0e0945a5611add8db38c58c7b0f90429ccd9970f6',
    },
    glyphImage: null,
    shapeLabel: null,
    symbolCoordinates: null,
    referenceApprovalEvidence: {
      path: `${BASE}/APPROVAL.md`,
      sha256: '4cda4b23b71c738e0b7117d84a4d1256656e010359c5a4b9f1f1db474ad8dfc3',
    },
    // Golden-reference approval is intentionally not reinterpreted as a
    // training-sample approval. A separate explicit training scope is needed.
    trainingApproval: null,
    licenseId: 'CC0-1.0',
    licenseEvidence: {
      path: `${BASE}/APPROVAL.md`,
      sha256: '4cda4b23b71c738e0b7117d84a4d1256656e010359c5a4b9f1f1db474ad8dfc3',
    },
    audiverisVersion: '5.11.0',
  }),
])

export const AUDIVERIS_8B_REPOSITORY_EVALUATIONS = Object.freeze(
  AUDIVERIS_8B_REPOSITORY_CANDIDATES.map((candidate) =>
    Object.freeze({
      candidateId: candidate.candidateId,
      evaluation: evaluateAudiverisTrainingCandidate(candidate),
    }),
  ),
)
