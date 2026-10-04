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
