# SES-190 Backend Shared Request Havuz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authenticated, read-only student endpoint that exposes pending work requests for the current student's teacher cohort as presentation-only `{ title, displayNameOrNickname }` rows.

**Architecture:** Reuse the existing authoritative Student Work Request store and teacher roster data. Resolve the authenticated student to exactly one active teacher grant, derive that teacher's pending request set, resolve each request's student through that teacher's active roster, and emit only presentation fields. Do not reuse `public_pool`, create new persistence, or grant student lifecycle authority.

**Tech Stack:** Node.js 24, Express 4.21.2, Firebase-backed Secure Delivery store abstractions, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-05-ses-190-student-eser-iste-shared-havuz-design.md`

## Global Constraints

- Existing `POST /student/work-requests` contract remains unchanged.
- Existing Student `public_pool` / `/student/pool` remains unchanged.
- Shared student Havuz is read-only.
- Student DTO contains only `title` and `displayNameOrNickname`.
- Never expose requestId, studentId, teacherId, provider subject/email, token, Piece/assignment IDs, lifecycle mutation keys, or diagnostics.
- Missing/ambiguous teacher authority fails closed.
- Pending request with no valid active roster presentation entry fails closed rather than leaking or guessing identity.
- Converted or revoked requests are excluded because only PENDING is projected.
- No new persistence domain or copied display-name field on request records.

## Review Focus

- Student with zero or multiple active teacher grants -> endpoint fails closed and returns no cross-cohort data.
- Request references a student missing from the active teacher roster -> whole read fails closed; no partial identity guess.
- Request belongs to another teacher -> never appears in current cohort projection.
- Converted/REVOKED request -> never appears in shared pending response.
- Response-shape regression -> tests explicitly prove internal IDs/action keys are absent.

---

### Task 1: Safe shared-pending projection in `studentWorkRequestService`

**Files:**
- Modify: `backend/delivery/services/studentWorkRequestService.js`
- Test: `tests/studentWorkRequestService.test.js`

**Interfaces:**
- Consumes: existing `authorization.resolvePrincipal(providerSubject, 'STUDENT')`, `store.listActiveTeacherGrantsForStudent(studentId)`, `store.listWorkRequestsForTeacher(teacherId)` and a roster read capability supplied at service construction.
- Produces: `listSharedPendingForStudent({ providerSubject }) -> Promise<readonly { title: string, displayNameOrNickname: string }[]>`.

- [ ] **Step 1: Write failing service tests**
  - Student A and Student B under the same teacher receive the same pending projection.
  - Another teacher cohort is excluded.
  - Converted and REVOKED rows are excluded.
  - Zero/multiple active grants reject with the existing teacher-authority ambiguity semantics.
  - Pending request whose student cannot be resolved through the active roster rejects fail-closed.
  - Every returned row has exactly `title` and `displayNameOrNickname` keys.

- [ ] **Step 2: Run focused service tests and verify RED**

Run: `node --test tests/studentWorkRequestService.test.js`

Expected: FAIL because `listSharedPendingForStudent` / roster dependency does not yet exist.

- [ ] **Step 3: Implement the minimal projection**
  - Extend service construction with the smallest existing roster-read dependency available in composition.
  - Reuse the same exact-one-active-teacher grant checks used by `requestWork`.
  - Fetch only that teacher's work requests and active roster entries.
  - Filter request state to `PENDING`.
  - Join by internal `studentId` only server-side.
  - Return frozen presentation DTOs containing only `title` and `displayNameOrNickname`.

- [ ] **Step 4: Run focused service tests and verify GREEN**

Run: `node --test tests/studentWorkRequestService.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add shared pending student request projection`

### Task 2: Authenticated GET route without changing request creation

**Files:**
- Modify: `backend/delivery/http/studentWorkRequestRouter.js`
- Modify only if needed for dependency wiring: `backend/delivery/composition.js`
- Test: `tests/studentWorkRequestHttp.test.js`

**Interfaces:**
- Consumes: `service.listSharedPendingForStudent({ providerSubject })` from Task 1.
- Produces: authenticated `GET /student/work-requests/pending`, returning `{ success: true, data: [...] }` through the existing Secure Delivery response/error conventions.

- [ ] **Step 1: Write failing HTTP tests**
  - Valid bearer student request returns 200 and exact presentation-only array.
  - Invalid/missing bearer auth follows existing 401/error response behavior.
  - Feature-disabled path fails using existing Secure Delivery feature gate.
  - GET must not require `writesEnabled`; it is a read surface.
  - POST creation behavior remains unchanged.

- [ ] **Step 2: Run focused HTTP tests and verify RED**

Run: `node --test tests/studentWorkRequestHttp.test.js`

Expected: FAIL because the GET route is absent.

- [ ] **Step 3: Implement the GET route**
  - Keep the existing `express.Router()` pattern.
  - Verify bearer token with the same `tokenVerifier` path as POST.
  - Check `config.enabled`; do not gate GET on `writesEnabled`.
  - Call `listSharedPendingForStudent` with normalized `decoded.uid`.
  - Return JSON via existing `{ success: true, data }` convention.
  - Reuse existing `secureDeliveryErrorStatus` / `sendSecureDeliveryError` handling and bounded observability pattern.

- [ ] **Step 4: Run HTTP tests and verify GREEN**

Run: `node --test tests/studentWorkRequestHttp.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: expose read-only shared student request havuz`

### Task 3: Browser API client contract for create + shared read

**Files:**
- Modify: `src/services/secureDeliveryApiClient.js`
- Test: `tests/studentWorkRequestApiClient.test.js`

**Interfaces:**
- Consumes: backend GET route from Task 2.
- Produces: `listSharedStudentWorkRequests()` using `student/work-requests/pending`; preserves existing `requestStudentWork(title)`.

- [ ] **Step 1: Write failing API client test**
  - Exact GET URL is `/secure-delivery/student/work-requests/pending`.
  - Method is GET/default request mode with bearer handling inherited from the client.
  - Existing POST test remains unchanged and `/student/pool` remains untouched.

- [ ] **Step 2: Run focused API client test and verify RED**

Run: `node --test tests/studentWorkRequestApiClient.test.js`

Expected: FAIL because list method is absent.

- [ ] **Step 3: Add only the new read method**

Signature: `listSharedStudentWorkRequests() -> Promise<readonly SharedPendingRow[]>` at the existing API-client object boundary.

- [ ] **Step 4: Run focused API client tests and verify GREEN**

Run: `node --test tests/studentWorkRequestApiClient.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add shared work request client read`

### Task 4: Backend regression and exact branch verification

**Files:**
- No new production files beyond Tasks 1-3.

**Interfaces:**
- Produces: fresh evidence that SES-170/155/156 behavior and `public_pool` are unchanged.

- [ ] **Step 1: Run request, management, and pool-focused suites**

Run the repository's focused Node tests covering:
- `tests/studentWorkRequestService.test.js`
- `tests/studentWorkRequestHttp.test.js`
- `tests/studentWorkRequestApiClient.test.js`
- teacher Piece management/request conversion tests
- Student public pool tests

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Inspect final diff**
  - No persistence migration.
  - No changes to `/student/pool` semantics.
  - No student lifecycle mutation endpoint.
  - No internal IDs in student projection DTO.

- [ ] **Step 5: Commit any test-only finalization if required, then stop before merge/deploy**

Merge and deploy remain separate product-owner approvals.
