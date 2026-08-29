# SesliTab Package Status

Last documentation review: 2026-08-29  
Latest verified protected-main implementation baseline: `08bb9a1d909c20445cc0dbcaf1a5514e48470ee8`  
Latest exact-main implementation CI: **#290 / run `33247398205`, job `99087145954` — SUCCESS**

A package/substage is **Completed** only after bounded acceptance criteria, focused tests, full regression suite, production build, protected-main merge and exact-main workflow evidence are satisfied.

## Package table

| Package | Status | Current evidence or limitation |
|---|---|---|
| 0R-A — Verified CI baseline | Completed | Protected-main `test-and-build` gate established. |
| 0R-B — Main branch protection | Completed | `main` protected; PR routing and required check enforced. |
| 0 — Safe baseline | Completed | Golden/reference and recovery foundations preserved. |
| 1A — Queue, retry, restart, cancellation | Completed | Real retry/cancellation/recovery safety verified. |
| 1B — File, XML and API security | Completed | PDF/XML/multipart/CORS/rate-limit boundaries verified. |
| 2A — Canonical note/time model | Completed | Shared pitch/time/source-verification contract verified. |
| 2B — Structural/rhythmic validator | Completed | Structural validity remains distinct from musical correctness. |
| 2C — Quality/error report | Completed | Deterministic quality findings verified. |
| 2D — Quality gate integration | Completed | Fail-closed ACCEPT/REVIEW/BLOCK consumer policy verified. |
| 2E — OMR benchmark | Completed | Isolated evidence framework; no universal accuracy claim. |
| 3 — Accessible playback and MIDI | Completed | Measure identity, TTS/playback and MIDI verified. |
| 4 — Basic Guitar TAB | Completed | Conservative quality-gated basic TAB verified. |
| 5 — Basic violin | Completed | Conservative first-position violin pipeline verified. |
| 6 — Chord-symbol parser | Completed | Source-only MusicXML harmony parser verified. |
| 7 — Chord display and Turkish TTS | Completed | Accessible source-only chord presentation/TTS verified. |
| 8 — Teacher correction and approval | **Completed** | T1–T6 verified, merged and docs closed. |
| 8B — Audiveris training dataset | **Partially implemented** | T1–T4 completed; 2,714 experimental mappings exist, but T4 approvals/admitted samples and T1/T2 trainable samples remain 0. |
| 8B-T1 — Verified dataset contract | **Completed** | PR #104 → merge `278b69ed…` → exact-main CI #266. |
| 8B-T2 — Verified evidence intake/readiness | **Completed** | PR #106 → merge `ce521047…` → exact-main CI #273. |
| 8B-T3 — MUSCIMA accidental mapping | **Completed** | PR #113 → merge `258ac272…` → exact-main CI #286; 1275/1275 PASS + browser proof PASS. |
| 8B-T4 — Research-only training admission | **Completed** | PR #115 → merge `08bb9a1d…` → exact-main CI #290; 1287/1287 PASS + browser proof PASS. |
| 9 — Advanced Guitar TAB | Not started | Sequentially blocked while Package 8B remains incomplete unless roadmap is explicitly changed. |
| 10 — Advanced violin | Not started | Advanced positions/alternatives/double stops remain planned. |
| 11 — Accessible tuner | Not started | Microphone pitch/accessibility package absent. |
| 12 — Teacher-to-student sharing | Not started | Exact-approved-revision sharing/authorization not implemented. |
| 13 — Simplified rhythm mode | Not started | Separate simplified rhythm-training mode planned. |
| 14 — Mobile productisation | Partially implemented | Responsive web exists; device VoiceOver/privacy/productisation closure remains. |

## Package 8B-T1 verified result

T1 defines the strict immutable admission contract. MusicXML alone is not a training sample; exact training approval binds to exact candidate evidence; candidate evidence, licence/version/split and train/evaluation leakage rules are explicit; missing evidence fails closed; production OMR/model/deployment wiring remains unchanged.

## Package 8B-T2 verified result

T2 verifies actual supplied artifact bytes against exact T1 declarations. Exact path and digest must match; missing observations remain incomplete; duplicate/undeclared/path/hash mismatch is rejected; `eligible` means manifest-review eligibility only; raw evidence bytes are not retained.

## Package 8B-T3 verified result

T3 adds a bounded research-only mapping contract for the user-supplied MUSCIMA-style accidental annotations.

