# SesliTab Package Status

Last documentation review: 2026-08-29  
Latest verified protected-main implementation baseline: `5acafbd420cb9e54b4fb5b36f590db882c3300c3`  
Latest exact-main implementation CI: **#297 / run `33249268267`, job `99091994669` — SUCCESS**

A package/substage is **Completed** only after bounded acceptance criteria, focused tests, full regression suite, production build, protected-main merge and exact-main workflow evidence are satisfied.

## Package table

| Package | Status | Current evidence or limitation |
|---|---|---|
| 0–7 | Completed | Existing verified product foundations remain intact. |
| 8 — Teacher correction and approval | **Completed** | T1–T6 verified, merged and docs closed. |
| 8B — Audiveris training dataset | **Partially implemented** | T1–T5 completed; 2,714 experimental mappings exist, but exact T4 approvals, admitted samples, T1/T2 trainable samples and real native serializer-ready samples remain 0. |
| 8B-T1 — Verified dataset contract | **Completed** | PR #104; exact training-evidence contract. |
| 8B-T2 — Verified evidence intake/readiness | **Completed** | PR #106; exact byte/path/hash verification. |
| 8B-T3 — MUSCIMA accidental mapping | **Completed** | PR #113; 2,714 bounded experimental mappings. |
| 8B-T4 — Research-only training admission | **Completed** | PR #115; non-commercial exact per-sample admission gate. |
| 8B-T5 — Isolated native sample staging harness | **Completed** | PR #118 → merge `5acafbd4…` → exact-main CI #297; 1299/1299 PASS + browser proof PASS. |
| 9 — Advanced Guitar TAB | Not started | Sequentially blocked while Package 8B remains incomplete unless roadmap is explicitly changed. |
| 10 — Advanced violin | Not started | Advanced positions/alternatives/double stops remain planned. |
| 11 — Accessible tuner | Not started | Microphone pitch/accessibility package absent. |
| 12 — Teacher-to-student sharing | Not started | Exact-approved-revision sharing/authorization not implemented. |
| 13 — Simplified rhythm mode | Not started | Separate simplified rhythm-training mode planned. |
| 14 — Mobile productisation | Partially implemented | Responsive web exists; device accessibility/privacy/productisation closure remains. |

## Package 8B-T5 verified result

T5 establishes a fail-closed bridge between T4 admission and a possible future Audiveris-native serializer. Upstream Audiveris `master` was verified at `7a36078e7ba0c006052c1f661b949cf9b729f505`.

A valid native Audiveris sample requires shape, explicit `interline`, glyph location and pixel `RunTable` evidence. T3 does not retain raw mask/RLE payload or interline. T5 therefore requires those exact inputs separately and verifies that decoded raw mask bytes match the T3 `maskSha256`; it never reconstructs or invents missing evidence.

Verified states:

- `blocked_research_admission`;
- `blocked_native_evidence`;
- `ready_for_audiveris_native_serializer`.

The final state remains staging-only. T5 never sets `samplesZipBuilt`, never executes training, never satisfies T1 `.omr`, never claims writer-independent evaluation, and never authorizes production or model replacement.

Current real state remains:

```text
mapped experimental samples:       2,714
T4 exact approvals:                    0
T4 admitted samples:                   0
T1/T2 trainable samples:               0
native serializer-ready real samples:  0
samples.zip built:                     NO
Audiveris training executed:           NO
production model changed:              NO
```

## 8B-T5 evidence

- stage-start main `51d505ea8c1e098c193b1f4525b1fb9a59326854`;
- PR #118 head `075984105476fbd815a700201ccb5ae2cd0e169b`;
- exact-head CI #296: SUCCESS, **1299/1299 tests**, 232 suites, 0 vulnerabilities, production build PASS, real-browser proof PASS;
- unresolved review threads before merge: 0;
- expected-head-locked squash merge `5acafbd420cb9e54b4fb5b36f590db882c3300c3`;
- exact-main CI #297 / run `33249268267`, job `99091994669`: SUCCESS, **1299/1299 tests**, 232 suites, 0 vulnerabilities, production build PASS, real-browser proof PASS.

## Package 8B continuing safeguards

Accept only actual supplied and approved evidence. Never invent glyphs, interline, raw masks, `.omr`, approvals, licences or metrics. Page-disjoint evaluation is not writer-independent evaluation. `samples.zip` serialization, Audiveris acceptance validation, training execution, evaluation and production-model adoption remain separate future gates.

No Package 8B work may silently change production Audiveris/provider/runtime, Gateway/worker, backend production path, `Dockerfile`, `render.yaml`, Render deployment connection, CI dependencies, or production model selection.

## Status vocabulary

Use only: **Completed**, **Partially implemented**, **Not started**, **Not verified**.
