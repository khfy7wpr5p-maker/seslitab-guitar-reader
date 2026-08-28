# SesliTab AI Context

## Official project and purpose

SesliTab is an inclusive, teacher-supervised and semi-automatic music-education system for blind, low-vision and sighted students. Unverified musical or training data must never be presented as definitively correct.

## Sources of truth

Product/safety truth: `docs/project-charter.md`, this file, and approved package instructions.  
Implementation truth: source code, tests/fresh CI, `docs/current-status.md`, `docs/package-status.md`, architecture and closure documents.

If documentation conflicts with code or fresh repository state, report the conflict rather than guessing.

## Required development procedure

Before each implementation stage:

1. fresh read-only repository inspection;
2. verify protected-main SHA, open PR/issues and current CI;
3. confirm exact package and prerequisites;
4. define allowed files and protected boundaries;
5. define focused tests, full regression and production build;
6. confirm write/merge authority;
7. use a dedicated branch and never direct-commit to main;
8. resolve review findings and require exact-head CI before merge;
9. merge with exact expected head;
10. require exact-main CI before status advancement.

Only one implementation package may be active at a time.

## Current roadmap position

As of verified Package 8B-T2 implementation closure on 2026-08-28:

- Package 0–7: **Completed**
- Package 8 / T1–T6: **Completed**
- Package 8B: **Partially implemented**
- Package 8B-T1 — verified dataset contract: **Completed**
- Package 8B-T2 — verified evidence intake/readiness: **Completed**
- Package 9 — Advanced Guitar TAB: Not started / sequentially blocked while Package 8B is incomplete
- Package 10 — Advanced Violin: Not started
- Package 11 — Accessible Tuner: Not started
- Package 12 — Teacher-to-student sharing: Not started
- Package 13 — Simplified rhythm mode: Not started
- Package 14 — Mobile productisation: Partially implemented

Verified Package 8B-T2 implementation main:
`ce5210476c5957595a9159abff6fd3b64afd10bd`

Exact-main CI #273 / run `33207881028`, job `98973500868`:

- **1244/1244 tests PASS**
- **232 suites**
- 0 failed/skipped/cancelled
- **0 vulnerabilities**
- production build PASS
- Package 8B-T1/T2 focused and review regressions PASS
- existing OMR/Audiveris, Render Blueprint and Dockerfile security regressions PASS

## Package 8 invariants retained

1. Automatic source revision is immutable.
2. Correction creates a new immutable revision and never overwrites its parent.
3. Correction audit evidence is separate from approval.
4. Quality-gate `ACCEPT` is not teacher approval.
5. Teacher approval binds to one exact revision and does not survive later revision/undo automatically.
6. History is lossless; undo creates new lineage.
7. Stale teacher mutation conflicts with zero partial domain write.
8. Package 12 later needs its own student-sharing authorization/quality contract.

## Package 8B-T1 invariants

1. T1 is research/data-domain only; it does not run or train Audiveris.
2. MusicXML alone is not an Audiveris training sample.
3. Candidate evidence is explicit: PDF, page image, `.omr`, MusicXML, glyph, shape label, coordinates, licence, Audiveris version and split.
4. `trainingApproval` is separate from golden/reference approval.
5. Training approval scope is `audiveris_training_sample`.
6. Training approval binds to the exact deterministic candidate-evidence SHA-256 fingerprint.
7. Any exact evidence change prevents reuse of the prior training approval.
8. Candidate, nested evidence and manifest records are strict immutable data.
9. Dataset manifests accept only trainable candidates.
10. Train/evaluation leakage is rejected by provenance and shared PDF/page/.omr/MusicXML/glyph hashes.
11. Dataset fingerprinting/versioning is deterministic and IDs/timestamps are never invented.
12. Unsafe paths, malformed hashes, accessors, sparse arrays, injected or mutable evidence fail closed.
13. No production Audiveris/provider/runtime/gateway/worker/Docker/Render integration is activated.

## Package 8B-T2 invariants

