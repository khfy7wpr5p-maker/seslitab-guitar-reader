# GTAB-10C investigation (in progress)

Baseline SesliTab PR #335: a7dbb784cd3e9e3c7de2ac3a8738e9a9f4d8c7cb.
Editor baseline: 34851f3f1ec00d3804144f414090bcfab8314808.
Semantic Engine: ef305f45ff90d940ac6c51a0c46c4fac006d7c5c; Partitura 1.9.0.

Confirmed failures and repairs:
- Smoosic-like MIDI 55 position string 3/fret 5 is MIDI 60, rejected by the actual Editor guitar model. Correct string 3/fret 0 preserves pitch 55.
- Unexpected exported staff accessed an uninitialized context list. Controlled non-PASS now replaces the TDZ exception.
- Matching tie-presence booleans previously permitted dangling endpoints. Reciprocal, adjacent, same-part/staff/voice/pitch structural graph validation rejects invalid endpoints, while renamed IDs preserve topology.
- Missing key/clef arrays are incomplete oracle coverage, distinct from valid empty key arrays.
- UTF-16 DTD/entity input bypassed the old ASCII byte test. defusedxml rejects declarations regardless of encoding. Fractional/nonfinite alterations no longer round to an integer MIDI pitch.
- Target part ordinal/count and oracle original-byte hashes are bound; the runner checks actual checkout HEAD, including CI merge SHA.

Local verification at this stage: comparator 21/21; Python 8/8 including actual pinned oracle invocation. Real pinned Editor → SesliTab handoff → Python oracle passes Audiveris-like and Smoosic-like fixtures. MuseScore-like remains non-PASS: original explicit key context is dropped by the pinned Editor, and Partitura links only one staff's ties when both staffs share voice/pitch. No context removal, tie manufacture, unsupported-diagnostic whitelist, or threshold change was used.

Read views add deterministic note IDs only at this stage. Existing IDs/tie markers are preserved; duplicates/collisions rejected. Snapshots are produced from these read views, not claimed as direct original-byte snapshots. Artifact records normalization policy, original/read-view SHA256 and note mapping; original files are re-read before output. A separately authorized narrow upstream Editor key-context repair and reversible oracle staff/voice disambiguation remain in progress.

PR Sonar baseline failed coverage 64.9, Security C, Reliability D (root-reported). Actual current issue locations unavailable through this workspace: public Sonar proxy CONNECT 403 and gh API Forbidden. No claim of finding disappearance or final gate acceptance. Coverage import, full tests/build/audit and exact-head CI remain pending. No merge/deploy.

## Second stage: actual pinned requalification

