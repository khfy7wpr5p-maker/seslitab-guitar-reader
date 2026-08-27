# Package 2E — Closure Evidence

Status: **Completed**

This status is authoritative only when this closure document is present on protected `main` and the closure merge's exact-main required CI has passed.

## Scope closed

Package 2E closes the experimental OMR benchmark framework and evidence boundary. It provides deterministic fixture provenance, teacher-verified MusicXML comparison, measured variant evidence, isolated eight-variant orchestration, and a fail-closed evidence-only recommendation policy.

Package 2E does **not** change the production Audiveris/OMR pipeline and does not claim that a real benchmark experiment has established a universal OMR accuracy percentage or a production winner. An empirical winner exists only when a complete measured experiment against teacher-verified golden truth satisfies the strict recommendation policy.

## Implementation evidence

- 2E-A — benchmark contract and fixture inventory: PR #45
- 2E-B — read-only golden MusicXML comparator: PR #46
- 2E-C — measured variant evidence: PR #47
- 2E-D — isolated comparative benchmark runner: PR #48
- 2E-E — evidence-only recommendation: PR #49
- 2E-E exact accepted head: `be16e72480aa38fc146d93be72dd4e8f58af8058`
- PR #49 exact-head CI run: `33090178321` / run #108 — completed/success
- PR #49 merge commit / technical closure baseline: `23f758b6231c282b0d10832820e18007dbaea65f`
- Required post-merge main CI run: `33090396467` / run #109
- Required post-merge job: `98581357326` / `test-and-build` — completed/success
- Full regression: 839 passed, 0 failed, 0 skipped, 0 cancelled; 229 suites
- Dependency audit: 120 packages audited; 0 vulnerabilities
- Production build: PASS with Vite 8.2.0

## Acceptance evidence

Package 2E verifies the following behavior:

- exactly eight approved comparative variant kinds are modeled;
- benchmark fixture provenance separates teacher-verified golden references from regression-only OMR outputs;
- missing golden truth is represented as `NOT_MEASURED`, never as invented accuracy;
- generated MusicXML is compared only with repository-inventoried teacher-verified golden truth;
- missing notes, extra notes, pitch errors, duration errors, voice errors, and fully-correct-measure rate are measured only when correspondence is safe;
- ambiguous event correspondence becomes `REVIEW_REQUIRED` rather than guessed matching;
- physical measure identity is based on part/measure position, not visible measure number alone;
- raw generated MusicXML is represented in benchmark evidence by deterministic artifact metadata rather than retained as mutable result state;
- every experimental variant receives a dedicated temporary workspace;
- prepared artifacts must remain inside their own variant workspace;
- original source SHA-256 and byte length are rechecked across adapter boundaries;
- temporary benchmark workspaces are removed in `finally` on success and failure;
- unavailable experimental preprocessing/OMR capability remains `NOT_MEASURED`;
- benchmark result ordering is deterministic;
- recommendation requires a complete eight-variant measured experiment with teacher-verified golden truth;
- a variant is recommended only if it uniquely Pareto-dominates every other variant across all approved metrics;
- exact ties, incomplete evidence, malformed evidence, and metric trade-offs become `REVIEW_REQUIRED`;
- no weighted/composite score is used to manufacture a winner;
- `accuracyPercentage` remains null; a benchmark measure-correctness rate is not promoted to a general OMR accuracy claim;
- outputs from different variants are never merged into a synthetic musical result.

## Golden/reference boundary

Teacher-verified comparison references:

- `tests/fixtures/golden-reference/plan0-cc0-4measure/`
- `tests/fixtures/golden-reference/plan0-owner-approved-3-8/`

The reviewed real-OMR XML corpus remains regression-only unless separate teacher-approved ground truth exists. Regression fingerprints must not be reclassified as recognition accuracy.

## Safety evidence

- No production Audiveris provider/runtime/preflight code was changed by Package 2E.
- No production OMR worker/provider/gateway code was changed by Package 2E.
- No production MusicXML OMR path or production parser behavior was changed by Package 2E.
- No E2E workflow behavior was changed by Package 2E.
- No dependency was added for Package 2E.
- No production data is rewritten or repaired by the benchmark.
- Structural validity is never promoted to musical correctness.
- Source-unverified music remains non-definitive.
- Original benchmark input preservation is enforced by SHA-256/byte-length checks.
- Real OMR measure-identity and playback-fingerprint regressions remained PASS.
- Audiveris provider/preflight/error/timeout/cancellation/temp-file/OMR-preservation regressions remained PASS.
- TTS and playback quality-gate regressions remained PASS.
- MusicXML security/XXE regressions remained PASS.
- Production build passed.
- No deployment was performed.

## Explicit limitations

Package 2E completion means the benchmark/evidence framework is complete and regression-verified. It does **not** mean:

- every real score has been benchmarked;
- preprocessing is now wired into the production OMR path;
- Audiveris recognition is error-free;
- an OMR accuracy percentage has been established;
- one preprocessing variant is universally best;
- teacher review can be skipped.

Any future empirical benchmark run must preserve the same golden-truth, isolation, provenance, fail-closed, and no-guessing rules.

## Next package boundary

Package 3A remains **Not started**. It may begin only after this closure package is merged through the protected PR path and the exact resulting `main` SHA passes required `test-and-build` CI.

Remaining Package 2E closure gate after that post-merge verification: **none**.
