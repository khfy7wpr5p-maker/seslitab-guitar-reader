# SES-225 Student Renderer Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SES-225 fail closed unless the exact pinned ST Student renderer artifact is intact and successfully renders the delivered SCORE and Guitar TAB MusicXML through the real ST Student loader/adapter boundary.

**Architecture:** Keep the existing cross-app package/lineage proof, but separate it from the final renderer acceptance. The cross-app step verifies the pinned Student runtime manifest and writes pending package evidence plus the exact delivered SCORE/TAB XML. A dedicated real-browser step loads the checked-out Student App's `notationRuntimeLoader` + `notationAdapter` with its vendored renderer, renders both XML payloads, and only then writes final PASS evidence.

**Tech Stack:** Node.js 24 ESM, node:test, node:crypto SHA-256, GitHub Actions, Chromium/CDP browser fixture, ST Student vendored score runtime contract `0.2.0`.

**Spec:** Linear SES-225 / PR #354 P1 review thread `PRRT_kwDOTkRmDs6rSLV2`.

## Global Constraints

- Exact Student App revision: `70042d2314c005e71de80094363ba66faa795456`.
- Exact Student renderer revision: `13aa0843158257a207afe062879743d58048cc6d`.
- Renderer contract version: `0.2.0`.
- No production deploy or live delivery mutation.
- Preserve source immutability and SCORE/TAB fingerprint checks.
- Final release evidence must not report PASS before the real Student renderer succeeds.

## Review Focus

- Manifest says the correct renderer revision while one vendored file is tampered: gate must fail.
- Manifest file byte length differs from actual bytes: gate must fail.
- Browser runtime fails to load or contract version differs: gate must fail.
- SCORE renders but Guitar TAB does not: gate must fail.
- Teacher renderer passes while pinned Student renderer fails: SES-225 must still fail.

---

### Task 1: Verify pinned Student renderer artifact and make final evidence pending

**Files:**
- Create: `scripts/studentRendererRuntimeIntegrity.js`
- Modify: `scripts/verifyGtabRt01gCrossAppRelease.js`
- Modify: `scripts/gtabRt01gReleaseGate.js`
- Test: `tests/gtabRt01gReleaseGate.test.js`

**Interfaces:**
- Produces: `verifyStudentRendererRuntimeIntegrity({ runtimeRoot, expectedRendererRevision, expectedContractVersion })` returning a verified summary.
- Produces: `artifacts/gtab-rt-01g/release-evidence.pending.json`, `student-score.musicxml`, and `student-guitar-tab.musicxml`.

- [ ] **Step 1: Write failing tests** for valid manifest integrity, tampered-file rejection, required renderer checks, and pending evidence wiring.
- [ ] **Step 2: Run tests and verify RED** on the PR head.
- [ ] **Step 3: Implement the minimal integrity verifier and pending evidence lifecycle.**
- [ ] **Step 4: Run focused and full Node suites and verify GREEN.**
- [ ] **Step 5: Commit.**

### Task 2: Exercise the exact Student renderer in Chromium before final PASS

**Files:**
- Create: `scripts/verifyGtabRt01gStudentRendererBrowser.js`
- Modify: `.github/workflows/gtab-rt-01g-release-gate.yml`
- Test: `tests/gtabRt01gReleaseGate.test.js`

**Interfaces:**
- Consumes: Task 1 pending evidence and delivered SCORE/TAB XML artifacts.
- Produces: final `artifacts/gtab-rt-01g/release-evidence.json` only after both real renders succeed.

- [ ] **Step 1: Write failing workflow/contract test** requiring the exact Student renderer browser verifier.
- [ ] **Step 2: Run tests and verify RED.**
- [ ] **Step 3: Implement a browser proof that stages the checked-out Student loader/adapter/runtime, renders delivered SCORE then Guitar TAB, verifies AVAILABLE + render evidence + SVG, and finalizes release evidence.**
- [ ] **Step 4: Run focused/full tests and the dedicated GitHub Actions gate; verify GREEN.**
- [ ] **Step 5: Resolve the P1 review thread only after exact-head CI is green.**
