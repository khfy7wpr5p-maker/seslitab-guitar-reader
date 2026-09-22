# TD-02 Teacher Roster + Management Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-neutral, read-only teacher roster snapshot/repository and management/preflight service that uses stable `studentId` identity, rejects duplicate authority records, and blocks unknown or inactive students before future Pool/assignment producer stages.

**Architecture:** TD-02 consumes the immutable `StudentRosterEntry` v1 contract merged by TD-01. A small synchronous repository contract represents an already-trusted roster snapshot; the reference implementation is in-memory and immutable. A separate teacher roster service revalidates every repository result, exposes stable-ID list/lookup/active-target preflight, and remains independent of Firebase, network, persistence, authentication and UI.

**Tech Stack:** Node.js 24, browser-compatible ES modules, Node `node:test`, existing TD-01 contract validation helpers, Vite production build. No new dependency.

**Spec:** `docs/superpowers/specs/2026-09-22-td02-teacher-roster-management-design.md`

## Global Constraints

- Protected `main` baseline at plan authoring: `d8d244cb1436eb9e2fd34a3b5a7ecf127aabf090`.
- Use a dedicated implementation branch/worktree; never implement on `main`.
- TD-02 consumes `StudentRosterEntry` v1 without widening its identity semantics.
- `studentId` is the only targeting identity.
- `displayNameOrNickname` is presentation-only and must never be accepted as lookup/authorization identity.
- Duplicate stable `studentId` records fail closed.
- Duplicate display names are valid.
- Inactive and unknown students cannot pass new-target preflight.
- Multi-target preflight is all-or-nothing and deduplicates stable IDs in first-selection order.
- No UI wiring.
- No roster CRUD UI.
- No student account creation.
- No Firebase/Admin SDK or Authentication user-list call.
- No Firestore/database/localStorage/IndexedDB.
- No fetch/WebSocket/network endpoint.
- No production authentication or security-rule change.
- No Pool publishing, assignment fan-out, assignment lifecycle or Student App work.
- No OMR/Audiveris/renderer/Smoosic/deployment change.
- No cross-repository write.
- No new dependency.
- The reference repository exposes read-only `list()` and `getByStudentId(studentId)`; it does not persist or mutate roster state.
- Production provider/auth/persistence selection remains deferred to TD-06.

## File Structure

### Create

- `src/services/teacherRosterRepository.js`
  - repository interface assertion;
  - immutable in-memory trusted-snapshot reference repository;
  - duplicate stable-ID rejection;
  - no persistence/network/mutation behavior.
- `src/services/teacherRosterService.js`
  - teacher-safe list/lookup;
  - exact active-student preflight;
  - all-or-nothing multi-student preflight;
  - revalidation of provider results.
- `tests/teacherRosterRepository.test.js`
- `tests/teacherRosterService.test.js`
- `tests/teacherRosterSecurity.test.js`
- `docs/teacher-delivery-td02-roster.md`

### Reuse without semantic widening

- `src/services/studentRosterEntry.js`
- `src/services/teacherDeliveryContractValidation.js`

### Do not modify unless a focused test proves an unavoidable compatibility defect

- `src/services/poolItem.js`
- `src/services/privateAssignment.js`
- `src/services/scoreAssignmentSourceBinding.js`
- Package 12 authorization/eligibility modules
- Stage L modules
- `main.js`
- `src/app.js`
- backend/deployment/OMR/renderer/Smoosic files

## Review Focus

1. **Untrusted adapter result:** a future provider adapter may return a mutable/forged roster row even though its method names match; the service must revalidate every row and fail closed. Task 2 pins this.
2. **Lookup identity mismatch:** `getByStudentId("student-a")` must fail if an adapter returns a valid frozen `student-b` row instead of silently accepting it. Task 2 pins this.
3. **Duplicate authority from adapter:** even if the reference repository prevents duplicates, a custom adapter returning duplicate stable IDs from `list()` must be rejected by the service. Task 2 pins this.
4. **Duplicate selection vs duplicate authority:** repeated UI-selected IDs must deduplicate in first-selection order, but duplicate repository identities must never be normalized away. Tasks 1–2 pin this distinction.
5. **Accidental provider/persistence creep:** TD-02 source must contain no Firebase/admin/network/browser-storage implementation or mutation API. Task 3 pins this.

