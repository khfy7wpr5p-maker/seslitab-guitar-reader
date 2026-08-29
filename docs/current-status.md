# SesliTab Current Status

Last documentation review: 2026-08-29  
Latest verified protected `main` implementation baseline: `8bb797ac8c8f01697669e875ecc6d7df13ea878f`  
Latest exact-main implementation CI: **#330 / run `33259462116`, job `99118792913` — SUCCESS**  
Current package state: **Package 0–11 Completed. Package 12 is Partially implemented with T1 Completed. Package 8B remains Partially implemented as deferred research.**

## Verified baseline

Exact-main CI #330 checked out protected-main SHA `8bb797ac8c8f01697669e875ecc6d7df13ea878f` and verified:

- **1369 / 1369 tests PASS**;
- **233 suites**;
- **0 failed / skipped / cancelled**;
- **0 vulnerabilities**;
- Vite production build **PASS**;
- real-browser score render + cursor runtime proof **PASS** using Google Chrome.

`main` remains protected and requires `test-and-build`.

## Package 10 — Advanced Violin

Status: **Completed.**

Package 10 extends the exact-array Package 2D `VIOLIN` quality-gated path with bounded generated first/second/third-position alternatives, string-crossing choices, two-note double stops, simultaneous voices/staves, sustained-string locking and exact tie continuity. Generated positions remain explicit non-teacher evidence and unsupported/impossible structures fail closed with zero partial output.

Evidence:

- implementation PR **#124** merged;
- protected-main implementation SHA `590abcaa523c9fc83dbf0f0483586a9fdf0d984c`;
- exact-main CI **#324 — SUCCESS**;
- **1340 / 1340 tests PASS**, 232 suites, 0 vulnerabilities, production build PASS, Chrome proof PASS.

Detailed contract: `docs/package-10-advanced-violin.md`.

## Package 11 — Accessible Chromatic Tuner

Status: **Completed.**

Package 11 adds a browser-local, instrument-agnostic chromatic tuner covering all 12 equal-tempered pitch classes. It uses Web Audio microphone time-domain samples and a bounded YIN-style detector with RMS noise gating, confidence gating, parabolic lag refinement and stable same-note smoothing.

Current tuner capabilities:

- all 12 chromatic note classes with Turkish enharmonic naming;
- note + octave, Hz and signed cent display;
- explicit `Pes / Çok yakın / Akortta / Tiz` guidance;
- ±2 cent in-tune threshold and ±5 cent near threshold;
- A4 calibration **415.0–466.2 Hz**, default 440 Hz;
- bounded live range **40–2000 Hz**;
- responsive low-vision layout and keyboard-visible focus;
- throttled screen-reader live announcements;
- microphone audio remains local and is never uploaded, persisted or recorded by SesliTab;
- microphone tracks are stopped on Stop, page exit and setup failure.

Evidence:

- implementation PR **#125** merged;
- protected-main implementation SHA `160c3bcadfc634f7b1300627993e89ebda764576`;
- exact-head CI **#325 — SUCCESS**;
- exact-main CI **#326 / run `33258600115`, job `99116529789` — SUCCESS**;
- **1352 / 1352 tests PASS**, 232 suites, 0 failed/skipped/cancelled;
- **0 vulnerabilities**;
- production build PASS and Chrome proof PASS.

Detailed contract: `docs/package-11-chromatic-tuner.md`.

## Package 12 — Teacher-to-Student Sharing

Status: **Partially implemented.**

### T1 — Exact Share Authorization

Status: **Completed.**

T1 adds a pure immutable sharing-domain boundary that remains separate from Package 8 teacher approval. Explicit authorization is bound to:

- one exact immutable teacher revision;
- its exact Package 8 approval record;
- one caller-supplied recipient identity;
- one caller-supplied issuer identity and authorization ID.

A later correction, undo-created revision, identical-content revision with different recursive lineage, another source, another approval record or another recipient does not inherit the authorization. Exact revocation is represented separately and fails closed as `REVOKED`.

Evidence:

- implementation PR **#127** merged;
- final PR head SHA `10c877ade4ced2a80b6dc102afd2285e114e6672`;
- protected-main implementation SHA `8bb797ac8c8f01697669e875ecc6d7df13ea878f`;
- exact-main CI **#330 / run `33259462116`, job `99118792913` — SUCCESS**;
- **1369 / 1369 tests PASS**, 233 suites, 0 failed/skipped/cancelled;
- **0 vulnerabilities**;
- production build PASS and Chrome proof PASS.

Important boundary: `AUTHORIZED_EXACT_BINDING` is not final student-delivery permission. T1 does not expose content, generate links/tokens/invite codes, authenticate users, persist authorization, add backend endpoints, send network requests or bypass quality/safety evidence.

Detailed contract: `docs/package-12-t1-share-authorization.md`.

## Package 8B — deferred research state

Package 8B remains **Partially implemented**, but missing research evidence no longer blocks application packages.

Current genuine research state:

- T1/T2 admitted real trainable samples: **0**;
- T3 bounded accidental mappings: **2,714** from 100 matched pages;
- T4 exact research approvals / admitted samples: **0 / 0**;
- T5 real native serializer-ready samples: **0**;
- real-data `samples.zip` built: **NO**;
- real-data pinned-Audiveris acceptance receipt: **NO**;
- Audiveris training executed: **NO**;
- production model changed: **NO**.

T1–T6 engineering gates remain intact. Do not fabricate sample approval, native mask/interline evidence, acceptance receipts or training results. Research may resume when genuine evidence exists.

## Next application boundary

**Package 12-T2 — Exact-revision safety/quality eligibility** is the next active substage.

T2 must reuse the T1 exact authorization binding but keep authorization and safety separate. It must require exact-revision quality/safety evidence before any student payload exists. Missing or stale quality evidence, later revision changes, non-applicable approval, recipient mismatch or revocation must fail closed with zero payload bytes.

Authenticated recipient access, persistence/database decisions and actual network delivery are later security/application stages and require separate architecture review if they introduce new infrastructure, dependencies or permission semantics.

## Protected OMR and deployment boundary

Package 12 and later application work must not silently change production Audiveris provider/runtime/preflight, OMR worker/provider selection, Cloud OMR Gateway, backend production OMR path, `Dockerfile`, `render.yaml`, current Render service/deployment connection, or production model selection/replacement.
