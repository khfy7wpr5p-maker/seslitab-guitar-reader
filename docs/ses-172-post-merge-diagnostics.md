# SES-172 post-merge diagnostics

Base main: `58e92c0b119073ae1e3761ed14b429388f5e2653`.

CI 37157317703 passed Node tests and build, then timed out waiting for the malformed-provenance status in CE-BRIDGE. Production Gate 37157493145 correctly rejected this unsuccessful CI run. That gate is unchanged.

The baseline CE-BRIDGE proof passed locally once plus three repeats using an npm-sourced local jQuery asset because the CDN is blocked in this environment. Its reported CI timeout has **not** been reproduced, including a delayed import-poll experiment. No timeout was increased and no assertion was skipped.

Direct execution of the baseline delivery function preserved the XML payload; nested escaping was not proven defective. A small helper makes serialization explicit. The fixture now confirms the actual postMessage source/origin and exact payload, waits for the parent's completed handoff, and verifies accepted XML and source revision remain unchanged after rejection. Failed runs remove any prior success artifact. These changes improve the proof; they do not establish the original CI timeout's cause.

Regression Quality push 37157317692 succeeded as a scanner workflow, while diagnostics 37157602002 rejected CE task `AaED0q95Ay3xakmEYgvY`. Scanner upload success is not server processing success or quality acceptance. The scan intentionally does not wait for the quality gate; diagnostics retain the exact task/analysis binding. A scanner warning mentioning `IllegalStateException` is not evidence of the CE root cause.

CE failures now distinguish upstream FAILED/CANCELED, invalid task schema/status, task/project/branch mismatch, HTTP/API errors, and exhausted polling budget. A separate `sonarqube-ce-failure/status.json` contains only validated task/project identifiers and bounded status/reason/category fields. Raw server messages, stack traces and private source data are omitted. Failed CE tasks remain failures, with no issue/gate export.

The user subsequently supplied authenticated Background Tasks evidence identifying the LOC quota failure (see inventory below). Local public Sonar GET is blocked by proxy HTTP 403; root's unauthenticated task and gate queries returned HTTP 404. No Sonar token is configured here. The supplied analysis ID `404755df-b090-4acf-9ebe-21b7081a5212` has not been linked to this task or merge SHA; no host/privacy/missing-task cause is inferred from 404.

## Exact quota evidence and source inventory

Authenticated Background Tasks text supplied by the user identifies the cause: organization `khfy7wpr5p-maker` has a 100,000-line allowance; the rejected analysis reports 105,199 lines. Its language distribution is CSS 3,059; Docker 45; JS 76,671; JSON 24,072; shell 6; web 229, totaling 105,199. This is a LOC quota rejection, not a quality issue. The organization allowance, this analysis size, and total organization billable usage are different measures; total organization usage was not supplied. A plan purchase/upgrade is not part of this change.

`scripts/sonarSourceInventory.mjs` inventories tracked files in the modeled languages against explicit source exclusions. It reports physical/nonblank physical lines, **not Sonar NCLOC or billable LOC**, and does not emulate language comment/token counting, automatic scanner exclusions, or SCM rules.

| Local tracked metric | Before explicit lock exclusion | After |
| --- | ---: | ---: |
| Modeled included files | 378 | 377 |
| Physical lines | 127,302 | 116,112 |
| Nonblank physical lines | 117,907 | 106,717 |
| JSON files / physical lines | 11 / 35,265 | 10 / 24,075 |

The modeled tracked JSON source inventory is:

| File | Physical lines | After explicit lock exclusion |
| --- | ---: | --- |
| `.bolt/config.json` | 3 | retained in local model |
| `docs/sti-01-02-runtime-authority-baseline.json` | 68 | retained |
| `docs/sti-08-09-smufl-keypad-basic-edits.json` | 99 | retained |
| `experiments/smoosic-mobile/package.json` | 22 | retained |
| `firebase.json` | 11 | retained |
| `firestore.indexes.json` | 21 | retained |
| `ops/render-production-alignment.v1.json` | 140 | retained |
| `ops/st-student-api-source-branch.v1.json` | 83 | retained |
| `package-lock.json` | 11,190 | generated lock excluded |
| `package.json` | 54 | retained |
| `src/data/chordBoardCatalogSnapshotV1.json` | 23,574 | retained |

