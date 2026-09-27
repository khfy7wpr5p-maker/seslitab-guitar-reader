# S16 Production Composition Stabilization Runbook

## Purpose

This runbook promotes one reviewed SesliTab teacher composition to the existing production frontend and proves what revision is actually served. It does not create infrastructure, change OMR, broaden Smoosic write-back, or declare physical-device acceptance from desktop evidence.

## Fixed Production Authority

- Source repository: `khfy7wpr5p-maker/seslitab-guitar-reader`
- Source branch: protected `main`
- Required GitHub check: `test-and-build`
- Existing frontend service: Render static service `srv-da9gqapf2nfc73fh6o1g` (`seslitab-app`)
- Frontend URL: `https://seslitab-app.onrender.com/`
- Existing OMR service: Render web service `srv-d9jmd26gekts7381pk1g` (`seslitab-omr`)
- OMR health URL: `https://seslitab-omr.onrender.com/health`

`https://seslitab-guitar-tab-bg2n.bolt.host/` is a historical disposable prototype/reference. It is not the production target, source authority, fallback deployment, or acceptance URL.

## Non-negotiable Boundaries

- Never create a Render service, domain, deployment target, or parallel application shell for S16.
- Do not modify `Dockerfile`, `render.yaml`, Audiveris, OMR provider selection, OMR workers, OMR storage, or OMR API behavior.
- Do not place Render credentials, API tokens, deploy hooks, or secrets in this repository or evidence.
- Do not add automatic deployment to GitHub Actions.
- Do not merge, deploy the frontend, or resume/change OMR under one combined approval. Each is a separate human gate.
- Do not hide/delete violin, rhythmic HTML/text, raw XML, note-card, or technical surfaces in S16.
- Do not mount Chord Board assignment or authenticated student delivery in S16.
- Supported Smoosic pitch write-back and unsupported structural edits must remain distinguishable.

## Promotion Sequence

Perform these steps in order. A failed or missing gate stops the sequence.

### 1. Fresh-read candidate identity

```bash
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
git diff --stat origin/main...HEAD
```

Record the full 40-character candidate revision. The worktree must contain only reviewed branch changes and generated ignored output. If `origin/main` moved, update through the approved non-destructive branch workflow and restart verification.

### 2. Focused contract and write-back tests

```bash
node --test \
  tests/s16BuildCompositionManifest.test.js \
  tests/s16DeployedCompositionContract.test.js \
  tests/smoosicProductWriteback.test.js \
  tests/stageS15SmoosicWriteback.test.js
```

Expected: all tests pass. Any failure stops promotion.

### 3. Full regression

```bash
npm test
```

Expected: zero failures. Skips must be listed and understood; they are not implicit evidence for the skipped environment.

### 4. Production build and exact manifest

```bash
npm run build
node scripts/verifyS16BuildCompositionManifest.js
```

Expected:

- build succeeds;
- `dist/seslitab-build.json` exists;
- repository is `khfy7wpr5p-maker/seslitab-guitar-reader`;
- revision equals `git rev-parse HEAD` exactly;
- composition is `teacher-smoosic-v1`;
- every required surface is present in the manifest contract.

### 5. Local real-browser proofs

```bash
node scripts/verifyS14SmoosicProductionCdpBrowser.js
node scripts/verifyS14SourceLifecycleAcceptanceBrowser.js
node scripts/verifyS15SmoosicWritebackBrowser.js
```

Expected: PASS for production composition, source lifecycle, supported pitch write-back, refreshed consumers, stale/invalid/unsupported edit rejection, and publication retry behavior. Missing Chrome/Chromium is `ENVIRONMENT_LIMITATION`, not PASS; the exact-head CI browser proof remains mandatory.

### 6. Pull request and exact-head CI

Open a pull request with:

- exact candidate revision;
- requirement-to-evidence matrix;
- focused/full/build/browser results;
- explicit `Dockerfile UNCHANGED`, `render.yaml UNCHANGED`, `OMR UNCHANGED`, `NEW RENDER SERVICE: NO`, `DEPLOYMENT: NOT PERFORMED` statements.

The required `test-and-build` check must pass at the exact PR head. A green run for another revision does not satisfy this gate.

### 7. STOP — merge approval

Request explicit approval naming the pull request and exact revision. Do not merge before that approval. After an approved merge, record the resulting exact `main` revision and verify required CI again if the merge created a new commit.

### 8. STOP — existing frontend deployment approval

Request a separate approval naming:

- Render service `srv-da9gqapf2nfc73fh6o1g`;
- exact `main` revision;
- existing build command `npm run build`;
- existing publish directory `dist`;
- no domain/service/config creation.

Only after approval, deploy or resume the existing `seslitab-app` service. Do not deploy to Bolt and do not touch `seslitab-omr` in this step.

### 9. Exact-revision deployed probe