Upstream narrow fix: `st-guitar-tab-editor` branch `fix/gtab10c-preserve-selected-key-context`, commit `e1fe771f4a1637c46dedf15a881f2bfcf260e9ae`, based on reviewed `34851f3f1ec00d3804144f414090bcfab8314808` (upstream PR #4 head, **not merged upstream main**). PR base should be `feature/gtab-10b-target-source-session`. Source reader captures selected global/staff key; writer preserves explicit fifths/mode/context changes, normalizes only the notation staff number. Ambiguous/mid-measure unsupported key context rejects instead of silently dropping. RED writer regression failed with missing key; upstream full Node suite 50/50 GREEN. The regression compares remaining export bytes after removing only key elements, confirming meter/measure/pitch/TAB output unchanged.

Partitura 1.9.0 importer `importmusicxml.py` keys ties by pitch and time within a part (lines 418–430); changing voice alone does not avoid the collision. Read-view policy `gtab10c-note-id-part-lane-read-view-v3` deterministically projects each original part/staff/voice lane into a private part identity. Every original note is represented once; other lanes are forward cursor movements, preserving timing. Existing IDs and tie/tied markers are retained; absent IDs are deterministic and collisions reject. No tie is generated or linked manually. Oracle output records raw read-view snapshots, restored-identity reference snapshots, part/note mappings and original/read-view hashes. It validates original XML marker coverage, identity mapping and complete pitched-event coverage before restoring part/voice/staff identity. Original files are re-read unchanged before publishing. Unsupported/ambiguous mappings and missing tie coverage reject. This is CI-only oracle normalization, not an original-byte direct snapshot claim.

Committed Editor fix + pinned Semantic Engine + Partitura 1.9.0: actual Editor → SesliTab handoff → oracle **3/3 PASS** (Audiveris-/Smoosic-/MuseScore-LIKE synthetic fixtures). Actual oracle graph regression: renamed IDs preserve topology; dangling/nonreciprocal/cross-staff/wrong endpoint/redacted edges are non-PASS. This does not qualify a real export corpus (GTAB-10D).

Coverage: real runner LCOV records 174/176 executable lines before final metadata additions; Python coverage.py 7.10.7 with branch measurement reports 90% combined, 260/280 lines before final coverage guard additions. CI repeats the actual pinned execution and boundary tests and generates XML/LCOV. Sonar imports both default Node and orchestration LCOV plus `coverage/gtab10c-python.xml`. Python tests moved naturally to `tests/python/test_gtab10c_oracle.py` and explicitly classified as tests, alongside the real graph integration test. Production qualification/oracle scripts remain analyzed sources; no coverage/source exclusion or threshold relaxation added. Third-party CI checkouts move to runner temp outside the analyzed first-party tree.

Validation:
- `npm ci --cache /workspace/.npm-cache --no-audit --no-fund`: PASS, 784 installed.
- `NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost CHROME_BIN=/usr/bin/chromium npm test`: 2721 tests, 2694 PASS, 0 FAIL, 27 existing skips, 68.2s. Emulator-dependent skips remain distinct from executed proof.
- Focused comparator/provenance/actual graph/source-scope tests: 28/28 PASS. Runner rejects stale SHA before dependency execution and ignores malicious PATH shadow git.
- Python actual oracle/security/identity boundary tests: 10/10 PASS.
- `NODE_USE_ENV_PROXY=1 npm_config_cache=/workspace/.npm-cache npm_config_package_lock=false npm run build`: PASS. First attempt without proxy configuration failed DNS on raw.githubusercontent.com; corrected using existing environment policy, no product workaround.
- Full and production `npm audit --json`: all severity counts 0, total 0.
- GTAB-10B Chromium multipart target proof: PASS with rebuilt pinned runtime.
- GTAB04 and GTAB09D Editor → Student contracts: PASS with exact Student `5f7d1d5a1b70616e599dec21ac384649d4803fcd` and Editor `e1fe771...`; source/TAB bytes preserved.
- Modified workflow YAML parsing and every bash run block syntax: PASS.

Root-reported Sonar on first-stage `0b80666943db74de2606a0fe9e9cf7481d8f5476`: Reliability no longer a fail condition, Security C remains, coverage 61.4. This predates real Python/orchestration coverage imports. Current Security rule/file/line still not obtained locally (proxy/API access restrictions). Existing PR issue reporting previously skipped after failed scan; now `always()` publishes current PR issue JSON and exact CE-task/analysis gate artifacts and a summary. Tokens only go to fixed `https://sonarcloud.io` API URLs without redirects; task host/project/ID are validated. Current PR issues are explicitly labeled current inventory, not historical exact-analysis snapshots. Scan/gate failure is never converted into success. Exact-head remote Sonar A/coverage acceptance remains unverified pending CI evidence. Upstream PR dependency/merge remains open; no merge/deploy performed.

## Mid-measure upstream follow-up

Root review identified a first/only attributes node after elapsed time escaping the later-attributes check. RED confirmed inherited-divisions second-measure key silently moved to the start. Added note/rest/forward cases and fail-closed guard. Upstream follow-up `28ac378babde8d35e9213648cc6e16429e9a7fd7` on the same dedicated branch; full upstream 51/51 GREEN. No changes to existing upstream PR #3/#4. SesliTab runtime and both qualification workflows use this exact SHA.

Latest follow-up requalification: Editor `28ac378...` → pinned Semantic Engine/Partitura 1.9.0 → all 3 fixtures PASS; focused comparator/provenance/graph/runtime-pin suite 34/34, Python 10/10. Final complete-pitched-event coverage guard and raw/restored snapshot evidence produce 89% combined Python line+branch coverage (266/288 lines, 130 branch destinations), above the unchanged 80% local report floor. Local interpreter is Python 3.12; CI explicitly uses Python 3.11. No runtime Python dependency added.

## Exact Security diagnostics and guarded path follow-up

Root exact `75ca0c0` diagnostics: Security C only; coverage no longer fails. Six issues: `githubactions:S6505` Regression Quality npm exec; `githubactions:S8541` semantic workflow pip binary policy; `pythonsecurity:S8707` oracle lines 28/308/349/350. Root commit `dd7bab875019bb870a941f5f21dc2d978c97ab8c` replaces npm exec with pinned ignore-scripts install/local c8, requests binary-only pip dependencies, and authorizes canonical bounded inputs/JSON outputs under fixture/artifact or private GTAB temp roots.

Fetched/fast-forwarded this head without losing local follow-ups (backup patch/stash retained). Binary-only pip's `:all:` in a plain YAML scalar caused a real ScannerError at line 56; block scalar restores parsing. Both workflows parse and all bash blocks pass syntax verification.

Additional RED→GREEN boundary proofs: different output path hardlinked to a source inode could overwrite original bytes; prefix-only authorization admitted world-writable temp directories. Output now rejects same-inode input aliases; temp roots must be private and owned by the process user; configured project roots cannot redirect outside the project. Existing symlink escape, oversized regular-file, JSON-output and missing explicit voice/staff tests pass. No empty voice element or dead intermediate voice calculation remains. Actual CLI missing-context negative test and workflow diagnostics simulation preserved during integration. Python 16/16, actual pinned fixtures 3/3, comparator/graph/provenance 23/23, synthetic workflow diagnostics 1/1 PASS. Final exact-head Sonar acceptance still pending; no waiver/exclusion/merge/deploy.

## Selected-staff key coverage review fix

Review thread PRRT_kwDOTkRmDs6qWk-x / comment 4218850367: key comparison previously pooled all rows for a part. RED regression confirms that leaking all staff keys could PASS. Pinned `ef305f...` adapter/model `KeySignatureContext` contains only part_id/onset_div/fifths/mode, whereas ClefContext has staff. Inferring a selected staff from these rows is unsupported.

The CI oracle now records original XML `key/@number` inventory per part, captured before read-view projection and bound through the existing original-byte hashes. This is explicit raw coverage metadata, not an added/fabricated staff field in the pinned snapshot. Comparator requires consistent coverage for the selected source part and derived notation part. Global/absent contexts remain supported. Staff-specific source or derived key contexts return `UNSUPPORTED`, `SEMANTIC_ORACLE_UNSUPPORTED`, cause `KEY_SIGNATURE_STAFF_CONTEXT`; missing/inconsistent bindings also reject. Staff-specific keys in an unrelated source part do not invalidate a selected global context. No engine pin/schema change, key removal, row guessing or waiver.

Real pinned Editor export + Partitura snapshots with two distinct staff keys verifies that the correct selected-only export, wrong key and leaked-all-key export are all non-PASS with this explicit unsupported-coverage reason; snapshot rows genuinely lack staff and original bytes remain unchanged. Existing three synthetic global-context fixtures remain PASS. Post-main-336 focused Node suite 35/35, Python 17/17, actual oracle integration 2/2 PASS. Final exact-head CI/Sonar must repeat acceptance before root resolves the review and performs the approved merge. No deploy.

## Selected-staff meter coverage review fix

Thread PRRT_kwDOTkRmDs6qXEjE / comment 4219052117: RED comparator regression reproduced a leaked-all-staff meter export returning PASS. Pinned TimeSignatureContext has part_id/onset_div/beats/beat_type, without staff; ClefContext retains staff and the comparator validates, filters and normalizes that identity. Key and time coverage now reuse the same raw XML inventory extractor and strict coverage validator.

Original `time/@number` inventory per part is captured before normalization and carried in `timeSignatureCoverage` (`gtab10c-time-staff-coverage-v1`) alongside the original source/export SHA256 bindings. Selected source/derived staff-specific, missing, duplicate or inconsistent coverage returns UNSUPPORTED / SEMANTIC_ORACLE_UNSUPPORTED / TIME_SIGNATURE_STAFF_CONTEXT. Unrelated source part scoped meters do not invalidate selected global coverage. No oracle staff guessing, pin/schema change, XML modification, waiver or exclusion.

Real pinned Editor/Partitura execution verifies correct selected-staff, wrong and leaked meter exports all reject with the explicit coverage reason; snapshot rows lack staff and original source/export bytes remain unchanged. Existing three global-context fixtures PASS. Focused Node suite 37/37, Python 18/18 and real pinned oracle integration 3/3 PASS. Final exact-head CI/Sonar must repeat acceptance before the root resolves the thread and performs the approved merge; task does not merge/deploy.

Full and production npm audit: all severities zero. Initial production build failed resolving raw.githubusercontent.com (EAI_AGAIN); retry uses the environment's existing Node proxy support. Remote exact-head build/browser/emulator/Sonar checks remain required; previous 627a2e9 acceptance is not evidence for this follow-up head.
