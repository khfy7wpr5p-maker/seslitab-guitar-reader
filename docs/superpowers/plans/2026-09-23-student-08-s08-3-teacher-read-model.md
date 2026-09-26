# STUDENT-08 S08-3 Teacher Read-Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing TD-06 student SCORE read model with explicit assignment metadata required by STUDENT-08, without changing authority, Firestore exposure, or deployment state.

**Architecture:** Keep the existing Secure Delivery authorization and storage path unchanged. The trusted server read service will derive `assignmentId`, `practiceType`, `assignedAt`, and current `state` from already-validated prepared/lifecycle records and add those fields to the sanitized student response. HTTP routes and the existing API client remain transparent carriers of that bounded response.

**Tech Stack:** Node.js 24, native `node:test`, Express, existing TD-06 domain records, Firebase emulator regression suite.

**Spec:** `khfy7wpr5p-maker/st-student-app@e9efad818465d781e8ebf053f975872f6d3558d1:docs/superpowers/specs/2026-09-23-student-08-s08-3-secure-delivery-integration-design.md`

## Global Constraints

- Student App performs no teacher write.
- Student App performs no TD-06 direct Firestore read.
- Server derives authority from verified bearer identity, never caller-supplied IDs.
- Pool recipient lists remain server-private.
- Private SCORE package remains exact-student and revoke-aware.
- No credential, provider diagnostic, Firestore path, teacher ID, evidence ID, or recipient list enters normal Student UI state; the PracticePackage v1 intended-recipient field remains confined to package validation.
- No production Firebase rules/schema/index/credential/billing/deploy action occurs in implementation PRs.
- TD-07 Chord Board producer or consumer is out of scope.
- STUDENT-09 is out of scope.
- Merge requires separate explicit human approval.

## Review Focus

1. **Lifecycle absent but prepared assignment valid:** response must report the immutable initial `ACTIVE` state, not invent a different state. Covered by Task 1 test `student read model exposes explicit immutable assignment metadata`.
2. **Lifecycle present in `COMPLETED` or `REPERTOIRE`:** response must carry the exact current lifecycle state. Covered by Task 1 test `student read model carries current lifecycle state`.
3. **Revoked lifecycle/delivery race:** new metadata must not make a revoked row visible. Covered by existing revoke-race test plus Task 1 regression run.
4. **Response-data leakage:** adding assignment metadata must not expose teacher/provider/evidence fields. Covered by Task 1 leakage assertion expansion.
5. **HTTP/client transport drift:** the exact new fields must survive the existing HTTP and client boundary unchanged. Covered by Task 2 transport regression tests.

---

### Task 1: Extend the sanitized student SCORE read model

**Files:**
- Modify: `backend/delivery/services/studentDeliveryReadService.js`
- Modify: `tests/studentDeliveryReadService.test.js`

**Interfaces:**
- Consumes: validated `PreparedAssignmentRecord.assignment`, optional validated `AssignmentLifecycleRecord`, validated `DeliveryRecord`, validated PracticePackage v1.
- Produces: student assignment rows with exact keys `deliveryId`, `assignmentId`, `packageId`, `practiceType`, `teacherNote`, `state`, `assignedAt`, `deliveredAt`, `package`.

- [ ] **Step 1: Add lifecycle imports and a failing ACTIVE metadata test**

Add these imports to `tests/studentDeliveryReadService.test.js`:

```js
import {
  createInitialAssignmentLifecycleRecord,
  transitionAssignmentLifecycleRecord,
} from '../src/services/assignmentLifecycleRecord.js'
```

Extend the existing `student list returns only the authenticated student private work` assertion:

```js
assert.deepEqual(
  {
    deliveryId: rows[0].deliveryId,
    assignmentId: rows[0].assignmentId,
    packageId: rows[0].packageId,
    practiceType: rows[0].practiceType,
    state: rows[0].state,
    assignedAt: rows[0].assignedAt,
    deliveredAt: rows[0].deliveredAt,
  },
  {
    deliveryId: 'assignment-a',
    assignmentId: 'assignment-a',
    packageId: 'package-a',
    practiceType: 'SCORE',
    state: 'ACTIVE',
    assignedAt: '2026-09-23T08:01:00Z',
    deliveredAt: '2026-09-23T08:03:00Z',
  },
)
```

- [ ] **Step 2: Run the targeted test and confirm RED**

Run:

```bash
node --test tests/studentDeliveryReadService.test.js
```

Expected: FAIL because one or more of `assignmentId`, `practiceType`, `state`, or `assignedAt` is missing from the student read model.

- [ ] **Step 3: Add failing lifecycle-state tests**

Refactor `makeHarness` to accept an optional `lifecycleA` and seed it through the existing `lifecycles` constructor option:

