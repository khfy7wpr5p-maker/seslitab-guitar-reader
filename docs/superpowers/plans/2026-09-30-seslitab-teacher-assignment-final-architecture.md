# SES-115 / TD-PROD-01 — SesliTab Teacher Assignment & Secure Delivery Final Architecture

> **Status:** APPROVED architecture. Implementation has not started.
>
> **Execution mode:** Fresh-read first. Use TDD for executable behavior. Preserve fail-closed security. Do not merge, activate production writes, or deploy without separate explicit approval.

## Goal

Deliver one teacher-facing **Ödev Gönder** workflow that can send either the exact teacher-final SCORE or an exact CHORD_BOARD voicing to authenticated students through the existing Secure Delivery architecture, without restoring the retired duplicate score UI or creating new Render services.

## Reviewed baseline

- SesliTab repository: `khfy7wpr5p-maker/seslitab-guitar-reader`.
- Architecture baseline: `main@492d0b280d596d144760abb2bf27a0d15aa01451`.
- SES-114 / PR #285: merged; read-only suspicious-measure integration is on `main`.
- ST Student App reviewed baseline: `main@b59bcb6dc5525f035515ab358734ebbe5a277fbb`.
- Linear implementation umbrella: SES-115.
- Notion architecture source: `SesliTab — Teacher Assignment & Secure Delivery Final Architecture — 2026-09-30`.

Execution must fresh-read current `origin/main` before each implementation slice and reconcile any drift rather than assuming this baseline is still current.

## Product flows

### SCORE

`PDF → OMR → Correction Engine → read-only suspicious-measure presentation → Smoosic teacher edit → final MusicXML → Ödev Gönder → authenticated roster → PracticePackage → Secure Delivery → Student App`

### CHORD_BOARD

`exact Chord Board voicing snapshot → Ödev Gönder → authenticated roster → immutable CHORD_BOARD package → Secure Delivery → Student App`

SCORE and CHORD_BOARD share roster, teacher-note, preparation/delivery state and acknowledgement rules. Their content-authority rules remain separate.

## Architecture invariants

- Smoosic remains the visible teacher score editor.
- The retired duplicate **Nota Görünümü** / legacy score editor must not be restored.
- Raw/source MusicXML remains immutable.
- The exact teacher-final MusicXML becomes SCORE assignment authority only after validation, fingerprinting and exact revision binding.
- Previous approval must not silently transfer to a new revision.
- Correction Engine presentation is read-only and must never mutate MusicXML, score history, approval state or delivery authority.
- Stable `studentId` is identity authority; display names are presentation only.
- Shared assignment state machine:
  - local assignment
  - `DURABLY_PREPARED`
  - `DELIVERED_TO_STUDENT`
- The UI may claim **Gönderildi** only after exact delivery acknowledgement.
- Silent partial batch success is forbidden.
- No new SesliTab Render service/domain.
- Existing SesliTab deployment targets remain `seslitab-app` and `seslitab-omr`.
- Production teacher writes, merge and deploy remain separate approval gates.
- Existing Smoosic message provenance checks (`origin + event.source + requestId + sourceRevision`) must not be weakened.

## Confirmed architecture gaps

1. SCORE and CHORD_BOARD assignment UIs are intentionally not mounted in the production shell by current security tests.
2. SCORE controller currently prepares local assignments but does not run the full Secure Delivery prepare/deliver path.
3. CHORD_BOARD already has prepare/deliver phases; duplicate delivery architecture must not be created.
4. Teacher roster domain data exists, but the production teacher UI needs an authenticated teacher-authorized roster read.
5. Final Smoosic MusicXML can diverge from pre-edit OMR/canonical data; assignment packages must be built from the exact final revision.
6. Current production Secure Delivery boundary intentionally requires teacher writes disabled.
7. The gateway uses `express.json()` without a route-specific limit; Express 4.21.x defaults to 100 KB, which can be insufficient for MusicXML/batch delivery.
8. Student App already understands SCORE packages and CHORD_BOARD delivery contracts; avoid rewriting the Student App contract unless an E2E failure proves a specific gap.

---

## Task 1 — Teacher Assignment Production Contract

**Goal:** Replace the historical “assignment UI must never production-mount” security contract with a controlled authenticated production-mount contract.

**Primary areas:**
- `main.js`
- production shell/composition files
- `tests/teacherScoreAssignmentSecurity.test.js`
- `tests/teacherChordBoardAssignmentSecurity.test.js`

- [ ] Fresh-read the production shell and both security tests.
- [ ] Write RED tests defining the new allowed production composition.
- [ ] Keep browser code free of Firebase Admin, direct Firestore authority, persistent bearer tokens and Student App write implementation.
- [ ] Prove the legacy duplicate score UI is still not mounted.
- [ ] Prove assignment surfaces remain unavailable when auth/composition prerequisites are absent.
- [ ] Run focused tests and full regression before committing this slice.

**Acceptance:** The production shell may mount one authenticated teacher assignment surface, but no privileged provider/server authority is moved into the browser.

