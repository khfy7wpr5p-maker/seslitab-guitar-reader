# TD-05 Assignment Lifecycle and Revoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add teacher-owned lifecycle management for prepared SCORE assignments while preserving the immutable TD-04 `PrivateAssignment v1` and exact SCORE source binding.

**Architecture:** Keep TD-04 assignment creation/source authority unchanged. Add an orthogonal immutable lifecycle record, an in-memory lifecycle repository, a teacher lifecycle service, a bounded controller, and an explicitly mounted teacher UI. Missing lifecycle overlay means effective ACTIVE/unrevoked state; lifecycle mutations never alter the original assignment or `sourceRef`.

**Tech Stack:** Node.js ESM `>=24.0.0 <25`, built-in `node:test` + `node:assert/strict`, Vite 8.2.0, existing fake teacher DOM test support.

**Spec:** `docs/superpowers/specs/2026-09-23-td05-assignment-lifecycle-design.md`

## Global Constraints

- Preserve `READY_EXACT_REVISION != DELIVERED_TO_STUDENT`.
- Preserve `PrivateAssignment v1` behavior: initial SCORE only, `state = ACTIVE`, `revokedAt = null`.
- Preserve forward-only `ACTIVE -> COMPLETED -> REPERTOIRE`.
- Revocation is orthogonal, one-way, and allowed from ACTIVE, COMPLETED, or REPERTOIRE while not already revoked.
- Revoked assignments cannot transition further.
- Same-target state retry and repeated revoke are idempotent and must not create new audit timestamps.
- Stable `studentId` is authority; display name/nickname is presentation only.
- Original assignment and exact `sourceRef` never change.
- No Firebase, Firestore, Auth, Student App write, network delivery, browser persistence, cross-repository write, security-rule deployment, migration, credentials, billing action, Package 12 semantic change, Stage L semantic change, or CHORD_BOARD producer.
- TD-05 UI stays explicit-mount and must not be wired into `main.js`, `src/app.js`, or `src/appShell.js`.
- Teacher UI must not claim `Gönderildi`, `Teslim edildi`, or equivalent delivery.
- Use TDD for every production behavior slice.
- Stop after exact-head verification and review; do not merge without explicit human approval.

## File Structure

**Create**
- `src/services/assignmentLifecycleRecord.js` — immutable lifecycle record construction, validation, state transition, revoke semantics.
- `src/services/teacherAssignmentLifecycleRepository.js` — provider-neutral in-memory current/history storage and exact mutation acknowledgements.
- `src/services/teacherAssignmentLifecycleService.js` — composes TD-04 assignment repository with TD-05 lifecycle repository, handles idempotency/time and acknowledgement validation.
- `src/services/teacherAssignmentLifecycleController.js` — teacher-safe view model and bounded action messages.
- `src/teacherAssignmentLifecycleUi.js` — explicit-mount lifecycle management view.
- `tests/assignmentLifecycleRecord.test.js`
- `tests/teacherAssignmentLifecycleRepository.test.js`
- `tests/teacherAssignmentLifecycleService.test.js`
- `tests/teacherAssignmentLifecycleController.test.js`
- `tests/teacherAssignmentLifecycleUi.test.js`
- `tests/teacherAssignmentLifecycleSecurity.test.js`
- `docs/teacher-delivery-td05-assignment-lifecycle.md`

**Do not modify for TD-05 behavior**
- `src/services/privateAssignment.js`
- `src/services/scoreAssignmentSourceBinding.js`
- `src/services/teacherScoreAssignmentRepository.js`
- `src/services/teacherScoreAssignmentService.js`
- `main.js`
- `src/app.js`
- `src/appShell.js`

## Review Focus

1. **Adapter returns a valid lifecycle record for the wrong original assignment** — service must reject even if assignmentId-like fields look plausible. Covered in Task 3 acknowledgement substitution tests.
2. **Retry arrives after state already changed or assignment already revoked** — operation must return the existing record without a second history row or `now()` call. Covered in Tasks 2 and 3 idempotency tests.
3. **Prepared assignment belongs to a now-inactive or removed roster entry** — teacher management must remain possible; view should use a bounded presentation fallback rather than losing lifecycle authority or exposing raw IDs. Covered in Task 4.
4. **Custom repository returns duplicate/malformed original assignments or lifecycle overlays during list** — listing must fail closed rather than render mixed authority. Covered in Task 3 list validation tests.
5. **UI receives a revoked REPERTOIRE row** — it must render history/status but expose neither Repertuara Ekle nor Tamamlandı nor Geri Çek actions. Covered in Task 5.

---

### Task 1: Immutable Assignment Lifecycle Record

**Files:**
- Create: `src/services/assignmentLifecycleRecord.js`
- Test: `tests/assignmentLifecycleRecord.test.js`

**Interfaces:**
- Consumes: `isPrivateAssignment(value)`, `PRIVATE_ASSIGNMENT_STATE`, `isAllowedTeacherAssignmentTransition(fromState, toState)`, `isStrictFrozenRecord(value, fields)`, `normalizeRequiredTimestamp(value, label)`.
- Produces:
  - `ASSIGNMENT_LIFECYCLE_SCHEMA_VERSION = 1`
  - `createInitialAssignmentLifecycleRecord(assignment)`
  - `transitionAssignmentLifecycleRecord(record, toState, transitionedAt)`
  - `revokeAssignmentLifecycleRecord(record, revokedAt)`
  - `isAssignmentLifecycleRecord(value)`
- Record shape:
  - `schemaVersion`
  - `assignment`
  - `state`
  - `stateChangedAt`
  - `revokedAt`

- [ ] **Step 1: Write failing lifecycle record tests**

Create `tests/assignmentLifecycleRecord.test.js` with helpers that construct a valid TD-04 SCORE assignment using `createPrivateAssignment()` and a strict frozen SCORE source binding fixture.

Pin these behaviors:

