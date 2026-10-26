# SES-172 exact-main Sonar acceptance follow-up

Status: implementation locally verified; PR #314 under review (https://github.com/khfy7wpr5p-maker/seslitab-guitar-reader/pull/314). Fresh exact-head server Sonar acceptance is pending root verification. No merge or deployment authorized. SES-170/155–158 remains blocked until an actual merged-main analysis passes, independently of this PR's checks.

## Confirmed baseline (public API evidence supplied by root)

- Main revision: `6f9b6f6b1aa9b178f00ea39c0d4925d6cf06670d`.
- Main analysis: `fae7a1fd-c95c-44be-b377-46d1dcae09a7`.
- CE task: `AaEFHSgFAy3xakmEYmDw`, SUCCESS, with that exact analysisId. Compute processing succeeds; the previous LOC quota failure does not block this analysis.
- Actual quality acceptance: ERROR, new security rating 3 (C), new reliability rating 3 (C), required 1 (A). Coverage 84.9%, duplication 0.4%, hotspot review 100%; these pass.
- Previous-version new-code baseline: 2026-09-20. Open new-code issues are exactly two SECURITY vulnerabilities and one RELIABILITY bug:
  - `AaEFHT7IQPV1eHbeiWON`, githubactions:S7631, production-gate.yml checkout.
  - `AaEFHTzRQPV1eHbeiWOM`, jssecurity:S8707, writeTdProd10StudentFixture.js CLI write path.
  - `AaEFHT-PQPV1eHbeiWOO`, javascript:S9383, student-app-e2e.spec.mjs test registration Promise.
- All three lastChangeAnalysisUuid values match the main analysis above. The earlier 24 security / 50 reliability export describes overall debt, not these three new-code blockers. The separate corpus Promise fix is authorized old debt, not this gate's reliability cause.

Source endpoints on configured https://sonarcloud.io, project `khfy7wpr5p-maker_seslitab-guitar-reader`: project_analyses/search with branch=main; ce/component with branch=main; qualitygates/project_status; issues/search with branch=main, sinceLeakPeriod=true, resolved=false and impactSoftwareQualities=SECURITY or RELIABILITY. Local CLI proxy access does not independently establish fresh server acceptance; root will verify the pushed exact head.

## Changes and boundaries

Qualification registration awaits the Node test runner Promise. Corpus file selection handles early rejected work and restores status/button state. The generated fixture accepts only its fixed sibling Student App destination, using module-location checkout identity rather than CLI-derived write paths, private non-symlink directories, no-follow regular-file writes, owner/mode checks and hardlink rejection. The existing CI sibling checkout remains supported.

Production Gate validates both webhook and GitHub API CI provenance before checkout: exact repository and head_repository (fork false), workflow path/id, completed successful push/main, first attempt, exact current main SHA. Repository code is imported only after that trusted checkout. Permissions remain actions:read and contents:read.

GitHub green is only PENDING_SONAR. Regression Quality publishes an additional immutable attempt-qualified `sonar-task-RUN-ATTEMPT` artifact, containing only report-task.txt and run-provenance.json. Provenance binds repository/workflow/ref/event/branch/SHA/run/attempt/scan outcome and report SHA-256. Failed scans still publish provenance and cannot pass. The existing diagnostics report artifact and trusted-source/host/redirect/exact-analysis guards remain supported. Scanner qualitygate.wait=false remains unchanged so task metadata publication survives an eventual server failure.

The production verifier resolves the trusted host/project from the same repository configuration as the scan, validates report and provenance before reading credentials, rejects redirects, polls only the exact CE task with bounded attempts, requires SUCCESS and a valid analysis ID, and compares main's latest analysis ID **and revision** before and after the exact analysisId gate request. It requires gate OK, non-ignored conditions and both new security/reliability ratings A with their required A thresholds. Missing, pending, failed, stale, foreign or changed evidence fails closed. No acceptance artifact survives a failed verifier invocation.

Before emitting PASS, GitHub main/CI/latest Regression run and attempt are checked again. A new main revision, newer scan run or changed attempt invalidates earlier Sonar evidence.