```js
function makeHarness({ lifecycleA = null } = {}) {
  // existing setup...
  const store = createInMemorySecureDeliveryStore({
    identityMappings: [
      teacherMapping(),
      studentMapping('uid-student-a', 'student-a'),
      studentMapping('uid-student-b', 'student-b'),
    ],
    grants,
    preparedAssignments: [a.record, b.record],
    practicePackages: [a.package, b.package],
    lifecycles: lifecycleA === null ? [] : [lifecycleA],
    deliveries: [deliveryA, deliveryB],
  })

  return {
    store,
    preparedA: a.record,
    authorization: createSecureDeliveryAuthorization({ store }),
  }
}
```

Add:

```js
test('student read model carries current lifecycle state', async () => {
  const { createStudentDeliveryReadService } = await loadService()

  const base = makeHarness()
  const active =
    createInitialAssignmentLifecycleRecord(
      base.preparedA.assignment,
    )
  const completed =
    transitionAssignmentLifecycleRecord(
      active,
      'COMPLETED',
      '2026-09-23T08:20:00Z',
    )
  const repertoire =
    transitionAssignmentLifecycleRecord(
      completed,
      'REPERTOIRE',
      '2026-09-23T08:30:00Z',
    )

  for (const [lifecycle, expected] of [
    [completed, 'COMPLETED'],
    [repertoire, 'REPERTOIRE'],
  ]) {
    const h = makeHarness({ lifecycleA: lifecycle })
    const service = createStudentDeliveryReadService(h)
    const [row] = await service.listAssignments({
      providerSubject: 'uid-student-a',
    })

    assert.equal(row.state, expected)
    assert.equal(row.assignmentId, 'assignment-a')
    assert.equal(row.practiceType, 'SCORE')
    assert.equal(row.assignedAt, '2026-09-23T08:01:00Z')
  }
})
```

- [ ] **Step 4: Run the targeted tests and confirm RED**

Run:

```bash
node --test tests/studentDeliveryReadService.test.js
```

Expected: FAIL on the lifecycle-state assertions because the current response does not expose `state`.

- [ ] **Step 5: Implement the minimal read-model extension**

Change `studentView` to accept the already-validated lifecycle:

```js
function studentView(
  delivery,
  prepared,
  lifecycle,
  pkg,
) {
  const assignment = prepared.assignment

  return Object.freeze({
    deliveryId: delivery.deliveryId,
    assignmentId: assignment.assignmentId,
    packageId: delivery.packageId,
    practiceType: assignment.practiceType,
    teacherNote: assignment.teacherNote,
    state:
      lifecycle === null
        ? assignment.state
        : lifecycle.state,
    assignedAt: assignment.assignedAt,
    deliveredAt: delivery.deliveredAt,
    package: pkg,
  })
}
```

In `visibleById`, retain the current lifecycle validation, keep the validated lifecycle value, and call:

```js
return studentView(
  delivery,
  prepared,
  lifecycle,
  pkg,
)
```

Do not add any caller-supplied identity field or Firestore metadata.

- [ ] **Step 6: Run the service tests and confirm GREEN**

Run:

```bash
node --test tests/studentDeliveryReadService.test.js
```

Expected: all tests in the file PASS.

- [ ] **Step 7: Expand the leakage regression**

In `student read model strips teacher/provider/evidence diagnostics`, also assert that the explicit response keys are bounded:

```js
assert.deepEqual(
  Object.keys(result).sort(),
  [
    'assignedAt',
    'assignmentId',
    'deliveredAt',
    'deliveryId',
    'package',
    'packageId',
    'practiceType',
    'state',
    'teacherNote',
  ],
)
```

Keep the existing forbidden-string assertions.

- [ ] **Step 8: Re-run the targeted suite**

Run:

