# CE-BRIDGE-01 Smoosic Structural Revalidation Phase B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect explicit teacher-authored Smoosic structural duration edits to the pinned CE-STRUCT browser runtime, require independent CE revalidation plus exact candidate conformance, then publish one immutable `teacher_corrected` SesliTab revision without granting approval, sharing, learning, automatic apply, or MusicXML write-back authority to the engine.

**Architecture:** Keep the existing S15 same-cardinality nonstructural write-back path intact. Add a separate CE-BRIDGE lane that is entered only when the Smoosic editor exports a valid `TeacherStructuralActionManifestV1`; the first production-admitted editor operation is `CHANGE_EVENT_DURATION`, because it is the only approved CE structural operation currently exposed by SesliTab's Smoosic mobile controls with a direct action seam (`½ süre` / `2× süre`). The host independently validates action provenance, maps exact source identity to a CE `ScoreGraph`, invokes the exact pinned CE browser runtime, verifies candidate MusicXML equals the CE projected graph, and only then uses the existing immutable teacher revision pipeline.

**Tech Stack:** Node.js 24.x SesliTab build/CI, browser ES2022 IIFE runtime, Smoosic 1.0.44, existing SesliTab MusicXML/parser/revision services, pinned ST OMR Correction Engine CE-STRUCT browser runtime.

**Spec:** `docs/superpowers/specs/2026-09-29-ce-bridge-01-smoosic-structural-revalidation-design.md`

## Global Constraints

- Fresh-read SesliTab baseline: `8578f04e0a623b16d64d2ddf381e6acc1878e30a`.
- Pinned Correction Engine baseline: `7550e77b3ddff55e63e714b2dbc2b450b69771dc`.
- Pinned CE browser artifact SHA-256: `b58df06f9f25ce61ed0ab6939238951cfdf9288912dddf9139b15bf6a9bb72e6`.
- CE contract: `ST_OMR_CORRECTION_ENGINE_CE_STRUCT_BROWSER`, contract/runtime version `1.0.0`, global `STOmrCorrectionCeStructRuntime`.
- CE patch schema must remain `teacher-structural-patch-set-v1`.
- Raw/source MusicXML remains immutable.
- SES-68 padding-rest provenance remains an independent evidence lane and cannot be treated as teacher intent.
- Structural intent comes only from explicit editor actions; final MusicXML diff is never an intent source.
- Candidate MusicXML is representation evidence only and must conform exactly to CE projection before commit.
- Any stale source, ambiguous mapping, malformed action manifest, unknown operation, unsupported mixed edit, CE failure, or candidate mismatch fails closed before immutable commit.
- No partial subset of a structural action manifest may be applied.
- Existing S15 pitch/nonstructural behavior remains unchanged when no valid structural action manifest is present.
- Milestone production admission is `CHANGE_EVENT_DURATION` only. The CE runtime still supports seven structural operation kinds, but insert/remove/voice/staff/tie/meter remain fail-closed until SesliTab has an explicit editor action hook and, where needed, a host revision representation that can prove them without inference.
- `src/services/teacherStructuralCorrectionRevalidation.js` remains the downstream T4/share-readiness channel; CE-BRIDGE must not replace it or infer share eligibility.
- CE authority flags must remain false: automatic apply, final teacher approval, student sharing, learning, and MusicXML write-back.
- No new persistence, authentication, Render service/domain, network service, deploy, or student delivery.
- Merge and deploy remain separate explicit human gates.

## Review Focus

1. A duration change made through an uninstrumented Smoosic surface must not be converted into teacher intent from the XML diff; export/apply must fail closed.
2. Pitch + duration in one Apply must not silently split into S15 + CE; candidate conformance must reject the mixed result unless a later atomic mapping design explicitly admits it.
3. Undoing a duration edit before Apply must remove that net structural action from the manifest; an empty net manifest must not create a structural revision.
4. A valid CE PASS with a candidate MusicXML that differs from the CE projected graph in any semantic field must return `CONFORMANCE_FAILED` and preserve the current revision.
5. A new teacher-corrected revision must invalidate prior approval/readiness by revision identity and must not make `teacherStructuralCorrectionRevalidation.js` evidence automatically appear.

