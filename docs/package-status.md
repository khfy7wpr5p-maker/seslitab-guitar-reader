# SesliTab Package Status

Last documentation review: 2026-08-29  
Latest verified protected-main implementation baseline: `eb711fa0483b87d841b4381e242b4d19ae95d189`  
Latest exact-main implementation CI: **#308 / run `33251255425`, job `99097200088` — SUCCESS**

A package/substage is **Completed** only after bounded acceptance criteria, focused tests, full regression suite, production build, protected-main merge and exact-main workflow evidence are satisfied.

## Package table

| Package | Status | Current evidence or limitation |
|---|---|---|
| 0–7 | Completed | Existing verified product foundations remain intact. |
| 8 — Teacher correction and approval | **Completed** | T1–T6 verified, merged and docs closed. |
| 8B — Audiveris training dataset | **Partially implemented** | T1–T6 completed; 2,714 experimental mappings exist, but exact T4 approvals, admitted samples, T1/T2 trainable samples and real T5 serializer-ready samples remain 0. No real archive/training/evaluation exists. |
| 8B-T1 — Verified dataset contract | **Completed** | PR #104; exact training-evidence contract. |
| 8B-T2 — Verified evidence intake/readiness | **Completed** | PR #106; exact byte/path/hash verification. |
| 8B-T3 — MUSCIMA accidental mapping | **Completed** | PR #113; 2,714 bounded experimental mappings. |
| 8B-T4 — Research-only training admission | **Completed** | PR #115; non-commercial exact per-sample admission gate. |
| 8B-T5 — Isolated native sample staging harness | **Completed** | PR #118; exact approval + mask/interline gate to serializer-ready staging. |
| 8B-T6 — Pinned native serializer + acceptance gate | **Completed** | PR #120 → merge `eb711fa0…` → exact-main CI #308; deterministic Audiveris-native ZIP contract and exact pinned `SampleRepository` receipt binding. |
| 9 — Advanced Guitar TAB | Not started | Sequentially blocked while Package 8B remains incomplete unless roadmap is explicitly changed. |
| 10 — Advanced violin | Not started | Advanced positions/alternatives/double stops remain planned. |
| 11 — Accessible tuner | Not started | Microphone pitch/accessibility package absent. |
| 12 — Teacher-to-student sharing | Not started | Exact-approved-revision sharing/authorization not implemented. |
| 13 — Simplified rhythm mode | Not started | Separate simplified rhythm-training mode planned. |
| 14 — Mobile productisation | Partially implemented | Responsive web exists; device accessibility/privacy/productisation closure remains. |

## Package 8B-T6 verified result

T6 closes the engineering boundary between exact T5 serializer-ready evidence and a pinned Audiveris sample-repository acceptance receipt.

The serializer accepts only a valid immutable T5 report in `ready_for_audiveris_native_serializer`. It re-verifies exact mask evidence and deterministically emits the Audiveris-native container/sample-sheet/RunTable structure. Identical valid evidence produces identical archive bytes and SHA-256.

Archive construction remains distinct from acceptance. `archive_built_pending_pinned_acceptance` becomes `accepted_by_pinned_audiveris` only when a separate clean checkout at exact Audiveris revision `7a36078e7ba0c006052c1f661b949cf9b729f505` loads the exact archive using `SampleRepository.getInstance(Path, true)` and reports the exact expected sample count. The acceptance report is bound to the archive SHA-256, staging-manifest fingerprint, pinned revision and count.

T6 does not authorize or execute training, evaluation, production use or model replacement.

Current real state remains:

```text
mapped experimental samples:             2,714
T4 exact approvals:                          0
T4 admitted samples:                         0
T1/T2 trainable samples:                     0
T5 serializer-ready real samples:            0
real samples.zip built:                      NO
real pinned-Audiveris acceptance receipt:    NO
Audiveris training executed:                 NO
production model changed:                    NO
```

## 8B-T6 evidence

- stage-start main `a771c27d9359c2fbcd4b126272287cf0ca82d875`;
- PR #120 final head `9f7806c6eb6079dfc5ee929d270dfb39b063e8a4`;
- exact-head CI #307 / run `33251176354`, job `99096993296`: SUCCESS;
- final merge gate: 0 behind, mergeable, 0 unresolved review threads;
- expected-head-locked squash merge `eb711fa0483b87d841b4381e242b4d19ae95d189`;
- exact-main CI #308 / run `33251255425`, job `99097200088`: SUCCESS, **1315/1315 tests**, 232 suites, 0 vulnerabilities, production build PASS, real-browser score runtime proof PASS.

## Package 8B continuing safeguards

Accept only actual supplied and approved evidence. Never invent glyphs, interline, raw masks, `.omr`, approvals, licences, acceptance receipts or metrics. Page-disjoint evaluation is not writer-independent evaluation.

T6 code existence is not evidence that the current 2,714 mappings can be trained. Real serialization remains blocked before T6 because T4/T5 real-data gates are unsatisfied. Training execution, evaluation and production-model adoption remain separate gates.

No Package 8B work may silently change production Audiveris/provider/runtime, Gateway/worker, backend production path, `Dockerfile`, `render.yaml`, Render deployment connection, CI dependencies, or production model selection.

## Status vocabulary

Use only: **Completed**, **Partially implemented**, **Not started**, **Not verified**.
