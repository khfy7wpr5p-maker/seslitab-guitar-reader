# SES-68 Deterministic Smoosic Padding-Rest Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Allow a supported Smoosic pitch edit from tests/fixtures/real-omr/gesi-clean.xml to write back into SesliTab without treating Smoosic-generated voice-padding rests as source notes, while preserving every source-authored rest and keeping all structural edits fail-closed.

**Architecture:** Mark padding rests only at the exact XmlToSmo import-time construction seam, retain their in-memory object identity plus exact score locator in an editor-owned registry, and emit a versioned provenance manifest with the raw Smoosic MusicXML. The SesliTab host validates that manifest and converts only the explicitly certified raw MusicXML rest ordinals into timing-preserving forward elements before existing part, voice, cardinality, stable-locator, semantic-change, revalidation and immutable-revision checks. No duration, silence-gap, measure, voice, rest-shape or count-delta inference is permitted. If provenance identity, ordering or cardinality cannot be proved, write-back returns UNSUPPORTED_STRUCTURE without changing the accepted revision.

**Tech Stack:** Node.js ESM >=24.0.0 <25, built-in node:test and node:assert/strict, DOMParser/XMLSerializer, Vite 8.2.0, Smoosic 1.0.44, the existing Chrome DevTools Protocol browser-proof harness, GitHub Actions and SonarQube/SonarCloud.

**Spec:** https://app.notion.com/p/3e92be2e5664815780bdc2c5dc3e4c34?pvs=204

**Tracking:** Linear SES-68; historical parent SES-43 remains Done. Diagnostic PR #276 remains diagnostic-only and is not an implementation base.

## Global Constraints

- Repository: khfy7wpr5p-maker/seslitab-guitar-reader.
- Planning baseline: 1464e79b719e871ce88527f03c18d0e83f015f6a. Execution must fresh-read origin/main and record the actual baseline and candidate head.
- Implement on branch onderozudogru/ses-68-smoosic-write-back-deterministic-padding-rest-provenance.
- Do not cherry-pick or merge production code from PR #276. Its quiet-gap/source-silence classifier is prohibited.
- Change only Smoosic import/export provenance, the host write-back boundary, focused tests, real-browser proof and evidence documentation.
- Preserve visible Smoosic editor behavior and the existing local XML download/export behavior. Provenance is used only for the SesliTab write-back request.
- Preserve every source-authored rest, including hidden rests and rests that resemble padding.
- Unsupported insertion, deletion, relocation, reordered note identity, missing provenance, stale revision and malformed payloads remain fail-closed.
- Normalization runs before existing single-part identity, Smoosic voice identity, candidate cardinality and stable-locator checks; all existing checks still run afterward.
- Never infer generated padding from silence intervals, duration, voice number, measure number, hidden state, print-object, rest count, position or musical shape.
- Do not change Dockerfile, render.yaml, Firebase, OMR, Audiveris, backend providers/workers/storage, Render service/domain/configuration, deployment wiring or production secrets.
- Use TDD for every executable slice: observe RED for the intended reason, make the smallest GREEN change, then refactor only while green.
- A failure of the identity-preservation or raw-ordinal proof is a design blocker. Stop and revise the plan; do not fall back to heuristics.
- Sonar must actually execute on the exact PR head. A Regression Quality run whose Sonar configuration reports disabled is BLOCKED, not PASS.
- Stop before merge. Deployment is a separate approval after merge; physical iPhone Safari/VoiceOver acceptance is a separate post-deploy human gate.

## File Structure

**Create**

- experiments/smoosic-mobile/src/seslitab-padding-rest-provenance.js — import-time marker registry, strict score revalidation and raw MusicXML ordinal manifest.
- tests/smoosicPaddingRestProvenance.test.js — pure registry/manifest contract and tamper/fail-closed cases.
- src/services/smoosicPaddingRestNormalization.js — strict host payload validation and exact ordinal-to-forward conversion.
- tests/smoosicPaddingRestNormalization.test.js — normalization, preservation and malformed-proof tests.
- docs/ses-68-smoosic-padding-rest-provenance.md — contract, threat model, evidence and operator stop conditions.