---

### Task 1: Read-Only Teacher Roster Repository

**Files:**
- Create: `src/services/teacherRosterRepository.js`
- Create: `tests/teacherRosterRepository.test.js`
- Read-only dependency: `src/services/studentRosterEntry.js`
- Read-only dependency: `src/services/teacherDeliveryContractValidation.js`

**Interfaces:**
- Consumes:
  - `isStudentRosterEntry(value)`
  - `normalizeRequiredId(value, fieldName)`
- Produces:
  - `assertTeacherRosterRepository(repository)`
  - `createInMemoryTeacherRosterRepository(initialEntries = [])`
  - repository method `list() -> frozen StudentRosterEntry[]`
  - repository method `getByStudentId(studentId) -> StudentRosterEntry | null`

- [ ] **Step 1: Write the failing repository tests**

Create `tests/teacherRosterRepository.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import { createStudentRosterEntry } from '../src/services/studentRosterEntry.js'
import {
  assertTeacherRosterRepository,
  createInMemoryTeacherRosterRepository,
} from '../src/services/teacherRosterRepository.js'

function entry(studentId, displayNameOrNickname, active = true) {
  return createStudentRosterEntry({
    studentId,
    displayNameOrNickname,
    active,
  })
}

test('TD-02 repository preserves immutable roster order and exact stable-id lookup', () => {
  const a = entry('student-a', 'Deniz')
  const b = entry('student-b', 'Ece', false)

  const repository = createInMemoryTeacherRosterRepository([a, b])
  const listed = repository.list()

  assert.equal(Object.isFrozen(repository), true)
  assert.equal(Object.isFrozen(listed), true)
  assert.deepEqual(listed, [a, b])
  assert.equal(repository.getByStudentId('student-a'), a)
  assert.equal(repository.getByStudentId(' student-b '), b)
  assert.equal(repository.getByStudentId('student-missing'), null)
  assert.equal(assertTeacherRosterRepository(repository), repository)
})

test('TD-02 repository rejects duplicate stable IDs even when display names differ', () => {
  assert.throws(
    () =>
      createInMemoryTeacherRosterRepository([
        entry('student-a', 'Deniz'),
        entry('student-a', 'Başka Ad'),
      ]),
    /duplicate.*studentId/i,
  )
})

test('TD-02 repository allows duplicate display names because names do not authorize', () => {
  const repository = createInMemoryTeacherRosterRepository([
    entry('student-a', 'Aynı Ad'),
    entry('student-b', 'Aynı Ad'),
  ])

  assert.deepEqual(
    repository.list().map((row) => row.studentId),
    ['student-a', 'student-b'],
  )
})

test('TD-02 repository rejects non-array, mutable and forged roster inputs', () => {
  assert.throws(
    () => createInMemoryTeacherRosterRepository({}),
    /array/i,
  )

  const valid = entry('student-a', 'Deniz')

  assert.throws(
    () => createInMemoryTeacherRosterRepository([structuredClone(valid)]),
    /StudentRosterEntry/i,
  )

  assert.throws(
    () =>
      createInMemoryTeacherRosterRepository([
        Object.freeze({ ...valid, providerRole: 'admin' }),
      ]),
    /StudentRosterEntry/i,
  )
})

test('TD-02 repository exposes no mutation surface', () => {
  const repository = createInMemoryTeacherRosterRepository([
    entry('student-a', 'Deniz'),
  ])

  for (const method of [
    'add',
    'create',
    'update',
    'rename',
    'activate',
    'deactivate',
    'delete',
    'save',
    'persist',
    'sync',
  ]) {
    assert.equal(method in repository, false, method)
  }
})
```

- [ ] **Step 2: Run the repository test and verify RED**

Run:

```bash
node --test tests/teacherRosterRepository.test.js
```

Expected: FAIL because `src/services/teacherRosterRepository.js` does not exist.

- [ ] **Step 3: Implement the minimal read-only repository**

