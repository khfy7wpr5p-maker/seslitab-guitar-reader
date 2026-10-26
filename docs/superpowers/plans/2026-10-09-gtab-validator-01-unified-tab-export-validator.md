# GTAB-VALIDATOR-01 Unified TAB Export Validator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SesliTab Guitar TAB authoring use one deterministic Part / Staff / Voice identity policy and one export validator from editor readiness through final handoff, while validating physical string/fret against sounding pitch and preserving written pitch plus immutable source MusicXML.

**Architecture:** Add a shared canonical MusicXML identity analyzer, then extract export validation from `editorGuitarTabHandoff.js` into a pure synchronous validator. `guitarTabScoreInventory.js`, teacher-workspace export readiness, and handoff validation will all delegate to these shared seams. Keep the pinned `st-guitar-tab-editor` runtime as assignment/sounding-MIDI/serializer authority; do not merge or alter upstream runtime as part of this task.

**Tech Stack:** Node.js 24 ES modules; browser `DOMParser` / `XMLSerializer`; existing MusicXML security inspection; pinned `st-guitar-tab-editor` revision `b7f4008ecdb0b74eead5869015099f4d734e234e`; existing Semantic Engine + Partitura 1.9.0 CI oracle.

**Spec:** Approved Notion handoff `GTAB-VALIDATOR-01 — Unified TAB Export Validator — Developer JSON Handoff — 2026-10-09` (`https://app.notion.com/p/3f42be2e56648133a69ed4b0ca21ba7d`), building on `docs/superpowers/specs/2026-10-06-gtab-10b-part-staff-voice-target-selection-design.md`.

## Global Constraints

- Baseline `main` must start from exact SHA `35775290be2fd39c7694f8eec06bc090acb3d9c1`.
- Primary implementation repository is `khfy7wpr5p-maker/seslitab-guitar-reader`.
- Do not add a new heavy XML parser dependency; use existing security inspection plus `DOMParser` / `XMLSerializer`.
- The accepted source MusicXML string is immutable authority; any identity completion is derived editor input only and must never overwrite source bytes.
- No auto-fingering. Teacher string/fret assignment remains authoritative.
- Ambiguous Part / Staff / Voice evidence fails closed; no closest-match or label-based fallback.
- Implicit Staff 1 may be materialized only when the score evidence proves one effective staff. Implicit Voice 1 may be materialized only when that staff has one effective voice and no contradictory explicit voice evidence.
- Written pitch semantic parity and sounding pitch physical validation are separate invariants.
- String/fret validation uses sounding pitch. Written pitch spelling/octave must not be rewritten to make a position pass.
- Keep the pinned Editor revision and provenance contract unchanged unless a failing acceptance test proves the upstream runtime itself is the root cause; if that happens, stop and re-scope before changing repositories.
- `st-score-semantic-engine` + Partitura 1.9.0 remain read-only qualification oracles and are not added to browser runtime.
- No merge or deploy in this plan. Merge/deploy require separate user approval.

## Review Focus

1. A note with no `<staff>` in a true one-staff score resolves to Staff 1, but the same omission in multi-staff evidence fails closed.
2. A note with no `<voice>` resolves to Voice 1 only when no other effective voice is possible; mixed missing/Voice 2 or contradictory voice evidence fails closed.
3. Duplicate or conflicting `<technical>`, `<string>`, or `<fret>` evidence never passes by selecting the first occurrence.
4. Transposition preserves written pitch parity while applying the applicable transpose exactly once to sounding-pitch validation, including selected-staff transpose evidence where supported.
5. Source replacement, wrong `partIndex`, stale target selection, and any derived identity completion leave original source bytes unchanged and block export rather than migrating authority.

---

### Task 1: Canonical Part / Staff / Voice identity analyzer

**Files:**
- Create: `src/services/guitarTabCanonicalIdentity.js`
- Create: `tests/guitarTabCanonicalIdentity.test.js`
- Read/Reuse: `musicXmlSecurity.js`
- Read/Reuse: `tests/support/smoosicXmlDom.js`

