# Package 8B-T2 — Verified Evidence Intake / Readiness

Date: 2026-08-28  
Status: **Completed**

## Purpose

Package 8B-T2 adds a bounded, fail-closed readiness boundary on top of the completed Package 8B-T1 dataset contract.

T2 answers only this question:

> Do the actual evidence bytes supplied to the isolated intake boundary match the exact artifact path/hash claims already declared by a valid T1 candidate, and is that candidate complete enough to proceed to dataset-manifest review?

T2 does **not** train Audiveris, admit data into a production model, measure recognition accuracy, or authorize model replacement.

## Prerequisite and verified baseline

Package 8B-T1 was completed and docs-closed before T2.

T2 implementation baseline:

`bc5dd930a9f2538160bf07e628cce5876c8223dd`

Exact-main CI #269 baseline:

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

T2 verifies bytes for T1-declared artifact evidence only:

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

Evidence paths are compared exactly and are not trimmed into equivalence. Raw bytes are never retained in the readiness report.

## Fail-closed rules

1. Invalid or mutable/injected T1 candidates are rejected before readiness evaluation.
2. Sparse or malformed intake arrays fail closed.
3. Intake entries must contain exactly `field`, `path`, and `bytes` as enumerable data properties.
4. Unknown evidence fields fail closed.
5. Duplicate evidence fields produce `rejected` readiness.
6. Evidence for a field not declared by the T1 candidate produces `rejected` readiness.
7. Exact raw path mismatch produces `rejected` readiness even when bytes happen to hash to the declared artifact.
8. Exact SHA-256 mismatch produces `rejected` readiness.
9. A declared artifact with no supplied observation keeps readiness `incomplete`.
10. T1 trainability remains authoritative: T2 cannot promote an incomplete T1 candidate.
11. MusicXML-only evidence remains incomplete even when its bytes verify exactly.
12. Readiness reports are immutable and semantically validated; contradictory frozen report objects do not become valid by shape alone.

## Current repository truth

The repository candidate `plan0-owner-approved-3-8-evidence-chain` has real PDF, `.omr`, MusicXML, reference approval/licence evidence and recorded hashes.

T2 verifies those currently declared bytes against the repository fixture in regression tests, but the candidate remains **incomplete** because it still lacks:

- separate page image;
- glyph image;
- real shape label;
- symbol coordinates;
- explicit `audiveris_training_sample` approval;
- train/evaluation split assignment.

Therefore the current real eligible/trainable sample count remains **0**.

No missing evidence is generated, inferred or fabricated.

## Implementation map

- `scripts/audiverisTrainingEvidenceReadiness.js` — isolated byte-hash/readiness evaluator and strict report validator
- `tests/package8bEvidenceReadiness.test.js` — main T2 regressions, including current real repository evidence
- `tests/package8bEvidenceReadinessReview.test.js` — semantic-forgery, exact-path and readiness-wording hardening regressions
- `docs/package-8b-t2-evidence-readiness.md` — this contract
- `docs/package-8b-t2-closure.md` — final implementation/CI/review closure evidence

## Review hardening

PR review found one P2 exact-path issue: intake paths were initially passed through a trimming helper, allowing a whitespace-padded locator to compare as the declared path. The merge was stopped.

The final head uses a raw-path validator and compares the supplied path byte-for-byte. A dedicated regression proves that a leading/trailing-whitespace variant with identical bytes is `PATH_MISMATCH` / `rejected`.

## Verification evidence

Implementation PR #106:

- final head: `8d333a4bc3de2b58731b6c0360e5d0923b9728fb`
- exact-head CI #272 / run `33207712313`, job `98972982291`: **SUCCESS**
- **1244/1244 tests PASS**
- **232 suites**
- 0 failed/skipped/cancelled
- **0 vulnerabilities**
- production build PASS
- review P2 fixed and regression-tested
- unresolved review threads: 0 at merge gate
- branch: 0 behind at merge gate

Protected-main squash merge:

`ce5210476c5957595a9159abff6fd3b64afd10bd`

Exact-main CI #273 / run `33207881028`, job `98973500868`:

- **SUCCESS**
- **1244/1244 tests PASS**
- **232 suites**
- 0 failed/skipped/cancelled
- **0 vulnerabilities**
- production build PASS
- existing OMR/Audiveris, Render Blueprint and Dockerfile safety regressions PASS

## Protected boundaries

T2 changed no production Audiveris/OMR provider/runtime/preflight, worker/provider selection, Cloud OMR Gateway, `Dockerfile`, `render.yaml`, Render deployment connection, dependency, workflow, model-training execution or production model selection/replacement.

## Completion result

All T2 acceptance criteria are satisfied. **Package 8B-T2 is Completed.**

Package 8B as a whole remains **Partially implemented** because there is still no genuine teacher-verified training-ready symbol sample. No evidence-supported T3 coding stage is declared by this closure; the next safe action is to obtain genuine missing evidence and fresh-read it through T1/T2 before any training work.