Create `src/services/teacherRosterRepository.js`:

```js
import { isStudentRosterEntry } from './studentRosterEntry.js'
import { normalizeRequiredId } from './teacherDeliveryContractValidation.js'

export function assertTeacherRosterRepository(repository) {
  if (
    repository === null ||
    typeof repository !== 'object' ||
    typeof repository.list !== 'function' ||
    typeof repository.getByStudentId !== 'function'
  ) {
    throw new TypeError(
      'teacher roster repository must provide list() and getByStudentId().',
    )
  }

  return repository
}

export function createInMemoryTeacherRosterRepository(initialEntries = []) {
  if (!Array.isArray(initialEntries)) {
    throw new TypeError('initial roster snapshot must be an array.')
  }

  const ordered = []
  const byStudentId = new Map()

  for (const candidate of initialEntries) {
    if (!isStudentRosterEntry(candidate)) {
      throw new TypeError(
        'initial roster snapshot entries must be valid immutable StudentRosterEntry records.',
      )
    }

    if (byStudentId.has(candidate.studentId)) {
      throw new Error(
        `duplicate studentId in teacher roster snapshot: ${candidate.studentId}`,
      )
    }

    ordered.push(candidate)
    byStudentId.set(candidate.studentId, candidate)
  }

  const frozenOrdered = Object.freeze([...ordered])

  return Object.freeze({
    list() {
      return frozenOrdered
    },

    getByStudentId(studentId) {
      const normalizedStudentId = normalizeRequiredId(
        studentId,
        'studentId',
      )

      return byStudentId.get(normalizedStudentId) ?? null
    },
  })
}
```

Do not add any mutation method, provider import, timestamp, UUID, persistence hook or network code.

- [ ] **Step 4: Run focused repository tests and verify GREEN**

Run:

```bash
node --test tests/teacherRosterRepository.test.js tests/studentRosterEntry.test.js
```

Expected: PASS, 0 failures.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/services/teacherRosterRepository.js tests/teacherRosterRepository.test.js
git commit -m "feat: add TD-02 teacher roster repository"
```

---

### Task 2: Teacher Roster Service and Active-Target Preflight

**Files:**
- Create: `src/services/teacherRosterService.js`
- Create: `tests/teacherRosterService.test.js`
- Reuse: `src/services/teacherRosterRepository.js`
- Reuse: `src/services/studentRosterEntry.js`
- Reuse: `src/services/teacherDeliveryContractValidation.js`

**Interfaces:**
- Consumes:
  - `assertTeacherRosterRepository(repository)`
  - `isStudentRosterEntry(value)`
  - `normalizeRequiredId(value, fieldName)`
- Produces:
  - `createTeacherRosterService({ repository })`
  - `listStudents({ includeInactive = true } = {})`
  - `getStudent(studentId)`
  - `requireActiveStudent(studentId)`
  - `preflightActiveStudentIds(studentIds)`

- [ ] **Step 1: Write the failing service tests**

Create `tests/teacherRosterService.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import { createStudentRosterEntry } from '../src/services/studentRosterEntry.js'
import {
  createInMemoryTeacherRosterRepository,
} from '../src/services/teacherRosterRepository.js'
import { createTeacherRosterService } from '../src/services/teacherRosterService.js'

function entry(studentId, displayNameOrNickname, active = true) {
  return createStudentRosterEntry({
    studentId,
    displayNameOrNickname,
    active,
  })
}

function service(entries) {
  return createTeacherRosterService({
    repository: createInMemoryTeacherRosterRepository(entries),
  })
}

test('TD-02 lists teacher-safe roster rows and filters inactive entries explicitly', () => {
  const roster = service([
    entry('student-a', 'Deniz'),
    entry('student-b', 'Ece', false),
  ])

  assert.deepEqual(
    roster.listStudents().map((row) => [row.studentId, row.active]),
    [
      ['student-a', true],
      ['student-b', false],
    ],
  )

  assert.deepEqual(
    roster
      .listStudents({ includeInactive: false })
      .map((row) => row.studentId),
    ['student-a'],
  )

  assert.throws(
    () => roster.listStudents({ includeInactive: 'false' }),
    /includeInactive.*boolean/i,
  )
})

