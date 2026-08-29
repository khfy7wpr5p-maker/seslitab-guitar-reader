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
5. define focused tests, full regression, production build and any required browser proof;
6. confirm write/merge authority;
7. use a dedicated branch and never direct-commit to main;
8. resolve review findings and require exact-head CI before merge;
9. merge with exact expected head;
10. require exact-main CI before status advancement.

Only one implementation package may be active at a time.

## Current roadmap position

As of verified Package 8B-T3 implementation closure on 2026-08-29:

- Package 0–7: **Completed**
- Package 8 / T1–T6: **Completed**
- Package 8B: **Partially implemented**
- Package 8B-T1 — verified dataset contract: **Completed**
- Package 8B-T2 — verified evidence intake/readiness: **Completed**
- Package 8B-T3 — bounded MUSCIMA accidental mapping: **Completed**
- Package 9 — Advanced Guitar TAB: Not started / sequentially blocked while Package 8B is incomplete unless roadmap changes explicitly
- Package 10 — Advanced Violin: Not started
- Package 11 — Accessible Tuner: Not started
- Package 12 — Teacher-to-student sharing: Not started
- Package 13 — Simplified rhythm mode: Not started
- Package 14 — Mobile productisation: Partially implemented

Verified Package 8B-T3 implementation main:
`258ac27262aa4715164aafebe8fce97bb89f9dfb`

Exact-main CI #286 / run `33246461356`, job `99084669804`:

- **1275/1275 tests PASS**
- **232 suites**
- 0 failed/skipped/cancelled
- **0 vulnerabilities**
- production build PASS
- real-browser score runtime proof PASS
- Package 8B-T1/T2/T3 focused regressions PASS
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
4. `trainingApproval` is separate from golden/reference or engineering-stage approval.
5. Training approval scope is `audiveris_training_sample`.
6. Training approval binds to the exact deterministic candidate-evidence SHA-256 fingerprint.
7. Any exact evidence change prevents reuse of prior training approval.
8. Dataset manifests accept only T1-trainable candidates and reject train/evaluation leakage.
9. IDs/timestamps and missing evidence are never invented.
10. No production Audiveris/provider/runtime/gateway/worker/Docker/Render integration is activated.

## Package 8B-T2 invariants

1. T2 accepts only a strict T1 candidate plus dense exact `{ field, path, bytes }` evidence observations.
2. Raw evidence bytes are hashed by T2 itself.
3. Exact path/hash mismatch, duplicate fields and undeclared evidence are rejected.
4. Missing declared observations remain incomplete.
5. T2 cannot promote a T1-incomplete candidate.
6. `eligible` means eligible for manifest review only, not training authorization or production readiness.
7. Raw evidence bytes are not retained in readiness reports.
8. T2 does not infer shape-label or coordinate truth from pixels.
9. No production Audiveris/model/deployment boundary is activated.

## Package 8B-T3 invariants

1. T3 is a bounded **experimental mapping** stage, not a training stage.
2. Only five source classes map to Audiveris accidental shapes:
   - `accidentalSharp` → `SHARP`
   - `accidentalFlat` → `FLAT`
   - `accidentalNatural` → `NATURAL`
   - `accidentalDoubleSharp` → `DOUBLE_SHARP`
   - `accidentalDoubleFlat` → `DOUBLE_FLAT`
3. Unrelated classes such as noteheads/stems/barlines are ignored rather than relabelled.
4. Exact page/annotation SHA-256, bbox bounds and binary RLE mask area are validated.
5. Mask fingerprints are computed from decoded pixels; deterministic sample IDs bind exact source evidence.
6. Deterministic split is **page-disjoint only**; writer independence is not claimed.
7. Supplied annotation XML is not an Audiveris `.omr` project and must never be represented as one.
8. User approval to perform T3 engineering is not per-sample `audiveris_training_sample` approval.
9. Every mapped record retains blockers: `missing_omr_artifact`, `missing_training_approval`, `external_license_review_required`.
10. T3 mappings do not bypass T1/T2 trainability/readiness admission.
11. Source/derived MUSCIMA images are not published into this public repo in T3.
12. No Audiveris training, model replacement, provider/runtime, gateway, Docker or Render change occurs.

