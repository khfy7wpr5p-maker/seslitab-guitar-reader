# SesliTab Package Status

Last documentation review: 2026-08-28  
Latest verified protected main: `218c3e18eed3a82861a4a1c24efd5458445ea9ca`  
Latest exact-main CI: **#222 / `33157031392`, job `98802158018` — SUCCESS**

This table is an orientation snapshot, not standalone completion evidence. A package is **Completed** only when its acceptance criteria, focused tests, full regression suite, production build, protected-main merge and required exact-main GitHub workflow evidence are satisfied. Dedicated closure documents remain authoritative.

## Verified closure baselines

- Plan 0: `4945d5b3ae5b0e1a61138f58673047ae3dba3e2d`
- Package 2A: `47b3ad374fdd49fdd1898c5e0c1b085fde7b9959`
- Package 2B: `e2fa6f6947334388d6a08299220d31f6d8462ab1`
- Package 2C technical closure: `8292f82327b6290d182b029e5ba402ae16c31cff`
- Package 2D technical closure: `0c9df668ddcb1b16d1d5b4ca6dd1d3839d441d95`
- Package 2E closure: `f6b808f331a38047f64e82e395a93ed185737813`
- Package 3 documentation closure: `02dadf55f22505dc5527478f2f6ddb90c17621ff`
- Package 4 implementation baseline: `424653c60ff35326ae137cdf8b72b43eeb7d25e1`
- Package 5 implementation baseline: `0465dba0c40e66ad0d8c77ea47b62fbd421209de`
- Package 6 final closure baseline: `99232915ebcd5089055d0f8695b6c1b08c697739`
- Package 7 final closure baseline: `9f49a07c83bd6dac853fc7aa0131c7df336b2b05`
- Package 8-T1 bounded closure baseline: **`218c3e18eed3a82861a4a1c24efd5458445ea9ca`**; exact-main CI **#222**: **1118/1118 tests**, 230 suites, 0 fail/skipped/cancelled, audit 0 vulnerabilities, production build PASS.

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
| 8 — Teacher correction and approval | **Partially implemented** | **8-T1 immutable revision domain completed; 8-T2..T6 remain unimplemented.** |
| 8-T1 — Revision domain contract | **Completed** | PR #86 → merge `218c3e18…` → exact-main CI #222: 1118/1118 tests and production build PASS. |
| 8-T2 — Correction operations | Not started | Next safe stage: controlled deterministic corrections must create a new immutable revision. |
| 8-T3 — Approval binding/invalidation | Not started | Approval must be a separate record bound to one exact revision/fingerprint. |
| 8-T4 — Undo/version history | Not started | No verified lossless revision-history/undo store yet. |
| 8-T5 — Optimistic concurrency | Not started | No verified stale-base edit conflict handling yet. |
| 8-T6 — Accessible teacher UI | Not started | UI must wait for domain/history/concurrency contracts. |
| 8B — Audiveris training dataset | Not started | Separate roadmap package; no teacher-approved reproducible training dataset yet. |
| 9 — Advanced Guitar TAB | Not started | Polyphonic/pedagogical fingering remains outside Package 4. |
| 10 — Advanced violin | Not started | Advanced positions, alternatives and double stops remain planned. |
| 11 — Accessible tuner | Not started | No verified microphone pitch-detection and accessible-feedback package. |
| 12 — Teacher-to-student sharing | Not started | No verified exact-approved-revision sharing/authorization system. |
| 13 — Simplified rhythm mode | Not started | City-name rhythm training remains planned. |
| 14 — Mobile productisation | Partially implemented | Responsive web foundations exist; device-level VoiceOver/audio/privacy/productisation criteria remain incomplete. |

## Package 8-T1 evidence

- implementation baseline: `eff2fbdd77cdd47dd811d306cf546a295096a653`
- PR #86 final head: `db32b9e24d4033fe308ab9b2fe7cdefb74ec593b`
- exact-head CI #221: SUCCESS
- protected-main merge: `218c3e18eed3a82861a4a1c24efd5458445ea9ca`
- exact-main CI #222 / `33157031392`, job `98802158018`: SUCCESS
- exact-main test count: **1118/1118 PASS**
- 230 suites
- 0 failed / skipped / cancelled
- 0 audit vulnerabilities
- production build PASS
- all PR review threads resolved before merge

Package 8-T1 does not implement approval. Its strict revision schema deliberately rejects approval-field injection. See `docs/package-8-t1-closure.md`.

## Protected integration boundary

Package 8-T1 did not modify and later Package 8 stages must not modify without separate explicit authorization:

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

Current strict next implementation stage: **Package 8-T2 only**.
