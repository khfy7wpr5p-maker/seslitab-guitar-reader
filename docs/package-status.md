# SesliTab Package Status

Last documentation review: 2026-08-28  
Latest verified protected-main implementation baseline: `4747210751c1c49295052f8cca7be58281b91023`  
Latest exact-main implementation CI: **#253 / run `33181815397`, job `98884637074` — SUCCESS**

This table is an orientation snapshot, not standalone completion evidence. A package is **Completed** only when its bounded acceptance criteria, focused tests, full regression suite, production build, protected-main merge and required exact-main workflow evidence are satisfied. Dedicated closure documents remain authoritative.

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
- Package 8-T1 bounded closure: `218c3e18eed3a82861a4a1c24efd5458445ea9ca`; exact-main CI #222 SUCCESS.
- Package 8-T2 bounded closure: `f6d80b4614654ee63a4fd2d51101e4961476a1ee`; exact-main CI #230 SUCCESS.
- Package 8-T3 final review-hardened implementation baseline: `c57966598d2d6fe34418119670bea42a9cdcf369`; exact-main CI #240 SUCCESS.
- Package 8-T4 final review-hardened implementation baseline: `eaf967174d1cc0f2552cc97e7e0a6bf0a1715c64`; exact-main CI #248: 1173/1173 tests, 232 suites, 0 vulnerabilities, build PASS.
- Package 8-T5 final implementation baseline: **`4747210751c1c49295052f8cca7be58281b91023`**; exact-main CI **#253**: **1186/1186 tests**, 232 suites, 0 fail/skipped/cancelled, audit 0 vulnerabilities, production build PASS.

| Package | Status | Current evidence or limitation |
|---|---|---|
| 0R-A — Verified CI baseline | Completed | Required `test-and-build` is part of the protected-main gate. |
| 0R-B — Main branch protection | Completed | `main` is protected; PR routing and required `test-and-build` are enforced. |
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
| 8 — Teacher correction and approval | **Partially implemented** | **8-T1 through 8-T5 completed; T6 remains unimplemented.** |
| 8-T1 — Revision domain contract | **Completed** | Immutable revision model; T3 hardening upgraded strict schema to v2 with recursive lineage. |
| 8-T2 — Correction operations | **Completed** | PR #89 → merge `f6d80b46…` → exact-main CI #230. |
| 8-T3 — Approval binding/invalidation | **Completed** | PR #95 → merge `c5796659…` → exact-main CI #240. Approval schema v3 binds recursive lineage. |
| 8-T4 — Undo/version history | **Completed** | PR #97 → merge `eaf96717…` → exact-main CI #248. Lossless undo creates a new lineage; old approval is not resurrected. |
| 8-T5 — Optimistic concurrency | **Completed** | PR #99 → final head `6e151b94…` → exact-head CI #252 → merge `47472107…` → exact-main CI #253. Full-history expectation detects stale correction/approval/undo state with zero partial domain write. |
| 8-T6 — Accessible teacher UI | **Not started / NEXT** | Must consume T1–T5 contracts without bypassing quality, approval, history or conflict protections. |
| 8B — Audiveris training dataset | Not started | Separate roadmap package; no teacher-approved reproducible training dataset yet. |
| 9 — Advanced Guitar TAB | Not started | Polyphonic/pedagogical fingering remains outside Package 4. |
| 10 — Advanced violin | Not started | Advanced positions, alternatives and double stops remain planned. |
| 11 — Accessible tuner | Not started | No verified microphone pitch-detection and accessible-feedback package. |
| 12 — Teacher-to-student sharing | Not started | No verified exact-approved-revision sharing/authorization system. |
| 13 — Simplified rhythm mode | Not started | City-name rhythm training remains planned. |
| 14 — Mobile productisation | Partially implemented | Responsive web foundations exist; device-level VoiceOver/audio/privacy/productisation criteria remain incomplete. |

## Package 8-T5 final evidence

T5 implements a bounded domain-level optimistic concurrency guard over the verified immutable T4 history contract.

Final verified contract:

1. the caller captures a strict immutable expectation from one exact valid T4 history;
2. expectation binds history/source identity, a deterministic full-history state fingerprint, exact current revision ID/content/recursive lineage, and evidence counts;
3. approval-only history changes are concurrency-visible even when current revision identity is unchanged;
4. stale history, different history identity and different source identity produce explicit conflict;
5. conflict returns exact unchanged current history plus a fresh expectation and produces no revision, audit event or approval;
6. successful guarded correction, approval or undo delegates to the already-verified T2/T3/T4 semantics;
7. no automatic musical merge/rebase occurs;
8. no identifiers or timestamps are invented;
9. malformed/mutable/injected expectation evidence fails closed;
10. the full-history FNV token is a deterministic version/drift token, not authentication, authorization or a digital signature.

### Authority boundary

T5 is a **compare-and-apply domain primitive**, not a database transaction or distributed lock. The supplied history must be the integration layer's authoritative current history at the commit boundary. Any future persistent storage layer must preserve the compare-and-apply condition atomically with its own write.

T5 therefore does not claim atomic database compare-and-swap wiring, distributed locking, cross-process serialization, authentication or authorization.

### CI evidence

- PR #99 final head: `6e151b94609ecf362b3bff0976479a6c2eda45b9`
- exact-head CI #252 / run `33181561159`, job `98883764663`: **SUCCESS**
- **1186/1186 tests PASS**, 232 suites, 0 fail/skipped/cancelled, 0 vulnerabilities, build PASS
- all 13 focused T5 regressions PASS
- final pre-merge review threads/submitted reviews: none
- protected-main squash merge: `4747210751c1c49295052f8cca7be58281b91023`
- exact-main CI #253 / run `33181815397`, job `98884637074`: **SUCCESS**
- exact-main **1186/1186 tests PASS**, 232 suites, 0 vulnerabilities, production build PASS
- existing Audiveris/OMR, Render Blueprint and Dockerfile security regressions PASS

Detailed contract: `docs/package-8-t5-optimistic-concurrency.md`.  
Detailed closure: `docs/package-8-t5-closure.md`.

## Protected integration boundary

Package 8-T1..T5 did not modify and later Package 8 stages must not modify without separate explicit authorization:

- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection.

Exact-main CI #253 passed the existing Audiveris/OMR, Render Blueprint and Dockerfile security regressions.

## Interpretation rules

- **Completed:** acceptance criteria, focused tests, full regression, production build and required protected-main workflow evidence are satisfied for that package or explicitly bounded sub-stage.
- **Partially implemented:** meaningful verified implementation exists, but the parent package acceptance/closure is incomplete.
- **Not started:** no meaningful verified package implementation evidence.
- **Not verified:** related code may exist, but available evidence is insufficient to assign another status safely.

Current roadmap next stage: **Package 8-T6**, but T6 source/UI implementation is **not part of this T5 closure and has not started**.