---

### Task 1: Pin and materialize the CE-STRUCT browser runtime

**Files:**
- Create: `scripts/prepareCeStructRuntime.js`
- Create: `tests/ceStructRuntimeBinding.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `prepareCeStructRuntime() -> { destination, revision, runtimeVersion, artifactSha256 }`
- Produces constants: `CE_STRUCT_REPOSITORY`, `CE_STRUCT_REVISION`, `CE_STRUCT_BROWSER_CONTRACT`, `CE_STRUCT_RUNTIME_GLOBAL`, `CE_STRUCT_ARTIFACT_SHA256`
- Public artifact destination: `public/st-omr-correction-engine-runtime/`

- [ ] **Step 1: Write RED runtime-binding tests**
  - Assert exact revision `7550e77b3ddff55e63e714b2dbc2b450b69771dc`.
  - Assert contract/runtime/global/artifact names match the merged CE runtime.
  - Assert generated manifest `engineSourceRevision` equals the pin, artifact SHA-256 equals `b58df06...`, `externalImports === 0`, and every authority/capability flag is false.
  - Assert manifest or artifact revision/digest drift is rejected.
  - Assert unsafe/missing generated files are rejected.

- [ ] **Step 2: Run the focused test and prove RED**
  - Run: `node --test tests/ceStructRuntimeBinding.test.js`
  - Expected: FAIL because `prepareCeStructRuntime.js` does not exist.

- [ ] **Step 3: Implement the runtime preparation script**
  - Follow `scripts/prepareEditorRuntime.js`: detached shallow checkout of the exact CE commit, `npm install --ignore-scripts --no-audit --no-fund --package-lock=false`, then `npm run build:ce-struct-browser`.
  - Verify the upstream manifest and exact artifact digest before copying `dist/browser` into `public/st-omr-correction-engine-runtime`.
  - Write a SesliTab provenance JSON containing exact source revision, upstream manifest digest, runtime version/global, and copied file digests.
  - Always delete the temporary build directory in `finally`.

- [ ] **Step 4: Add the build script to the existing runtime preparation chain**
  - Add `ce-struct:prepare-runtime`.
  - Extend `runtime:prepare` so score, editor, CE-STRUCT, and SMuFL assets are prepared before the existing Smoosic/Vite build.

- [ ] **Step 5: Run focused and existing runtime binding tests**
  - Run: `node --test tests/ceStructRuntimeBinding.test.js tests/editorRuntimeBinding.test.js tests/scoreRuntimeBinding.test.js`
  - Expected: PASS.

- [ ] **Step 6: Commit**
  - Commit message: `build: pin CE-STRUCT browser runtime`

### Task 2: Record explicit Smoosic structural action provenance without weakening SES-68

**Files:**
- Create: `experiments/smoosic-mobile/src/seslitab-structural-action-provenance.js`
- Modify: `experiments/smoosic-mobile/src/index.js`
- Modify: `experiments/smoosic-mobile/src/seslitab-padding-rest-provenance.js`
- Create: `tests/smoosicStructuralActionProvenance.test.js`
- Modify: `tests/smoosicPaddingRestProvenance.test.js`

**Interfaces:**
- Produces: `createSmoosicStructuralActionTracker() -> { beginImport, recordDurationAction, reconcileRenderedScore, createApplyManifest, clear, authorizedDurationIdentitySet }`
- Produces manifest: `TeacherStructuralActionManifestV1`
- Existing postMessage request remains protocol v1; existing result remains protocol v2 with one optional `structuralActionManifest` field.

- [ ] **Step 1: Write RED tracker contract tests**
  - Manifest exact fields: `version: 1`, `sourceRevision`, non-empty `editorSessionId`, `actionId`, ordered `operations`, `baseMappingFingerprint`, `createdFromExplicitTeacherApply: true`.
  - A duration action records only an exact selected Smoosic object identity, raw note ordinal, stable part/measure/voice/staff locator, exact before duration, exact after duration, and operation order.
  - Two duration actions on the same target collapse to one net before/after operation.
  - Ctrl+Z reconciliation returning the note to its import value removes the active operation.
  - Pitch-only actions produce no structural manifest.
  - Unmarked model mutation is never converted into an action.
  - Padding-rest identities cannot be structural targets.

- [ ] **Step 2: Prove RED**
  - Run: `node --test tests/smoosicStructuralActionProvenance.test.js tests/smoosicPaddingRestProvenance.test.js`
  - Expected: FAIL on the missing tracker.

- [ ] **Step 3: Implement the import-time identity/action tracker**
  - Build a deterministic canonical mapping from the imported raw MusicXML order and Smoosic object identities.
  - Keep Smoosic object identity internal; the host-facing operation uses raw ordinal + stable locator as the exact mapping proof.
  - Compute one deterministic `baseMappingFingerprint` over canonical import mapping.
  - Never discover a structural action by comparing final XML.

- [ ] **Step 4: Instrument only proven mobile duration actions**
  - In `runMobileKeyAction(button)`, for `,` and `.`: capture exact selected note/locator and before state, execute the native Smoosic key action, await renderer stability, then capture after state and call `recordDurationAction`.
  - For Ctrl+Z: execute native undo, await stability, then call `reconcileRenderedScore`; do not append an `UNDO` CE operation.
  - Existing pitch path remains unchanged and does not enter the structural tracker.

- [ ] **Step 5: Preserve SES-68 proof with a narrow structural waiver**
  - Do not loosen padding-rest checks globally.
  - `adoptRenderedScore` may tolerate a duration change only for a non-padding note identity explicitly present in `authorizedDurationIdentitySet()`.
  - Padding rest identity, duration, locator, raw ordinal, and source-rest topology remain exact.

- [ ] **Step 6: Extend the existing export result**
  - `createSesliTabWritebackExport` asks the structural tracker for `createApplyManifest({ sourceRevision, actionId: requestId })`.
  - Include `structuralActionManifest` only when the net operation list is non-empty.
  - Bound the manifest to at most 128 operations and 64 KiB serialized JSON; overflow fails export.

- [ ] **Step 7: Run focused tests and S15 regressions**
  - Run: `node --test tests/smoosicStructuralActionProvenance.test.js tests/smoosicPaddingRestProvenance.test.js tests/stageS15SmoosicWriteback.test.js`
  - Expected: PASS.

- [ ] **Step 8: Commit**
  - Commit message: `feat: capture explicit Smoosic structural actions`

### Task 3: Independently validate the action manifest and exact identity bridge on the host

**Files:**
- Create: `src/services/smoosicStructuralActionManifest.js`
- Create: `src/services/smoosicCeStructIdentityBridge.js`
- Create: `tests/smoosicStructuralActionManifest.test.js`
- Create: `tests/smoosicCeStructIdentityBridge.test.js`

**Interfaces:**
- Produces: `validateTeacherStructuralActionManifest(value, context) -> frozenValidatedManifest`
- Produces: `createSmoosicCeStructIdentityBridge({ currentRevision, currentMusicXml }) -> { baseMappingFingerprint, records, eventIdForRawOrdinal, rawOrdinalForEventId }`
- Event IDs are deterministic and revision-local: `seslitab:<revisionId>:event:<sourceIndex>`.

- [ ] **Step 1: Write RED strict-shape tests**
  - Reject arrays/accessors/symbol keys/prototype-polluted nested objects, unknown top-level/operation keys, malformed IDs, duplicate order values, missing before/after, empty operation arrays, >128 operations, and >64 KiB serialized manifest.
  - Reject `createdFromExplicitTeacherApply !== true`.
  - Reject stale `sourceRevision`.
  - Reject `baseMappingFingerprint` mismatch.
  - Deep-clone/freeze only after validation; never trust structured-clone object prototypes as authority.

- [ ] **Step 2: Write RED mapping tests**
  - Map raw source note ordinal to exactly one current revision index/event ID.
  - Require part/measure/voice/staff/rest/chord identity agreement.
  - Duplicate, missing, stale, reordered, or ambiguous mapping returns `AMBIGUOUS_IDENTITY`; there is no nearest-note, pitch-label, visible measure number, geometry, or candidate ordinal fallback.

- [ ] **Step 3: Prove RED**
  - Run: `node --test tests/smoosicStructuralActionManifest.test.js tests/smoosicCeStructIdentityBridge.test.js`
  - Expected: FAIL because host validators do not exist.

- [ ] **Step 4: Implement the validator and identity bridge**
  - Use exact current immutable revision + exact registered MusicXML.
  - Independently reproduce the editor's canonical base mapping fingerprint.
  - Map only manifest-declared actions; candidate MusicXML does not participate in teacher-intent mapping.

- [ ] **Step 5: Admit only the current production slice**
  - `CHANGE_EVENT_DURATION` is admitted when exact identity and before/after state match.
  - The other six CE operation names are recognized as CE contract values but return `UNSUPPORTED_STRUCTURE` in this milestone rather than being guessed or silently ignored.

- [ ] **Step 6: Run tests**
  - Expected: PASS.

- [ ] **Step 7: Commit**
  - Commit message: `feat: validate structural action identity`

### Task 4: Build the exact CE ScoreGraph and invoke the pinned runtime fail-closed

**Files:**
- Create: `src/services/smoosicCeStructBridge.js`
- Create: `tests/smoosicCeStructBridge.test.js`

**Interfaces:**
- Produces: `resolveCeStructRuntime(globalScope) -> runtime | null`
- Produces: `buildCeStructBaseGraph({ currentRevision, currentMusicXml, identityBridge, runtime }) -> ScoreGraph`
- Produces: `processSmoosicStructuralEdit({ runtime, currentRevision, currentMusicXml, manifest, identityBridge, ids }) -> bridgeResult`
- Bridge result status vocabulary includes: `NO_CHANGE`, `UNSUPPORTED_STRUCTURE`, `INVALID_ACTION_PROVENANCE`, `STALE_SOURCE`, `AMBIGUOUS_IDENTITY`, `CE_RUNTIME_UNAVAILABLE`, `CE_CONTRACT_MISMATCH`, `CE_PROJECTION_FAILED`, `CE_REVALIDATION_FAILED`, `CONFORMANCE_FAILED`, `CONFLICT`.

- [ ] **Step 1: Write RED runtime admission tests**
  - Require global `STOmrCorrectionCeStructRuntime`.
  - Require contract/version/runtime/patch schema exact match and exactly the required constructor/process methods.
  - Missing/unknown runtime returns typed failure, never falls back to copied CE logic.

- [ ] **Step 2: Write RED ScoreGraph mapping tests**
  - Create measures from exact source structural context with `key/beats/beatType/implicit/pickup`.
  - Create events with deterministic event ID, exact measureKey, onset, duration, voice, staff, pitch/rest/chord state, and tie metadata.
  - Base graph fingerprint must be produced by the pinned CE runtime.
  - A revision/XML cardinality or meter mismatch fails closed.

- [ ] **Step 3: Write RED CE patch/invocation tests**
  - Build `createTeacherEditAuthorization({ actionId: manifest.actionId })`.
  - Build exactly one `CHANGE_EVENT_DURATION` patch from the manifest's exact target/before/after.
  - Build patch set with exact source ID and CE base fingerprint.
  - Require `projection.ok === true`, `revalidation.integrityDecision === 'PASS'`, and `teacherCorrectedRevisionEligible === true`.
  - Require every returned authority flag to remain false.
  - Stale before/fingerprint, CE FAIL, malformed runtime output, or unexpected authority true returns typed failure and preserves current revision.

- [ ] **Step 4: Prove RED, implement minimal bridge, then GREEN**
  - Run: `node --test tests/smoosicCeStructBridge.test.js`.
  - Expected final: PASS.

- [ ] **Step 5: Commit**
  - Commit message: `feat: invoke CE-STRUCT for teacher duration edits`

### Task 5: Require exact candidate MusicXML conformance to CE projection

**Files:**
- Create: `src/services/smoosicCeStructConformance.js`
- Create: `tests/smoosicCeStructConformance.test.js`

**Interfaces:**
- Produces: `buildCandidateCeStructGraph({ candidateMusicXml, baseGraph, identityBridge, manifest, runtime }) -> ScoreGraph`
- Produces: `verifyCeStructCandidateConformance({ projectedGraph, candidateGraph }) -> true | throws`

- [ ] **Step 1: Write RED exact-conformance tests**
  - Duration-only candidate matching CE projection passes.
  - Candidate with undeclared pitch, voice, staff, tie, onset, meter, extra/missing event, reordered identity, or changed rest topology fails.
  - Pitch + declared duration in the same Apply fails as `CONFORMANCE_FAILED`; do not split it into S15 + CE.
  - Representation-only SES-68 normalizations that canonicalize back to the same graph pass.
  - JSON key order or object instance differences do not matter; graph semantic content/order/identity does.

- [ ] **Step 2: Prove RED**
  - Run: `node --test tests/smoosicCeStructConformance.test.js`
  - Expected: FAIL on missing conformance service.

- [ ] **Step 3: Implement candidate graph construction**
  - Parse the already SES-68-normalized candidate.
  - Reuse base event IDs only through exact identity bridge.
  - Never assign identity by proximity or candidate ordinal fallback.
  - Compare the full canonical graph against `projection.graph`.

- [ ] **Step 4: Run tests**
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - Commit message: `feat: require CE structural candidate conformance`

### Task 6: Publish one immutable teacher-corrected revision only after CE + conformance PASS

**Files:**
- Modify: `src/services/smoosicProductWriteback.js`
- Create: `tests/smoosicStructuralProductWriteback.test.js`
- Modify: `tests/stageS15SmoosicWriteback.test.js`

**Interfaces:**
- Produces: structural outcome `APPLIED_STRUCTURAL` with `revision`, exact `musicXml`, and refreshed authority.
- Existing S15 `APPLIED` behavior remains unchanged for nonstructural writes.

- [ ] **Step 1: Write RED routing/transaction tests**
  - No structural manifest: exact existing S15 path.
  - Valid structural manifest: SES-68 normalization → manifest validation → identity bridge → CE → candidate conformance → immutable commit.
  - Any failure before commit leaves the exact authority/workspace/current revision unchanged.
  - Structural success creates exactly one new `TEACHER_CORRECTED` revision and registers the exact conformed candidate MusicXML.
  - Prior approval/readiness does not transfer to the new revision.
  - Publishing the committed revision through the existing SesliTab result path triggers fresh quality analysis for the new exact revision; no previous quality decision is reused by revision identity.
  - No T4 structural revalidation evidence is fabricated.
  - A publication/UI failure after immutable commit remains retryable without creating a second revision, preserving current S15 publication semantics.

- [ ] **Step 2: Prove RED**
  - Run: `node --test tests/smoosicStructuralProductWriteback.test.js tests/stageS15SmoosicWriteback.test.js`
  - Expected: FAIL before structural routing exists.

- [ ] **Step 3: Extend status vocabulary without changing S15 meanings**
  - Add `APPLIED_STRUCTURAL`, `INVALID_ACTION_PROVENANCE`, `AMBIGUOUS_IDENTITY`, `CE_RUNTIME_UNAVAILABLE`, `CE_CONTRACT_MISMATCH`, `CE_PROJECTION_FAILED`, `CE_REVALIDATION_FAILED`, and `CONFORMANCE_FAILED`.
  - Keep existing `APPLIED`, `NO_CHANGE`, `UNSUPPORTED_STRUCTURE`, `INVALID_XML`, `CONFLICT`, `STALE_SOURCE`, `PUBLISH_FAILED`.

- [ ] **Step 4: Implement structural transaction routing**
  - Preserve the exact SES-68 padding normalization and bounded part/divisions/voice representation normalization before CE candidate graph construction.
  - Use existing `revalidatePrDEditorMusicXml` + `commitPrDProductRevision` for the admitted duration slice after CE conformance, so revision history/concurrency/approval invalidation stays inside existing host authority.
  - Do not add insert/remove/meter persistence through guessed host operations.

- [ ] **Step 5: Run focused + revision/concurrency regressions**
  - Run: `node --test tests/smoosicStructuralProductWriteback.test.js tests/stageS15SmoosicWriteback.test.js tests/teacherRevisionHistory*.test.js tests/teacherRevisionConcurrency.test.js tests/teacherStructuralCorrectionRevalidation.test.js`
  - Expected: PASS.

- [ ] **Step 6: Commit**
  - Commit message: `feat: commit CE-revalidated structural duration revisions`

### Task 7: Load CE runtime in the host UI and expose accessible fail-closed status

**Files:**
- Modify: `src/smoosicEditorTabUi.js`
- Create: `tests/stageCeBridgeSmoosicStructuralWriteback.test.js`
- Create: `tests/fixtures/ce-bridge-structural-browser-proof.html`
- Create: `scripts/verifyCeBridgeStructuralBrowser.js`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `loadCeStructRuntime(root) -> Promise<runtime|null>`, following the existing `stagePrDKeypadIntegrationUi.js` dynamic runtime-loader pattern.
- Existing Apply button remains the single explicit teacher Apply action.

- [ ] **Step 1: Write RED host-message/security tests**
  - Keep same-origin, exact iframe source, requestId, result version, sourceRevision, and current source checks.
  - Accept `structuralActionManifest` only after the host validator succeeds.
  - Malformed/oversized manifests, stale session/revision, and runtime load failure produce typed fail-closed status.
  - Normal UI must not expose raw provenance/debug payload.

- [ ] **Step 2: Write RED accessibility/status tests**
  - Error state: `role=alert`, assertive live region.
  - Success/info: `role=status`, polite live region.
  - Short Turkish status messages distinguish unsupported edit, stale source, action provenance failure, CE failure, and candidate mismatch without relying on color.

- [ ] **Step 3: Implement the CE runtime loader**
  - Load `/st-omr-correction-engine-runtime/ce-struct-browser-runtime.js` once per document.
  - Require the exact global/contract before routing structural Apply.
  - No network request from the CE artifact itself; only the existing static asset load is allowed.

- [ ] **Step 4: Wire Apply routing**
  - Freeze `startingSourceRevision` before request.
  - If result carries a valid non-empty structural manifest, call the structural transaction path with the loaded CE runtime.
  - If no structural manifest is present, retain current S15 path exactly.
  - Do not interpret candidate XML structure as an implicit action manifest.

- [ ] **Step 5: Add real-browser protected proof**
  - Exercise one explicit `2× süre` action → Apply → CE PASS → exact candidate conformance → one `teacher_corrected` revision → fresh SesliTab quality analysis → rerender.
  - Exercise undo-before-Apply → no structural revision.
  - Exercise undeclared mixed pitch+duration → fail closed and old revision remains.
  - Exercise malformed/stale manifest, CE runtime unavailable, and candidate mismatch.
  - Add the proof to protected CI after S15 write-back and before downstream share/readiness checks.

- [ ] **Step 6: Run focused + browser proof**
  - Run focused Node tests, build the Smoosic bundle, then run `node scripts/verifyCeBridgeStructuralBrowser.js`.
  - Expected: PASS.

- [ ] **Step 7: Commit**
  - Commit message: `feat: wire CE-STRUCT Smoosic apply flow`

### Task 8: Full qualification, docs, and Guardrails gate

**Files:**
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/CURRENT_STATUS.md`
- Modify only if needed by established CI composition: `.github/workflows/ci.yml`