---

## Task 2 — Authenticated Teacher Roster

**Goal:** Provide the production teacher UI an exact authorized roster.

**Required API:**
- `GET /api/secure-delivery/v1/teacher/roster`

**Rules:**
- Authenticated teacher identity comes only from the verified token/provider mapping.
- Returned rows are bounded to the teacher's granted roster scope.
- Stable `studentId` remains identity authority.
- Display name/nickname is presentation only.
- Inactive/ungranted students are not assignable.

- [ ] Add RED router/service/authorization tests.
- [ ] Add the provider-neutral roster read service.
- [ ] Add server route + exact bounded response model.
- [ ] Add browser client method.
- [ ] Add production adapter/composition wiring.
- [ ] Prove wrong-teacher, missing-grant, inactive and malformed cases fail closed.

**Acceptance:** The teacher UI cannot infer or select a student outside the authenticated teacher's authorized roster.

---

## Task 3 — Final MusicXML Intake

**Goal:** Convert the current Smoosic teacher result into an exact SCORE assignment source.

**Rules:**
- Use the existing validated Smoosic export/write-back boundary; do not invent a second editor export protocol.
- Parse and validate the exact final MusicXML.
- Enforce bounded payload size.
- Compute deterministic content fingerprint.
- Bind to exact teacher/source revision.
- Stale, malformed, ambiguous or mismatched revision fails closed.

- [ ] Write RED tests for exact revision + fingerprint binding.
- [ ] Add final-MusicXML assignment intake service.
- [ ] Reject stale export response/request correlation.
- [ ] Reject invalid XML/semantic round-trip failures under the existing supported-edit contract.
- [ ] Prove raw/source MusicXML remains unchanged.

**Acceptance:** The exact bytes selected for assignment are provably the teacher-final revision, not stale OMR or stale editor state.

---

## Task 4 — SCORE Package Builder

**Goal:** Create `StudentPracticePackageV1` from the exact final MusicXML.

**Rules:**
- Do not reuse stale pre-edit OMR canonical events.
- Derive any required canonical student-safe data from the exact final MusicXML/revision.
- Preserve optional Guitar TAB MusicXML contract when the qualified TAB source is available.
- Package recipient must exactly equal assignment studentId.
- Package approved revision must exactly equal assignment revision.

- [ ] Write RED package-authority mismatch tests.
- [ ] Build package from final XML + final canonical projection.
- [ ] Validate exact recipient/revision/fingerprint.
- [ ] Prove package is immutable and student-safe.
- [ ] Prove rejected source cannot create a package.

**Acceptance:** A SCORE package cannot contain a final XML revision paired with stale canonical events or another student's authority.

---

## Task 5 — Unified Delivery Orchestrator

**Goal:** Reuse one Secure Delivery orchestration for SCORE and CHORD_BOARD without merging content-authority logic.

**Required state transitions:**
`local assignment → DURABLY_PREPARED → DELIVERED_TO_STUDENT`

**Rules:**
- Exact prepare acknowledgement required before delivery.
- Exact delivery acknowledgement required before success.
- Batch limit and identity checks remain bounded.
- Conflicts are fail-closed.
- Partial silent delivery is forbidden.
- Retry after durable prepare must be safe/idempotent.

- [ ] Extract/generalize the shared orchestration from the existing CHORD_BOARD flow.
- [ ] Add SCORE adapter into the shared orchestration.
- [ ] Preserve CHORD_BOARD voicing fingerprint checks.
- [ ] Add RED acknowledgement substitution/mismatch tests for both content types.
- [ ] Add retry-after-DURABLY_PREPARED tests.

**Acceptance:** SCORE and CHORD_BOARD have identical delivery semantics but retain separate package/content validators.

---

## Task 6 — Teacher Homework UI

**Goal:** Mount one teacher-facing **Ödev Gönder** surface.

**UI model:**
- Content mode: **Nota** | **Akor**
- Shared authorized student roster
- Common teacher note
- Optional per-student override
- **Öğrenciye Gönder**
- Bounded status/result area

**Rules:**
- The teacher does not need to see the technical prepare/deliver split.
- If preparation succeeds but delivery fails, show a truthful retryable state.
- **Gönderildi** only after exact delivery acknowledgement.
- Existing accessibility/VoiceOver behavior must remain intact.

- [ ] Write RED DOM/controller tests.
- [ ] Mount only after authenticated composition is ready.
- [ ] Reuse the same roster for SCORE and CHORD_BOARD.
- [ ] Preserve per-student note override behavior.
- [ ] Add error copy for invalid XML, inactive student, conflict, prepare failure and delivery failure.
- [ ] Verify iPhone/VoiceOver focus order and control names.

**Acceptance:** One production surface replaces separate technical assignment UIs without restoring the legacy score workspace.

---

## Task 7 — Correction Presentation in the Smoosic-hosted Teacher Flow

**Goal:** Keep suspicious-measure guidance visible to the teacher while preserving a non-mutating boundary.

