# SES-43 SesliTab Teacher Production Composition Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing `seslitab-app` deployment provably serve the reviewed GitHub teacher composition and close its desktop plus physical-iPhone Smoosic Apply acceptance gap without changing OMR or creating infrastructure.

**Architecture:** Emit exact source/composition provenance into the completed Vite bundle, retain the existing S14/S15 local browser proofs, and add a fail-closed read-only probe for the already-approved Render URL. Promotion remains sequential: exact-head CI, separate existing-service deployment approval, deployed probe, then physical iPhone Safari evidence.

**Tech Stack:** Node.js ESM >=24.0.0 <25, built-in `node:test` and `node:assert/strict`, Vite 8.2.0, existing Chrome DevTools Protocol browser-proof pattern, GitHub Actions, existing Render static service.

**Spec:** `docs/superpowers/specs/2026-09-27-seslitab-teacher-production-composition-stabilization-design.md`

## Global Constraints

- Reference repository: `khfy7wpr5p-maker/seslitab-guitar-reader`.
- Planning baseline: `c38fe59b78c93b3ddf982265119c6a06328fe344`; execution must fresh-read `origin/main` and record the actual candidate head.
- Use only existing Render static service `srv-da9gqapf2nfc73fh6o1g` (`seslitab-app`).
- Preserve existing Render OMR service `srv-d9jmd26gekts7381pk1g` (`seslitab-omr`).
- Do not create a Render service, domain, deployment target, or alternate shell.
- Do not modify `Dockerfile`, `render.yaml`, Audiveris, OMR provider/worker/API/storage, or current OMR service configuration.
- Do not deploy automatically from CI.
- Do not treat the Bolt URL as production authority or deploy to it.
- Preserve PDF/OMR, MusicXML, Nota Ara, Smoosic, Apply, playback, Guitar TAB, tuner and MIDI behavior.
- Do not mount Chord Board assignment or authenticated student delivery.
- Do not delete or hide violin, rhythmic HTML/text, raw XML, note-card, or technical surfaces in this package.
- Preserve S15 fail-closed structural-edit boundaries and immutable revision/revalidation behavior.
- Use TDD for new executable behavior.
- Stop after exact-head PR/CI evidence; merge and existing-service deployment each require separate human approval.
- Resuming or changing `seslitab-omr` requires approval separate from frontend deployment approval.

## File Structure

**Create**

- `scripts/s16BuildCompositionManifest.js` — pure revision resolution, manifest creation, validation and `dist` writer.
- `scripts/writeS16BuildCompositionManifest.js` — small CLI invoked only after a successful Vite build.
- `scripts/verifyS16BuildCompositionManifest.js` — read-only CLI that checks the completed artifact against the checked-out revision.
- `scripts/s16DeployedCompositionContract.js` — pure deployed-manifest and required-surface result validation.
- `scripts/verifyS16DeployedCompositionBrowser.js` — fail-closed remote URL/CDP probe and JSON evidence writer.
- `tests/s16BuildCompositionManifest.test.js` — revision precedence, schema, deterministic content and failure tests.
- `tests/s16DeployedCompositionContract.test.js` — exact URL/revision/composition/surface and failure classification tests.
- `docs/s16-production-composition-stabilization.md` — operator runbook, approval gates and evidence template.

**Modify**

- `package.json` — append manifest generation to `build`; add an explicit read-only deployed-probe command.
- `.github/workflows/ci.yml` — verify and upload build-composition evidence after `npm run build`; do not add deployment.
- `README.md` — point operators to the production authority/runbook and repeat the no-new-service boundary.

**Reuse without changing unless a failing regression proves otherwise**

- `main.js`
- `src/smoosicEditorTabUi.js`
- `src/services/smoosicProductWriteback.js`
- `scripts/verifyS14SmoosicProductionCdpBrowser.js`
- `scripts/verifyS15SmoosicWritebackBrowser.js`
- `tests/stageS15SmoosicWriteback.test.js`
- `tests/smoosicProductWriteback.test.js`

**Explicitly do not modify**

