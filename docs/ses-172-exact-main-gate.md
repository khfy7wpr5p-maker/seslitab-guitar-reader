# SES-172 exact-main Sonar acceptance follow-up

Status: review preparation. No merge or deployment authorized. SES-170/155–158 remains blocked until an actual merged-main analysis passes, independently of this PR's checks.

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

Results will be updated after clean install, focused adversarial tests, full Node tests, build, browser proof and full/production audit. A PR gate pass does not prove that the currently merged main passes. Final main acceptance requires a subsequent exact-main CE/analysis/gate observation.