The only changed tracked file is npm-generated `package-lock.json` (11,190 physical/nonblank lines; lockfile v3, 828 package records). `**/package-lock.json` makes that generated boundary explicit, including any future nested npm lockfile; it excludes no manifest or first-party source. Full/production npm audit and clean npm ci continue to consume the unchanged lockfile. No global JSON exclusion or new vendor/generated directory exclusion is added. The existing generated runtime/vendor/build boundaries are retained.

Crucially, local JSON excluding the lockfile is 24,075 physical lines; excluding the three-line `.bolt/config.json` gives exactly the server's 24,072 JSON lines. This is strong evidence that the scanner may already ignore npm locks automatically. The explicit exclusion is therefore **not established to reduce actual server LOC or resolve the 5,199-line excess**. A fresh exact-head server analysis/indexed-file inventory must decide this; subtracting 11,190 from the server count would be unjustified. Large remaining files are first-party application/backend/browser test infrastructure, with no evidenced third-party/generated boundary large enough to claim quota resolution.

First-party catalog `src/data/chordBoardCatalogSnapshotV1.json` (23,574 physical lines), package manifests, Firebase configuration/indexes, ops configuration, JS/CSS and executable scripts remain included. Tests remain classified as tests, and LCOV remains configured. Scope regressions compare all modeled tracked files before/after and require only the npm lockfile to change.

## Quality gate waiting contract recommendation

`sonar.qualitygate.wait=false` means scanner success only proves upload. Enabling waiting can correctly fail the scan on CE failure or a failed quality gate, but simply flipping it breaks the current exact diagnostics contract: metadata upload has an implicit success condition, and source validation requires a successful Regression Quality run. Failed scans would then lose automatic diagnostics eligibility.

Recommendation: in a separate reviewed change, preserve exact task metadata with failure-safe upload, and establish an authenticated exact-task acceptance check that fails on CE failure/failed gate with bounded time, for PR and push analyses. Keep the current trusted-source boundary or explicitly redesign its failure eligibility with equivalent workflow/repository/branch/artifact authority checks before changing waiting. This change does not flip waiting, accept failed processing, disable any rule, or weaken Production Gate. PR #313 needs a fresh exact-head server analysis; a green upload job alone cannot close the quota incident.

Root connector verified PR #313 initial head `2bfe2a3899efeeef7a7e33f1c8d9e5376e12f5ff`: all seven checks passed, including full test-and-build with CE-BRIDGE and SonarCloud Code Analysis. Sonar bot comment `5976080060` reports gate PASS, zero new issues/hotspots, 87.0% new coverage and zero duplication. These results apply to that PR head; they do not establish merged-main LOC acceptance or validate the subsequent scope change's exact head.


## Audited browser proof test classification (follow-up)

Initial lockfile-only inventory remains unchanged as recorded above and in the handoff artifacts. The explicit lock boundary is not a proven quota fix.

Only 18 browser proofs executed by `.github/workflows/ci.yml` and their three test-only helpers are added to the exact `sonar.test.inclusions` safelist. `scripts` is added as a test root so those exact paths can be indexed as TEST. Every remaining script stays source unless already excluded by the existing boundaries. No broad `scripts/**` or `verify*` pattern is added. Product entrypoints (`src`, `backend`, root JS, package entrypoints) have no references to the safelisted helpers/proofs; full tracked caller references are captured separately. Legacy non-CI browser proofs are deliberately not added just to chase the quota.

| Exact TEST path | Physical lines | Nonblank physical lines |
| --- | ---: | ---: |
| `scripts/ceBridgeFixtureTransport.js` | 5 | 5 |
| `scripts/s14CdpProofHarness.js` | 312 | 287 |
| `scripts/ses153BrowserProofSession.js` | 185 | 183 |
| `scripts/verifyCeBridgeStructuralBrowser.js` | 500 | 474 |
| `scripts/verifyPrCKeypadBrowser.js` | 59 | 54 |
| `scripts/verifyPrDEditorBrowser.js` | 60 | 55 |
| `scripts/verifyPrECoexistenceBrowser.js` | 64 | 59 |
| `scripts/verifyPrFAccessibilityBrowser.js` | 236 | 218 |
| `scripts/verifyS14CoreRuntimeBrowser.js` | 109 | 99 |
| `scripts/verifyS14FailedReplacementBrowser.js` | 136 | 126 |
| `scripts/verifyS14MobileMenuHostOcclusionBrowser.js` | 407 | 377 |
| `scripts/verifyS14MobileScrollSettleProductionBrowser.js` | 293 | 271 |
| `scripts/verifyS14SmoosicProductionCdpBrowser.js` | 480 | 435 |
| `scripts/verifyS14SourceLifecycleAcceptanceBrowser.js` | 201 | 183 |
| `scripts/verifyS15SmoosicWritebackBrowser.js` | 1146 | 1076 |
| `scripts/verifySes147AuthRosterBrowser.js` | 91 | 83 |
| `scripts/verifySes153TeacherAuthorityBrowser.js` | 24 | 23 |
| `scripts/verifySmoosicCorrectionOverlayBrowser.js` | 326 | 297 |
| `scripts/verifySti17CrossRealmBrowser.js` | 145 | 131 |
| `scripts/verifySti17MobileEditorCleanupBrowser.js` | 60 | 54 |
| `scripts/verifySti17SingleSelectionAuthorityBrowser.js` | 138 | 125 |