- `Dockerfile`
- `render.yaml`
- `backend/providers/**`
- `backend/workers/**`
- `backend/storage/**`
- `src/stageS13SmoosicTransitionCleanup.css`
- `src/package5Ui.js`
- student-delivery and Chord Board production/domain files.

## Review Focus

1. **The build records a convenient branch SHA rather than the bytes actually checked out** — the manifest must require `git rev-parse HEAD` to agree with any CI/Render revision environment value. Covered in Task 1.
2. **A stale deployment serves a new-looking page from cache** — the probe must fetch the manifest and page with cache bypass, require exact revision equality, and record the final URL. Covered in Task 3.
3. **A manifest claims the right composition while JavaScript failed to mount it** — the remote browser must inspect actual DOM controls after load and fail on runtime errors. Covered in Task 3.
4. **Desktop Chromium passes but iPhone Safari Apply fails** — physical-device proof is a mandatory independent gate, not an inference from CDP. Covered in Task 6.
5. **A structural edit is mistaken for a broken supported pitch write-back** — acceptance evidence must identify the edit class and separately verify the fail-closed structural outcome. Covered in Task 6.

---

### Task 1: Exact Build Revision and Composition Manifest

**Files:**

- Create: `scripts/s16BuildCompositionManifest.js`
- Create: `scripts/writeS16BuildCompositionManifest.js`
- Create: `scripts/verifyS16BuildCompositionManifest.js`
- Test: `tests/s16BuildCompositionManifest.test.js`

**Interfaces:**

- Produces `S16_COMPOSITION_SCHEMA_VERSION = 1`.
- Produces `S16_COMPOSITION_ID = 'teacher-smoosic-v1'`.
- Produces `S16_SOURCE_REPOSITORY = 'khfy7wpr5p-maker/seslitab-guitar-reader'`.
- Produces `resolveS16BuildRevision({ env, cwd, execFileSyncImpl }) -> string`.
- Produces `createS16BuildCompositionManifest({ revision, builtAt }) -> Readonly<object>`.
- Produces `validateS16BuildCompositionManifest(value, { expectedRevision? }) -> Readonly<object>`.
- Produces `writeS16BuildCompositionManifest({ distRoot, manifest }) -> Promise<string>`.

- [ ] **Step 1: Write failing manifest tests**

Test that a 40-character lowercase Git head creates schema `1`, repository `khfy7wpr5p-maker/seslitab-guitar-reader`, composition `teacher-smoosic-v1`, and the exact ordered surface list `['pdf-omr','musicxml','discovery','smoosic','smoosic-writeback','playback','guitar-tab','tuner','midi']`. Test fixed `builtAt`, deep immutability, JSON round-trip, uppercase normalization, invalid/missing SHA rejection, environment/Git mismatch rejection, and a successful write to `<temp>/dist/seslitab-build.json`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/s16BuildCompositionManifest.test.js`

Expected: FAIL because `scripts/s16BuildCompositionManifest.js` does not exist.

- [ ] **Step 3: Implement exact revision resolution and manifest validation**

`resolveS16BuildRevision` must read the checked-out revision with `git rev-parse HEAD`. If `RENDER_GIT_COMMIT` or `GITHUB_SHA` is present, it must be a 40-character hexadecimal SHA and equal the checked-out revision; disagreement throws. Never fall back to a branch name, short SHA, package version, or current time.

- [ ] **Step 4: Implement the post-build writer CLI**

The CLI resolves the exact revision, creates the manifest with an ISO-8601 UTC time, verifies `dist/index.html` exists, writes only `dist/seslitab-build.json`, rereads it, validates it, and exits non-zero on any mismatch.

- [ ] **Step 5: Implement the read-only artifact verifier CLI**

The verifier resolves the exact checked-out revision, reads `dist/seslitab-build.json`, calls `validateS16BuildCompositionManifest(value, { expectedRevision })`, confirms `dist/index.html` exists, prints the verified revision/composition, and never writes a file.

- [ ] **Step 6: Run the focused test and verify GREEN**

Run: `node --test tests/s16BuildCompositionManifest.test.js`

Expected: PASS with no repository files written outside the test temporary directory.

- [ ] **Step 7: Commit the manifest slice**

```bash
git add scripts/s16BuildCompositionManifest.js scripts/writeS16BuildCompositionManifest.js scripts/verifyS16BuildCompositionManifest.js tests/s16BuildCompositionManifest.test.js
git commit -m "build: add exact SesliTab composition provenance"
```

### Task 2: Build and CI Provenance Gate

**Files:**

- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Test: `tests/s16BuildCompositionManifest.test.js`

**Interfaces:**

- Consumes Task 1 `writeS16BuildCompositionManifest` CLI.
- Produces `dist/seslitab-build.json` after every successful `npm run build`.
- Keeps required CI check name `test-and-build` unchanged.

- [ ] **Step 1: Add a failing package/CI contract assertion**

Extend the Task 1 test to assert that `package.json` ends the existing build chain with `node scripts/writeS16BuildCompositionManifest.js`, and `.github/workflows/ci.yml` validates `dist/seslitab-build.json` after the build without any deploy action or Render credential.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/s16BuildCompositionManifest.test.js`