test('TD-02 lookup uses exact stable studentId and never display name', () => {
  const roster = service([
    entry('student-a', 'Aynı Ad'),
    entry('student-b', 'Aynı Ad'),
  ])

  assert.equal(roster.getStudent('student-a').studentId, 'student-a')
  assert.equal(roster.getStudent(' student-b ').studentId, 'student-b')
  assert.equal(roster.getStudent('student-missing'), null)

  assert.equal('getStudentByDisplayName' in roster, false)
  assert.equal('getStudentByEmail' in roster, false)
})

test('TD-02 requireActiveStudent fails closed for unknown and inactive targets', () => {
  const roster = service([
    entry('student-a', 'Deniz'),
    entry('student-b', 'Ece', false),
  ])

  assert.equal(
    roster.requireActiveStudent('student-a').studentId,
    'student-a',
  )

  assert.throws(
    () => roster.requireActiveStudent('student-missing'),
    /student-not-found.*student-missing/i,
  )

  assert.throws(
    () => roster.requireActiveStudent('student-b'),
    /student-inactive.*student-b/i,
  )
})

test('TD-02 multi-target preflight deduplicates in first-selection order', () => {
  const roster = service([
    entry('student-a', 'Deniz'),
    entry('student-b', 'Ece'),
    entry('student-c', 'Ada'),
  ])

  const result = roster.preflightActiveStudentIds([
    ' student-b ',
    'student-a',
    'student-b',
    'student-c',
  ])

  assert.equal(Object.isFrozen(result), true)
  assert.deepEqual(
    result.map((row) => row.studentId),
    ['student-b', 'student-a', 'student-c'],
  )
})

test('TD-02 multi-target preflight is all-or-nothing for empty, unknown or inactive input', () => {
  const roster = service([
    entry('student-a', 'Deniz'),
    entry('student-b', 'Ece', false),
  ])

  assert.throws(
    () => roster.preflightActiveStudentIds([]),
    /at least one studentId/i,
  )

  assert.throws(
    () =>
      roster.preflightActiveStudentIds([
        'student-a',
        'student-missing',
      ]),
    /student-not-found.*student-missing/i,
  )

  assert.throws(
    () =>
      roster.preflightActiveStudentIds([
        'student-a',
        'student-b',
      ]),
    /student-inactive.*student-b/i,
  )

  assert.throws(
    () =>
      roster.preflightActiveStudentIds([
        'student-a',
        'student\u0000x',
      ]),
    /studentId/i,
  )
})

test('TD-02 service revalidates custom adapter rows and exact lookup identity', () => {
  const a = entry('student-a', 'Deniz')
  const b = entry('student-b', 'Ece')

  const forgedListService = createTeacherRosterService({
    repository: {
      list() {
        return [structuredClone(a)]
      },
      getByStudentId() {
        return a
      },
    },
  })

  assert.throws(
    () => forgedListService.listStudents(),
    /invalid.*StudentRosterEntry/i,
  )

  const mismatchedLookupService = createTeacherRosterService({
    repository: {
      list() {
        return [a, b]
      },
      getByStudentId() {
        return b
      },
    },
  })

  assert.throws(
    () => mismatchedLookupService.getStudent('student-a'),
    /identity-mismatch/i,
  )
})

test('TD-02 service rejects duplicate stable IDs returned by a custom adapter', () => {
  const a = entry('student-a', 'Deniz')

  const roster = createTeacherRosterService({
    repository: {
      list() {
        return [a, a]
      },
      getByStudentId() {
        return a
      },
    },
  })

  assert.throws(
    () => roster.listStudents(),
    /duplicate.*studentId/i,
  )
})
```

- [ ] **Step 2: Run the new service tests and verify RED**

Run:

```bash
node --test tests/teacherRosterService.test.js
```

Expected: FAIL because `src/services/teacherRosterService.js` does not exist.

- [ ] **Step 3: Implement the teacher roster service**

Create `src/services/teacherRosterService.js`:

```js
import { isStudentRosterEntry } from './studentRosterEntry.js'
import {
  normalizeRequiredId,
} from './teacherDeliveryContractValidation.js'
import {
  assertTeacherRosterRepository,
} from './teacherRosterRepository.js'