```bash
node --test tests/studentDeliveryReadService.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

```bash
git add backend/delivery/services/studentDeliveryReadService.js tests/studentDeliveryReadService.test.js
git commit -m "feat: expose student assignment lifecycle metadata"
```

### Task 2: Pin the HTTP/client transport contract and documentation

**Files:**
- Modify: `tests/secureDeliveryHttp.test.js`
- Modify: `tests/secureDeliveryApiClient.test.js`
- Modify: `docs/teacher-delivery-td06-secure-delivery.md`

**Interfaces:**
- Consumes: Task 1 student assignment row.
- Produces: transport-level regression evidence that the bounded row survives `GET /student/assignments` and `GET /student/assignments/:deliveryId` unchanged.

- [ ] **Step 1: Add an HTTP response-shape regression**

Add a dedicated test using `fakeDeps`:

```js
test('student assignment HTTP response preserves bounded assignment metadata only', async () => {
  const { createSecureDeliveryRouter } = await loadHttp()
  const deps = fakeDeps({
    enabled: true,
    writesEnabled: false,
    studentReadsEnabled: true,
  })

  deps.studentService.listAssignments = async (input) => {
    deps.calls.push(['student-list', input])
    return [{
      deliveryId: 'assignment-a',
      assignmentId: 'assignment-a',
      packageId: 'package-a',
      practiceType: 'SCORE',
      teacherNote: 'Ölçü 8 tekrar',
      state: 'COMPLETED',
      assignedAt: '2026-09-23T08:01:00Z',
      deliveredAt: '2026-09-23T08:03:00Z',
      package: { safe: true },
    }]
  }

  const response = await request(
    appFor(createSecureDeliveryRouter(deps)),
    '/api/secure-delivery/v1/student/assignments',
    {
      method: 'GET',
      headers: { Authorization: 'Bearer token' },
    },
  )

  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.data[0].state, 'COMPLETED')
  assert.equal(body.data[0].assignmentId, 'assignment-a')
  assert.equal(body.data[0].practiceType, 'SCORE')
  assert.equal(JSON.stringify(body).includes('teacherId'), false)
})
```

This is a regression pin for the already-transparent router; it may pass immediately because no router transformation is required.

- [ ] **Step 2: Add an API-client transport regression**

In `tests/secureDeliveryApiClient.test.js`, add:

```js
test('student assignment client returns bounded assignment metadata unchanged', async () => {
  const { createSecureDeliveryApiClient } = await loadClient()
  const expected = [{
    deliveryId: 'assignment-a',
    assignmentId: 'assignment-a',
    packageId: 'package-a',
    practiceType: 'SCORE',
    teacherNote: '',
    state: 'REPERTOIRE',
    assignedAt: '2026-09-23T08:01:00Z',
    deliveredAt: '2026-09-23T08:03:00Z',
    package: { safe: true },
  }]

  const client = createSecureDeliveryApiClient({
    baseUrl: 'https://example.invalid/api/secure-delivery/v1',
    getIdToken: async () => 'fresh-token',
    fetchImpl: async () => jsonResponse({
      success: true,
      data: expected,
    }),
  })

  assert.deepEqual(
    await client.listStudentAssignments(),
    expected,
  )
})
```

- [ ] **Step 3: Run the boundary tests**

Run:

```bash
node --test tests/secureDeliveryHttp.test.js tests/secureDeliveryApiClient.test.js
```

Expected: PASS. If either fails, fix only the transparent transport regression; do not introduce a new mapping layer.

- [ ] **Step 4: Update TD-06 documentation**

In `docs/teacher-delivery-td06-secure-delivery.md`, document that student SCORE rows now include:

```text
deliveryId
assignmentId
packageId
practiceType
teacherNote
state
assignedAt
deliveredAt
package
```

State explicitly:

```text
assignmentId/practiceType/state/assignedAt are derived from trusted prepared/lifecycle records.
No caller-supplied identity is accepted.
No top-level studentId, teacherId, providerSubject, recipient list, Firestore path, or evidence ID is returned.
PracticePackage v1 remains unchanged.
```

- [ ] **Step 5: Run TD-06 emulator tests**

Run:

```bash
npm run test:td06:emulator
```

Expected: PASS with zero failures.

- [ ] **Step 6: Run the full repository tests**

Run:

```bash
npm test
```

Expected: zero failures.

- [ ] **Step 7: Run production build**

Run:

```bash
npm run build
```

Expected: exit code 0.

- [ ] **Step 8: Commit Task 2**

```bash
git add tests/secureDeliveryHttp.test.js tests/secureDeliveryApiClient.test.js docs/teacher-delivery-td06-secure-delivery.md
git commit -m "test: pin student assignment read-model transport"
```

### Task 3: Final branch verification and PR gate

**Files:**
- No product-code changes expected.

**Interfaces:**
- Consumes: Task 1 and Task 2 outputs.
- Produces: merge-readiness evidence only; no merge.

- [ ] **Step 1: Run the exact branch verification set**

Run:

```bash
npm ci --ignore-scripts
npm run test:td06:emulator
npm test
npm run build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 2: Verify GitHub checks on the exact head**

Require:

```text
CI / test-and-build: success
Regression Quality / Playwright protected baseline: success
Regression Quality / SonarQube analysis: success
SonarCloud Code Analysis: success when emitted
unresolved review threads: 0
base drift: 0
```

- [ ] **Step 3: Stop before merge**

Report exact main SHA, branch, PR number, exact head SHA, changed files, test counts, CI results, and unresolved-thread count. Do not merge without separate explicit human approval.
