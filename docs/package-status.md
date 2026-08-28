# SesliTab Package Status

Last documentation review: 2026-08-28  
Latest verified protected-main implementation baseline: `278b69ed1f7f0cede6a3dc00e8265e887811c88b`  
Latest exact-main implementation CI: **#266 / run `33196791822`, job `98935863577` — SUCCESS**

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
| 8B — Audiveris training dataset | **Partially implemented** | T1 contract completed; zero real trainable samples currently admitted. |
| 8B-T1 — Verified dataset contract | **Completed** | PR #104 → merge `278b69ed…` → exact-main CI #266, 1228/1228 PASS. |
| 8B-T2 — Verified evidence intake/readiness | Not started | Next bounded safe stage; must not fabricate or train. |
| 9 — Advanced Guitar TAB | Not started | Polyphonic/pedagogical fingering remains future work. |
| 10 — Advanced violin | Not started | Advanced positions/alternatives/double stops remain planned. |
| 11 — Accessible tuner | Not started | Microphone pitch/accessibility package absent. |
| 12 — Teacher-to-student sharing | Not started | Exact-approved-revision sharing/authorization not implemented. |
| 13 — Simplified rhythm mode | Not started | Separate simplified rhythm-training mode planned. |
| 14 — Mobile productisation | Partially implemented | Responsive web exists; device VoiceOver/privacy/productisation closure remains. |

## Package 8B-T1 verified result

T1 provides the admission contract required before a real Audiveris training dataset can exist:

1. MusicXML alone cannot become a training sample.
2. Explicit training approval is required and is bound to exact candidate evidence by SHA-256 fingerprint.
3. Candidate evidence includes source PDF/page image/.omr/MusicXML/glyph/shape/coordinates/licence/Audiveris version.
4. Train/evaluation leakage is rejected through provenance and shared source/glyph evidence hashes.
5. Dataset manifests are immutable, deterministic and reproducible.
6. Missing or malformed evidence fails closed.
7. No production OMR/model/deployment wiring changed.

Current repository inventory contains one owner/teacher-approved golden-reference chain with PDF + `.omr` + MusicXML + approval + integrity evidence. It is **not** a trainable 8B sample because separate page/glyph/shape/coordinate evidence, explicit training approval and split membership are absent.

Therefore current real trainable sample count is **0**.

## 8B-T1 evidence

- implementation PR #104 head `4005192f55afead7d22e7a32db596569faa7aff9`
- exact-head CI #265 / run `33196559638`, job `98935074605`: SUCCESS
- 1228/1228 tests, 232 suites, 0 vulnerabilities, build PASS
- no review threads
- protected-main merge `278b69ed1f7f0cede6a3dc00e8265e887811c88b`
- exact-main CI #266 / run `33196791822`, job `98935863577`: SUCCESS
- 1228/1228 tests, 232 suites, 0 fail/skipped/cancelled, 0 vulnerabilities, build PASS

## Package 8B continuing safeguards

- accept only actual supplied/verified evidence;
- never invent glyphs, labels, coordinates, images, approvals or metrics;
- golden-reference approval is not silently treated as Audiveris-training approval;
- training and evaluation evidence remain isolated;
- no automatic production-model replacement;
- existing production OMR flow remains unchanged.

## Protected integration boundary

No Package 8B work may silently change production Audiveris/provider/runtime, gateway/worker, `Dockerfile`, `render.yaml`, or the Render deployment connection. Any production-model/runtime change needs separate explicit authorization and measured evidence.

## Status vocabulary

Use only: **Completed**, **Partially implemented**, **Not started**, **Not verified**.
