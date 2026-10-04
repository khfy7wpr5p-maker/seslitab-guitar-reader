# SES-170 request authority root cause and follow-up

Status: scoped fix under preparation; no merge or deployment authorized. User-reported symptom/reproduction is still pending. These are independently reproduced store defects, not an assertion that they caused an unreported UI symptom. SES-170 is the work-request foundation; SES-155/156 teacher management/API/UI is separate.

## Baseline and confirmed root causes

Base/current main: `0c60d4cd97dfa478bb378814965f8c0ce319af64` (fresh fetch unchanged). SES-170 PR #315 merged; feature revision `551a5e002c2bddfc8d3912d13bf37b74cbfb63b2`. New independent branch: `fix/ses-170-request-authority`; merged PR #314 branch is not reused.

Both work-request stores validated each row's shape and equality of requestId, then applied CAS. They did not validate the relationship between those otherwise valid rows. Actual-source RED proof:

1. Create PENDING, legally commit REVOKED, then commit `(revoked, pending)`: accepted and persisted PENDING, reopening a one-way revoked request.
2. Construct a valid REVOKED row with the same requestId but a different teacher/student: accepted and persisted reassigned authority. The same missing invariant permits title/requestedAt rewrites and converted-terminal changes.

New Node regressions run the actual domain and both store implementations, not transformed mirror implementations. Initial run: 14 tests, 2 PASS / 12 FAIL. Firestore adapter tests use staged transaction reads/writes; they do **not** establish real Firestore isolation. Real emulator tests separately cover the two defects, immutable fields, exact retries, converted-terminal changes and concurrent competing CAS transactions.

## Fix and preserved behavior

`assertStudentWorkRequestTransition` lives with the shared domain contract and is called at both store boundaries before reads/writes. It requires valid rows, immutable schema/request identity, teacher/student authority, title and requestedAt. Exact unchanged snapshots remain no-ops. Only PENDING may advance, and the next snapshot must equal the canonical conversion/revocation constructor result. CONVERTED and REVOKED may only replay the exact same snapshot; no unrevoke, reassignment, retarget or restamp.

The existing transaction/current-state comparison remains intact: an exact duplicate successful transition returns the stored terminal result; a competing different terminal snapshot conflicts. Illegal current/next pairs are rejected before the idempotent/CAS shortcut, preventing a stored-next shortcut from bypassing invariants.

No Piece is created, public_pool is unchanged, teacher authority and same-student existing-Piece evidence remain in place. The established implicit initial ACTIVE lifecycle is intentionally retained and tested; removing it would break the legacy positive contract. Valid ACTIVE and REPERTOIRE acknowledgements and historical unchanged terminal replay remain supported. No product UI, Render/offline/VoiceOver/OMR changes.

Other suggested candidate concerns (grant-revocation race, persistence binding and repeat-acknowledgement evidence policy) are not claimed fixed or established causes here. Scope is the two proven store defects; no speculative broad rewrite.

## Separate main Sonar finding

Authorized artifact `11298281469`, diagnostics run `37188073142`, file `ses170-main-sonarqube-diagnostics.zip`, downloaded through user-scoped file ID into this execution workspace only. No Notion transfer or signed URL sharing.

- Export analysisId: `88e7275b-2343-4baf-9f32-4b4eb9b900e3`, branch main, project `khfy7wpr5p-maker_seslitab-guitar-reader`.
- Gate ERROR: new reliability 4/D (required 1/A). New security 1/A, maintainability 1/A, coverage 84.7, duplication 0.4 and reviewed hotspots 100 pass.
- Full overall reliability inventory: 63, not the log's truncated first 50. The newly created record matching this analysis is `AaEF9vO37KR903vHEEyy`, javascript:S2871, BUG / CRITICAL, RELIABILITY HIGH, `scripts/verifyGtab04EditorStudentContract.js:61`, lastChangeAnalysisUuid equal to the export analysis ID. It belongs to GTAB04 qualification, not SES-170.
- The zip does not include CE task ID or analysis revision manifest. Local Sonar direct GET and GitHub REST are proxy-denied; no independent CE/revision binding or sinceLeakPeriod response is invented. Root must finish exact task/analysis/revision and new-code binding using direct authorized API or source scan metadata. Overall debt is not equated with new-code debt.

The targeted GTAB04 fix adds a numeric comparator to the numbered voice fixture's Set sort. The current fixture contains only 1–4, so no runtime wrong-order observation is claimed. No voice-count/product expansion and no source/rule exclusion. Exact pinned Editor/Student qualification is rerun instead of adding a mirror test.

Production Gate failing closed on the red actual Sonar gate is correct. Its source/host/attempt/analysis guards and quality rules are unchanged.

## Verification and limits

- SES-170 focused actual-source regressions: 30 PASS, 0 FAIL/SKIP, including legitimate ACTIVE/REPERTOIRE conversions, exact duplicate acknowledgement, terminal/id/authority/snapshot guard and CAS behavior.
- GTAB04 qualification: PASS with Editor `9fc2a5b8eae19bcf1972cd6c3a451210b9a0c243` and Student App `5f7d1d5a1b70616e599dec21ac384649d4803fcd`; Student TAB capability AVAILABLE and TAB bytes preserved.
- Local emulator attempt: Java 21 available, but cloud-firestore-emulator-v1.22.0.jar download fails; proxy CONNECT 403 at storage.googleapis.com. No policy bypass or secret disclosure. Real emulator regression execution remains required in CI; adapter tests are not reported as emulator PASS.
- Clean install, full tests, build, audits and appropriate browser proofs are being completed. Final exact-head CI/Sonar must be checked separately; PR PASS does not establish main PASS.

Evidence package: `/workspace/.cloud-setup/ses170-investigation`. Root will open the new PR after branch publication; no merge/deploy.