```js
test('TD-05 initial lifecycle view preserves exact assignment and ACTIVE state', () => {
  const assignment = scoreAssignment()
  const record = createInitialAssignmentLifecycleRecord(assignment)

  assert.equal(Object.isFrozen(record), true)
  assert.equal(record.assignment, assignment)
  assert.equal(record.state, PRIVATE_ASSIGNMENT_STATE.ACTIVE)
  assert.equal(record.stateChangedAt, assignment.assignedAt)
  assert.equal(record.revokedAt, null)
  assert.equal(isAssignmentLifecycleRecord(record), true)
})

test('TD-05 lifecycle transitions ACTIVE -> COMPLETED -> REPERTOIRE without changing assignment', () => {
  const assignment = scoreAssignment()
  const active = createInitialAssignmentLifecycleRecord(assignment)
  const completed = transitionAssignmentLifecycleRecord(
    active,
    PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    '2026-09-23T08:00:00Z',
  )
  const repertoire = transitionAssignmentLifecycleRecord(
    completed,
    PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
    '2026-09-23T09:00:00Z',
  )

  assert.equal(completed.assignment, assignment)
  assert.equal(repertoire.assignment, assignment)
  assert.equal(completed.state, PRIVATE_ASSIGNMENT_STATE.COMPLETED)
  assert.equal(repertoire.state, PRIVATE_ASSIGNMENT_STATE.REPERTOIRE)
  assert.equal(completed.stateChangedAt, '2026-09-23T08:00:00Z')
  assert.equal(repertoire.stateChangedAt, '2026-09-23T09:00:00Z')
})

test('TD-05 lifecycle rejects skipped reverse and post-revoke transitions', () => {
  const assignment = scoreAssignment()
  const active = createInitialAssignmentLifecycleRecord(assignment)

  assert.throws(
    () => transitionAssignmentLifecycleRecord(
      active,
      PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
      '2026-09-23T08:00:00Z',
    ),
    /transition/i,
  )

  const completed = transitionAssignmentLifecycleRecord(
    active,
    PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    '2026-09-23T08:00:00Z',
  )
  assert.throws(
    () => transitionAssignmentLifecycleRecord(
      completed,
      PRIVATE_ASSIGNMENT_STATE.ACTIVE,
      '2026-09-23T09:00:00Z',
    ),
    /transition/i,
  )

  const revoked = revokeAssignmentLifecycleRecord(
    completed,
    '2026-09-23T10:00:00Z',
  )
  assert.throws(
    () => transitionAssignmentLifecycleRecord(
      revoked,
      PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
      '2026-09-23T11:00:00Z',
    ),
    /revoked/i,
  )
})

test('TD-05 revoke preserves current lifecycle state and exact assignment', () => {
  const assignment = scoreAssignment()
  const completed = transitionAssignmentLifecycleRecord(
    createInitialAssignmentLifecycleRecord(assignment),
    PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    '2026-09-23T08:00:00Z',
  )
  const revoked = revokeAssignmentLifecycleRecord(
    completed,
    '2026-09-23T10:00:00Z',
  )

  assert.equal(revoked.assignment, assignment)
  assert.equal(revoked.state, PRIVATE_ASSIGNMENT_STATE.COMPLETED)
  assert.equal(revoked.stateChangedAt, completed.stateChangedAt)
  assert.equal(revoked.revokedAt, '2026-09-23T10:00:00Z')
})

test('TD-05 lifecycle validator rejects mutable clone and substituted original assignment', () => {
  const assignment = scoreAssignment()
  const record = createInitialAssignmentLifecycleRecord(assignment)

  assert.equal(isAssignmentLifecycleRecord(structuredClone(record)), false)

  const other = scoreAssignment({
    assignmentId: 'assignment-other',
    studentId: 'student-b',
  })
  assert.equal(
    isAssignmentLifecycleRecord(Object.freeze({
      ...record,
      assignment: other,
    })),
    false,
  )
})
```