**Interfaces:**
- No new runtime authority. Documentation must distinguish CE structural integrity, immutable teacher correction, and final teacher approval.

- [ ] **Step 1: Document the exact shipped boundary**
  - State exact SesliTab and CE runtime revisions.
  - State that CE-BRIDGE production admission is duration-only in this milestone because only that structural editor action has an explicit provenance hook.
  - State that the CE contract contains seven operations but the remaining six are fail-closed at the product adapter.
  - State that T4/share-readiness and final teacher approval remain separate.
  - State no deploy/new Render/service/domain/persistence/auth/student delivery.

- [ ] **Step 2: Run full qualification on exact branch HEAD**
  - `npm install --ignore-scripts`
  - `npm test`
  - `npm run build`
  - existing protected browser regression chain
  - SonarQube/Cloud workflow
  - Expected: all GREEN.

- [ ] **Step 3: Verify runtime provenance from generated build**
  - CE public provenance source revision must equal `7550e77b3ddff55e63e714b2dbc2b450b69771dc`.
  - CE artifact digest must equal `b58df06f9f25ce61ed0ab6939238951cfdf9288912dddf9139b15bf6a9bb72e6`.
  - Generated CE manifest authority/capability flags must all be false.

- [ ] **Step 4: Run Codex Engineering Guardrails whole-diff verification**
  - Review complete diff from current `main` to exact branch HEAD.
  - Critical/Important findings require test-first repair, a new commit, and complete qualification rerun.
  - Explicitly inspect: hidden XML-diff intent inference, stale source/session acceptance, identity fallback, mixed-edit partial apply, authority widening, duplicate immutable commits, and accidental T4/share approval coupling.