**Interfaces:**
- Produces: `normalizeGuitarTabTargetSelection(value, { allowNull = false } = {}) -> frozen target tuple | null`; invalid exact identity throws a stable identity error.
- Produces: `analyzeGuitarTabCanonicalIdentity(root, { label = 'score' } = {}) -> { parts }`, where every pitched-note record has exact `partId`, `partIndex`, `staff`, `voice`, and `implicitStaff` / `implicitVoice` flags.
- Produces: `resolveGuitarTabCanonicalTarget(identityAnalysis, targetSelection) -> exact selected part/staff/voice evidence`; stale, empty, or ambiguous target throws a stable identity error.
- Identity errors expose a stable machine code under category `IDENTITY`; callers must not parse human prose.

- [ ] **Step 1: Write failing identity tests** for exact part-list/body parity, duplicate `partId`, wrong `partIndex`, single-staff implicit Staff 1, multi-staff missing-staff ambiguity, sole-voice implicit Voice 1, mixed missing/Voice 2 ambiguity, duplicate staff/voice elements, and empty selected target.
- [ ] **Step 2: Run the focused tests and confirm RED.**

Run: `node --test tests/guitarTabCanonicalIdentity.test.js`

Expected: FAIL because the shared analyzer does not exist.

- [ ] **Step 3: Implement the smallest shared analyzer** in `src/services/guitarTabCanonicalIdentity.js`. Determine effective staff count from trustworthy MusicXML staff declarations plus explicit note evidence; determine effective voices per staff from explicit note evidence. Never infer a different part/staff/voice from display labels or pitch.
- [ ] **Step 4: Run the focused identity tests and confirm GREEN.**
- [ ] **Step 5: Commit the slice.**

Commit message: `feat(GTAB): add canonical TAB identity analyzer`

### Task 2: Make score inventory and derived editor input use the canonical policy

**Files:**
- Modify: `src/services/guitarTabScoreInventory.js`
- Modify: `tests/guitarTabScoreInventory.test.js`
- Test: `tests/gtab10bMultipartSelection.test.js`
- Test: `tests/guitarTabTeacherAuthoring.test.js`

**Interfaces:**
- Consumes: Task 1 identity analyzer.
- Preserves: `extractGuitarTabScoreInventory(musicXml, options)` public shape.
- Preserves: `prepareGuitarTabEditorSourceXml(musicXml, targetSelection, options)` public signature.
- Produces: derived editor XML that inserts `<staff>1</staff>` / `<voice>1</voice>` only where Task 1 explicitly marked the identity as safe implicit evidence.

- [ ] **Step 1: Add RED regression tests** proving one-staff/one-voice omissions are completed only in the derived editor XML, multi-staff or multi-voice omissions fail closed, exact inventory comes from the same analyzer, and `sourceXml` remains byte-for-byte unchanged.
- [ ] **Step 2: Run focused inventory/selection tests and confirm the intended RED failures.**

Run: `node --test tests/guitarTabScoreInventory.test.js tests/gtab10bMultipartSelection.test.js tests/guitarTabTeacherAuthoring.test.js`

- [ ] **Step 3: Replace local identity reconstruction** in `guitarTabScoreInventory.js` with Task 1 analyzer output. Keep security parsing behavior and the existing public inventory contract.
- [ ] **Step 4: Run the focused tests and confirm GREEN.**
- [ ] **Step 5: Commit the slice.**

Commit message: `refactor(GTAB): unify score inventory identity policy`

### Task 3: Extract one synchronous export validator

**Files:**
- Create: `src/services/guitarTabExportValidator.js`
- Create: `tests/guitarTabExportValidator.test.js`
- Modify later in Task 4: `src/services/editorGuitarTabHandoff.js`

**Interfaces:**
- Consumes: Task 1 canonical identity analyzer.
- Produces: `validateGuitarTabExport({ scoreMusicXml, guitarTabMusicXml, targetSelection = null, DOMParserCtor = globalThis.DOMParser })`.
- Success result: `{ ok: true, category: null, code: null, facts }`.
- Failure result: `{ ok: false, category, code }`; no raw source XML or sensitive payload is returned.
- Validation categories: `SECURITY`, `IDENTITY`, `TAB_SHAPE`, `SEMANTIC`, `PHYSICAL`, `RUNTIME`.
- `facts` must be sufficient for handoff verification but must not grant mutation, publication, or fingering authority.

- [ ] **Step 1: Write failing validator tests** for valid single-part and exact multipart target exports; written-pitch parity; sounding-pitch string/fret match; wrong-octave physical mismatch; standard six-string tuning; chord distinct-string requirement; source/derived duration-onset-tie parity; target mismatch; and safe code/category output.
- [ ] **Step 2: Add RED ambiguity tests** for multiple `<technical>` blocks, duplicate `<string>`, duplicate `<fret>`, conflicting string/fret values, malformed transpose, and selected-staff transpose ambiguity. The validator must never accept the first matching technical node by accident.
- [ ] **Step 3: Run validator tests and confirm RED.**