## Attempt policy

CI still requires first-attempt success; failed CI cannot be rehabilitated by a rerun. Regression Quality deliberately permits its latest successful rerun, since server processing may be retried independently, **only** with the exact attempt-qualified artifact, successful scanner outcome, exact CE/analysis/current-main revision and final unchanged attempt. An older green scan or previous-attempt artifact cannot replace a failing/pending/latest run. This is an explicit policy change from the old first-attempt Regression requirement, accompanied by stronger Sonar evidence. Older scans lacking the new provenance artifact remain blocked; rerunning the updated Regression workflow and Production Gate can supply new evidence. No automatic rerun, merge or deployment is introduced.

The generic legacy sonar-report-task artifact is retained for diagnostics, while Production Gate exclusively uses attempt-qualified provenance. A rerun artifact conflict in the legacy upload must not prevent publishing the attempt evidence; the legacy artifact is replaced explicitly on reruns, and diagnostics always resolves the latest run's task through its existing source checks.

## Verification record

Validated implementation commit: `05f51a2f95232de8b5ad57681721e869f574e9c1`, branch `fix/ses-172-exact-main-sonar-gate`, base `6f9b6f6b1aa9b178f00ea39c0d4925d6cf06670d` (fresh fetch unchanged).

- Clean `npm_config_cache=/workspace/.npm-cache npm ci --ignore-scripts --no-fund --no-audit`: PASS, 796 packages. Initial use of the default unwritable cache failed; rerunning with the documented workspace cache passed without a dependency/lockfile change.
- Focused Sonar/gate/path/async/workflow/TD-PROD-10 regressions: 93 PASS, 0 FAIL/SKIP (92 in the combined run, plus the subsequently added workflow artifact-selection test; all included in the final full run).
- `CHROME_BIN=/usr/bin/chromium npm test`: 2527 tests, 2503 PASS, 0 FAIL, 24 pre-existing emulator skips, exit 0, 64.6 seconds. No skip/assertion/timeout changes. First local full invocation through the old shell Chrome wrapper held child pipes open; that invocation was stopped and repeated with the actual browser executable. This is a local launcher issue, not a reproduction of the original CI malformed-action timeout.
- `npm_config_package_lock=false npm run build`: PASS, exit 0, composition manifest bound to implementation head. Existing large-chunk warnings remain. No tracked generated assets or lockfiles changed.
- `node scripts/verifyCeBridgeStructuralBrowser.js`: three consecutive PASS, each preserving source/current accepted revision on rejected malformed actions and recording same-frame/same-origin/exact serialization provenance.
- `npm run test:s16:browser`: 1 PASS, 0 FAIL/SKIP.
- `npm audit --json` and `npm audit --omit=dev --json`: both exit 0, all severities and total vulnerabilities 0.
- Focused native Node coverage: postMergeProductionGate.js, studentFixtureOutput.js, verifyExactMainSonar.mjs and writeSonarRunProvenance.mjs each 100% line coverage; the adversarial tests exercise real local HTTP, subprocess CLI, file/symlink/hardlink behavior and the actual embedded GitHub scripts. Coverage is not a claim of branch completeness or server gate acceptance.
- `git diff --check`: PASS. Security source inventory/exclusions and prior PATH/SSH guards unchanged.

Browser environment: writable XDG configuration and real Chromium; the CDN is proxy-blocked. Proofs use the exact npm-registry jquery 3.6.0 slim asset substituted only into generated dist after the successful normal build. No tracked CDN/product changes; these proofs do not establish CDN reachability. The complete cross-repository Student App Chromium/WebKit qualification is left to PR CI; local tests verify registration Promise completion/rejection and the actual fixed sibling writer's filesystem boundaries.

Evidence logs, audits, repeated browser artifacts and complete patch are retained at `/workspace/.cloud-setup/ses172-exact-main-final`. PR #314 is open; root is checking exact final head CI/Sonar. A PR gate pass does not prove that the currently merged main passes. Main still has the confirmed C/C baseline above until a new exact merged-main CE/analysis/gate observation establishes otherwise. No merge or deployment performed.