Also test malformed timestamps, unsupported fields, accessor/symbol-backed inputs, double direct revoke, and invalid initial assignment.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/assignmentLifecycleRecord.test.js
```

Expected: FAIL because `src/services/assignmentLifecycleRecord.js` does not exist.

- [ ] **Step 3: Implement the minimal lifecycle record module**

Create `src/services/assignmentLifecycleRecord.js` using the existing strict validation helpers.

Core implementation shape:

```js
import {
  PRIVATE_ASSIGNMENT_STATE,
  isAllowedTeacherAssignmentTransition,
  isPrivateAssignment,
} from './privateAssignment.js'
import {
  isStrictFrozenRecord,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

export const ASSIGNMENT_LIFECYCLE_SCHEMA_VERSION = 1

const RECORD_FIELDS = Object.freeze([
  'schemaVersion',
  'assignment',
  'state',
  'stateChangedAt',
  'revokedAt',
])

function assertInitialAssignment(assignment) {
  if (!isPrivateAssignment(assignment)) {
    throw new TypeError(
      'assignment must be a valid immutable initial SCORE PrivateAssignment.',
    )
  }
  return assignment
}

export function createInitialAssignmentLifecycleRecord(assignment) {
  const trusted = assertInitialAssignment(assignment)

  return Object.freeze({
    schemaVersion: ASSIGNMENT_LIFECYCLE_SCHEMA_VERSION,
    assignment: trusted,
    state: PRIVATE_ASSIGNMENT_STATE.ACTIVE,
    stateChangedAt: trusted.assignedAt,
    revokedAt: null,
  })
}

export function isAssignmentLifecycleRecord(value) {
  try {
    if (
      value?.schemaVersion !== ASSIGNMENT_LIFECYCLE_SCHEMA_VERSION ||
      !isStrictFrozenRecord(value, RECORD_FIELDS) ||
      !isPrivateAssignment(value.assignment) ||
      !Object.values(PRIVATE_ASSIGNMENT_STATE).includes(value.state)
    ) {
      return false
    }

    if (
      normalizeRequiredTimestamp(
        value.stateChangedAt,
        'stateChangedAt',
      ) !== value.stateChangedAt
    ) {
      return false
    }

    if (value.state === PRIVATE_ASSIGNMENT_STATE.ACTIVE) {
      if (value.stateChangedAt !== value.assignment.assignedAt) {
        return false
      }
    }

    if (value.revokedAt !== null) {
      if (
        normalizeRequiredTimestamp(value.revokedAt, 'revokedAt') !==
        value.revokedAt
      ) {
        return false
      }
    }

    return true
  } catch {
    return false
  }
}

export function transitionAssignmentLifecycleRecord(
  record,
  toState,
  transitionedAt,
) {
  if (!isAssignmentLifecycleRecord(record)) {
    throw new TypeError(
      'record must be a valid immutable AssignmentLifecycleRecord.',
    )
  }
  if (record.revokedAt !== null) {
    throw new Error('assignment-lifecycle-revoked')
  }
  if (!Object.values(PRIVATE_ASSIGNMENT_STATE).includes(toState)) {
    throw new TypeError('toState must be a supported assignment state.')
  }
  if (record.state === toState) return record
  if (!isAllowedTeacherAssignmentTransition(record.state, toState)) {
    throw new Error(
      `assignment-lifecycle-transition-not-allowed:${record.state}:${toState}`,
    )
  }

  return Object.freeze({
    schemaVersion: ASSIGNMENT_LIFECYCLE_SCHEMA_VERSION,
    assignment: record.assignment,
    state: toState,
    stateChangedAt: normalizeRequiredTimestamp(
      transitionedAt,
      'transitionedAt',
    ),
    revokedAt: null,
  })
}

export function revokeAssignmentLifecycleRecord(record, revokedAt) {
  if (!isAssignmentLifecycleRecord(record)) {
    throw new TypeError(
      'record must be a valid immutable AssignmentLifecycleRecord.',
    )
  }
  if (record.revokedAt !== null) return record

  return Object.freeze({
    schemaVersion: ASSIGNMENT_LIFECYCLE_SCHEMA_VERSION,
    assignment: record.assignment,
    state: record.state,
    stateChangedAt: record.stateChangedAt,
    revokedAt: normalizeRequiredTimestamp(revokedAt, 'revokedAt'),
  })
}
```

If the strict record helper rejects any case differently, preserve its existing semantics rather than weakening it.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test tests/assignmentLifecycleRecord.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/services/assignmentLifecycleRecord.js tests/assignmentLifecycleRecord.test.js
git commit -m "feat: add TD-05 assignment lifecycle record"
```

---

### Task 2: In-Memory Lifecycle Repository and Immutable History

**Files:**
- Create: `src/services/teacherAssignmentLifecycleRepository.js`
- Test: `tests/teacherAssignmentLifecycleRepository.test.js`

**Interfaces:**
- Consumes Task 1:
  - `createInitialAssignmentLifecycleRecord(assignment)`
  - `transitionAssignmentLifecycleRecord(record, toState, transitionedAt)`
  - `revokeAssignmentLifecycleRecord(record, revokedAt)`
  - `isAssignmentLifecycleRecord(value)`
- Produces:
  - `assertTeacherAssignmentLifecycleRepository(repository)`
  - `createInMemoryTeacherAssignmentLifecycleRepository(initialRecords = [])`
- Repository methods:
  - `list()`
  - `getByAssignmentId(assignmentId)`
  - `history(assignmentId)`
  - `transition({ assignment, toState, transitionedAt })`
  - `revoke({ assignment, revokedAt })`

- [ ] **Step 1: Write failing repository tests**

Create `tests/teacherAssignmentLifecycleRepository.test.js`.

Cover:

```js
test('TD-05 repository stores immutable current record and mutation history', () => {
  const assignment = scoreAssignment()
  const repository =
    createInMemoryTeacherAssignmentLifecycleRepository()

  const completed = repository.transition({
    assignment,
    toState: PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    transitionedAt: '2026-09-23T08:00:00Z',
  })
  const repertoire = repository.transition({
    assignment,
    toState: PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
    transitionedAt: '2026-09-23T09:00:00Z',
  })

  assert.equal(repository.getByAssignmentId(assignment.assignmentId), repertoire)
  assert.deepEqual(repository.history(assignment.assignmentId), [
    completed,
    repertoire,
  ])
  assert.equal(Object.isFrozen(repository.history(assignment.assignmentId)), true)
})

test('TD-05 repository transition retry is idempotent and does not append history', () => {
  const assignment = scoreAssignment()
  const repository =
    createInMemoryTeacherAssignmentLifecycleRepository()

  const first = repository.transition({
    assignment,
    toState: PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    transitionedAt: '2026-09-23T08:00:00Z',
  })
  const retry = repository.transition({
    assignment,
    toState: PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    transitionedAt: '2026-09-23T08:30:00Z',
  })

  assert.equal(retry, first)
  assert.equal(repository.history(assignment.assignmentId).length, 1)
  assert.equal(retry.stateChangedAt, '2026-09-23T08:00:00Z')
})

test('TD-05 repository repeated revoke preserves original revokedAt and history', () => {
  const assignment = scoreAssignment()
  const repository =
    createInMemoryTeacherAssignmentLifecycleRepository()

  const first = repository.revoke({
    assignment,
    revokedAt: '2026-09-23T10:00:00Z',
  })
  const retry = repository.revoke({
    assignment,
    revokedAt: '2026-09-23T11:00:00Z',
  })

  assert.equal(retry, first)
  assert.equal(retry.revokedAt, '2026-09-23T10:00:00Z')
  assert.equal(repository.history(assignment.assignmentId).length, 1)
})

test('TD-05 repository rejects a different original assignment for an existing lifecycle identity', () => {
  const assignment = scoreAssignment()
  const repository =
    createInMemoryTeacherAssignmentLifecycleRepository()

  repository.transition({
    assignment,
    toState: PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    transitionedAt: '2026-09-23T08:00:00Z',
  })

  const substituted = scoreAssignment({
    assignmentId: assignment.assignmentId,
    studentId: 'student-b',
  })

  assert.throws(
    () => repository.revoke({
      assignment: substituted,
      revokedAt: '2026-09-23T10:00:00Z',
    }),
    /identity|assignment/i,
  )
})

test('TD-05 repository blocks transition after revoke without changing history', () => {
  const assignment = scoreAssignment()
  const repository =
    createInMemoryTeacherAssignmentLifecycleRepository()

  repository.revoke({
    assignment,
    revokedAt: '2026-09-23T10:00:00Z',
  })
  const before = repository.history(assignment.assignmentId)

  assert.throws(
    () => repository.transition({
      assignment,
      toState: PRIVATE_ASSIGNMENT_STATE.COMPLETED,
      transitionedAt: '2026-09-23T11:00:00Z',
    }),
    /revoked/i,
  )
  assert.deepEqual(repository.history(assignment.assignmentId), before)
})
```

Also test strict method input objects, malformed initial records, duplicate initial assignmentId, deterministic `list()`, unknown `history()` returning a frozen empty array, no delete/restore methods, and malformed assignment rejection before mutation.

- [ ] **Step 2: Run repository tests and verify RED**

```bash
node --test tests/teacherAssignmentLifecycleRepository.test.js
```

Expected: FAIL because repository module does not exist.

- [ ] **Step 3: Implement minimal repository**

Use Maps keyed by normalized assignmentId. Keep `currentById`, `historyById`, and deterministic `order`.

Mutation algorithm:

```js
function currentOrInitial(assignment) {
  const existing = currentById.get(assignment.assignmentId) ?? null

  if (existing === null) {
    return createInitialAssignmentLifecycleRecord(assignment)
  }

  if (existing.assignment !== assignment) {
    throw new Error(
      `teacher-assignment-lifecycle-identity-mismatch:${assignment.assignmentId}`,
    )
  }

  return existing
}

function append(record) {
  const id = record.assignment.assignmentId
  if (!historyById.has(id)) {
    historyById.set(id, [])
    order.push(id)
  }
  historyById.get(id).push(record)
  currentById.set(id, record)
  return record
}
```

Repository methods:

```js
transition(input = {}) {
  assertStrictInputObject(
    input,
    ['assignment', 'toState', 'transitionedAt'],
    'AssignmentLifecycleTransition',
  )

  const current = currentOrInitial(
    assertInitialAssignment(input.assignment),
  )
  const next = transitionAssignmentLifecycleRecord(
    current,
    input.toState,
    input.transitionedAt,
  )

  if (next === current) return current
  return append(next)
},

revoke(input = {}) {
  assertStrictInputObject(
    input,
    ['assignment', 'revokedAt'],
    'AssignmentLifecycleRevoke',
  )

  const current = currentOrInitial(
    assertInitialAssignment(input.assignment),
  )
  const next = revokeAssignmentLifecycleRecord(
    current,
    input.revokedAt,
  )

  if (next === current) return current
  return append(next)
}
```

`list()` returns only persisted lifecycle overlays, frozen and in first-mutation order. `history(id)` returns a new frozen array snapshot.

The repository object itself is frozen and exposes no `delete`, `restore`, or `unrevoke`.

- [ ] **Step 4: Run repository + record tests**

```bash
node --test   tests/assignmentLifecycleRecord.test.js   tests/teacherAssignmentLifecycleRepository.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/services/teacherAssignmentLifecycleRepository.js tests/teacherAssignmentLifecycleRepository.test.js
git commit -m "feat: add TD-05 lifecycle repository"
```

---

### Task 3: Teacher Assignment Lifecycle Service

**Files:**
- Create: `src/services/teacherAssignmentLifecycleService.js`
- Test: `tests/teacherAssignmentLifecycleService.test.js`

**Interfaces:**
- Consumes TD-04 assignment repository:
  - `list()`
  - `getByAssignmentId(assignmentId)`
- Consumes Task 2 lifecycle repository:
  - `getByAssignmentId(assignmentId)`
  - `transition(input)`
  - `revoke(input)`
  - `history(assignmentId)`
- Produces:
  - `createTeacherAssignmentLifecycleService({ assignmentRepository, lifecycleRepository, now })`
  - returned methods:
    - `listAssignments()`
    - `markCompleted(assignmentId)`
    - `moveToRepertoire(assignmentId)`
    - `revokeAssignment(assignmentId)`
    - `getAssignmentHistory(assignmentId)`

- [ ] **Step 1: Write failing service tests**

Build fixtures from the real TD-04 `createInMemoryTeacherScoreAssignmentRepository()`.

Pin missing-overlay behavior:

```js
test('TD-05 service lists TD-04 assignments as effective ACTIVE without persisting an overlay', () => {
  const assignment = scoreAssignment()
  const assignmentRepository =
    createInMemoryTeacherScoreAssignmentRepository([assignment])
  const lifecycleRepository =
    createInMemoryTeacherAssignmentLifecycleRepository()

  const service = lifecycleService({
    assignmentRepository,
    lifecycleRepository,
  })

  const rows = service.listAssignments()

  assert.equal(rows.length, 1)
  assert.equal(rows[0].assignment, assignment)
  assert.equal(rows[0].state, PRIVATE_ASSIGNMENT_STATE.ACTIVE)
  assert.equal(rows[0].revokedAt, null)
  assert.deepEqual(lifecycleRepository.list(), [])
})
```

Pin transitions and exact assignment preservation:

```js
test('TD-05 service completes then promotes exact original assignment', () => {
  const assignment = scoreAssignment()
  const service = lifecycleServiceWithAssignment(assignment)

  const completed = service.markCompleted(assignment.assignmentId)
  const repertoire = service.moveToRepertoire(assignment.assignmentId)

  assert.equal(completed.assignment, assignment)
  assert.equal(repertoire.assignment, assignment)
  assert.equal(repertoire.state, PRIVATE_ASSIGNMENT_STATE.REPERTOIRE)
  assert.equal(repertoire.assignment.sourceRef, assignment.sourceRef)
})
```

Pin idempotency and time:

```js
test('TD-05 service idempotent retry does not call now again', () => {
  const assignment = scoreAssignment()
  let nowCalls = 0
  const service = lifecycleServiceWithAssignment(assignment, {
    now() {
      nowCalls += 1
      return nowCalls === 1
        ? '2026-09-23T08:00:00Z'
        : '2026-09-23T09:00:00Z'
    },
  })

  const first = service.markCompleted(assignment.assignmentId)
  const retry = service.markCompleted(assignment.assignmentId)

  assert.equal(first, retry)
  assert.equal(nowCalls, 1)
})
```

Pin revoke from all states and no post-revoke transition.

Pin Review Focus #1 with a custom adapter:

```js
test('TD-05 service rejects a valid acknowledgement bound to another original assignment', () => {
  const expected = scoreAssignment()
  const other = scoreAssignment({
    assignmentId: 'assignment-other',
    studentId: 'student-b',
  })
  const baseLifecycle =
    createInMemoryTeacherAssignmentLifecycleRepository()
  const wrongAck = transitionAssignmentLifecycleRecord(
    createInitialAssignmentLifecycleRecord(other),
    PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    '2026-09-23T08:00:00Z',
  )

  const service = lifecycleServiceWithAssignment(expected, {
    lifecycleRepository: {
      ...baseLifecycle,
      transition() {
        return wrongAck
      },
    },
  })

  assert.throws(
    () => service.markCompleted(expected.assignmentId),
    /acknowledgement|mismatch/i,
  )
})
```

Pin Review Focus #4:
- assignment repository `list()` returns mutable/malformed assignment → fail closed;
- duplicate assignment IDs in list → fail closed;
- lifecycle lookup returns malformed record → fail closed;
- lifecycle lookup returns valid record bound to a different exact assignment → fail closed.

Also test unknown assignment, normalized ID lookup, illegal skipped/reverse action, malformed `now()` output called exactly once, frozen list/history outputs, and repeated revoke skips `now()`.

- [ ] **Step 2: Run service tests and verify RED**

```bash
node --test tests/teacherAssignmentLifecycleService.test.js
```

Expected: FAIL because service module does not exist.

- [ ] **Step 3: Implement service dependency assertions**

The assignment repository assertion is local to TD-05 so TD-04 code remains unchanged:

```js
function assertAssignmentRepository(repository) {
  if (
    !repository ||
    typeof repository !== 'object' ||
    typeof repository.list !== 'function' ||
    typeof repository.getByAssignmentId !== 'function'
  ) {
    throw new TypeError(
      'teacher assignment repository must provide list() and getByAssignmentId().',
    )
  }
  return repository
}
```

Use `assertTeacherAssignmentLifecycleRepository()` for the TD-05 repository and validate `now` is a function.

- [ ] **Step 4: Implement exact assignment + current lifecycle resolution**

Use helpers with strict validation:

```js
function resolveAssignment(id) {
  const assignment =
    trustedAssignmentRepository.getByAssignmentId(id)

  if (assignment === null || assignment === undefined) {
    throw new Error(
      `teacher-assignment-not-found:${id}`,
    )
  }
  if (!isPrivateAssignment(assignment)) {
    throw new TypeError(
      'teacher assignment repository lookup must return a valid immutable PrivateAssignment.',
    )
  }
  if (assignment.assignmentId !== id) {
    throw new Error(
      `teacher-assignment-identity-mismatch:${id}`,
    )
  }

  return assignment
}

function resolveCurrent(assignment) {
  const current =
    trustedLifecycleRepository.getByAssignmentId(
      assignment.assignmentId,
    )

  if (current === null || current === undefined) {
    return createInitialAssignmentLifecycleRecord(
      assignment,
    )
  }
  if (
    !isAssignmentLifecycleRecord(current) ||
    current.assignment !== assignment
  ) {
    throw new Error(
      'teacher assignment lifecycle lookup mismatch.',
    )
  }

  return current
}
```

For `listAssignments()`, validate the assignment repository array, every row, unique assignmentId, and every overlay. Build effective records without persisting missing overlays.

- [ ] **Step 5: Implement acknowledgement validation**

```js
function assertLifecycleAcknowledgement(
  acknowledgement,
  assignment,
  expectedState,
  expectedRevokedAt,
) {
  if (!isAssignmentLifecycleRecord(acknowledgement)) {
    throw new Error(
      'teacher assignment lifecycle repository acknowledgement is invalid.',
    )
  }
  if (
    acknowledgement.assignment !== assignment ||
    acknowledgement.assignment.assignmentId !== assignment.assignmentId ||
    acknowledgement.assignment.studentId !== assignment.studentId ||
    acknowledgement.state !== expectedState ||
    acknowledgement.revokedAt !== expectedRevokedAt
  ) {
    throw new Error(
      'teacher assignment lifecycle repository acknowledgement mismatch.',
    )
  }
  return acknowledgement
}
```

Do not compare only IDs; exact original assignment object identity is required.

- [ ] **Step 6: Implement idempotent transition orchestration**

```js
function transitionTo(assignmentId, toState) {
  const id = normalizeRequiredId(
    assignmentId,
    'assignmentId',
  )
  const assignment = resolveAssignment(id)
  const current = resolveCurrent(assignment)

  if (current.revokedAt !== null) {
    throw new Error(
      `teacher-assignment-lifecycle-revoked:${id}`,
    )
  }
  if (current.state === toState) {
    return current
  }
  if (
    !isAllowedTeacherAssignmentTransition(
      current.state,
      toState,
    )
  ) {
    throw new Error(
      `teacher-assignment-transition-not-allowed:${current.state}:${toState}`,
    )
  }

  const transitionedAt =
    normalizeRequiredTimestamp(
      now(),
      'transitionedAt',
    )

  const acknowledgement =
    trustedLifecycleRepository.transition({
      assignment,
      toState,
      transitionedAt,
    })

  return assertLifecycleAcknowledgement(
    acknowledgement,
    assignment,
    toState,
    null,
  )
}
```

Expose:
- `markCompleted(id)` → `transitionTo(id, COMPLETED)`
- `moveToRepertoire(id)` → `transitionTo(id, REPERTOIRE)`

- [ ] **Step 7: Implement idempotent revoke orchestration**

```js
function revokeAssignment(assignmentId) {
  const id = normalizeRequiredId(
    assignmentId,
    'assignmentId',
  )
  const assignment = resolveAssignment(id)
  const current = resolveCurrent(assignment)

  if (current.revokedAt !== null) {
    return current
  }

  const revokedAt = normalizeRequiredTimestamp(
    now(),
    'revokedAt',
  )
  const acknowledgement =
    trustedLifecycleRepository.revoke({
      assignment,
      revokedAt,
    })

  return assertLifecycleAcknowledgement(
    acknowledgement,
    assignment,
    current.state,
    revokedAt,
  )
}
```

- [ ] **Step 8: Run Task 1–3 tests**

```bash
node --test   tests/assignmentLifecycleRecord.test.js   tests/teacherAssignmentLifecycleRepository.test.js   tests/teacherAssignmentLifecycleService.test.js
```

Expected: PASS.

- [ ] **Step 9: Run TD-04 regression tests before committing**

```bash
node --test   tests/privateAssignment.test.js   tests/teacherScoreAssignmentRepository.test.js   tests/teacherScoreAssignmentService.test.js
```

Expected: PASS with unchanged TD-04 semantics.

- [ ] **Step 10: Commit Task 3**

```bash
git add src/services/teacherAssignmentLifecycleService.js tests/teacherAssignmentLifecycleService.test.js
git commit -m "feat: add TD-05 lifecycle service"
```

---

### Task 4: Teacher Lifecycle Controller and Safe Presentation Model

**Files:**
- Create: `src/services/teacherAssignmentLifecycleController.js`
- Test: `tests/teacherAssignmentLifecycleController.test.js`

**Interfaces:**
- Consumes service methods:
  - `listAssignments()`
  - `markCompleted(id)`
  - `moveToRepertoire(id)`
  - `revokeAssignment(id)`
- Consumes trusted roster presentation:
  - `rosterService.listStudents({ includeInactive: true })`
- Produces:
  - `createTeacherAssignmentLifecycleController({ lifecycleService, rosterService })`
  - returned:
    - `getViewModel()`
    - `markCompleted(id)`
    - `moveToRepertoire(id)`
    - `revoke(id)`

View rows:

```js
{
  assignmentId,
  displayNameOrNickname,
  teacherNote,
  state,
  revoked,
}
```

No sourceRef, revision/evidence/auth IDs, provider diagnostics, or recipient arrays are exposed.

- [ ] **Step 1: Write failing controller tests**

Pin teacher-safe view output:

```js
test('TD-05 controller exposes lifecycle presentation without source diagnostics', () => {
  const view = controllerFixture().getViewModel()
  const row = view.assignments[0]

  assert.equal(Object.isFrozen(view), true)
  assert.equal(Object.isFrozen(view.assignments), true)
  assert.equal(row.displayNameOrNickname, 'Ada')
  assert.equal(row.state, PRIVATE_ASSIGNMENT_STATE.ACTIVE)
  assert.equal(row.revoked, false)
  assert.equal(Object.hasOwn(row, 'sourceRef'), false)
  assert.equal(Object.hasOwn(row, 'revisionId'), false)
  assert.equal(Object.hasOwn(row, 'authorizationId'), false)
})
```

Pin Review Focus #3:

```js
test('TD-05 controller keeps an assignment manageable when roster presentation is missing', () => {
  const view = controllerFixture({
    rosterStudents: Object.freeze([]),
  }).getViewModel()

  assert.equal(view.assignments.length, 1)
  assert.equal(
    view.assignments[0].displayNameOrNickname,
    'Öğrenci',
  )
  assert.equal(
    view.assignments[0].assignmentId,
    'assignment-a',
  )
})
```

The fallback must not expose `student-a` as display text.

Pin bounded action copy:
- success complete → `Ödev tamamlandı.`
- success repertoire → `Ödev repertuara eklendi.`
- success revoke → `Ödev geri çekildi.`
- not found → `Ödev bulunamadı.`
- illegal transition → `Bu işlem mevcut ödev durumunda yapılamaz.`
- revoked transition → `Geri çekilmiş ödev değiştirilemez.`
- acknowledgement → `Ödev işlemi doğrulanamadı.`
- unknown raw technical error → `Ödev güncellenemedi.` and raw secret absent.

- [ ] **Step 2: Run controller tests and verify RED**

```bash
node --test tests/teacherAssignmentLifecycleController.test.js
```

Expected: FAIL because controller module does not exist.

- [ ] **Step 3: Implement controller view model**

Build a roster presentation map from `listStudents({ includeInactive: true })`.

For each lifecycle record, produce only the bounded UI row.

```js
function getViewModel() {
  const lifecycleRows =
    lifecycleService.listAssignments()
  const students =
    rosterService.listStudents({
      includeInactive: true,
    })
  const names = new Map(
    students.map((student) => [
      student.studentId,
      student.displayNameOrNickname,
    ]),
  )

  return Object.freeze({
    assignments: Object.freeze(
      lifecycleRows.map((record) =>
        Object.freeze({
          assignmentId:
            record.assignment.assignmentId,
          displayNameOrNickname:
            names.get(
              record.assignment.studentId,
            ) || 'Öğrenci',
          teacherNote:
            record.assignment.teacherNote,
          state: record.state,
          revoked: record.revokedAt !== null,
        }),
      ),
    ),
  })
}
```

Validate lifecycleService and rosterService method surfaces in constructor.

- [ ] **Step 4: Implement bounded action wrappers**

Each action catches domain errors and returns:

```js
Object.freeze({
  ok: true,
  record,
  message: '...',
})
```

or:

```js
Object.freeze({
  ok: false,
  record: null,
  message: teacherMessage(error),
})
```

Map errors with regex patterns but never return raw `error.message`.

- [ ] **Step 5: Run controller + service tests**

```bash
node --test   tests/teacherAssignmentLifecycleService.test.js   tests/teacherAssignmentLifecycleController.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/services/teacherAssignmentLifecycleController.js tests/teacherAssignmentLifecycleController.test.js
git commit -m "feat: add TD-05 lifecycle controller"
```

---

### Task 5: Explicit-Mount Teacher Lifecycle UI

**Files:**
- Create: `src/teacherAssignmentLifecycleUi.js`
- Test: `tests/teacherAssignmentLifecycleUi.test.js`
- Reuse: `tests/support/fakeTeacherPoolDom.js`

**Interfaces:**
- Consumes controller:
  - `getViewModel()`
  - `markCompleted(id)`
  - `moveToRepertoire(id)`
  - `revoke(id)`
- Produces:
  - `mountTeacherAssignmentLifecycleUi({ root = document, host, controller })`
  - return `{ refresh, destroy }`

- [ ] **Step 1: Write failing UI tests**

Pin explicit-mount copy:

```js
test('TD-05 UI mounts Ödev Yönetimi and never claims delivery', () => {
  const { host } = mount()

  assert.equal(
    host.querySelector('h2').textContent,
    'Ödev Yönetimi',
  )
  assert.doesNotMatch(
    host.textContent,
    /Gönderildi|Teslim edildi|Öğrenciye gönder/i,
  )
})
```

Pin state actions:

```js
test('TD-05 UI renders only valid actions for ACTIVE and COMPLETED rows', () => {
  const { host } = mount({
    assignments: Object.freeze([
      row({
        assignmentId: 'assignment-active',
        state: PRIVATE_ASSIGNMENT_STATE.ACTIVE,
      }),
      row({
        assignmentId: 'assignment-completed',
        state: PRIVATE_ASSIGNMENT_STATE.COMPLETED,
      }),
    ]),
  })

  const active = article(host, 'assignment-active')
  assert.equal(button(active, 'Tamamlandı') !== null, true)
  assert.equal(button(active, 'Repertuara Ekle'), null)
  assert.equal(button(active, 'Geri Çek') !== null, true)

  const completed = article(host, 'assignment-completed')
  assert.equal(button(completed, 'Tamamlandı'), null)
  assert.equal(button(completed, 'Repertuara Ekle') !== null, true)
  assert.equal(button(completed, 'Geri Çek') !== null, true)
})
```

Pin Review Focus #5:

```js
test('TD-05 UI renders revoked REPERTOIRE history with no mutation buttons', () => {
  const { host } = mount({
    assignments: Object.freeze([
      row({
        assignmentId: 'assignment-r',
        state: PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
        revoked: true,
      }),
    ]),
  })

  const item = article(host, 'assignment-r')
  assert.match(item.textContent, /Geri çekildi/)
  assert.equal(item.querySelectorAll('button').length, 0)
})
```

Also test:
- REPERTOIRE non-revoked gets only Geri Çek;
- teacher note and display name render but assignmentId is not visible text;
- click Tamamlandı calls exact assignment ID and refreshes on success;
- click Repertuara Ekle calls exact assignment ID and refreshes on success;
- click Geri Çek calls exact assignment ID and refreshes on success;
- failed action shows bounded message and does not refresh;
- `destroy()` removes only its own section.

- [ ] **Step 2: Run UI tests and verify RED**

```bash
node --test tests/teacherAssignmentLifecycleUi.test.js
```

Expected: FAIL because UI module does not exist.

- [ ] **Step 3: Implement explicit mount UI**

Use the established teacher UI pattern.

Core rendering shape:

```js
function renderRows(rows) {
  list.replaceChildren()

  for (const row of rows) {
    const article = element(
      root,
      'article',
      'teacher-assignment-lifecycle__item',
    )
    article.dataset.assignmentId =
      row.assignmentId

    const student = element(root, 'h3')
    student.textContent =
      row.displayNameOrNickname
    article.appendChild(student)

    if (row.teacherNote) {
      const note = element(root, 'p')
      note.textContent = row.teacherNote
      article.appendChild(note)
    }

    const state = element(root, 'span')
    state.textContent = row.revoked
      ? 'Geri çekildi'
      : row.state === 'ACTIVE'
        ? 'Aktif'
        : row.state === 'COMPLETED'
          ? 'Tamamlandı'
          : 'Repertuar'
    article.appendChild(state)

    if (!row.revoked) {
      if (row.state === 'ACTIVE') {
        article.appendChild(
          actionButton(
            'Tamamlandı',
            () => controller.markCompleted(
              row.assignmentId,
            ),
          ),
        )
      } else if (row.state === 'COMPLETED') {
        article.appendChild(
          actionButton(
            'Repertuara Ekle',
            () => controller.moveToRepertoire(
              row.assignmentId,
            ),
          ),
        )
      }

      article.appendChild(
        actionButton(
          'Geri Çek',
          () => controller.revoke(
            row.assignmentId,
          ),
        ),
      )
    }

    list.appendChild(article)
  }
}
```

Every action handler:
1. calls controller;
2. sets `role=status` message;
3. calls `refresh()` only when `result.ok === true`.

Do not import or wire this module from production entry points.

- [ ] **Step 4: Run UI/controller tests**

```bash
node --test   tests/teacherAssignmentLifecycleController.test.js   tests/teacherAssignmentLifecycleUi.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/teacherAssignmentLifecycleUi.js tests/teacherAssignmentLifecycleUi.test.js
git commit -m "feat: add TD-05 lifecycle management UI"
```

---

### Task 6: Security Boundaries, Regression Locks, Documentation, and Exact Verification

**Files:**
- Create: `tests/teacherAssignmentLifecycleSecurity.test.js`
- Create: `docs/teacher-delivery-td05-assignment-lifecycle.md`
- Verify unchanged:
  - `src/services/privateAssignment.js`
  - `src/services/teacherScoreAssignmentService.js`
  - `main.js`
  - `src/app.js`
  - `src/appShell.js`

**Interfaces:**
- No new production API.
- This task locks architectural boundaries and produces final verification evidence.

- [ ] **Step 1: Write failing security/boundary tests**

Create `tests/teacherAssignmentLifecycleSecurity.test.js`.

Provider/network boundary:

```js
const td05Sources = [
  '../src/services/assignmentLifecycleRecord.js',
  '../src/services/teacherAssignmentLifecycleRepository.js',
  '../src/services/teacherAssignmentLifecycleService.js',
  '../src/services/teacherAssignmentLifecycleController.js',
  '../src/teacherAssignmentLifecycleUi.js',
]

test('TD-05 contains no provider network browser persistence or Student App implementation', () => {
  for (const path of td05Sources) {
    const source = readFileSync(
      new URL(path, import.meta.url),
      'utf8',
    )

    assert.doesNotMatch(
      source,
      /firebase|firestore|adminCredential|listUsers\s*\(|fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|bearer|token|student-app|st-student-app/i,
      path,
    )
  }
})
```

No production auto-mount:

```js
test('TD-05 does not production-mount lifecycle UI', () => {
  for (const path of [
    '../main.js',
    '../src/app.js',
    '../src/appShell.js',
  ]) {
    const source = readFileSync(
      new URL(path, import.meta.url),
      'utf8',
    )

    assert.doesNotMatch(
      source,
      /teacherAssignmentLifecycleUi|mountTeacherAssignmentLifecycleUi|teacher-assignment-lifecycle/i,
      path,
    )
  }
})
```

Preserve TD-04 initial contract:

```js
test('TD-05 preserves initial PrivateAssignment validator boundary', () => {
  const source = readFileSync(
    new URL(
      '../src/services/privateAssignment.js',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(
    source,
    /value\.state\s*!==\s*PRIVATE_ASSIGNMENT_STATE\.ACTIVE/,
  )
  assert.match(
    source,
    /value\.revokedAt\s*!==\s*null/,
  )
})
```

No delivery copy:

```js
test('TD-05 teacher UI copy never claims student delivery', () => {
  const source = readFileSync(
    new URL(
      '../src/teacherAssignmentLifecycleUi.js',
      import.meta.url,
    ),
    'utf8',
  )

  assert.doesNotMatch(
    source,
    /Gönderildi|Teslim edildi|Öğrenciye gönder/i,
  )
})
```

Keep Stage L boundary by reusing the same assertions as TD-04 security tests:
- `STAGE_L_DELIVERY_STATE = 'not_implemented'`
- `deliveryAllowed: false`

- [ ] **Step 2: Run security test and make any boundary-only corrections**

```bash
node --test tests/teacherAssignmentLifecycleSecurity.test.js
```

Expected: PASS once Tasks 1–5 comply.

If it fails because production code contains a prohibited behavior, correct only the TD-05 code that introduced it. Do not weaken the test to permit Firebase/network/Student App/autowiring.

- [ ] **Step 3: Write durable TD-05 implementation summary**

Create `docs/teacher-delivery-td05-assignment-lifecycle.md` containing:

```markdown
# TD-05 — Assignment Lifecycle and Revoke

## Boundary
TD-05 manages teacher-owned lifecycle state for prepared SCORE PrivateAssignment records. It does not deliver assignments to Student App.

## Model
PrivateAssignment v1 remains immutable. AssignmentLifecycleRecord is an orthogonal immutable overlay.

Missing overlay means effective ACTIVE + unrevoked.

## Lifecycle
ACTIVE -> COMPLETED -> REPERTOIRE only.
No reverse transition.
Revoke is one-way and orthogonal to lifecycle state.
Revoked assignments cannot transition.

## Idempotency
Same-target state retry returns current record without new history or timestamp.
Repeated revoke returns the original revoked record and timestamp.

## Repository truth
TD-04 repository owns original assignment/source identity.
TD-05 repository owns current lifecycle overlay and immutable mutation history.
Teacher success requires exact acknowledgement revalidation.

## UI boundary
Teacher copy uses Ödev Yönetimi / Hazırlanan Ödevler, Tamamlandı, Repertuara Ekle, Geri Çek.
It never claims delivery and is not production-mounted.

## Deferred
Authenticated persistence/delivery: TD-06.
CHORD_BOARD exact source: TD-07.
```

Do not add implementation-result claims until the actual exact-head verification has run. After verification, append the exact evidence in a final docs-only commit.

- [ ] **Step 4: Run all focused TD-05 tests**

```bash
node --test   tests/assignmentLifecycleRecord.test.js   tests/teacherAssignmentLifecycleRepository.test.js   tests/teacherAssignmentLifecycleService.test.js   tests/teacherAssignmentLifecycleController.test.js   tests/teacherAssignmentLifecycleUi.test.js   tests/teacherAssignmentLifecycleSecurity.test.js
```

Expected: PASS.

- [ ] **Step 5: Run TD-01 through TD-04 regression tests**

Run the known Teacher Delivery suites:

```bash
node --test   tests/teacherDeliveryContracts.test.js   tests/privateAssignment.test.js   tests/teacherRosterRepository.test.js   tests/teacherRosterService.test.js   tests/teacherPoolPublishingService.test.js   tests/teacherPoolPublishingController.test.js   tests/teacherPoolPublishingUi.test.js   tests/teacherPoolPublishingSecurity.test.js   tests/teacherScoreAssignmentRepository.test.js   tests/teacherScoreAssignmentService.test.js   tests/teacherScoreAssignmentController.test.js   tests/teacherScoreAssignmentUi.test.js   tests/teacherScoreAssignmentSecurity.test.js
```

If a listed historical file name differs on the execution branch, discover the exact existing TD-01–04 test file names and run the complete corresponding set; do not skip a stage.

Expected: PASS.

- [ ] **Step 6: Run the full repository test suite**

```bash
npm test
```

Expected: exit 0, zero failed tests.

Record the exact passed/failed counts from output; do not reuse historical 1819-test evidence.

- [ ] **Step 7: Run production build**

```bash
npm run build
```

Expected: exit 0.

Do not install or change production dependencies as part of this task. If the build environment lacks already-required dependencies, report the environment limitation instead of silently changing package state.

- [ ] **Step 8: Run protected browser / Playwright checks applicable to the branch**

Use the repository's current protected workflow commands and CI configuration discovered at execution time. At minimum, verify the same browser/protected layers required for TD-04 merge readiness when still present.

Do not substitute historical workflow results for the TD-05 exact head.

- [ ] **Step 9: Verify Sonar checks on exact PR head when CI exposes them**

Inspect exact-head workflow/check results and require repository-mandated SonarQube/SonarCloud checks to pass.

Do not change Sonar project/security settings under TD-05.

- [ ] **Step 10: Verify no unintended protected-file changes**

Run:

```bash
git diff --name-only <TD05_BASE_SHA>...HEAD
```

Expected production changes are limited to the five new TD-05 source files plus TD-05 tests/docs. In particular there must be no change to:
- `src/services/privateAssignment.js`
- `src/services/scoreAssignmentSourceBinding.js`
- `src/services/teacherScoreAssignmentRepository.js`
- `src/services/teacherScoreAssignmentService.js`
- `main.js`
- `src/app.js`
- `src/appShell.js`

- [ ] **Step 11: Run exact-head base-drift check**

Immediately before merge-readiness:

```bash
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main
git merge-base HEAD origin/main
```

If main moved, inspect the changed surface and rebase/merge only through the approved branch workflow, then rerun affected verification. Do not claim merge-ready from stale-base evidence.

- [ ] **Step 12: Append exact verification evidence to TD-05 summary doc**

Only after Steps 4–11 succeed, append:
- exact TD-05 PR head SHA;
- focused test result;
- TD-01–04 regression result;
- full `npm test` passed/failed count;
- build result;
- protected browser/Playwright result;
- SonarQube/SonarCloud result when applicable;
- exact base SHA / drift result.

Never copy the TD-04 `1819/1819` count unless the new run independently produces that exact number.

- [ ] **Step 13: Commit Task 6**

```bash
git add tests/teacherAssignmentLifecycleSecurity.test.js docs/teacher-delivery-td05-assignment-lifecycle.md
git commit -m "test: lock TD-05 lifecycle boundaries"
```

If Step 12 adds verification evidence after CI/check completion, make one final docs-only verification commit with an explicit message such as:

```bash
git add docs/teacher-delivery-td05-assignment-lifecycle.md
git commit -m "docs: record TD-05 exact-head verification"
```

- [ ] **Step 14: Request independent code review before merge**

Use `superpowers:requesting-code-review` against the exact implementation branch head and the approved TD-05 spec/plan.

Review must explicitly check:
- immutable original assignment/sourceRef;
- forward-only transitions;
- revoke/idempotency;
- acknowledgement substitution resistance;
- privacy/copy boundaries;
- TD-04 regressions;
- no provider or production mount leakage.

Resolve review findings through the normal review/fix/reverification loop.

- [ ] **Step 15: Stop at merge-ready**

Report:
- exact branch and PR;
- exact head SHA;
- files changed;
- focused/full/build/protected/Sonar results;
- reviewer findings/resolution;
- base drift status;
- any residual risks.

Do not merge until the user explicitly approves merge.

---

## Plan Self-Review Result

- **Spec coverage:** all 28 TD-05 spec sections map to Tasks 1–6.
- **Placeholder scan:** no TBD, TODO, FIXME, “implement later”, or undefined neighboring API is permitted in execution.
- **Type/interface consistency:** all later tasks consume the exact function and method names defined earlier in this plan.
- **Review Focus coverage:** all five review-focus conditions are pinned by explicit tests in Tasks 3–5.
- **Scope:** TD-05 only. TD-06 and TD-07 remain blocked until TD-05 merge and post-merge verification.

## Execution Handoff

Recommended execution method: **Subagent-driven**.

Reason: lifecycle authority, privacy boundaries, immutable source identity, idempotency, and acknowledgement verification cross six sequential but independently reviewable tasks. A fresh reviewer after each task reduces the risk of silently weakening TD-04 contracts before the whole-branch review.