Run: `node --test tests/guitarTabExportValidator.test.js`

- [ ] **Step 4: Implement the validator** by moving the reusable parse/timeline/TAB-shape/semantic/physical logic out of the handoff service. Written pitch stays in semantic parity keys; physical position checks use sounding MIDI after the applicable transpose is resolved exactly once.
- [ ] **Step 5: Run validator tests and confirm GREEN.**
- [ ] **Step 6: Commit the slice.**

Commit message: `feat(GTAB): add unified TAB export validator`

### Task 4: Delegate handoff validation to the unified validator

**Files:**
- Modify: `src/services/editorGuitarTabHandoff.js`
- Modify: `tests/editorGuitarTabHandoff.test.js`
- Modify: `tests/gtabOctaveHandoffValidation.test.js`

**Interfaces:**
- Consumes: `validateGuitarTabExport(...)` from Task 3.
- Preserves: `prepareEditorGuitarTabHandoff(...)` return envelope, SHA-256 fingerprints, target-selection fingerprint semantics, and immutable score source.
- Compatibility: existing handoff callers continue receiving a thrown handoff error on invalid export, while the underlying stable validator `category` and `code` remain recoverable for trusted UI mapping.

- [ ] **Step 1: Add RED delegation tests** proving handoff and direct validator agree on valid/invalid identity, physical pitch, transpose, duplicate technical evidence, and stale target cases.
- [ ] **Step 2: Run focused handoff tests and confirm RED where duplicate/local validation diverges.**

Run: `node --test tests/editorGuitarTabHandoff.test.js tests/gtabOctaveHandoffValidation.test.js tests/guitarTabExportValidator.test.js`

- [ ] **Step 3: Remove duplicate validation authority** from `editorGuitarTabHandoff.js`; keep only input envelope checks, validator delegation, fingerprint creation, and immutable handoff result creation.
- [ ] **Step 4: Run focused handoff tests and confirm GREEN.**
- [ ] **Step 5: Commit the slice.**

Commit message: `refactor(GTAB): delegate handoff to export validator`

### Task 5: Make teacher-workspace `canExport` and final export use the same validator

**Files:**
- Modify: `src/guitarTabTeacherWorkspaceUi.js`
- Modify: `tests/guitarTabTeacherWorkspaceUi.test.js`
- Modify: `tests/guitarTabTeacherAuthoring.test.js`

**Interfaces:**
- Consumes: Task 3 validator.
- `canExportState(state)` remains synchronous and first requires `tabDocument.canExport() === true`; only then serialize the current derived TAB and run the unified validator against immutable `state.sourceXml` + exact `state.selectedRegion`.
- `getGuitarTabTeacherWorkspaceState(root)` adds safe export validation evidence: `exportValidationCategory` and `exportValidationCode` (nullable).
- `exportGuitarTabTeacherWorkspaceMusicXml(...)` returns safe validator `category` / `code` on validation failure while preserving existing top-level failure reason `EXPORT_VALIDATION_FAILED` for compatibility.
- UI status text maps only stable category/code to bounded Turkish messages; it never exposes stack traces or source XML.

- [ ] **Step 1: Add RED UI tests** proving complete assignments are not enough when serialized XML fails identity/semantic/physical validation, export button stays disabled, validation code/category are observable, and a valid export enables the button.
- [ ] **Step 2: Add RED compatibility tests** for stale source/target and generic handoff failure; existing `NO_SOURCE`, `INCOMPLETE_ASSIGNMENTS`, `STALE_TARGET`, and `DOWNLOAD_FAILED` behavior stays intact.
- [ ] **Step 3: Run focused workspace tests and confirm RED.**

Run: `node --test tests/guitarTabTeacherWorkspaceUi.test.js tests/guitarTabTeacherAuthoring.test.js`

- [ ] **Step 4: Implement validator-backed preflight and safe status mapping.** Do not add network calls, background validation, or a new browser dependency.
- [ ] **Step 5: Run focused workspace tests and confirm GREEN.**
- [ ] **Step 6: Commit the slice.**

Commit message: `feat(GTAB): gate teacher export on unified validation`

