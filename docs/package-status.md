# SesliTab Package Status

Last documentation review: 2026-08-28  
Latest verified protected main: `95f11139929d1e3d65bd6c295794c316bb04ca84`  
Latest exact-main CI: **#237 / `33165513082`, job `98829856646` — SUCCESS**

This table is an orientation snapshot, not standalone completion evidence. A package is **Completed** only when its acceptance criteria, focused tests, full regression suite, production build, protected-main merge and required exact-main workflow evidence are satisfied. Dedicated closure documents remain authoritative.

## Verified Package 8 closure baselines

- Package 8-T1: `218c3e18eed3a82861a4a1c24efd5458445ea9ca`; exact-main CI #222 SUCCESS.
- Package 8-T2: `f6d80b4614654ee63a4fd2d51101e4961476a1ee`; exact-main CI #230 SUCCESS.
- Package 8-T3 final review-hardened baseline: **`95f11139929d1e3d65bd6c295794c316bb04ca84`**; exact-main CI **#237** SUCCESS: **1151/1151 tests**, 232 suites, 0 fail/skipped/cancelled, 0 vulnerabilities, production build PASS.

| Package | Status | Current evidence or limitation |
|---|---|---|
| 0R-A — Verified CI baseline | Completed | Required `test-and-build` is part of the protected-main gate. |
| 0R-B — Main branch protection | Completed | `main` is protected; pull-request routing and required `test-and-build` are enforced. |
| 0 — Safe baseline | Completed | Approved golden references, integrity manifests and recovery evidence are preserved. |
| 1A — Queue, retry, restart, cancellation | Completed | Retry/re-enqueue, duplicate prevention, cancellation, restart recovery and cleanup are verified. |
| 1B — File, XML and API security | Completed | PDF/XML/multipart/API/CORS/rate-limit/security boundaries are verified. |
| 2A — Canonical note and time model | Completed | Canonical pitch/time/source-verification contract verified. |
| 2B — Structural and rhythmic validator | Completed | Structural validity remains distinct from musical correctness. |
| 2C — Quality and error report | Completed | Deterministic quality/error reporting is verified. |
| 2D — Quality gate integration | Completed | Fail-closed `ACCEPT` / `REVIEW` / `BLOCK` consumer policy verified. |
| 2E — OMR benchmark | Completed | Deterministic benchmark/evidence framework completed without universal accuracy claims. |
| 3 — Accessible measure playback and MIDI | Completed | Exact measure identity, selected-measure TTS/playback and deterministic MIDI verified. |
| 4 — Basic Guitar TAB | Completed | Conservative quality-gated Guitar TAB pipeline and accessible UI verified. |
| 5 — Basic violin | Completed | Conservative first-position quality-gated violin pipeline and accessible UI verified. |
| 6 — Chord-symbol parser | Completed | Source-only MusicXML `<harmony>` parser verified. |
| 7 — Chord display and Turkish TTS | Completed | Source-only accessible chord presentation/TTS closure verified. |
| 8 — Teacher correction and approval | **Partially implemented** | **8-T1 revision domain, 8-T2 controlled corrections and review-hardened 8-T3 exact-revision approval are completed; 8-T4..T6 remain unimplemented.** |
| 8-T1 — Revision domain contract | **Completed** | PR #86 → merge `218c3e18…` → exact-main CI #222 SUCCESS. |
| 8-T2 — Correction operations | **Completed** | PR #89 → merge `f6d80b46…` → exact-main CI #230 SUCCESS. |
| 8-T3 — Approval binding/invalidation | **Completed** | PR #91 initial implementation; PR #92 review found P1 and was closed unmerged; PR #93 schema-v2 hardening → main `95f11139…` → exact-main CI #237 SUCCESS. |
| 8-T4 — Undo/version history | Not started | **Next safe stage.** No verified lossless history/undo contract yet. |
| 8-T5 — Optimistic concurrency | Not started | No verified stale-base edit conflict handling yet. |
| 8-T6 — Accessible teacher UI | Not started | UI must wait for domain/approval/history/concurrency contracts. |
| 8B — Audiveris training dataset | Not started | Separate roadmap package. |
| 9 — Advanced Guitar TAB | Not started | Polyphonic/pedagogical fingering remains outside Package 4. |
| 10 — Advanced violin | Not started | Advanced positions, alternatives and double stops remain planned. |
| 11 — Accessible tuner | Not started | No verified microphone pitch-detection and accessible-feedback package. |
| 12 — Teacher-to-student sharing | Not started | No verified exact-approved-revision sharing/authorization system. |
| 13 — Simplified rhythm mode | Not started | City-name rhythm training remains planned. |
| 14 — Mobile productisation | Partially implemented | Responsive web foundations exist; device-level VoiceOver/audio/privacy/productisation criteria remain incomplete. |

## Package 8-T3 final evidence

Initial implementation:

- PR #91 final head: `d1805c054e490e71e3d266471ad158defbcd49e1`
- exact-head CI #233: SUCCESS
- initial main: `70a02589206eeea9c3defec4d5f544e9222cbe3a`
- exact-main CI #234: SUCCESS

Closure review:

- docs PR #92 was **not merged**;
- review identified a valid P1: intermediate ancestor `revisionId` reuse plus restored ancestor content could revive the old four-dimension approval binding;
- the stale docs PR was closed after the finding.

Final hardening:

- PR #93 final head: `ee215d3c1d53e2bb7a7323387c02a79223643e46`
- exact-head CI #236 / run `33165415557`, job `98829539401`: SUCCESS
- final protected-main commit: `95f11139929d1e3d65bd6c295794c316bb04ca84`
- exact-main CI #237 / run `33165513082`, job `98829856646`: SUCCESS
- **1151/1151 tests PASS**, 232 suites, 0 fail/skipped/cancelled
- all **15** T3 focused tests PASS
- ancestor-revision-ID reuse regression PASS
- dependency audit: **0 vulnerabilities**
- production build: **PASS**

Final T3 schema is **v2** and binds approval applicability to exact source/root-source/revision ID/revision kind/parent revision/revision timestamp/content fingerprint. Historical approval remains immutable and a later record cannot inherit it merely by reusing an old ID/content.

## CI stability note

The superseded docs PR #92 CI #235 first attempt had one transient `tests/api.test.js` DELETE-job 502. The same exact docs head was rerun without code changes and passed **1150/1150 tests + build**. This is recorded as a test-stability signal, not a current main failure. Final hardened main CI #237 is green.

## Protected integration boundary

Package 8-T1/T2/T3 did not modify and later Package 8 stages must not modify without separate explicit authorization:

- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection.

## Interpretation rules

- **Completed:** acceptance criteria, focused tests, full regression, production build and required protected-main workflow evidence are satisfied for that package or explicitly bounded sub-stage.
- **Partially implemented:** meaningful verified implementation exists, but the parent package acceptance/closure is incomplete.
- **Not started:** no meaningful verified package implementation evidence.
- **Not verified:** related code may exist, but available evidence is insufficient to assign another status safely.

Current strict next implementation stage: **Package 8-T4 only — not started by this closure.**