**Modify**

- experiments/smoosic-mobile/src/index.js — scope the tracker to XmlToSmo.convert and attach provenance only to the SesliTab export-result message.
- src/smoosicEditorTabUi.js — require protocol version 2, validate/pass provenance and keep existing origin/request/revision checks.
- src/services/smoosicProductWriteback.js — normalize certified padding before existing structural validation.
- tests/smoosicProductWriteback.test.js — supported and fail-closed write-back coverage.
- tests/stageS15SmoosicWriteback.test.js — versioned message and host lifecycle assertions.
- scripts/verifyS15SmoosicWritebackBrowser.js — real gesi-clean.xml RED/GREEN proof and evidence.
- .github/workflows/ci.yml — only if needed to upload the extended existing S15 evidence; do not add deployment.
- sonar-project.properties — only if the new focused browser-proof path needs the same existing test-infrastructure exclusion pattern; do not disable or weaken a quality condition.

**Explicitly do not modify**

- Dockerfile
- render.yaml
- backend/**
- Firebase configuration or rules
- public/vendor/** and node_modules/**
- Smoosic third-party source/package contents
- student-delivery, Chord Board, OMR and deployment files

## Contract

The editor-to-host export envelope becomes version 2 and contains:

- type, requestId, sourceRevision and raw musicXml as today;
- paddingRestProvenance.version = 1;
- paddingRestProvenance.sourceRevision exactly equal to the request;
- paddingRestProvenance.rawNoteCount;
- paddingRestProvenance.entries sorted by rawNoteOrdinal;
- each entry contains exact non-negative staffIndex, measureIndex, voiceIndex, noteIndex and rawNoteOrdinal plus the captured import-time note identity token and duration tick count used only to validate the marked object.

The marker registry is created anew for each successful XmlToSmo.convert. It marks only note objects returned by SmoMeasure.createRestNoteWithDuration while that exact conversion is active. Calls before or after the conversion, including teacher-created rests, are never marked. The marker is an in-memory non-enumerable symbol/object identity plus a registry record; it must not alter saved MusicXML or visible Smoosic behavior.

Before a SesliTab export-result is posted, the editor walks the current score in the same deterministic order used by SmoToXml. Every registered entry must still resolve to the same marked note object at the same locator with the captured identity and duration. The number of traversed model notes must equal raw MusicXML note elements. Each marked locator must map to one unique raw note ordinal. Any mismatch returns an export error and no usable provenance.

The host function normalizeSmoosicPaddingRests({ musicXml, provenance, sourceRevision }) returns a frozen result containing musicXml, rawNoteCount, normalizedNoteCount and convertedCount. It rejects missing/version-mismatched/stale proof; unsorted, duplicate or out-of-range ordinals; count disagreement; a target that is not a MusicXML rest note; or a target whose explicit duration disagrees with the proof. It converts only certified target note elements to forward elements by copying their explicit duration and, when present, voice/staff values. It does not synthesize timing data or inspect neighboring notes.

applySmoosicProductWriteback receives paddingRestProvenance, invokes normalization first, then runs the existing part identity, voice identity, cardinality, stable-locator, supported semantic change, revalidation, conflict and immutable revision paths unchanged.

## Review Focus

1. A source-authored hidden rest is marked accidentally. The import wrapper must mark only SmoMeasure.createRestNoteWithDuration calls made inside the exact XmlToSmo.convert scope; source XML rest conversion and later teacher actions are negative tests.
2. Smoosic cloning silently loses identity. The real browser proof must demonstrate that all 14 generated padding objects remain exactly provable after the supported pitch edit. Missing identity blocks write-back.
3. Model traversal and MusicXML order diverge. The editor must prove total note count and one-to-one ordinal mapping; no fuzzy remap is allowed.
4. A forged/stale iframe message names genuine-rest ordinals. Existing same-origin, event.source, requestId and sourceRevision checks remain mandatory; the host additionally validates proof structure and target rest/duration before conversion.
5. Normalization hides a structural edit. After conversion, every existing cardinality, stable-locator, semantic-diff and canonical revalidation check still runs.
6. Sonar appears green without scanning. Exact-head Regression Quality evidence must show the server/cloud scan step executed and the quality gate passed; disabled mode blocks merge readiness.

---

### Task 1: Characterize and Lock the Provenance Seam

**Files:**

- Create: tests/smoosicPaddingRestProvenance.test.js
- Create: experiments/smoosic-mobile/src/seslitab-padding-rest-provenance.js
- Modify: experiments/smoosic-mobile/src/index.js

**Interfaces:**

- createSmoosicPaddingRestTracker() -> tracker
- tracker.runDuringImport(convertFn) -> score
- tracker.createExportManifest({ score, rawMusicXml, sourceRevision }) -> frozen provenance
- tracker.clear() -> void

- [ ] **Step 1: Write the failing import-scope tests**

Use fake note objects and a fake createRestNoteWithDuration seam to prove that only objects created during runDuringImport are marked. Cover a source-authored hidden rest, a teacher-created rest after import, repeated imports clearing old state, duplicate identities, missing locators and mutation of captured duration/identity.

- [ ] **Step 2: Run the focused test and verify RED**

Run: node --test tests/smoosicPaddingRestProvenance.test.js

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the smallest import-scoped tracker**

Wrap and restore the Smoosic factory in try/finally. Store no XML-derived guess. Use an unexported Symbol plus object identity and exact locator captured after conversion. Clearing or replacing a score invalidates the old registry.

- [ ] **Step 4: Add deterministic ordinal and count tests**

Build a small fake score with pitched notes, a source rest and two marked padding rests. Assert sorted unique raw ordinals and exact raw/model note-count agreement. Make order drift, a replaced object and a count mismatch fail closed.

- [ ] **Step 5: Integrate only the load seam**

In loadMusicXmlFile, scope the tracker around XmlToSmo.convert and retain the tracker only after view.changeScore succeeds. Do not change currentEditorMusicXmlText or the local XML download path yet.

- [ ] **Step 6: Verify GREEN and existing editor contract**

Run: node --test tests/smoosicPaddingRestProvenance.test.js tests/stageS15SmoosicWriteback.test.js

Expected: PASS; no write-back protocol change yet.

- [ ] **Step 7: Commit the seam**

Commit message: test: capture deterministic Smoosic padding provenance

### Task 2: Versioned Editor Export Provenance

**Files:**

- Modify: experiments/smoosic-mobile/src/index.js
- Modify: tests/stageS15SmoosicWriteback.test.js
- Test: tests/smoosicPaddingRestProvenance.test.js

**Interfaces:**

- SESLITAB_EXPORT_VERSION = 2
- createSesliTabWritebackExport({ score, sourceRevision, tracker }) -> { musicXml, paddingRestProvenance }
- Local save/export continues to use currentEditorMusicXmlText() without provenance normalization.

- [ ] **Step 1: Write failing message-contract tests**

Require export-result version 2 and a provenance object whose sourceRevision matches the request. Assert that missing/stale/unprovable tracker state posts a bounded error result and never posts a successful result with raw XML alone. Assert local XML save remains raw and unchanged.

- [ ] **Step 2: Run focused tests and verify RED**

Run: node --test tests/smoosicPaddingRestProvenance.test.js tests/stageS15SmoosicWriteback.test.js

Expected: FAIL because the result is still version 1 and has no proof.

- [ ] **Step 3: Implement the host-request-only export builder**

Call SmoToXml once, serialize once, create the manifest from the current score and raw XML, and post both in the same result. Do not normalize XML in the editor and do not persist the marker in XML.

- [ ] **Step 4: Keep security checks unchanged**

Preserve same-origin, event.source === parent, request type, requestId and sourceRevision behavior. Bound manifest entry count by raw note count and existing payload size policy.

- [ ] **Step 5: Verify GREEN**

Run: node --test tests/smoosicPaddingRestProvenance.test.js tests/stageS15SmoosicWriteback.test.js

Expected: PASS.

- [ ] **Step 6: Commit the protocol slice**

Commit message: feat: emit versioned Smoosic padding provenance

### Task 3: Strict Host Normalization

**Files:**

- Create: src/services/smoosicPaddingRestNormalization.js
- Create: tests/smoosicPaddingRestNormalization.test.js

**Interfaces:**

- SMOOSIC_PADDING_PROVENANCE_VERSION = 1
- normalizeSmoosicPaddingRests({ musicXml, provenance, sourceRevision }) -> frozen result

- [ ] **Step 1: Write failing normalizer tests**

Cover one and multiple certified rest ordinals, sorted uniqueness, exact counts, sourceRevision match and timing-preserving forward output. Negative cases: no proof, version mismatch, stale revision, duplicate/unsorted/out-of-range ordinal, target pitched note, target without duration, duration mismatch, malformed XML and oversized entry list.

- [ ] **Step 2: Add real-rest preservation tests**

Construct raw XML containing a visible source rest, a hidden source rest with print-object=no, a teacher-added rest and a marked padding rest with identical duration/voice/measure shape. Certify only the padding ordinal. Assert all other rest note elements are byte-semantically present after normalization.

- [ ] **Step 3: Run the focused test and verify RED**

Run: node --test tests/smoosicPaddingRestNormalization.test.js

Expected: FAIL because the module does not exist.

- [ ] **Step 4: Implement exact ordinal conversion**

Parse securely with the existing DOM parser boundary. Validate the complete manifest before mutating a cloned document. Convert only certified note elements to forward elements, copying explicit duration and optional voice/staff children. Do not consult neighboring events or compute silent gaps.

- [ ] **Step 5: Verify GREEN and inspect for heuristic leakage**

Run: node --test tests/smoosicPaddingRestNormalization.test.js

Expected: PASS.

Run a repository search for sourceSilentIntervals, intervalInsideGap and quiet-gap logic in changed production files.

Expected: no matches.

- [ ] **Step 6: Commit the normalizer**

Commit message: feat: normalize only certified Smoosic padding rests

### Task 4: Integrate Before Existing Structural Validation

**Files:**

- Modify: src/services/smoosicProductWriteback.js
- Modify: src/smoosicEditorTabUi.js
- Modify: tests/smoosicProductWriteback.test.js
- Modify: tests/stageS15SmoosicWriteback.test.js

**Interfaces:**

- WRITEBACK_VERSION = 2
- applySmoosicProductWriteback({ authority, musicXml, paddingRestProvenance, revisionId, ...existing }) -> existing outcome contract

- [ ] **Step 1: Write the failing supported-edit test**

Use a source with a real rest and a Smoosic candidate containing certified padding plus one pitch edit. Expect APPLIED, one immutable revision, unchanged source rests and the existing downstream revalidation behavior.

- [ ] **Step 2: Write fail-closed regression tests**

Require UNSUPPORTED_STRUCTURE and unchanged authority/revision for missing proof, tampered proof, inserted/deleted note, voice relocation, reordered identity, certified genuine rest, extra unproven rest and stale sourceRevision. Keep existing NO_CHANGE, INVALID_XML, CONFLICT, STALE_SOURCE and PUBLISH_FAILED expectations.

- [ ] **Step 3: Run focused tests and verify RED**

Run: node --test tests/smoosicPaddingRestNormalization.test.js tests/smoosicProductWriteback.test.js tests/stageS15SmoosicWriteback.test.js

Expected: supported padding case fails before cardinality because integration is absent.

- [ ] **Step 4: Integrate normalization first**

Validate message version/proof in smoosicEditorTabUi, pass proof to applySmoosicProductWriteback, normalize, then call the existing single-part and voice normalization and changedIndexesFor flow. Map any proof/normalization mismatch to UNSUPPORTED_STRUCTURE. Do not weaken existing locators or semantic fields.

- [ ] **Step 5: Verify GREEN**

Run the focused command from Step 3.

Expected: PASS.

- [ ] **Step 6: Commit the write-back slice**

Commit message: fix: accept proven Smoosic padding writeback

### Task 5: Real gesi-clean.xml Browser Proof

**Files:**

- Modify: scripts/verifyS15SmoosicWritebackBrowser.js
- Modify: tests/stageS15SmoosicWriteback.test.js
- Evidence: artifacts/s15-smoosic-writeback.json

**Interfaces:**

- Reuses tests/fixtures/real-omr/gesi-clean.xml.
- Records source/raw/normalized total, pitched and rest counts; generated ordinal/locator list; edit class; terminal status; committed revision; and negative-case outcomes.

- [ ] **Step 1: Extend the browser proof and observe RED**

Load gesi-clean.xml through the real Smoosic runtime, change exactly one pitch, request write-back and require source 112 events, raw Smoosic 126 events, 104 pitched notes in both, 8 source rests, 22 raw rests, exactly 14 certified padding entries at measure indexes 7, 18 and 19, normalized 112 events and APPLIED.

Run: node scripts/verifyS15SmoosicWritebackBrowser.js

Expected before implementation: FAIL at the supported gesi write-back assertion.

- [ ] **Step 2: Prove identity survives the supported edit**

The artifact must show every certified entry still resolves to the exact import-marked object and raw ordinal after the pitch edit. If any entry is reconstructed by shape or identity is lost, STOP and revise the design.

- [ ] **Step 3: Add real negative browser cases**

Prove: no-change is truthful; a source-authored hidden rest is preserved; teacher rest insertion is rejected; deletion is rejected; voice relocation is rejected; one tampered ordinal is rejected; the accepted revision remains unchanged after every rejection.

- [ ] **Step 4: Verify GREEN**

Run: node scripts/verifyS15SmoosicWritebackBrowser.js

Expected: PASS and artifacts/s15-smoosic-writeback.json contains all counts, provenance and rejection evidence.

- [ ] **Step 5: Run focused browser-adjacent tests**

Run: node --test tests/smoosicPaddingRestProvenance.test.js tests/smoosicPaddingRestNormalization.test.js tests/smoosicProductWriteback.test.js tests/stageS15SmoosicWriteback.test.js

Expected: PASS.

- [ ] **Step 6: Commit the browser evidence slice**

Commit message: test: prove real Smoosic padding provenance

### Task 6: Documentation and Security Review

**Files:**

- Create: docs/ses-68-smoosic-padding-rest-provenance.md
- Modify: sonar-project.properties only if justified by the existing browser-proof exclusion pattern

- [ ] **Step 1: Document the trust boundary**

Record the versioned envelope, import-only marking seam, object-identity/locator proof, exact ordinal conversion, all rejection reasons and why hidden/duration/voice/measure/silence are not provenance.

- [ ] **Step 2: Document operational stops**

State that missing proof, Smoosic version changes, traversal-order drift, disabled Sonar, browser-proof failure, CI failure or any real-rest mutation blocks merge. Repeat no Render/Firebase/OMR/config change and no deployment.

- [ ] **Step 3: Run a secrets and forbidden-surface review**

Inspect git diff --name-only origin/main...HEAD and git diff --check. Confirm no credentials, generated vendor bundles, Dockerfile, render.yaml, backend, Firebase, OMR or deployment edits.

- [ ] **Step 4: Run Sonar file analysis**

Analyze each changed main source file individually with the SonarQube file-analysis capability when available:
- experiments/smoosic-mobile/src/seslitab-padding-rest-provenance.js
- experiments/smoosic-mobile/src/index.js
- src/services/smoosicPaddingRestNormalization.js
- src/services/smoosicProductWriteback.js
- src/smoosicEditorTabUi.js

Resolve every new blocker, critical, vulnerability and unreviewed security hotspot before proceeding. Do not suppress findings merely to pass.

- [ ] **Step 5: Commit documentation**

Commit message: docs: record SES-68 provenance security contract

### Task 7: Exact-Head Verification and PR Gate

**Files:**

- Verification/evidence only. No additional product behavior.

- [ ] **Step 1: Fresh-read and reconcile**

Fetch origin/main. Record origin/main, HEAD and diff stat. If main moved, update through the approved non-destructive workflow and rerun all evidence.

- [ ] **Step 2: Run focused tests**

Run: node --test tests/smoosicPaddingRestProvenance.test.js tests/smoosicPaddingRestNormalization.test.js tests/smoosicProductWriteback.test.js tests/stageS15SmoosicWriteback.test.js

Expected: PASS.

- [ ] **Step 3: Run the full repository gates**

Run: npm test

Expected: PASS.

Run: npm run build

Expected: PASS.

Run every S14/S15 browser command present in .github/workflows/ci.yml, including node scripts/verifyS15SmoosicWritebackBrowser.js.

Expected: PASS.

- [ ] **Step 4: Run verification-before-completion**

Use superpowers:verification-before-completion and Codex Engineering Guardrails code-verification against the exact candidate head. Map each acceptance criterion to fresh command evidence; classify anything not executed as unverified.

- [ ] **Step 5: Open a draft PR and require exact-head CI**

The PR must reference SES-68 and the Notion spec, explicitly reject PR #276 heuristic logic, list changed files and counts, and state no Render/Firebase/OMR/deployment/config change. Both CI/test-and-build and Regression Quality must pass on the same head.

- [ ] **Step 6: Require actual Sonar execution and quality gate**

Inspect the Regression Quality job. The SonarQube Server scan or SonarQube Cloud scan step must execute; the disabled explanation step is a blocker. Retrieve the exact-head quality gate and list every condition. Require overall OK and no unresolved new-code security hotspot. If credentials/integration are absent, stop and request separate setup authority; do not alter secrets in this task.

- [ ] **Step 7: Request independent code review**

Use superpowers:requesting-code-review against the exact plan/spec and candidate head. Fix accepted findings with new RED/GREEN evidence and rerun exact-head gates.

- [ ] **Step 8: STOP before merge**

Do not merge. Present candidate SHA, requirement-to-evidence matrix, focused/full/build/browser/CI/Sonar results and unresolved risks for explicit human merge approval.

### Task 8: Post-Merge Deployment and Physical Device Gates

**Files:**

- Evidence only; no source or infrastructure changes.

- [ ] **Step 1: STOP for existing-service deployment approval**

After an explicitly approved merge, request separate approval naming the exact main revision and existing seslitab-app service. Do not deploy or alter Render/OMR configuration without it.

- [ ] **Step 2: Verify deployed exact revision**

Use the existing read-only production composition probe and confirm the deployed manifest equals the approved main revision.

- [ ] **Step 3: Physical iPhone Safari/VoiceOver acceptance**

On the approved iPhone/Safari version, load gesi-clean.xml, perform one pitch-only edit, apply it, and verify APPLIED plus refreshed notation/TAB/playback-facing output. Repeat no-change and one structural negative case. Record device, OS/browser, exact revision, fixture, messages and output observations.

- [ ] **Step 4: Final STOP**

A desktop/browser PASS without physical-device evidence is PARTIAL. Any device failure blocks completion; do not create another service or change OMR as a workaround.

## Self-review Result

- Spec coverage: deterministic provenance, source-rest preservation, pre-cardinality normalization, structural fail-closed behavior, TDD, browser proof, Sonar, merge/deploy/device gates map to Tasks 1–8.
- Root cause: the plan acts at Smoosic import-time generated-object provenance, not at the later XML shape.
- Heuristic exclusion: no duration, voice, measure, hidden-state, rest-count, silence-gap or musical-shape inference is allowed.
- Type/interface consistency: editor envelope version 2 carries provenance version 1; host validates the same sourceRevision and raw ordinals before existing write-back validation.
- Security posture: origin/source/request/revision checks remain, malformed or stale proof fails closed, and no third-party or infrastructure code is modified.
- Verification posture: focused, full, build, real-browser, exact-head CI, actual Sonar quality gate and independent review are required.
- Approval posture: this commit contains planning only. Production implementation must not begin until this plan and execution method receive explicit human approval.