Expected: FAIL because build and CI do not yet call the manifest gate.

- [ ] **Step 3: Append manifest generation to the existing build chain**

Keep runtime preparation, Smoosic preparation and `vite build` ordering unchanged. Add the writer only after `vite build` succeeds.

- [ ] **Step 4: Add CI validation and artifact upload**

After `npm run build`, run `node scripts/verifyS16BuildCompositionManifest.js`, then upload only `dist/seslitab-build.json` as `seslitab-build-composition`. Do not add a deployment job, webhook, Render API call, secret, or environment mutation.

- [ ] **Step 5: Run focused and production-build checks**

Run: `node --test tests/s16BuildCompositionManifest.test.js`

Expected: PASS.

Run: `npm run build`

Expected: PASS and `dist/seslitab-build.json` validates against the checked-out 40-character revision.

- [ ] **Step 6: Re-run existing local composition proofs**

Run: `node scripts/verifyS14SmoosicProductionCdpBrowser.js`

Expected: PASS with the Smoosic teacher composition mounted from `dist`.

Run: `node scripts/verifyS15SmoosicWritebackBrowser.js`

Expected: PASS for supported write-back, refreshed consumers, stale/invalid/structural rejection and retry behavior.

- [ ] **Step 7: Commit the CI gate**

```bash
git add package.json .github/workflows/ci.yml tests/s16BuildCompositionManifest.test.js
git commit -m "ci: verify SesliTab production composition identity"
```

### Task 3: Read-only Deployed Composition Probe

**Files:**

- Create: `scripts/s16DeployedCompositionContract.js`
- Create: `scripts/verifyS16DeployedCompositionBrowser.js`
- Test: `tests/s16DeployedCompositionContract.test.js`
- Modify: `package.json`

**Interfaces:**

- Produces `normalizeS16ProductionTarget(value) -> URL`; accepts HTTPS `seslitab-app.onrender.com` only.
- Produces `verifyS16DeployedManifest(value, { expectedRevision }) -> Readonly<object>`.
- Produces `verifyS16MountedSurfaceSnapshot(value) -> Readonly<object>`.
- CLI requires `SESLITAB_PRODUCTION_URL=https://seslitab-app.onrender.com` and `SESLITAB_EXPECTED_REVISION=<40-char-sha>`.
- CLI writes `artifacts/s16-deployed-composition.json` and never performs a non-GET network request.

- [ ] **Step 1: Write failing deployed-contract tests**