## User-supplied T3 evidence measured outside the repository

Conversation uploads:

- `Images.rar` SHA-256 `7732e6fece20a5928dc19c45c008b24f1899a1a7510c9d7cac30cb7d18fb1a04`
- `Parsed_by_page_omr_xml.rar` SHA-256 `ffa0caaf1c87b2f34011f42943a8f897701030ddcea9e57a24d6a9735ae24cca`

Measured:

- 100 PNG images + 100 XML annotations, 100/100 page matches;
- 10,109 annotation objects;
- **2,714 accidental annotations**;
- 0 accidental bbox overruns;
- local research-only normalized split: 2,247 mapped train / 467 mapped evaluation across 80/20 pages;
- normalized manifest SHA-256 `1e5ae9441f7d1e02d39f24c4851545eb34b8587428365c5f2b44ebb1ef494a40`.

These 2,714 are **not** T1/T2-admitted trainable samples. Current actual T1/T2 eligible/trainable sample count remains **0**.

## Package 8B implementation map

- `scripts/audiverisTrainingDatasetContract.js` — T1 strict candidate/manifest validation
- `scripts/audiverisTrainingDatasetInventory.js` — T1 read-only current-evidence inventory
- `scripts/audiverisTrainingEvidenceReadiness.js` — T2 exact byte/path/hash readiness evaluator
- `scripts/audiverisMuscimaAccidentalMapping.js` — T3 bounded accidental mapping evidence
- `tests/package8bDatasetContract.test.js` — T1 regressions
- `tests/package8bEvidenceReadiness.test.js` / `tests/package8bEvidenceReadinessReview.test.js` — T2 regressions
- `tests/package8bMuscimaAccidentalMapping.test.js` — T3 mapping/boundary regressions
- `docs/package-8b-t1-closure.md`, `docs/package-8b-t2-closure.md`, `docs/package-8b-t3-closure.md` — closure evidence

## Package 8B-T3 evidence

- PR #113 final head `b3f4b71a9748f2b8281abe5f0d9e6fb925a0fd9a`
- exact-head CI #285 / run `33246314925`, job `99084280341`: SUCCESS
- review threads: 0 unresolved
- protected-main merge `258ac27262aa4715164aafebe8fce97bb89f9dfb`
- exact-main CI #286 / run `33246461356`, job `99084669804`: SUCCESS
- 1275/1275 tests, 232 suites, 0 failures/skips/cancellations, 0 vulnerabilities, build PASS, real-browser proof PASS

## Current blocker / next safe action

Package 8B remains **Partially implemented**. T3 provides useful experimental accidental mapping evidence but does not satisfy T1/T2 trainability.

Before any training stage, fresh-read and explicitly decide:

1. whether T1's `.omr` requirement applies unchanged to third-party classifier-glyph corpora or needs a separately reviewed contract extension;
2. how exact per-sample training authorization is represented under the external MUSCIMA/CVC-MUSCIMA licence boundary;
3. how evaluation avoids overstating generalization when only page-disjoint, not writer-independent, split evidence is known.

Do not run training, claim accuracy improvement, or replace/tune the production model from T3 mappings alone.

Under the current sequential roadmap, do not start Package 9 while Package 8B remains incomplete unless the user explicitly changes the roadmap.

## Protected integration boundaries

Unless separately and explicitly authorized with measured evidence, do not change:

- production Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway or production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection;
- production model selection/replacement.

Do not add dependencies unless necessary and approved. Do not invent notes, rhythms, symbols, training labels, coordinates, `.omr` evidence, approvals, licences or performance metrics.