### Task 6: Qualification fixtures, browser proof, and semantic oracle coverage

**Files:**
- Create: `tests/gtabValidator01Regression.test.js`
- Create: `tests/fixtures/gtab-validator-01-browser-proof.html`
- Create: `scripts/verifyGtabValidator01Browser.js`
- Modify: `package.json`
- Modify: `src/qualification/gtab10cSemanticParity.js` only if a validator fixture needs existing pinned-oracle metadata exposure; do not change oracle authority.
- Modify/Create: `tests/python/test_gtab10c_oracle.py` or a narrowly scoped `tests/python/test_gtab_validator_01_oracle.py` depending on which keeps existing oracle boundaries intact.

**Interfaces:**
- Reuses pinned Editor exact SHA `b7f4008ecdb0b74eead5869015099f4d734e234e`.
- Reuses pinned Semantic Engine / Partitura 1.9.0 as read-only oracle.
- Produces npm script: `test:gtab-validator-browser` -> `node scripts/verifyGtabValidator01Browser.js`.

- [ ] **Step 1: Add regression matrix tests** for single-part, multipart exact target, multi-staff, multi-voice, simultaneous chord, guitar octave transpose, selected-staff transpose where supported, source immutability, and all ambiguity fail-closed cases from Review Focus.
- [ ] **Step 2: Add browser proof** that a valid completed assignment becomes export-ready and an injected invalid/ambiguous export remains disabled with a safe code/category.
- [ ] **Step 3: Add/extend oracle coverage** so source written semantics and derived notation/TAB written semantics agree independently in Partitura 1.9.0; sounding string/fret remains validator-owned physical evidence, not inferred by Partitura.
- [ ] **Step 4: Run qualification checks.**

Run:
- `node --test tests/gtabValidator01Regression.test.js`
- `npm run test:gtab-validator-browser`
- existing GTAB-10C semantic parity/oracle command(s) from CI

Expected: all GREEN with source immutability explicitly asserted.

- [ ] **Step 5: Commit the slice.**

Commit message: `test(GTAB): qualify unified export validator`

### Task 7: Exact-head broad verification and handoff report

**Files:**
- Modify only if needed to wire the new focused gate into an existing appropriate CI workflow; do not weaken or remove any gate.
- Create: `docs/verification/2026-10-09-gtab-validator-01.md`

**Interfaces:**
- Consumes the integrated branch from Tasks 1-6.
- Produces a verification report mapping every acceptance criterion to fresh evidence and exact final head SHA.

- [ ] **Step 1: Run all focused GTAB validator/identity/workspace/handoff tests again on the integrated head.**
- [ ] **Step 2: Run the full Node suite.**

Run: `npm test`

- [ ] **Step 3: Run affected browser gates**, including `npm run test:gtab10b-browser` and `npm run test:gtab-validator-browser`.
- [ ] **Step 4: Run `npm run build`** and verify exact Editor runtime provenance remains pinned and reproducible.
- [ ] **Step 5: Run existing GTAB-10C semantic parity/oracle and regression-quality gates** using the repository CI commands.
- [ ] **Step 6: Run dependency-security and Sonar/quality-gate checks** through the repository's existing workflows/configuration; do not substitute local reasoning for unavailable server evidence.
- [ ] **Step 7: Inspect the final diff** for unrelated changes, source mutation, hidden dependency additions, authority expansion, or accidental runtime/parser additions.
- [ ] **Step 8: Write the verification report** with statuses `Confirmed`, `Partial`, `Unverified`, or `Failed` for each acceptance criterion and include the exact final head SHA plus commands/results.
- [ ] **Step 9: Stop before merge/deploy.** Present the exact-head PR/readiness result for separate user approval.

## Completion Definition

GTAB-VALIDATOR-01 is complete only when fresh exact-head evidence demonstrates all of the following:

- one canonical Part / Staff / Voice policy is reused by inventory/editor preparation and export validation;
- implicit Staff 1 / Voice 1 occurs only when unambiguous;
- teacher export readiness and handoff share the same unified validator;
- duplicate/conflicting technical string/fret evidence fails closed;
- written pitch semantic parity is preserved independently from sounding-pitch physical validation;
- source MusicXML bytes remain immutable;
- focused tests, `npm test`, affected browser proof, build/provenance, semantic oracle, regression quality, dependency security, and Sonar quality gate are GREEN on the exact final head;
- no merge or deploy occurred without separate approval.