function assertRosterEntry(value, label) {
  if (!isStudentRosterEntry(value)) {
    throw new TypeError(
      `${label} must be a valid immutable StudentRosterEntry.`,
    )
  }

  return value
}

function validatedRosterList(repository) {
  const value = repository.list()

  if (!Array.isArray(value)) {
    throw new TypeError('teacher roster repository list() must return an array.')
  }

  const seen = new Set()
  const entries = []

  for (const candidate of value) {
    const row = assertRosterEntry(
      candidate,
      'teacher roster repository row',
    )

    if (seen.has(row.studentId)) {
      throw new Error(
        `duplicate studentId returned by teacher roster repository: ${row.studentId}`,
      )
    }

    seen.add(row.studentId)
    entries.push(row)
  }

  return Object.freeze(entries)
}

export function createTeacherRosterService({ repository } = {}) {
  const trustedRepository = assertTeacherRosterRepository(repository)

  function getStudent(studentId) {
    const normalizedStudentId = normalizeRequiredId(
      studentId,
      'studentId',
    )
    const candidate =
      trustedRepository.getByStudentId(normalizedStudentId)

    if (candidate === null || candidate === undefined) {
      return null
    }

    const row = assertRosterEntry(
      candidate,
      'teacher roster repository lookup result',
    )

    if (row.studentId !== normalizedStudentId) {
      throw new Error(
        `teacher-roster-identity-mismatch:${normalizedStudentId}`,
      )
    }

    return row
  }

  function requireActiveStudent(studentId) {
    const normalizedStudentId = normalizeRequiredId(
      studentId,
      'studentId',
    )
    const row = getStudent(normalizedStudentId)

    if (row === null) {
      throw new Error(
        `teacher-roster-student-not-found:${normalizedStudentId}`,
      )
    }

    if (row.active !== true) {
      throw new Error(
        `teacher-roster-student-inactive:${normalizedStudentId}`,
      )
    }

    return row
  }

  return Object.freeze({
    listStudents({ includeInactive = true } = {}) {
      if (typeof includeInactive !== 'boolean') {
        throw new TypeError('includeInactive must be a boolean.')
      }

      const entries = validatedRosterList(trustedRepository)

      if (includeInactive) {
        return entries
      }

      return Object.freeze(
        entries.filter((row) => row.active === true),
      )
    },

    getStudent,

    requireActiveStudent,

    preflightActiveStudentIds(studentIds) {
      if (!Array.isArray(studentIds)) {
        throw new TypeError('studentIds must be an array.')
      }

      const normalizedIds = []
      const seen = new Set()

      for (const rawStudentId of studentIds) {
        const studentId = normalizeRequiredId(
          rawStudentId,
          'studentId',
        )

        if (seen.has(studentId)) continue
        seen.add(studentId)
        normalizedIds.push(studentId)
      }

      if (normalizedIds.length === 0) {
        throw new Error(
          'teacher roster preflight requires at least one studentId.',
        )
      }

      const entries = normalizedIds.map((studentId) =>
        requireActiveStudent(studentId),
      )

      return Object.freeze(entries)
    },
  })
}
```

The service deliberately revalidates repository output. Do not trust a future provider adapter solely because it implements the method names.

- [ ] **Step 4: Run focused service/repository tests and verify GREEN**

Run:

```bash
node --test   tests/teacherRosterRepository.test.js   tests/teacherRosterService.test.js   tests/studentRosterEntry.test.js
```

Expected: PASS, 0 failures.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/services/teacherRosterService.js tests/teacherRosterService.test.js
git commit -m "feat: add TD-02 roster preflight service"
```

---

### Task 3: Security Boundary Matrix and TD-02 Contract Documentation

**Files:**
- Create: `tests/teacherRosterSecurity.test.js`
- Create: `docs/teacher-delivery-td02-roster.md`
- Read-only: `src/services/teacherRosterRepository.js`
- Read-only: `src/services/teacherRosterService.js`
- Read-only: `main.js`

