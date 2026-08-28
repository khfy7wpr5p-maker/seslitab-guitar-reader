# SesliTab Package Status

Last documentation review: 2026-08-29  
Latest verified protected-main implementation baseline: `ce5210476c5957595a9159abff6fd3b64afd10bd`  
Latest exact-main implementation CI: **#273 / run `33207881028`, job `98973500868` — SUCCESS**

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
| 8B — Audiveris training dataset | **Partially implemented** | T1/T2 contracts completed; zero real eligible/trainable samples currently admitted. |
| 8B-T1 — Verified dataset contract | **Completed** | PR #104 → merge `278b69ed…` → exact-main CI #266, 1228/1228 PASS. |
| 8B-T2 — Verified evidence intake/readiness | **Completed** | PR #106 → merge `ce521047…` → exact-main CI #273, 1244/1244 PASS. |
| 9 — Advanced Guitar TAB | Not started | Sequentially blocked while Package 8B remains incomplete. |
| 10 — Advanced violin | Not started | Advanced positions/alternatives/double stops remain planned. |
| 11 — Accessible tuner | Not started | Microphone pitch/accessibility package absent. |
| 12 — Teacher-to-student sharing | Not started | Exact-approved-revision sharing/authorization not implemented. |
| 13 — Simplified rhythm mode | Not started | Separate simplified rhythm-training mode planned. |
| 14 — Mobile productisation | Partially implemented | Responsive web exists; device VoiceOver/privacy/productisation closure remains. |

## Package 8B-T1 verified result

T1 provides the immutable admission contract required before a real Audiveris training dataset can exist:

1. MusicXML alone cannot become a training sample.
2. Explicit training approval is required and is bound to exact candidate evidence by SHA-256 fingerprint.
3. Candidate evidence includes source PDF/page image/.omr/MusicXML/glyph/shape/coordinates/licence/Audiveris version.
4. Train/evaluation leakage is rejected through provenance and shared source/glyph evidence hashes.
5. Dataset manifests are immutable, deterministic and reproducible.
6. Missing or malformed evidence fails closed.
7. No production OMR/model/deployment wiring changed.

## Package 8B-T2 verified result

T2 proves whether actual supplied artifact bytes match the exact T1 evidence declarations without changing the evidence:

1. T2 computes SHA-256 from raw non-empty `Uint8Array` bytes itself.
2. Exact declared path and digest must match; paths are not silently trimmed or normalized into equivalence.
3. Missing observations remain `incomplete`.
4. Duplicate, undeclared, path-mismatched or hash-mismatched observations become `rejected`.
5. Only a T1-trainable candidate with all declared artifacts verified can be `eligible`.
6. `eligible` means only eligible for dataset-manifest review, not authorized training or production use.
7. Raw evidence bytes are not retained in reports.
8. Readiness reports are deterministic, immutable and semantically fail-closed.
9. Existing production OMR/model/deployment wiring remains unchanged.

The current repository owner/teacher-approved golden-reference chain verifies its currently declared PDF/.omr/MusicXML/reference approval/licence bytes, but it still lacks separate page/glyph/shape/coordinate evidence, explicit training approval and split membership.

Therefore current real eligible/trainable sample count is **0**.

## 8B-T2 evidence

- implementation PR #106 final head `8d333a4bc3de2b58731b6c0360e5d0923b9728fb`
- exact-head CI #272 / run `33207712313`, job `98972982291`: SUCCESS
- 1244/1244 tests, 232 suites, 0 failures/skips/cancellations, 0 vulnerabilities, build PASS
- review P2 exact-path issue fixed and regression-tested
- protected-main merge `ce5210476c5957595a9159abff6fd3b64afd10bd`
- exact-main CI #273 / run `33207881028`, job `98973500868`: SUCCESS
- 1244/1244 tests, 232 suites, 0 fail/skipped/cancelled, 0 vulnerabilities, build PASS

## Package 8B continuing safeguards / blocker

- accept only actual supplied/verified evidence;
- never invent glyphs, labels, coordinates, images, approvals, licences or metrics;
- golden-reference approval is not silently treated as Audiveris-training approval;
- training and evaluation evidence remain isolated;
- no automatic production-model replacement;
- existing production OMR flow remains unchanged;
- no evidence-supported T3 coding stage is declared while genuine teacher-verified symbol evidence is absent;
- Package 9 does not start while Package 8B remains incomplete under the approved sequential roadmap.

## Protected integration boundary

No Package 8B work may silently change production Audiveris/provider/runtime, gateway/worker, `Dockerfile`, `render.yaml`, Render deployment connection, or production model selection. Any production-model/runtime change needs separate explicit authorization and measured evidence.

## Status vocabulary

Use only: **Completed**, **Partially implemented**, **Not started**, **Not verified**.