**Rules:**
- Reuse the accepted Correction Engine suspicious-measure result.
- Use exact `partId + measureIndex` identity.
- Never infer identity from visual DOM order.
- Never scrape undocumented Smoosic DOM as score authority.
- Ambiguous/stale mapping clears/rejects the overlay instead of guessing.
- Overlay state must not enter exported MusicXML.

- [ ] Add RED lifecycle tests for render/source change/edit/retry.
- [ ] Reuse existing SES-114 analysis/runtime contracts.
- [ ] Keep presentation isolated from MusicXML and revision history.
- [ ] Prove export bytes are unchanged by overlay state.

**Acceptance:** Correction guidance can disappear safely; it can never corrupt or rewrite the teacher's score.

---

## Task 8 — Secure Delivery Payload Boundary

**Goal:** Support realistic MusicXML/batch delivery without globally widening the OMR gateway parser.

**Rules:**
- Add a Secure-Delivery-specific JSON/body size policy.
- Add aggregate batch-byte limits.
- Keep per-assignment/package limits explicit.
- Return deterministic `413`/bounded public error behavior on oversize.
- Do not change general PDF/OMR request limits.

- [ ] Write RED boundary tests around current 100 KB default behavior.
- [ ] Mount a route-specific parser/order safely for Secure Delivery.
- [ ] Add aggregate batch byte accounting before persistence.
- [ ] Add oversize SCORE + oversize multi-student batch tests.
- [ ] Re-run gateway shutdown/CORS/security tests.

**Acceptance:** Valid MusicXML assignments fit within reviewed limits; oversized/malicious payloads fail before durable writes.

---

## Task 9 — Production Teacher-Write Profile

**Goal:** Add a separately reviewable production write profile while preserving the current read-only profile.

**Rules:**
- Current read-only profile remains valid and fail-closed.
- Teacher writes require explicit production activation.
- Exact teacher identity mapping + teacher/student grant required.
- Recipient/package/revision/fingerprint authority must be verified server-side.
- Direct Firestore client access remains deny-all.
- No credentials/tokens are committed.
- No activation or deploy under implementation approval alone.

- [ ] Write RED production-boundary profile tests.
- [ ] Introduce explicit teacher-write activation contract.
- [ ] Preserve emulator-host and demo-project rejection in production.
- [ ] Prove closed flags return unavailable/write-disabled behavior.
- [ ] Document required Human Gate for provisioning + activation.

**Acceptance:** Code can support writes, but production remains closed until explicit environment/provisioning approval.

---

## Task 10 — End-to-End Qualification

**SCORE positive path:**
`teacher-final MusicXML → selected student → prepare → deliver → Student App list/detail → notation render`

**CHORD_BOARD positive path:**
`exact voicing → selected student → prepare → deliver → Student App assignment → chord practice`

**Negative qualification:**
- wrong recipient
- ungranted/inactive student
- revoked assignment
- stale revision
- malformed XML
- oversized XML
- oversized multi-student batch
- duplicate conflict
- acknowledgement substitution
- delivery retry after durable preparation
- no overlay authority leakage into MusicXML

- [ ] Run focused unit/integration suites.
- [ ] Run full `npm test`.
- [ ] Run production build.
- [ ] Run Smoosic/browser structural proofs.
- [ ] Run Secure Delivery protected tests/emulator tests.
- [ ] Run Student App contract/integration tests against the exact package fixtures.
- [ ] Run protected Playwright/browser proofs.
- [ ] Run SonarQube/SonarCloud and whole-diff review.
- [ ] Record exact candidate head.

**Acceptance:** Both assignment types complete teacher→delivery→Student App without identity, revision, package or acknowledgement drift.

---

## Promotion gates

1. **Implementation approval** — satisfied by the architecture approval that created SES-115.
2. **Exact-head PR + CI evidence** — required before merge.
3. **Merge approval** — separate explicit user approval.
4. **Production provisioning/write activation approval** — separate explicit user approval.
5. **Existing-service deploy approval** — separate explicit user approval.
6. **Physical teacher/student acceptance** — required before declaring the product flow complete.

No gate implies the next one automatically.

## Non-goals

- No automatic Correction Engine correction authority expansion.
- No new Render service/domain.
- No replacement of Smoosic with the retired editor.
- No direct browser Firestore authority.
- No identity lookup by display name.
- No silent conversion of historical no-production-mount tests into evidence that production delivery was already qualified.
- No unrelated OMR, TAB engine or Student App redesign unless a failing E2E proves a scoped defect.

## Cross-system references

- Linear: SES-115 — TD-PROD-01.
- Linear: SES-114 — CE-INTEG-01 (Done).
- Linear architecture document: `SesliTab — Güncel mimari: OMR, Smoosic, TAB, ödev ve Render — 2026-09-26`, updated 2026-09-30 with this decision.
- Notion: `SesliTab — Teacher Assignment & Secure Delivery Final Architecture — 2026-09-30`.