**Interfaces:**
- Consumes all TD-02 repository/service APIs.
- Produces no new runtime API.

- [ ] **Step 1: Write the TD-02 security boundary test**

Create `tests/teacherRosterSecurity.test.js`:

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { createStudentRosterEntry } from '../src/services/studentRosterEntry.js'
import {
  createInMemoryTeacherRosterRepository,
} from '../src/services/teacherRosterRepository.js'
import { createTeacherRosterService } from '../src/services/teacherRosterService.js'

test('TD-02 roster source contains no provider, network or browser-persistence implementation', () => {
  for (const path of [
    '../src/services/teacherRosterRepository.js',
    '../src/services/teacherRosterService.js',
  ]) {
    const source = readFileSync(
      new URL(path, import.meta.url),
      'utf8',
    )

    assert.doesNotMatch(
      source,
      /firebase|adminCredential|listUsers\s*\(|fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|firestore|database|bearer|token/i,
    )
  }
})

test('TD-02 does not wire roster behavior into production UI entry points', () => {
  const main = readFileSync(
    new URL('../main.js', import.meta.url),
    'utf8',
  )

  assert.doesNotMatch(
    main,
    /teacherRosterRepository|teacherRosterService|teacherRosterUi/i,
  )
})

test('TD-02 service exposes read/preflight operations only', () => {
  const repository = createInMemoryTeacherRosterRepository([
    createStudentRosterEntry({
      studentId: 'student-a',
      displayNameOrNickname: 'Deniz',
      active: true,
    }),
  ])
  const roster = createTeacherRosterService({ repository })

  assert.deepEqual(
    Object.keys(roster).sort(),
    [
      'getStudent',
      'listStudents',
      'preflightActiveStudentIds',
      'requireActiveStudent',
    ],
  )

  for (const forbidden of [
    'createStudent',
    'updateStudent',
    'renameStudent',
    'activateStudent',
    'deactivateStudent',
    'deleteStudent',
    'save',
    'persist',
    'sync',
    'listFirebaseUsers',
  ]) {
    assert.equal(forbidden in roster, false, forbidden)
  }
})

test('TD-02 human-readable name never becomes an identity API', () => {
  const repository = createInMemoryTeacherRosterRepository([
    createStudentRosterEntry({
      studentId: 'student-a',
      displayNameOrNickname: 'Aynı Ad',
      active: true,
    }),
    createStudentRosterEntry({
      studentId: 'student-b',
      displayNameOrNickname: 'Aynı Ad',
      active: true,
    }),
  ])
  const roster = createTeacherRosterService({ repository })

  assert.equal(roster.getStudent('student-a').studentId, 'student-a')
  assert.equal(roster.getStudent('student-b').studentId, 'student-b')
  assert.equal('getStudentByDisplayName' in roster, false)
  assert.equal('resolveStudentName' in roster, false)
})
```

- [ ] **Step 2: Run the security test**

Run:

```bash
node --test tests/teacherRosterSecurity.test.js
```

Expected: PASS, 0 failures.

If it fails because TD-02 source contains a forbidden production capability, remove that capability rather than weakening the test.

- [ ] **Step 3: Write the bounded implemented-contract document**

Create `docs/teacher-delivery-td02-roster.md`:

```markdown
# TD-02 — Teacher Roster + Management Service

Status: implemented on the feature branch; production/merge status is determined only by the final PR and exact-main gates.

## Boundary

TD-02 adds a provider-neutral, read-only trusted roster snapshot boundary and teacher-side target preflight.

It does not implement Firebase/Admin user discovery, persistence, authentication, roster CRUD UI, Pool publishing, private-assignment fan-out or Student App roster access.

## Identity

- `studentId` is the only targeting identity.
- `displayNameOrNickname` is presentation-only.
- duplicate stable IDs fail closed;
- duplicate display names are allowed;
- inactive and unknown students cannot pass new-target preflight.

## Repository

The TD-02 reference repository exposes only:

- `list()`;
- `getByStudentId(studentId)`.

It stores an immutable in-memory snapshot of TD-01 `StudentRosterEntry` records and exposes no mutation/persistence method.

## Teacher roster service

The service exposes only:

- `listStudents({ includeInactive })`;
- `getStudent(studentId)`;
- `requireActiveStudent(studentId)`;
- `preflightActiveStudentIds(studentIds)`.

Multi-target preflight deduplicates stable IDs in first-selection order and fails the whole preflight if any selected student is unknown or inactive.

## Deferred

- Pool producer/UI: TD-03;
- SCORE assignment fan-out/UI: TD-04;
- persisted assignment lifecycle: TD-05;
- authenticated provider/persistence and production authorization: TD-06;
- Chord Board delivery adapter: TD-07.
```

Do not update broader status/architecture files in TD-02 unless fresh review proves no competing branch owns them and a separate documentation decision authorizes it.

- [ ] **Step 4: Run TD-01 + TD-02 focused contract/security tests**

Run:

```bash
node --test   tests/studentRosterEntry.test.js   tests/teacherRosterRepository.test.js   tests/teacherRosterService.test.js   tests/teacherRosterSecurity.test.js   tests/teacherDeliveryContracts.test.js
```

Expected: PASS, 0 failures.

- [ ] **Step 5: Commit Task 3**

```bash
git add tests/teacherRosterSecurity.test.js docs/teacher-delivery-td02-roster.md
git commit -m "docs: record TD-02 roster boundary"
```

---

### Task 4: Full Verification, Draft PR and Exact-Head Gate

**Files:**
- No planned product-file edits.
- Read branch diff, current main and PR/check metadata only.

**Interfaces:**
- Consumes the completed TD-02 branch.
- Produces verification evidence and a draft implementation PR only.

- [ ] **Step 1: Fresh-read current main before implementation verification**

Verify current protected `main` HEAD and compare it with the implementation branch base.

Expected baseline at plan authoring:

```text
d8d244cb1436eb9e2fd34a3b5a7ecf127aabf090
```

If `main` moved during implementation, inspect the new commits and conflicts before any rebase/update. Never force-push protected `main`.

- [ ] **Step 2: Verify implementation branch scope**

Run:

```bash
git status --short
git diff --check
git diff --name-only main...HEAD
```

Expected changed files are limited to:

```text
src/services/teacherRosterRepository.js
src/services/teacherRosterService.js
tests/teacherRosterRepository.test.js
tests/teacherRosterService.test.js
tests/teacherRosterSecurity.test.js
docs/teacher-delivery-td02-roster.md
```

If unrelated product/backend/UI/OMR/deployment files appear, stop and report them instead of hiding them inside TD-02.

- [ ] **Step 3: Run focused TD-02 and identity regressions**

Run:

```bash
node --test   tests/studentRosterEntry.test.js   tests/teacherRosterRepository.test.js   tests/teacherRosterService.test.js   tests/teacherRosterSecurity.test.js   tests/teacherDeliveryContracts.test.js   tests/teacherShareAuthorization.test.js   tests/teacherShareEligibility.test.js
```

Expected: PASS, 0 failures.

- [ ] **Step 4: Run the full repository suite**

Run:

```bash
npm test
```

Expected: exit 0, 0 failed tests.

Record the exact total/pass/fail counts from this fresh run.

- [ ] **Step 5: Run production build**

Run:

```bash
npm run build
```

Expected: exit 0.

Inspect the branch diff after the build. Do not commit unrelated generated/runtime changes.

- [ ] **Step 6: Re-run focused security tests after the production build**

Run:

```bash
node --test   tests/teacherRosterSecurity.test.js   tests/teacherRosterService.test.js   tests/teacherDeliveryContracts.test.js
```

Expected: PASS, 0 failures.

- [ ] **Step 7: Fresh-read open dependency PRs**

Before opening the implementation PR, verify at minimum:

- protected `main` HEAD;
- PR #232 state/head because Smoosic write-back can change current-revision semantics used by later TD-04, even though TD-02 does not touch that code;
- PR #235 TD-02 spec/plan documentation state;
- any newer Teacher Delivery PR that overlaps TD-02 files;
- protected required check name/state.

TD-02 must not silently absorb another branch's unrelated work.

- [ ] **Step 8: Create the draft TD-02 implementation PR**

Recommended implementation branch:

```text
feat/td02-teacher-roster-management
```

Create a draft PR to `main` with body:

```markdown
## TD-02 — Teacher Roster + Management Service

### Implemented
- provider-neutral read-only roster repository;
- immutable in-memory trusted-snapshot reference implementation;
- stable studentId lookup;
- duplicate stable-ID rejection;
- active/inactive roster filtering;
- single-target active-student preflight;
- all-or-nothing multi-target active-student preflight;
- provider-result revalidation.

### Preserved boundaries
- display name/nickname is presentation-only;
- no UI wiring;
- no Firebase/Admin user listing;
- no persistence/database/browser storage;
- no authentication/security-rule change;
- no Pool publishing or assignment fan-out;
- no Student App, OMR, renderer or deployment change;
- no cross-repository write.

### Verification

Before creating the PR, copy the exact fresh evidence already captured in Steps 2–6 into this section:

- the focused TD-02 test command and its exact pass/fail count;
- the full `npm test` total/pass/fail count;
- the exact `npm run build` result;
- the exact `git diff --check` result.

Do not create the PR with missing, estimated or historical verification evidence.

Human stop point: do not merge and do not start TD-03 without explicit approval.
```

- [ ] **Step 9: Verify exact PR-head CI**

On the exact implementation PR head SHA:

- required `test-and-build` or current protected-main required equivalent must succeed;
- all other triggered required checks must be reported as actually observed;
- unresolved review blockers must be 0 before a merge-readiness claim;
- base drift must be 0 before a merge-readiness claim.

Do not call the PR merge-ready while a required check is queued, failed, skipped unexpectedly or cancelled.

- [ ] **Step 10: Stop before merge**

Report:

- current main SHA;
- implementation branch;
- exact PR head SHA;
- changed files;
- focused/full/build results;
- CI state;
- whether any base drift exists;
- explicit confirmation that no UI/Firebase/persistence/auth/OMR/deployment/cross-repo write occurred;
- next required human approval.

Do not merge TD-02 and do not start TD-03 without a new explicit approval.

---

## Plan Self-Review

### Spec coverage

- provider-neutral roster repository: Task 1;
- immutable in-memory reference repository: Task 1;
- duplicate stable-ID rejection: Tasks 1–2;
- duplicate display names allowed: Tasks 1–3;
- stable-ID-only list/lookup: Task 2;
- active/inactive filtering: Task 2;
- unknown/inactive single-target preflight rejection: Task 2;
- all-or-nothing multi-target preflight: Task 2;
- first-selection-order deduplication: Task 2;
- forged/mismatched provider result rejection: Task 2;
- teacher-safe read/preflight-only surface: Tasks 2–3;
- no Firebase/Admin/network/browser persistence: Task 3;
- no UI/Student App integration: Task 3;
- TD-03/04/05/06/07 remain deferred: Tasks 3–4.

No spec requirement is assigned to product code outside TD-02.

### Placeholder scan

The implementation tasks contain no unresolved implementation marker, placeholder or unnamed API. Future verification values are not hard-coded; the PR step requires copying fresh evidence captured by the immediately preceding verification steps.

### Type consistency

- repository `list()` returns an array of immutable TD-01 `StudentRosterEntry` records;
- repository `getByStudentId(studentId)` returns one exact roster record or `null`;
- service `getStudent(studentId)` preserves that nullable contract;
- `requireActiveStudent(studentId)` returns one exact active record or throws;
- `preflightActiveStudentIds(studentIds)` returns a frozen array of exact active records;
- both repository and service normalize identity through TD-01 `normalizeRequiredId`;
- no API accepts display name as an identity.

### Review Focus coverage

All five Review Focus cases have explicit tests in Tasks 1–3.

## Execution Gate

After this plan is reviewed and approved, implementation starts on a fresh isolated branch/worktree using TDD.

Recommended implementation branch:

```text
feat/td02-teacher-roster-management
```

The implementation must stop at the draft PR / exact-head verification gate and must not merge or start TD-03 without new explicit human approval.
