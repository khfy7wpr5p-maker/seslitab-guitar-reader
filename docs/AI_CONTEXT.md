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

As of verified Package 8B-T1 implementation closure on 2026-08-28:

- Package 0–7: **Completed**
- Package 8 / T1–T6: **Completed**
- Package 8B: **Partially implemented**
- Package 8B-T1 — verified dataset contract: **Completed**
- Package 8B-T2 — verified evidence intake/readiness: **NEXT / Not started**
- Package 9 — Advanced Guitar TAB: Not started
- Package 10 — Advanced Violin: Not started
- Package 11 — Accessible Tuner: Not started
- Package 12 — Teacher-to-student sharing: Not started
- Package 13 — Simplified rhythm mode: Not started
- Package 14 — Mobile productisation: Partially implemented

Verified Package 8B-T1 implementation main:
`278b69ed1f7f0cede6a3dc00e8265e887811c88b`

Exact-main CI #266 / run `33196791822`, job `98935863577`:

- **1228/1228 tests PASS**
- **232 suites**
- 0 failed/skipped/cancelled
- **0 vulnerabilities**
- production build PASS
- Package 8B-T1 focused/review regressions PASS
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

## Current real 8B evidence

The repository currently has one owner/teacher-approved golden-reference chain:

`tests/fixtures/golden-reference/plan0-owner-approved-3-8/`

It preserves PDF + `.omr` + MusicXML + approval + SHA-256 integrity, with CC0-1.0 rights evidence and Audiveris 5.11.0 recorded.

It is intentionally **INCOMPLETE** for Audiveris training because the repository has no separate page image, glyph image, shape label, symbol coordinates, explicit training approval or split assignment for that chain.

Current actual trainable 8B sample count: **0**.

Never fabricate the missing evidence and never infer that benchmark/golden approval is training approval.

## Package 8B-T1 implementation map

- `scripts/audiverisTrainingDatasetContract.js` — strict candidate/manifest validation, exact approval binding, deterministic fingerprints and split isolation
- `scripts/audiverisTrainingDatasetInventory.js` — read-only inventory of current repository evidence
- `tests/package8bDatasetContract.test.js` — focused fail-closed and boundary regressions
- `docs/package-8b-t1-dataset-contract.md` — T1 contract
- `docs/package-8b-t1-closure.md` — closure evidence

## Package 8B-T1 evidence

- PR #104 final head `4005192f55afead7d22e7a32db596569faa7aff9`
- exact-head CI #265 / run `33196559638`, job `98935074605`: SUCCESS
- 1228/1228 tests, 232 suites, 0 vulnerabilities, build PASS
- review threads: none
- protected-main merge `278b69ed1f7f0cede6a3dc00e8265e887811c88b`
- exact-main CI #266 / run `33196791822`, job `98935863577`: SUCCESS
- 1228/1228 tests, 232 suites, 0 fail/skipped/cancelled, 0 vulnerabilities, build PASS

## Next bounded stage: Package 8B-T2

T2 may only establish a bounded intake/readiness/report layer for genuinely supplied external or repository evidence against the T1 contract.

Safe T2 candidates include:

- classify evidence as eligible/incomplete/rejected without modifying it;
- produce deterministic missing-evidence/readiness reports;
- verify declared file/hash/provenance/training-approval references at an isolated boundary;
- keep actual admitted training samples separate from mere candidates.

T2 must **not**:

- generate page images or glyphs and call them teacher evidence;
- infer/assign real Audiveris shape labels without teacher evidence;
- invent coordinates, approvals, licences or source metadata;
- run model training;
- claim accuracy improvement;
- replace/tune the production model;
- change the production OMR path.

If no new verified training artifacts are supplied, T2 should remain an intake/readiness contract and report zero admitted real samples.

## Protected integration boundaries

Unless separately and explicitly authorized, do not change:

- production Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway or production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection.

Do not add dependencies unless necessary and approved. Do not invent notes, rhythms, symbols, training labels, coordinates, approval evidence or performance metrics.