- [ ] **Step 5: Update PR/Linear evidence and STOP**
  - Record exact branch head, CI/quality-gate evidence, runtime revision/digest, and Guardrails result.
  - Leave PR draft or ready as appropriate, but do not merge without a new explicit merge approval.
  - Do not deploy.

## Self-Review

- **Spec coverage:** The full CE-BRIDGE ordering is represented: source freeze, correlated export, SES-68 proof, structural action proof, exact identity, CE projection/revalidation, authority checks, candidate graph conformance, immutable corrected revision, fresh host publication/rerender, and separate approval. The product-admitted editor action surface is intentionally narrower than the CE contract because current Smoosic code exposes an exact action seam only for duration; the other operation kinds remain explicit fail-closed rather than inferred.
- **Step scan:** Each task has its own RED → minimal implementation → GREEN → commit boundary. Runtime preparation, editor provenance, host identity, CE invocation, conformance, immutable commit, UI/browser integration, and final qualification can each be independently reviewed.
- **Type consistency:** `TeacherStructuralActionManifestV1` is editor evidence; `TeacherStructuralPatchSetV1` remains CE evidence. Padding-rest provenance stays separate. `teacherStructuralCorrectionRevalidation.js` remains downstream share-readiness evidence and is not consumed as CE intent.
- **Review Focus coverage:** Uninstrumented edits are covered in Task 2/3; mixed edits in Task 5; undo net action in Task 2; CE-vs-candidate mismatch in Task 5; approval/T4 isolation in Task 6/8.
- **Proportion:** The plan fixes interfaces, files, gates, and tests but leaves function bodies to the implementer.