Total: 21 files, 4,977 physical / 4,615 nonblank physical lines. These are not Sonar NCLOC. Even the physical-line upper bound is below the original 5,199 excess, leaving at least 222 lines of that original excess under the optimistic bound, before new source changes/organization accounting. This narrow classification therefore cannot alone establish quota resolution. If legitimate remaining first-party code still exceeds the allowance, the incident remains externally quota BLOCKED; a plan/capacity decision belongs to the user. No plan upgrade or project removal is performed.

`verifyS16DeployedCompositionBrowser.js`, `sonarDiagnostics.mjs`, `postMergeProductionGate.js`, build/runtime preparation, legacy non-CI proofs, and all product JS/CSS/JSON remain source. The inventory model now records source/test/excluded type and incorporates the scanner's automatic source-exclusion behavior for test-inclusion patterns. Tests require exactly the audited list, real CI references, no product-entrypoint consumers, and retained product/deploy/security sources.

### Official indexing evidence

The SonarSource official repository at tag `10.7.0.96327` (commit `9e1fded16c1dc80f886af1db4413cbe78a245d7f`) was fetched read-only:

- [AbstractExclusionFilters.java](https://github.com/SonarSource/sonarqube/blob/9e1fded16c1dc80f886af1db4413cbe78a245d7f/sonar-scanner-engine/src/main/java/org/sonar/scanner/scan/filesystem/AbstractExclusionFilters.java#L180): `prepareMainExclusions` combines `sourceExclusions` and `testInclusions`; TEST matching has separate inclusion/exclusion patterns.
- [ProjectFileIndexer.java](https://github.com/SonarSource/sonarqube/blob/9e1fded16c1dc80f886af1db4413cbe78a245d7f/sonar-scanner-engine/src/main/java/org/sonar/scanner/scan/filesystem/ProjectFileIndexer.java#L121): main sources indexed as `Type.MAIN`; test roots indexed as `Type.TEST`.
- [FileIndexer.java](https://github.com/SonarSource/sonarqube/blob/9e1fded16c1dc80f886af1db4413cbe78a245d7f/sonar-scanner-engine/src/main/java/org/sonar/scanner/scan/filesystem/FileIndexer.java#L121): indexed-file debug log explicitly identifies `as test`.

This proves the public scanner indexing semantics, not the exact deployed Cloud version, analyzer test-rule safelist, or actual billed LOC. Official documentation URL retrieval was proxy403; no claim is made that its current text was read. New exact-head scanner/server evidence must confirm the 21 files are indexed as tests, retained source files remain sources, and report actual analysis/billable LOC. A PR PASS alone does not prove merged-main quota acceptance.

### PATH security finding fixed without exclusion

Root supplied GitHub check-run `111352303927` annotation on `scripts/sonarSourceInventory.mjs` line22: “Make sure the PATH variable only contains fixed, unwriteable directories.” Issue ID `AaEE7sz0SHsnK_btESsA`; the rule key was not supplied and is not asserted.

The inventory now invokes `/usr/bin/git` directly (system binary on Ubuntu CI and the managed cloud machine), without environment/repository executable overrides or PATH search. Git filesystem-monitor execution is disabled for this read-only inventory. It remains SOURCE. A regression places an executable attacker `git` first in PATH, proves that shadow executable is effective, then runs the actual inventory through absolute Node and requires successful real tracked output with no attacker marker. The test failed on the old implementation and passes after the fix. The exact-head Sonar check must still confirm disappearance of the finding; no acceptance/suppression/exclusion substitutes for that check.
