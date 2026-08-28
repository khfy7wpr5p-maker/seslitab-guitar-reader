# Package 8B-T2 — Verified Evidence Intake / Readiness

Date: 2026-08-28  
Status: **Implementation in progress**

## Purpose

Package 8B-T2 adds a bounded, fail-closed readiness boundary on top of the completed Package 8B-T1 dataset contract.

T2 answers only this question:

> Do the actual evidence bytes supplied to the isolated intake boundary match the exact artifact path/hash claims already declared by a valid T1 candidate, and is that candidate complete enough to proceed to dataset-manifest review?

T2 does **not** train Audiveris, admit data into a production model, measure recognition accuracy, or authorize model replacement.

## Prerequisite

Package 8B-T1 is completed and closed on protected main.

Verified T1 closure main before T2:

`bc5dd930a9f2538160bf07e628cce5876c8223dd`

Exact-main CI #269 is the T2 baseline:

- 1228/1228 tests PASS
- 232 suites
- 0 failed/skipped/cancelled
- 0 vulnerabilities
- production build PASS

## Readiness states

- `eligible` — the T1 candidate is trainable under the T1 contract and every declared artifact reference supplied to T2 has matching exact path + SHA-256 bytes. This means **eligible for dataset-manifest review only**.
- `incomplete` — the T1 candidate is incomplete or one or more declared artifacts have not yet been observed by T2.
- `rejected` — supplied intake evidence contradicts the candidate, for example through a path/hash mismatch, duplicate evidence field, or evidence supplied for an undeclared field.

`eligible` is **not** equivalent to:

- musical correctness;
- model-training execution authorization;
- dataset admission;
- accuracy improvement;
- production readiness;
- production model replacement approval.

## Evidence fields

T2 can verify bytes for T1-declared artifact evidence only:

- source PDF;
- page image;
- `.omr` artifact;
- MusicXML provenance artifact when declared;
- glyph image;
- reference-approval evidence when declared;
- licence evidence;
- explicit training-approval evidence.

Shape labels and symbol coordinates remain structured T1 candidate evidence. T2 does not infer their semantic truth from pixels. A candidate still requires the exact explicit `audiveris_training_sample` approval binding established by T1.

## Byte verification boundary

`evaluateAudiverisEvidenceReadiness(candidate, evidenceEntries)` accepts:

- one strict immutable T1 candidate;
- a dense array of exact `{ field, path, bytes }` intake records;
- `bytes` as non-empty `Uint8Array` values.

T2 computes SHA-256 itself from the supplied raw bytes. Caller-provided digest strings are not accepted as verification evidence.

Raw bytes are never retained in the readiness report.

## Fail-closed rules

1. Invalid or mutable/injected T1 candidates are rejected before readiness evaluation.
2. Sparse or malformed intake arrays fail closed.
3. Intake entries must contain exactly `field`, `path`, and `bytes` as enumerable data properties.
4. Unknown evidence fields fail closed.
5. Duplicate evidence fields produce `rejected` readiness.
6. Evidence for a field not declared by the T1 candidate produces `rejected` readiness.
7. Exact path mismatch produces `rejected` readiness even when bytes happen to hash to another declared artifact.
8. Exact SHA-256 mismatch produces `rejected` readiness.
9. A declared artifact with no supplied observation keeps readiness `incomplete`.
10. T1 trainability remains authoritative: T2 cannot promote an incomplete T1 candidate.
11. MusicXML-only evidence remains incomplete even when its bytes verify exactly.
12. Readiness reports are immutable and semantically validated; contradictory frozen report objects do not become valid by shape alone.

## Current repository truth

The repository candidate `plan0-owner-approved-3-8-evidence-chain` has real PDF, `.omr`, MusicXML, reference approval/licence evidence and recorded hashes.

T2 verifies those declared bytes against the repository fixture in regression tests, but the candidate remains **incomplete** because it still lacks:

- separate page image;
- glyph image;
- real shape label;
- symbol coordinates;
- explicit `audiveris_training_sample` approval;
- train/evaluation split assignment.

Therefore the current real eligible sample count remains **0**.

No missing evidence is generated, inferred or fabricated.

## Implementation map

- `scripts/audiverisTrainingEvidenceReadiness.js` — isolated byte-hash/readiness evaluator and strict report validator
- `tests/package8bEvidenceReadiness.test.js` — main T2 regressions, including current real repository evidence
- `tests/package8bEvidenceReadinessReview.test.js` — semantic-forgery/readiness wording hardening regressions
- `docs/package-8b-t2-evidence-readiness.md` — this contract

## Protected boundaries

T2 must not change or activate:

- production Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway or production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection;
- model-training execution;
- production model selection/replacement.

No dependency is added.

## Acceptance criteria

T2 implementation may be marked complete only if:

1. exact evidence bytes can make a fully valid synthetic T1 candidate `eligible` for manifest review;
2. missing observations remain `incomplete`;
3. path/hash contradictions become `rejected`;
4. malformed/injected intake fails closed;
5. current real repository candidate stays `incomplete` after all currently declared hashes are verified;
6. MusicXML-only evidence cannot be promoted;
7. output is deterministic and immutable;
8. raw evidence bytes are not retained in reports;
9. production OMR/Audiveris/Render/Docker boundaries remain isolated;
10. focused tests, full regression and production build pass on exact PR head;
11. review findings are resolved;
12. protected-main exact merge SHA passes push CI.