```bash
SESLITAB_PRODUCTION_URL=https://seslitab-app.onrender.com \
SESLITAB_EXPECTED_REVISION=<approved-40-character-main-sha> \
npm run verify:production-composition
```

The command is read-only against production. It performs only GET traffic, requires the exact manifest and final URL, loads one in-memory MusicXML fixture, and checks the actually mounted Nota Ara, Smoosic, Apply, Guitar TAB and tuner surfaces. It writes `artifacts/s16-deployed-composition.json` only after PASS.

Any 4xx/5xx response, redirect, revision/composition mismatch, missing surface, browser runtime error, or non-GET browser request is FAIL/blocked evidence, never a warning-only PASS.

### 10. Separate OMR decision

If PDF/OMR acceptance is required and `seslitab-omr` is suspended or unhealthy, record `ENVIRONMENT_LIMITATION` and request a separate approval naming service `srv-d9jmd26gekts7381pk1g`. Do not edit `render.yaml`, create a replacement, or infer OMR health from MusicXML success.

### 11. Physical iPhone Safari acceptance

Use the exact Render URL verified in Step 9 on the user's iPhone 15.

1. Record device model, iOS version and Safari version.
2. Open `https://seslitab-app.onrender.com/` after clearing/revalidating the page cache.
3. Load the approved small MusicXML fixture and record its filename/hash.
4. Confirm Nota Ara, tuner and Guitar TAB remain available.
5. Open `Nota Düzenle` and wait for the fixture to load in Smoosic.
6. Change exactly one pitch; do not insert, delete, or relocate a note.
7. Choose `Düzenlemeyi SesliTab'a Uygula`.
8. Confirm the success status says the new revision was verified and outputs were refreshed.
9. Confirm notation, Guitar TAB and playback-facing output reflect the supported pitch change.
10. Apply again without a musical change and record the truthful no-change status.
11. Perform one clearly identified unsupported structural edit; confirm the structural rejection, unchanged last accepted revision, and MusicXML export availability.

Desktop Chromium PASS plus missing physical Safari evidence is `PARTIAL`, never PASS.

## Evidence Record

Create one record with no credentials or private student data:

```json
{
  "schemaVersion": 1,
  "repository": "khfy7wpr5p-maker/seslitab-guitar-reader",
  "candidateRevision": "<40-character-sha>",
  "ci": {
    "runUrl": "<github-actions-run-url>",
    "headRevision": "<40-character-sha>",
    "requiredCheck": "test-and-build",
    "result": "PASS|FAIL"
  },
  "render": {
    "frontendServiceId": "srv-da9gqapf2nfc73fh6o1g",
    "deploymentId": "<existing-service-deployment-id>",
    "testedUrl": "https://seslitab-app.onrender.com/",
    "finalUrl": "https://seslitab-app.onrender.com/",
    "deployedManifest": {},
    "probeTimestamp": "<UTC-ISO-8601>"
  },
  "device": {
    "model": "iPhone 15",
    "iosVersion": "<version>",
    "browser": "Safari",
    "browserVersion": "<version>"
  },
  "fixture": {
    "fileName": "<fixture.musicxml>",
    "sha256": "<64-character-sha256>"
  },
  "acceptance": {
    "editClass": "SUPPORTED_PITCH_EDIT",
    "terminalStatusText": "<exact observed status>",
    "outputRefreshObservation": "<notation/TAB/playback observation>",
    "noChangeStatusText": "<exact observed status>",
    "unsupportedEditClass": "<identified structural edit>",
    "unsupportedStatusText": "<exact observed status>",
    "screenshotsOrRecording": [],
    "result": "PASS|PARTIAL|FAIL|INCONCLUSIVE",
    "blockerClassification": "NONE|IMPLEMENTATION_DEFECT|ENVIRONMENT_LIMITATION|PLATFORM_SPECIFIC|UNRESOLVED"
  }
}
```

## Stop and Rollback Rules

- Wrong or missing manifest: stop. Diagnose the existing build/service linkage; do not open another service.
- Failed required CI: stop. Do not merge or deploy.
- Failed deployed probe: stop promotion. Preserve evidence and diagnose. Redeploy the last known-good exact revision only after explicit approval.
- Suspended/unhealthy OMR: record `ENVIRONMENT_LIMITATION`; request a separate OMR approval.
- Desktop PASS and iPhone FAIL: keep the desktop-proven revision available for bounded Safari diagnosis, classify `PLATFORM_SPECIFIC` when evidence supports it, and do not declare S16 accepted.
- Unsupported structural edit rejected: this is expected only when the edit is correctly identified and the accepted revision remains unchanged. Do not reclassify it as supported pitch-edit success.
- Never roll forward by creating a new Render service, switching to Bolt, or weakening revision/surface checks.

## Completion

S16 is complete only when exact-head CI, exact-revision deployed probe and physical iPhone Safari evidence all pass. Then update the existing Notion stabilization record and Linear SES-43; do not create duplicate work items. The later UI-only hide package requires a new design approval.