1. T2 accepts only a strict T1 candidate plus dense exact `{ field, path, bytes }` evidence observations.
2. Raw evidence bytes must be non-empty `Uint8Array` values and are hashed by T2 itself.
3. Caller-provided digest strings do not prove byte verification.
4. Evidence paths are compared exactly and are not trimmed into equivalence.
5. Exact path/hash mismatch, duplicate fields and undeclared evidence are rejected.
6. Missing declared observations remain incomplete.
7. T2 cannot promote a T1-incomplete candidate.
8. `eligible` means eligible for dataset-manifest review only; it is not training authorization or production readiness.
9. MusicXML-only evidence cannot be promoted.
10. Raw evidence bytes are never retained in readiness reports.
11. Readiness reports are deterministic, immutable and semantically fail-closed.
12. T2 does not infer shape-label or coordinate truth from pixels.
13. No production Audiveris/model/deployment boundary is activated.

## Current real 8B evidence

The repository currently has one owner/teacher-approved golden-reference chain:

`tests/fixtures/golden-reference/plan0-owner-approved-3-8/`

It preserves PDF + `.omr` + MusicXML + reference approval + SHA-256/licence evidence, with Audiveris 5.11.0 recorded. T2 verifies the currently declared artifact bytes in regression tests.

It remains **INCOMPLETE** for Audiveris training because the repository has no separate page image, glyph image, real shape label, symbol coordinates, explicit `audiveris_training_sample` approval or train/evaluation split assignment.

Current actual eligible/trainable 8B sample count: **0**.

Never fabricate the missing evidence and never infer that benchmark/golden approval is training approval.

## Package 8B implementation map

- `scripts/audiverisTrainingDatasetContract.js` — strict T1 candidate/manifest validation, exact approval binding, deterministic fingerprints and split isolation
- `scripts/audiverisTrainingDatasetInventory.js` — read-only T1 inventory of current repository evidence
- `scripts/audiverisTrainingEvidenceReadiness.js` — T2 isolated raw-byte path/hash readiness evaluator
- `tests/package8bDatasetContract.test.js` — T1 fail-closed/boundary regressions
- `tests/package8bEvidenceReadiness.test.js` — T2 readiness/current-repository regressions
- `tests/package8bEvidenceReadinessReview.test.js` — T2 semantic-forgery/exact-path hardening regressions
- `docs/package-8b-t1-closure.md` / `docs/package-8b-t2-closure.md` — closure evidence

## Package 8B-T2 evidence

- PR #106 final head `8d333a4bc3de2b58731b6c0360e5d0923b9728fb`
- exact-head CI #272 / run `33207712313`, job `98972982291`: SUCCESS
- 1244/1244 tests, 232 suites, 0 failures/skips/cancellations, 0 vulnerabilities, build PASS
- review P2 exact-path issue fixed and regression-tested
- protected-main merge `ce5210476c5957595a9159abff6fd3b64afd10bd`
- exact-main CI #273 / run `33207881028`, job `98973500868`: SUCCESS
- 1244/1244 tests, 232 suites, 0 failures/skips/cancellations, 0 vulnerabilities, build PASS

## Current blocker / next safe action

Package 8B remains **Partially implemented**. There is no evidence-supported T3 coding stage while genuine teacher-verified symbol training evidence is absent.

The next safe action is to obtain genuine missing evidence and then fresh-read it through T1/T2. Do not generate page/glyph images and label them as teacher evidence, infer real Audiveris shape labels, invent coordinates/approvals/licences/splits, run training, claim accuracy improvement, or replace/tune the production model.

Under the approved sequential roadmap, do not start Package 9 while Package 8B remains incomplete unless the user explicitly changes the roadmap.

## Protected integration boundaries

Unless separately and explicitly authorized with measured evidence, do not change:

- production Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway or production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection;
- production model selection/replacement.

Do not add dependencies unless necessary and approved. Do not invent notes, rhythms, symbols, training labels, coordinates, approval evidence or performance metrics.