Cover exact Render host acceptance; rejection of HTTP, credentials, fragments, alternate hosts, Bolt and redirect-final URLs; manifest 404/malformed/schema/repository/revision/composition mismatch; missing required surface; browser console/page error; and a full passing snapshot containing search, Smoosic tab, Apply button, tuner and Guitar TAB after MusicXML intake.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/s16DeployedCompositionContract.test.js`

Expected: FAIL because the contract module does not exist.

- [ ] **Step 3: Implement pure fail-closed validation**

Keep target, manifest and DOM snapshot checks independent. Return no partial PASS: every required field and mounted surface must be present and exact.

- [ ] **Step 4: Implement the read-only remote browser CLI**

Use the existing Chrome/Chromium CDP discovery pattern. Fetch `/seslitab-build.json` and the page with cache bypass, require final URL to remain on the configured Render origin, capture page/console errors, upload an in-memory minimal MusicXML fixture through the public input, then observe the mounted search, Smoosic, Apply, Guitar TAB and tuner surfaces. Do not call Render APIs and do not submit PDF/OMR jobs.

- [ ] **Step 5: Add an explicit npm command**

Add `verify:production-composition` that runs only `node scripts/verifyS16DeployedCompositionBrowser.js`. Do not include it in normal `npm test` or automatic CI because it targets live state.

- [ ] **Step 6: Run focused tests and a controlled local-server probe**

Run: `node --test tests/s16DeployedCompositionContract.test.js`

Expected: PASS.

Serve the completed `dist` from a temporary localhost origin only for harness debugging; call the exported validators directly because the CLI must reject non-production hosts. Expected: the same DOM snapshot passes and a deliberately wrong expected revision fails.

- [ ] **Step 7: Commit the read-only probe**

```bash
git add scripts/s16DeployedCompositionContract.js scripts/verifyS16DeployedCompositionBrowser.js tests/s16DeployedCompositionContract.test.js package.json
git commit -m "test: add deployed SesliTab composition probe"
```

### Task 4: Operator Runbook and Guardrails Review

**Files:**

- Create: `docs/s16-production-composition-stabilization.md`
- Modify: `README.md`

**Interfaces:**

- Produces one runbook that names the existing service IDs, required approvals, commands, evidence schema, stop conditions and rollback direction.
- Does not contain credentials, tokens or a new service definition.

- [ ] **Step 1: Write the runbook**

Document the exact order: fresh-read candidate head; focused tests; full `npm test`; `npm run build`; S14/S15 browser proofs; required `test-and-build`; human merge approval; human approval for existing `seslitab-app` deployment; exact-revision deployed probe; physical iPhone Safari acceptance. State that OMR resume/change is a separate approval and that Bolt is not the production target.

- [ ] **Step 2: Add the evidence template**

Require: repository, candidate revision, CI run URL/result, Render service ID, tested production URL/final URL, deployed manifest, probe timestamp, device/model, iOS/Safari version, fixture hash/name, edit class, terminal status text, output refresh observation, screenshots/recording references, result and blocker classification.

- [ ] **Step 3: Add the rollback/stop direction**

On a failed probe, stop promotion and redeploy the last known-good exact revision only after approval; never create another service. On OMR suspension, record environment limitation and request separate approval. On iPhone-only failure, keep the desktop-proven revision available for diagnosis but do not declare acceptance complete.

- [ ] **Step 4: Link the runbook from README**

Add a short production-authority link near the existing Bolt and protected deployment boundaries. Do not rewrite historical package status.

- [ ] **Step 5: Review the diff for forbidden surfaces**

Run: `git diff --name-only origin/main...HEAD`

Expected: only Task 1–4 files; no `Dockerfile`, `render.yaml`, backend OMR/provider/worker/storage, UI cleanup, Chord Board, student-delivery or deployment secret files.

- [ ] **Step 6: Commit documentation**

```bash
git add docs/s16-production-composition-stabilization.md README.md
git commit -m "docs: add SesliTab composition promotion runbook"
```

### Task 5: Exact-head Verification and Pull Request Gate

**Files:**

- Verify only; no production or infrastructure edits.

**Interfaces:**

- Consumes Tasks 1–4.
- Produces an exact candidate-head evidence matrix and reviewable PR.
- Stops before merge.

- [ ] **Step 1: Fresh-read and reconcile the candidate branch**

Run: `git fetch origin main`

Record `git rev-parse HEAD`, `git rev-parse origin/main`, and `git diff --stat origin/main...HEAD`. Rebase/update only through the repository's approved non-destructive workflow if `main` moved; rerun all evidence afterward.

- [ ] **Step 2: Run focused verification**

Run: `node --test tests/s16BuildCompositionManifest.test.js tests/s16DeployedCompositionContract.test.js tests/smoosicProductWriteback.test.js tests/stageS15SmoosicWriteback.test.js`

Expected: PASS.

- [ ] **Step 3: Run full regression and build**

Run: `npm test`

Expected: PASS.

Run: `npm run build`

Expected: PASS with exact-head `dist/seslitab-build.json`.

- [ ] **Step 4: Run real-browser local acceptance**

Run the existing S14 production integration, S14 source lifecycle and S15 write-back scripts named in `.github/workflows/ci.yml`.

Expected: PASS with no stale/invalid/unsupported edit changing the accepted revision.

- [ ] **Step 5: Open the PR and require exact-head CI**

The PR description must include the requirement-to-evidence matrix, explicit no-OMR/no-Render-config/no-new-service statements, and the candidate revision. Required `test-and-build` must pass at the same head.

- [ ] **Step 6: STOP for merge approval**

Do not merge. Present the exact-head evidence and request explicit human merge approval.

### Task 6: Existing-service Deployment and Physical iPhone Acceptance

**Files:**

- Evidence only: `artifacts/s16-deployed-composition.json` plus the runbook evidence record.
- No source, OMR or Render configuration changes.

**Interfaces:**

- Consumes an explicitly approved merged revision from Task 5.
- Produces deployed exact-revision evidence and a physical iPhone Safari verdict.
- Stops before any UI cleanup package.

- [ ] **Step 1: STOP for existing frontend service deployment approval**

Request approval naming service `srv-da9gqapf2nfc73fh6o1g`, target revision and build/publish settings. Do not resume, deploy or change the service until that exact approval is received.

- [ ] **Step 2: Deploy only the approved revision to the existing frontend service**

Use the existing `seslitab-app` service. Do not create a service, change domain, modify OMR, or deploy to Bolt. Record the Render deployment identifier and exact revision.

- [ ] **Step 3: Run the deployed composition probe**

Run:

```bash
SESLITAB_PRODUCTION_URL=https://seslitab-app.onrender.com \
SESLITAB_EXPECTED_REVISION=<approved-40-character-sha> \
npm run verify:production-composition
```

Expected: PASS; manifest and final URL match, no browser runtime error, and all required teacher surfaces are mounted.

- [ ] **Step 4: Decide the separate OMR gate**

If PDF/OMR acceptance is required and `seslitab-omr` remains suspended, stop and request explicit OMR resume approval. Do not infer OMR health from MusicXML success and do not alter `render.yaml`.

- [ ] **Step 5: Perform physical iPhone Safari supported-edit proof**

On the user's iPhone 15 and reported iOS/Safari version, open the exact verified Render URL with a cache-busting query, load the approved small MusicXML fixture, open Smoosic, change one pitch without inserting/deleting/moving a note, choose `Düzenlemeyi SesliTab'a Uygula`, and verify the success message plus refreshed notation/Guitar TAB/playback-facing output.