Measured supplied evidence:

- 100 matched PNG/XML pages;
- 10,109 total annotation objects;
- 2,714 accidentals;
- accidental counts: 1,131 sharp, 821 flat, 350 natural, 220 double-sharp, 192 double-flat;
- 0 accidental bbox overruns;
- local page-disjoint split: 2,247 mapped train / 467 mapped evaluation across 80/20 pages.

Only these mappings are admitted:

- `accidentalSharp` → `SHARP`
- `accidentalFlat` → `FLAT`
- `accidentalNatural` → `NATURAL`
- `accidentalDoubleSharp` → `DOUBLE_SHARP`
- `accidentalDoubleFlat` → `DOUBLE_FLAT`

T3 validates exact page/annotation hashes, bbox bounds and binary RLE mask area, hashes decoded mask pixels, creates deterministic sample identities and ignores unrelated notation classes rather than relabelling them.

The 2,714 records remain **experimental mapping evidence**, not T1/T2 trainable samples. The annotation XML is not treated as `.omr`; engineering approval is not treated as training approval; page-disjoint evaluation is not called writer-independent.

## Package 8B-T4 verified result

T4 adds a separate fail-closed admission layer for an isolated non-commercial Audiveris classifier research experiment.

Verified boundaries:

- MUSCIMA++ / CVC-MUSCIMA evidence is bounded to non-commercial research use in this stage;
- commercial or production intent returns `blocked_license_use`;
- research intent without complete exact per-sample T4 approvals returns `blocked_missing_sample_approvals`;
- T4 research approval scope is `audiveris_classifier_research_sample`, separate from T1 `audiveris_training_sample`;
- approval binds exact `sampleId` + `audiverisShape` + decoded-mask SHA-256 + reviewer + timestamp + fixed licence profile;
- only complete exact approvals can reach `ready_for_isolated_samples_zip_build`;
- readiness authorizes only a later isolated artifact-preparation step, not training execution;
- T1's stricter `.omr` requirement remains authoritative and unchanged;
- `productionAuthorized` and `modelReplacementAuthorized` remain false;
- page-disjoint evidence is not upgraded to writer-independent evaluation.

Current 2,714-sample state:

- exact T4 research approvals: **0**;
- T4 admitted research samples: **0**;
- T1/T2 trainable samples: **0**;
- isolated `samples.zip`: **not built**;
- Audiveris training: **not executed**;
- production classifier/model: **unchanged**.

Engineering-stage approval to implement T4 is not silently expanded into 2,714 per-sample approvals.

## 8B-T4 evidence

- implementation branch `feature/package-8b-t4-research-training-admission`
- PR #115 final head `9142e9b3f81f75e0f0f1e44450c0ee9294e1f640`
- exact-head CI #289: SUCCESS
- review threads: 0 unresolved
- protected-main merge `08bb9a1d909c20445cc0dbcaf1a5514e48470ee8`
- exact-main CI #290 / run `33247398205`, job `99087145954`: SUCCESS
- **1287/1287 tests**, 232 suites, 0 failed/skipped/cancelled, 0 vulnerabilities, production build PASS, real-browser proof PASS

## Package 8B continuing safeguards / blocker

- accept only actual supplied/verified evidence;
- never invent glyphs, labels, coordinates, `.omr`, approvals, licences or metrics;
- golden/reference approval, engineering-stage approval and T4 research approval are distinct from T1 Audiveris-training approval;
- T3 mappings and T4 admission logic do not bypass T1/T2;
- current T4 approval/admission counts remain 0;
- page-disjoint evaluation is not writer-independent evaluation;
- external MUSCIMA/CVC-MUSCIMA licence constraints remain explicit and research-only in this project stage;
- no automatic training execution or production-model replacement;
- existing production OMR flow remains unchanged;
- a later isolated `samples.zip` adapter/harness requires separate explicit authorization and exact sample approvals;
- Package 9 remains blocked under the current sequential roadmap while Package 8B is incomplete.

## Protected integration boundary

No Package 8B work may silently change production Audiveris/provider/runtime, gateway/worker, `Dockerfile`, `render.yaml`, Render deployment connection, or production model selection. Any training execution or production-model/runtime change needs separate explicit authorization and measured evidence.

## Status vocabulary

Use only: **Completed**, **Partially implemented**, **Not started**, **Not verified**.