- [ ] **Step 6: Perform bounded negative checks**

Apply with no musical change and verify the truthful no-change message. Then perform one clearly identified unsupported structural edit and verify it is rejected with the structural message while the last accepted SesliTab revision remains unchanged and MusicXML export remains available.

- [ ] **Step 7: Record and classify evidence**

Record exact revision, URL/final URL, device/browser, fixture, edit, terminal messages and output observations. Verdict must be `PASS`, `PARTIAL`, `FAIL`, or `INCONCLUSIVE` using the Guardrails evidence rules. A desktop PASS plus missing physical-device evidence is `PARTIAL`, never PASS.

- [ ] **Step 8: Update the existing SES-43 records and STOP**

Attach the final evidence to the existing Notion stabilization page and Linear SES-43 without creating duplicate tasks. Stop for a new human design approval before preparing the separate UI-only hide package.

## Self-review Result

- Spec coverage: every approved composition-first requirement maps to Tasks 1–6.
- Scope separation: UI hiding, Chord Board mounting, student delivery and OMR changes remain outside this plan.
- Type/interface consistency: build and deployed validators use the same schema/repository/composition/revision values.
- Review-focus coverage: revision drift, cache/final URL, DOM mount, iPhone Safari and structural-edit classification each have an owning task.
- Proportion: the plan specifies decisions, interfaces, checks and gates; it does not duplicate the existing Smoosic write-back implementation.
