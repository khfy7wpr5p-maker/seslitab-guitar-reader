# TD-04 SCORE Private Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a provider-neutral, all-or-nothing teacher SCORE assignment producer that fans one exact approved/ready score revision out to one immutable `PrivateAssignment` per selected active student, with common-note defaults, per-student overrides, exact-source duplicate protection, acknowledgement-gated success, and no student delivery.

**Architecture:** TD-04 adds four isolated units: an atomic in-memory assignment repository, a SCORE assignment orchestration service, a teacher-safe controller, and an explicitly mounted UI module. The service reuses TD-02 roster preflight plus the existing TD-01 `createScoreAssignmentSourceBinding()` and `createPrivateAssignment()` contracts; it does not widen Stage L, PrivateAssignment, or production UI entry points.

**Tech Stack:** JavaScript ES modules, Node.js 24, built-in `node:test` + `node:assert/strict`, Vite 8, existing SesliTab teacher delivery contracts.

**Spec:** `docs/superpowers/specs/2026-09-22-td04-score-private-assignment-design.md`

## Global Constraints

- `READY_EXACT_REVISION != DELIVERED_TO_STUDENT`.
- Stage L remains `deliveryState = "not_implemented"` and `deliveryAllowed = false`.
- One selected student produces one independent `PrivateAssignment`; no private recipient array is introduced.
- TD-04 is SCORE-only. `CHORD_BOARD` remains deferred to TD-07.
- Every selected student receives a fresh action-time `ScoreAssignmentSourceBinding`.
- One coherent TD-02 `preflightActiveStudentIds(studentIds)` result defines deterministic fan-out order.
- `commonTeacherNote` is the default; an explicit per-student override replaces it; an explicit empty override clears it for that student.
- Same `studentId + sourceId + revisionId + SCORE` is a duplicate and rejects the whole batch.
- Same student + a newer exact revision is allowed.
- The reference repository `createBatch()` is atomic: validate all first, append all second.
- Teacher success requires exact immutable batch acknowledgement.
- No partial-success presentation.
- No assignment lifecycle transition or revoke in TD-04; TD-05 owns those.
- No Firebase, Firestore, Authentication, Admin SDK, network delivery endpoint, browser persistence, production security rule, migration, credential, Student App write, or cross-repository write.
- No production auto-mount from `main.js`, `src/app.js`, or `src/appShell.js`.
- Existing `PrivateAssignment v1`, `ScoreAssignmentSourceBinding v1`, Package 12, Stage L, TD-02 roster, and TD-03 Pool semantics are not widened.
- No new runtime dependency.

## Review Focus

1. **Override identity confusion:** an override keyed by an unselected student, duplicate override row, symbol/accessor field, or display name must fail closed before any SCORE binding or write. Task 2 pins this.
2. **Duplicate lookup substitution:** a custom repository returning an assignment for the wrong student/source/revision must fail closed rather than classify the target incorrectly. Task 2 pins exact lookup identity.
3. **Factory instability:** assignment-ID/readiness-ID/time factories may be malformed or change if called twice; each generated authority value is called once per required action and validated. Task 2 pins call counts and malformed output.
4. **Acknowledgement reorder/substitution:** a repository returning all valid assignments but in a different order or with one student's note/source substituted must not produce teacher success. Task 2 pins exact batch equivalence.
5. **UI stale override leakage:** deselecting a student after entering a per-student note must exclude that student's override from the submitted request. Task 4 pins selection-scoped submission.

---

## File Structure

### Create

- `src/services/teacherScoreAssignmentRepository.js`
  - provider-neutral repository contract;
  - deterministic in-memory reference repository;
  - atomic `createBatch()`;
  - exact SCORE duplicate-key lookup.

- `src/services/teacherScoreAssignmentService.js`
  - strict batch input;
  - TD-02 roster preflight;
  - common/per-student note resolution;
  - fresh `ScoreAssignmentSourceBinding` per target;
  - duplicate preflight;
  - `PrivateAssignment` fan-out;
  - batch acknowledgement validation.

- `src/services/teacherScoreAssignmentController.js`
  - active roster presentation rows;
  - bounded teacher-facing success/failure results;
  - no raw diagnostics.

- `src/teacherScoreAssignmentUi.js`
  - explicit-mount student multi-select;
  - common note;
  - per-selected-student override input;
  - `Ödevi Hazırla` action;
  - no delivery wording.

- `src/teacherScoreAssignmentUi.css`
  - TD-04 scoped selectors only.

- `tests/teacherScoreAssignmentRepository.test.js`
- `tests/teacherScoreAssignmentService.test.js`
- `tests/teacherScoreAssignmentController.test.js`
- `tests/teacherScoreAssignmentUi.test.js`
- `tests/support/fakeTeacherScoreAssignmentDom.js`
- `tests/teacherScoreAssignmentSecurity.test.js`
- `docs/teacher-delivery-td04-score-private-assignment.md`

### Reuse without semantic widening

- `src/services/teacherRosterService.js`
- `src/services/scoreAssignmentSourceBinding.js`
- `src/services/privateAssignment.js`
- `src/services/teacherDeliveryContractValidation.js`
- existing teacher workspace / Package 12 / Stage L dependencies transitively used by SCORE source binding.

### Do not modify unless a focused regression proves an unavoidable compatibility defect and new human approval is obtained

- `main.js`
- `src/app.js`
- `src/appShell.js`
- `index.html`
- `src/services/privateAssignment.js`
- `src/services/scoreAssignmentSourceBinding.js`
- `src/services/stageLShareReadiness.js`
- Package 12 eligibility modules
- TD-03 Pool files
- backend/provider/auth/security-rule/deployment files
- Student App repository

---

### Task 1: Atomic SCORE Assignment Repository

**Files:**
- Create: `src/services/teacherScoreAssignmentRepository.js`
- Create: `tests/teacherScoreAssignmentRepository.test.js`

**Interfaces:**
- Consumes:
  - `isPrivateAssignment(value)`
  - `PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE`
  - `normalizeRequiredId(value, fieldName)`
- Produces:
  - `assertTeacherScoreAssignmentRepository(repository)`
  - `createInMemoryTeacherScoreAssignmentRepository(initialAssignments = [])`
  - `repository.list()`
  - `repository.getByAssignmentId(assignmentId)`
  - `repository.findExactScoreAssignment({ studentId, sourceId, revisionId })`
  - `repository.createBatch(assignments)`
- `createBatch()` returns one frozen array containing the exact acknowledged stored assignment records in insertion order.

- [ ] **Step 1: Write failing repository tests**

Create `tests/teacherScoreAssignmentRepository.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  createPrivateAssignment,
} from '../src/services/privateAssignment.js'
import {
  createInMemoryTeacherScoreAssignmentRepository,
} from '../src/services/teacherScoreAssignmentRepository.js'

function sourceRef({
  studentId,
  sourceId = 'score-1',
  revisionId = 'revision-1',
} = {}) {
  return Object.freeze({
    schemaVersion: 1,
    sourceKind: 'score_exact_revision',
    studentId,
    sourceId,
    sourceRevisionId: 'source-revision-1',
    revisionId,
    revisionKind: 'automatic',
    contentFingerprint: 'content-fp',
    lineageFingerprint: 'lineage-fp',
    approvalId: 'approval-1',
    authorizationId: `auth-${studentId}`,
    qualityEvidenceId: `quality-${studentId}`,
    revalidationEvidenceId: null,
    readinessRoute: 'package12_t2',
    package12Status: 'eligible_exact_revision',
    boundAt: '2026-09-22T20:00:00Z',
  })
}

function assignment({
  assignmentId,
  studentId,
  sourceId = 'score-1',
  revisionId = 'revision-1',
  teacherNote = '',
} = {}) {
  return createPrivateAssignment({
    assignmentId,
    studentId,
    practiceType: PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE,
    teacherNote,
    assignedAt: '2026-09-22T20:00:00Z',
    sourceRef: sourceRef({
      studentId,
      sourceId,
      revisionId,
    }),
  })
}

test('TD-04 repository lists deterministic frozen assignment history', () => {
  const a = assignment({
    assignmentId: 'assignment-a',
    studentId: 'student-a',
  })
  const b = assignment({
    assignmentId: 'assignment-b',
    studentId: 'student-b',
  })
  const repository =
    createInMemoryTeacherScoreAssignmentRepository([a, b])

  const rows = repository.list()

  assert.equal(Object.isFrozen(repository), true)
  assert.equal(Object.isFrozen(rows), true)
  assert.deepEqual(rows, [a, b])
  assert.equal(
    repository.getByAssignmentId(' assignment-b '),
    b,
  )
})

test('TD-04 exact SCORE lookup binds student + source + revision', () => {
  const exact = assignment({
    assignmentId: 'assignment-a',
    studentId: 'student-a',
    sourceId: 'score-1',
    revisionId: 'revision-1',
  })
  const repository =
    createInMemoryTeacherScoreAssignmentRepository([exact])

  assert.equal(
    repository.findExactScoreAssignment({
      studentId: 'student-a',
      sourceId: 'score-1',
      revisionId: 'revision-1',
    }),
    exact,
  )
  assert.equal(
    repository.findExactScoreAssignment({
      studentId: 'student-a',
      sourceId: 'score-1',
      revisionId: 'revision-2',
    }),
    null,
  )
  assert.equal(
    repository.findExactScoreAssignment({
      studentId: 'student-b',
      sourceId: 'score-1',
      revisionId: 'revision-1',
    }),
    null,
  )
})

test('TD-04 createBatch atomically stores all valid assignments', () => {
  const repository =
    createInMemoryTeacherScoreAssignmentRepository()
  const a = assignment({
    assignmentId: 'assignment-a',
    studentId: 'student-a',
  })
  const b = assignment({
    assignmentId: 'assignment-b',
    studentId: 'student-b',
  })

  const acknowledgement =
    repository.createBatch([a, b])

  assert.equal(Object.isFrozen(acknowledgement), true)
  assert.deepEqual(acknowledgement, [a, b])
  assert.deepEqual(repository.list(), [a, b])
})

test('TD-04 createBatch rejects duplicate assignmentId with zero partial append', () => {
  const existing = assignment({
    assignmentId: 'assignment-existing',
    studentId: 'student-existing',
  })
  const repository =
    createInMemoryTeacherScoreAssignmentRepository([existing])

  const valid = assignment({
    assignmentId: 'assignment-new',
    studentId: 'student-a',
  })
  const duplicateId = assignment({
    assignmentId: 'assignment-existing',
    studentId: 'student-b',
    revisionId: 'revision-2',
  })

  assert.throws(
    () => repository.createBatch([valid, duplicateId]),
    /duplicate.*assignmentId/i,
  )
  assert.deepEqual(repository.list(), [existing])
})

test('TD-04 createBatch rejects existing exact SCORE duplicate with zero partial append', () => {
  const existing = assignment({
    assignmentId: 'assignment-existing',
    studentId: 'student-a',
    sourceId: 'score-1',
    revisionId: 'revision-1',
  })
  const repository =
    createInMemoryTeacherScoreAssignmentRepository([existing])

  const unrelated = assignment({
    assignmentId: 'assignment-new',
    studentId: 'student-b',
  })
  const duplicateExact = assignment({
    assignmentId: 'assignment-duplicate',
    studentId: 'student-a',
    sourceId: 'score-1',
    revisionId: 'revision-1',
  })

  assert.throws(
    () =>
      repository.createBatch([
        unrelated,
        duplicateExact,
      ]),
    /duplicate.*exact.*score/i,
  )
  assert.deepEqual(repository.list(), [existing])
})

test('TD-04 createBatch rejects an internal exact duplicate with zero append', () => {
  const repository =
    createInMemoryTeacherScoreAssignmentRepository()

  const a = assignment({
    assignmentId: 'assignment-a',
    studentId: 'student-a',
  })
  const b = assignment({
    assignmentId: 'assignment-b',
    studentId: 'student-a',
  })

  assert.throws(
    () => repository.createBatch([a, b]),
    /duplicate.*exact.*score/i,
  )
  assert.deepEqual(repository.list(), [])
})

test('TD-04 createBatch rejects one malformed record before mutating storage', () => {
  const repository =
    createInMemoryTeacherScoreAssignmentRepository()
  const valid = assignment({
    assignmentId: 'assignment-a',
    studentId: 'student-a',
  })

  assert.throws(
    () =>
      repository.createBatch([
        valid,
        Object.freeze({ forged: true }),
      ]),
    /PrivateAssignment/i,
  )
  assert.deepEqual(repository.list(), [])
})

test('TD-04 same student may receive a newer exact revision', () => {
  const existing = assignment({
    assignmentId: 'assignment-r1',
    studentId: 'student-a',
    revisionId: 'revision-1',
  })
  const repository =
    createInMemoryTeacherScoreAssignmentRepository([existing])
  const next = assignment({
    assignmentId: 'assignment-r2',
    studentId: 'student-a',
    revisionId: 'revision-2',
  })

  repository.createBatch([next])

  assert.deepEqual(repository.list(), [existing, next])
})
```

The test helper's source binding must be built using a valid frozen TD-01 binding shape. If `isPrivateAssignment()` rejects the inline helper because a TD-01 constant differs, replace only the helper with a real binding fixture copied from `tests/privateAssignment.test.js`; do not weaken production validation.

- [ ] **Step 2: Run repository test and verify RED**

Run:

```bash
node --test tests/teacherScoreAssignmentRepository.test.js
```

Expected: FAIL because `src/services/teacherScoreAssignmentRepository.js` does not exist.

- [ ] **Step 3: Implement exact-key and repository validation helpers**

Create `src/services/teacherScoreAssignmentRepository.js`:

```js
import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  isPrivateAssignment,
} from './privateAssignment.js'
import {
  assertStrictInputObject,
  normalizeRequiredId,
} from './teacherDeliveryContractValidation.js'

const EXACT_LOOKUP_FIELDS = Object.freeze([
  'studentId',
  'sourceId',
  'revisionId',
])

function exactKey({ studentId, sourceId, revisionId }) {
  return [
    normalizeRequiredId(studentId, 'studentId'),
    normalizeRequiredId(sourceId, 'sourceId'),
    normalizeRequiredId(revisionId, 'revisionId'),
  ].join('\u0001')
}

function exactKeyFromAssignment(assignment) {
  return exactKey({
    studentId: assignment.studentId,
    sourceId: assignment.sourceRef.sourceId,
    revisionId: assignment.sourceRef.revisionId,
  })
}

function assertAssignment(value, label) {
  if (!isPrivateAssignment(value)) {
    throw new TypeError(
      `${label} must be a valid immutable PrivateAssignment.`,
    )
  }
  if (
    value.practiceType !==
      PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE
  ) {
    throw new TypeError(
      `${label} must be a SCORE PrivateAssignment.`,
    )
  }
  return value
}

export function assertTeacherScoreAssignmentRepository(
  repository,
) {
  if (
    !repository ||
    typeof repository !== 'object' ||
    typeof repository.list !== 'function' ||
    typeof repository.getByAssignmentId !== 'function' ||
    typeof repository.findExactScoreAssignment !== 'function' ||
    typeof repository.createBatch !== 'function'
  ) {
    throw new TypeError(
      'teacher SCORE assignment repository must provide list(), getByAssignmentId(), findExactScoreAssignment() and createBatch().',
    )
  }

  return repository
}
```

- [ ] **Step 4: Implement deterministic in-memory repository with validate-before-mutate batch**

Continue in the same file:

```js
export function createInMemoryTeacherScoreAssignmentRepository(
  initialAssignments = [],
) {
  if (!Array.isArray(initialAssignments)) {
    throw new TypeError(
      'initial SCORE assignment snapshot must be an array.',
    )
  }

  const order = []
  const byAssignmentId = new Map()
  const byExactScoreKey = new Map()

  function validateNewAssignment(
    assignment,
    pendingAssignmentIds,
    pendingExactKeys,
  ) {
    const row = assertAssignment(
      assignment,
      'SCORE assignment',
    )
    const assignmentId = row.assignmentId
    const scoreKey = exactKeyFromAssignment(row)

    if (
      byAssignmentId.has(assignmentId) ||
      pendingAssignmentIds.has(assignmentId)
    ) {
      throw new Error(
        `duplicate assignmentId in SCORE assignment repository: ${assignmentId}`,
      )
    }

    if (
      byExactScoreKey.has(scoreKey) ||
      pendingExactKeys.has(scoreKey)
    ) {
      throw new Error(
        `duplicate exact SCORE assignment: ${row.studentId}:${row.sourceRef.sourceId}:${row.sourceRef.revisionId}`,
      )
    }

    pendingAssignmentIds.add(assignmentId)
    pendingExactKeys.add(scoreKey)
    return row
  }

  for (const assignment of initialAssignments) {
    const pendingAssignmentIds = new Set()
    const pendingExactKeys = new Set()
    const row = validateNewAssignment(
      assignment,
      pendingAssignmentIds,
      pendingExactKeys,
    )
    order.push(row.assignmentId)
    byAssignmentId.set(row.assignmentId, row)
    byExactScoreKey.set(
      exactKeyFromAssignment(row),
      row,
    )
  }

  return Object.freeze({
    list() {
      return Object.freeze(
        order.map((assignmentId) =>
          byAssignmentId.get(assignmentId),
        ),
      )
    },

    getByAssignmentId(assignmentId) {
      const id = normalizeRequiredId(
        assignmentId,
        'assignmentId',
      )
      return byAssignmentId.get(id) ?? null
    },

    findExactScoreAssignment(input = {}) {
      assertStrictInputObject(
        input,
        EXACT_LOOKUP_FIELDS,
        'ExactScoreAssignmentLookup',
      )
      const key = exactKey(input)
      return byExactScoreKey.get(key) ?? null
    },

    createBatch(assignments) {
      if (
        !Array.isArray(assignments) ||
        assignments.length === 0
      ) {
        throw new TypeError(
          'SCORE assignment batch must be a non-empty array.',
        )
      }

      const pendingAssignmentIds = new Set()
      const pendingExactKeys = new Set()
      const validated = assignments.map((assignment) =>
        validateNewAssignment(
          assignment,
          pendingAssignmentIds,
          pendingExactKeys,
        ),
      )

      for (const row of validated) {
        order.push(row.assignmentId)
        byAssignmentId.set(row.assignmentId, row)
        byExactScoreKey.set(
          exactKeyFromAssignment(row),
          row,
        )
      }

      return Object.freeze([...validated])
    },
  })
}
```

- [ ] **Step 5: Run repository + TD-01 assignment tests and verify GREEN**

Run:

```bash
node --test   tests/teacherScoreAssignmentRepository.test.js   tests/privateAssignment.test.js   tests/scoreAssignmentSourceBinding.test.js
```

Expected: PASS, 0 failures.

- [ ] **Step 6: Commit Task 1**

```bash
git add   src/services/teacherScoreAssignmentRepository.js   tests/teacherScoreAssignmentRepository.test.js
git commit -m "feat: add TD-04 atomic SCORE assignment repository"
```

---

### Task 2: SCORE Assignment Fan-Out Service

**Files:**
- Create: `src/services/teacherScoreAssignmentService.js`
- Create: `tests/teacherScoreAssignmentService.test.js`

**Interfaces:**
- Consumes:
  - repository from Task 1;
  - `rosterService.preflightActiveStudentIds(studentIds)`;
  - `createScoreAssignmentSourceBinding(input)`;
  - `createPrivateAssignment(input)`;
  - `PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE`;
  - `PRIVATE_ASSIGNMENT_MAX_TEACHER_NOTE_LENGTH`;
  - strict validation helpers.
- Produces:
  - `createTeacherScoreAssignmentService({ repository, rosterService, createAssignmentId, createReadinessIds, now })`
  - `service.prepareScoreAssignments(input)`
- Factory signatures:
  - `createAssignmentId({ studentId, index }) -> string`
  - `createReadinessIds({ studentId, index }) -> { authorizationId, rootQualityEvidenceId, revalidationEvidenceId }`
  - `now() -> timestamp string`

**Strict input shape:**

```js
{
  workspace,
  sourceNotes,
  studentIds,
  commonTeacherNote,
  teacherNoteOverrides,
}
```

**Override row shape:**

```js
{
  studentId,
  teacherNote,
}
```

- [ ] **Step 1: Write shared real SCORE-ready fixture helpers first**

At the top of `tests/teacherScoreAssignmentService.test.js`, reuse the real preparation pattern from `tests/scoreAssignmentSourceBinding.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import '../scripts/runOmrQualityReport.js'

import {
  CANONICAL_NOTE_SCHEMA_VERSION,
  CANONICAL_VERIFICATION_STATUS,
} from '../noteTheory.js'
import {
  prepareMusicXmlQualityGate,
} from '../src/services/appQualityGate.js'
import {
  applyTeacherWorkspaceCorrection,
  approveTeacherWorkspace,
  createTeacherWorkspace,
} from '../src/services/teacherWorkspaceModel.js'
import {
  createStudentRosterEntry,
} from '../src/services/studentRosterEntry.js'
import {
  createInMemoryTeacherRosterRepository,
} from '../src/services/teacherRosterRepository.js'
import {
  createTeacherRosterService,
} from '../src/services/teacherRosterService.js'
import {
  createInMemoryTeacherScoreAssignmentRepository,
} from '../src/services/teacherScoreAssignmentRepository.js'
import {
  createTeacherScoreAssignmentService,
} from '../src/services/teacherScoreAssignmentService.js'

const VALID_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`

function verificationState() {
  return {
    schemaVersion: CANONICAL_NOTE_SCHEMA_VERSION,
    status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    pitch: {
      valid: true,
      status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    },
    time: {
      valid: true,
      status: CANONICAL_VERIFICATION_STATUS.VERIFIED,
    },
  }
}

function verifiedNotes() {
  return ['Do', 'Re', 'Mi', 'Fa'].map(
    (noteName, index) => ({
      partId: 'P1',
      measureNumber: 1,
      measureKey: 'P1:0',
      measureIndex: 0,
      voice: 1,
      staff: 1,
      startBeat: index,
      beats: 1,
      noteName,
      sourceVerificationState:
        verificationState(),
    }),
  )
}

function approvedWorkspace(notes) {
  prepareMusicXmlQualityGate(notes, VALID_XML)

  return approveTeacherWorkspace({
    workspace: createTeacherWorkspace({
      content: notes,
      actorId: 'teacher-1',
      sourceId: 'score-1',
      automaticRevisionId: 'auto-1',
      historyId: 'history-1',
      createdAt: '2026-09-22T20:00:00Z',
    }),
    approvalId: 'approval-1',
    createdAt: '2026-09-22T20:01:00Z',
  })
}

function roster() {
  return createTeacherRosterService({
    repository:
      createInMemoryTeacherRosterRepository([
        createStudentRosterEntry({
          studentId: 'student-a',
          displayNameOrNickname: 'Ada',
          active: true,
        }),
        createStudentRosterEntry({
          studentId: 'student-b',
          displayNameOrNickname: 'Bora',
          active: true,
        }),
        createStudentRosterEntry({
          studentId: 'student-c',
          displayNameOrNickname: 'Cem',
          active: true,
        }),
        createStudentRosterEntry({
          studentId: 'student-off',
          displayNameOrNickname: 'Pasif',
          active: false,
        }),
      ]),
  })
}

function service({
  repository =
    createInMemoryTeacherScoreAssignmentRepository(),
  rosterService = roster(),
  assignmentIds = [
    'assignment-a',
    'assignment-b',
    'assignment-c',
  ],
  time = '2026-09-22T20:02:00Z',
} = {}) {
  return createTeacherScoreAssignmentService({
    repository,
    rosterService,
    createAssignmentId({ index }) {
      return assignmentIds[index]
    },
    createReadinessIds({ studentId }) {
      return {
        authorizationId: `auth-${studentId}`,
        rootQualityEvidenceId:
          `quality-${studentId}`,
        revalidationEvidenceId:
          `revalidation-${studentId}`,
      }
    },
    now() {
      return time
    },
  })
}
```

- [ ] **Step 2: Write failing fan-out and note tests**

Add:

```js
test('TD-04 one active student produces one ACTIVE SCORE assignment', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)

  const result = service().prepareScoreAssignments({
    workspace,
    sourceNotes: notes,
    studentIds: ['student-a'],
    commonTeacherNote: '1-8. ölçüler yavaş.',
    teacherNoteOverrides: [],
  })

  assert.equal(Object.isFrozen(result), true)
  assert.equal(result.length, 1)
  assert.equal(result[0].studentId, 'student-a')
  assert.equal(result[0].teacherNote, '1-8. ölçüler yavaş.')
  assert.equal(result[0].practiceType, 'SCORE')
  assert.equal(result[0].state, 'ACTIVE')
  assert.equal(result[0].revokedAt, null)
  assert.equal(result[0].sourceRef.studentId, 'student-a')
})

test('TD-04 three selected students fan out in TD-02 first-selection order', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)

  const result = service().prepareScoreAssignments({
    workspace,
    sourceNotes: notes,
    studentIds: [
      ' student-c ',
      'student-a',
      'student-c',
      'student-b',
    ],
    commonTeacherNote: 'Ortak not',
    teacherNoteOverrides: [],
  })

  assert.deepEqual(
    result.map((row) => row.studentId),
    ['student-c', 'student-a', 'student-b'],
  )
  assert.deepEqual(
    result.map((row) => row.teacherNote),
    ['Ortak not', 'Ortak not', 'Ortak not'],
  )
  assert.equal(
    new Set(result.map((row) => row.assignmentId)).size,
    3,
  )
})

test('TD-04 per-student override replaces common note only for that student', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)

  const result = service().prepareScoreAssignments({
    workspace,
    sourceNotes: notes,
    studentIds: [
      'student-a',
      'student-b',
      'student-c',
    ],
    commonTeacherNote: 'Ortak not',
    teacherNoteOverrides: [{
      studentId: 'student-b',
      teacherNote: 'Metronom 60 BPM.',
    }],
  })

  assert.deepEqual(
    result.map((row) => row.teacherNote),
    ['Ortak not', 'Metronom 60 BPM.', 'Ortak not'],
  )
})

test('TD-04 explicit empty override clears common note for only that student', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)

  const result = service().prepareScoreAssignments({
    workspace,
    sourceNotes: notes,
    studentIds: ['student-a', 'student-b'],
    commonTeacherNote: 'Ortak not',
    teacherNoteOverrides: [{
      studentId: 'student-b',
      teacherNote: '',
    }],
  })

  assert.deepEqual(
    result.map((row) => row.teacherNote),
    ['Ortak not', ''],
  )
})
```

- [ ] **Step 3: Write failing roster/override fail-closed tests**

Add tests proving:

```js
test('TD-04 unknown or inactive target causes zero repository writes', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)
  let createBatchCalls = 0
  const base =
    createInMemoryTeacherScoreAssignmentRepository()
  const repository = {
    ...base,
    createBatch(rows) {
      createBatchCalls += 1
      return base.createBatch(rows)
    },
  }
  const producer = service({ repository })

  assert.throws(
    () =>
      producer.prepareScoreAssignments({
        workspace,
        sourceNotes: notes,
        studentIds: ['student-a', 'student-off'],
        commonTeacherNote: '',
        teacherNoteOverrides: [],
      }),
    /student-inactive/i,
  )
  assert.equal(createBatchCalls, 0)

  assert.throws(
    () =>
      producer.prepareScoreAssignments({
        workspace,
        sourceNotes: notes,
        studentIds: ['student-missing'],
        commonTeacherNote: '',
        teacherNoteOverrides: [],
      }),
    /student-not-found/i,
  )
  assert.equal(createBatchCalls, 0)
})

test('TD-04 duplicate or unselected teacher-note override fails before write', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)
  let createBatchCalls = 0
  const base =
    createInMemoryTeacherScoreAssignmentRepository()
  const producer = service({
    repository: {
      ...base,
      createBatch(rows) {
        createBatchCalls += 1
        return base.createBatch(rows)
      },
    },
  })

  for (const overrides of [
    [
      { studentId: 'student-a', teacherNote: 'A' },
      { studentId: 'student-a', teacherNote: 'B' },
    ],
    [
      { studentId: 'student-c', teacherNote: 'C' },
    ],
  ]) {
    assert.throws(
      () =>
        producer.prepareScoreAssignments({
          workspace,
          sourceNotes: notes,
          studentIds: ['student-a', 'student-b'],
          commonTeacherNote: '',
          teacherNoteOverrides: overrides,
        }),
      /override/i,
    )
  }

  assert.equal(createBatchCalls, 0)
})

test('TD-04 strict batch and override input rejects prototype/accessor/symbol authority', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)
  const producer = service()
  const valid = {
    workspace,
    sourceNotes: notes,
    studentIds: ['student-a'],
    commonTeacherNote: '',
    teacherNoteOverrides: [],
  }

  const inherited = Object.assign(
    Object.create({ hidden: true }),
    valid,
  )
  assert.throws(
    () => producer.prepareScoreAssignments(inherited),
    /plain object|unsupported/i,
  )

  const symbolInput = {
    ...valid,
    [Symbol('hidden')]: true,
  }
  assert.throws(
    () => producer.prepareScoreAssignments(symbolInput),
    /unsupported/i,
  )

  const accessorOverride = {
    studentId: 'student-a',
    teacherNote: '',
  }
  Object.defineProperty(
    accessorOverride,
    'teacherNote',
    {
      enumerable: true,
      get() {
        return 'forged'
      },
    },
  )
  assert.throws(
    () =>
      producer.prepareScoreAssignments({
        ...valid,
        teacherNoteOverrides: [accessorOverride],
      }),
    /override|plain data/i,
  )
})
```

- [ ] **Step 4: Write failing exact readiness and all-or-nothing tests**

Add:

```js
test('TD-04 binds exact SCORE readiness separately to each stable studentId', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)

  const result = service().prepareScoreAssignments({
    workspace,
    sourceNotes: notes,
    studentIds: ['student-a', 'student-b'],
    commonTeacherNote: '',
    teacherNoteOverrides: [],
  })

  assert.deepEqual(
    result.map((row) => row.sourceRef.studentId),
    ['student-a', 'student-b'],
  )
  assert.deepEqual(
    result.map((row) => row.sourceRef.authorizationId),
    ['auth-student-a', 'auth-student-b'],
  )
  assert.equal(
    result[0].sourceRef.revisionId,
    result[1].sourceRef.revisionId,
  )
})

test('TD-04 one non-ready selected target prevents batch write', () => {
  const notes = verifiedNotes()
  // Do not prepare quality-gate state: exact binding must fail.
  const workspace = approveTeacherWorkspace({
    workspace: createTeacherWorkspace({
      content: notes,
      actorId: 'teacher-1',
      sourceId: 'score-1',
      automaticRevisionId: 'auto-1',
      historyId: 'history-1',
      createdAt: '2026-09-22T20:00:00Z',
    }),
    approvalId: 'approval-1',
    createdAt: '2026-09-22T20:01:00Z',
  })

  let writes = 0
  const base =
    createInMemoryTeacherScoreAssignmentRepository()
  const producer = service({
    repository: {
      ...base,
      createBatch(rows) {
        writes += 1
        return base.createBatch(rows)
      },
    },
  })

  assert.throws(
    () =>
      producer.prepareScoreAssignments({
        workspace,
        sourceNotes: notes,
        studentIds: ['student-a', 'student-b'],
        commonTeacherNote: '',
        teacherNoteOverrides: [],
      }),
    /readiness-not-eligible/i,
  )
  assert.equal(writes, 0)
})
```

The test proves action-time exact readiness because the service itself creates the source binding during the action; it must not accept any readiness object in its public input.

- [ ] **Step 5: Write failing duplicate-exact-source tests**

Add:

```js
test('TD-04 existing same student + same source + same revision rejects entire batch', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)
  const repository =
    createInMemoryTeacherScoreAssignmentRepository()

  service({
    repository,
    assignmentIds: ['assignment-existing'],
  }).prepareScoreAssignments({
    workspace,
    sourceNotes: notes,
    studentIds: ['student-a'],
    commonTeacherNote: '',
    teacherNoteOverrides: [],
  })

  const before = repository.list()

  assert.throws(
    () =>
      service({
        repository,
        assignmentIds: [
          'assignment-new-a',
          'assignment-new-b',
        ],
      }).prepareScoreAssignments({
        workspace,
        sourceNotes: notes,
        studentIds: ['student-b', 'student-a'],
        commonTeacherNote: '',
        teacherNoteOverrides: [],
      }),
    /same|duplicate|already.*prepared|exact SCORE/i,
  )

  assert.deepEqual(repository.list(), before)
})

test('TD-04 a newer exact revision for the same student is allowed', () => {
  const notes = verifiedNotes()
  let workspace = approvedWorkspace(notes)
  const repository =
    createInMemoryTeacherScoreAssignmentRepository()

  service({
    repository,
    assignmentIds: ['assignment-r1'],
  }).prepareScoreAssignments({
    workspace,
    sourceNotes: notes,
    studentIds: ['student-a'],
    commonTeacherNote: '',
    teacherNoteOverrides: [],
  })

  workspace = applyTeacherWorkspaceCorrection({
    workspace,
    fieldKey: '0:beats',
    value: 2,
    revisionId: 'revision-2',
    eventId: 'correction-2',
    operationId: 'operation-2',
    createdAt: '2026-09-22T20:03:00Z',
  })
  workspace = approveTeacherWorkspace({
    workspace,
    approvalId: 'approval-2',
    createdAt: '2026-09-22T20:04:00Z',
  })

  // The corrected revision's Package 12 revalidation must be prepared
  // through the same real readiness path already exercised by
  // scoreAssignmentSourceBinding tests. Use a correction that remains
  // eligible under current T3/T4 rules; do not mock readiness.
  const result = service({
    repository,
    assignmentIds: ['assignment-r2'],
    time: '2026-09-22T20:05:00Z',
  }).prepareScoreAssignments({
    workspace,
    sourceNotes: notes,
    studentIds: ['student-a'],
    commonTeacherNote: '',
    teacherNoteOverrides: [],
  })

  assert.equal(result.length, 1)
  assert.equal(result[0].sourceRef.revisionId, 'revision-2')
  assert.equal(repository.list().length, 2)
})
```

If the chosen correction is not eligible under existing T3/T4 rules, use the smallest correction fixture already proven eligible in Package 12 tests. Do not weaken Package 12 or mock `createScoreAssignmentSourceBinding`.

- [ ] **Step 6: Write failing factory and acknowledgement tests**

Add tests proving:

```js
test('TD-04 calls batch time once and per-student factories once', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)
  let nowCalls = 0
  const assignmentCalls = []
  const readinessCalls = []

  const producer = createTeacherScoreAssignmentService({
    repository:
      createInMemoryTeacherScoreAssignmentRepository(),
    rosterService: roster(),
    createAssignmentId(input) {
      assignmentCalls.push(input)
      return `assignment-${input.studentId}`
    },
    createReadinessIds(input) {
      readinessCalls.push(input)
      return {
        authorizationId:
          `auth-${input.studentId}`,
        rootQualityEvidenceId:
          `quality-${input.studentId}`,
        revalidationEvidenceId:
          `revalidation-${input.studentId}`,
      }
    },
    now() {
      nowCalls += 1
      return '2026-09-22T20:02:00Z'
    },
  })

  producer.prepareScoreAssignments({
    workspace,
    sourceNotes: notes,
    studentIds: ['student-a', 'student-b'],
    commonTeacherNote: '',
    teacherNoteOverrides: [],
  })

  assert.equal(nowCalls, 1)
  assert.deepEqual(
    assignmentCalls.map((row) => row.studentId),
    ['student-a', 'student-b'],
  )
  assert.deepEqual(
    readinessCalls.map((row) => row.studentId),
    ['student-a', 'student-b'],
  )
})

test('TD-04 malformed generated authority fails before createBatch', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)
  let writes = 0
  const base =
    createInMemoryTeacherScoreAssignmentRepository()

  const producer = createTeacherScoreAssignmentService({
    repository: {
      ...base,
      createBatch(rows) {
        writes += 1
        return base.createBatch(rows)
      },
    },
    rosterService: roster(),
    createAssignmentId() {
      return ''
    },
    createReadinessIds({ studentId }) {
      return {
        authorizationId: `auth-${studentId}`,
        rootQualityEvidenceId:
          `quality-${studentId}`,
        revalidationEvidenceId:
          `revalidation-${studentId}`,
      }
    },
    now() {
      return '2026-09-22T20:02:00Z'
    },
  })

  assert.throws(
    () =>
      producer.prepareScoreAssignments({
        workspace,
        sourceNotes: notes,
        studentIds: ['student-a'],
        commonTeacherNote: '',
        teacherNoteOverrides: [],
      }),
    /assignmentId/i,
  )
  assert.equal(writes, 0)
})

test('TD-04 rejects reordered or substituted batch acknowledgement', () => {
  const notes = verifiedNotes()
  const workspace = approvedWorkspace(notes)
  const base =
    createInMemoryTeacherScoreAssignmentRepository()

  const reordered = service({
    repository: {
      ...base,
      createBatch(rows) {
        base.createBatch(rows)
        return Object.freeze([...rows].reverse())
      },
    },
  })

  assert.throws(
    () =>
      reordered.prepareScoreAssignments({
        workspace,
        sourceNotes: notes,
        studentIds: ['student-a', 'student-b'],
        commonTeacherNote: '',
        teacherNoteOverrides: [],
      }),
    /acknowledgement/i,
  )
})
```

Also add one substituted-note acknowledgement test and one mutable-clone acknowledgement test. Both must fail with `/acknowledgement/i`.

- [ ] **Step 7: Run service test and verify RED**

Run:

```bash
node --test tests/teacherScoreAssignmentService.test.js
```

Expected: FAIL because `teacherScoreAssignmentService.js` does not exist.

- [ ] **Step 8: Implement strict input and note override normalization**

Create `src/services/teacherScoreAssignmentService.js`:

```js
import {
  PRIVATE_ASSIGNMENT_MAX_TEACHER_NOTE_LENGTH,
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  createPrivateAssignment,
  isPrivateAssignment,
} from './privateAssignment.js'
import {
  createScoreAssignmentSourceBinding,
  isScoreAssignmentSourceBinding,
} from './scoreAssignmentSourceBinding.js'
import {
  assertTeacherScoreAssignmentRepository,
} from './teacherScoreAssignmentRepository.js'
import {
  assertStrictInputObject,
  normalizeOptionalText,
  normalizeRequiredId,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

const PREPARE_FIELDS = Object.freeze([
  'workspace',
  'sourceNotes',
  'studentIds',
  'commonTeacherNote',
  'teacherNoteOverrides',
])

const OVERRIDE_FIELDS = Object.freeze([
  'studentId',
  'teacherNote',
])

const READINESS_ID_FIELDS = Object.freeze([
  'authorizationId',
  'rootQualityEvidenceId',
  'revalidationEvidenceId',
])

function normalizeOverrides(
  rows,
  selectedStudentIds,
) {
  if (!Array.isArray(rows)) {
    throw new TypeError(
      'teacherNoteOverrides must be an array.',
    )
  }

  const selected = new Set(selectedStudentIds)
  const byStudentId = new Map()

  for (const row of rows) {
    assertStrictInputObject(
      row,
      OVERRIDE_FIELDS,
      'TeacherNoteOverride',
    )

    if (
      OVERRIDE_FIELDS.some(
        (field) => !Object.hasOwn(row, field),
      )
    ) {
      throw new TypeError(
        'TeacherNoteOverride contains missing fields.',
      )
    }

    const studentId = normalizeRequiredId(
      row.studentId,
      'studentId',
    )

    if (!selected.has(studentId)) {
      throw new Error(
        `teacher-note-override-target-not-selected:${studentId}`,
      )
    }
    if (byStudentId.has(studentId)) {
      throw new Error(
        `duplicate-teacher-note-override:${studentId}`,
      )
    }

    byStudentId.set(
      studentId,
      normalizeOptionalText(
        row.teacherNote,
        'teacherNote',
        PRIVATE_ASSIGNMENT_MAX_TEACHER_NOTE_LENGTH,
      ),
    )
  }

  return byStudentId
}
```

- [ ] **Step 9: Implement exact assignment equivalence and acknowledgement validation**

Continue:

```js
function sameSourceBinding(a, b) {
  if (
    !isScoreAssignmentSourceBinding(a) ||
    !isScoreAssignmentSourceBinding(b)
  ) {
    return false
  }

  for (const field of [
    'schemaVersion',
    'sourceKind',
    'studentId',
    'sourceId',
    'sourceRevisionId',
    'revisionId',
    'revisionKind',
    'contentFingerprint',
    'lineageFingerprint',
    'approvalId',
    'authorizationId',
    'qualityEvidenceId',
    'revalidationEvidenceId',
    'readinessRoute',
    'package12Status',
    'boundAt',
  ]) {
    if (a[field] !== b[field]) return false
  }

  return true
}

function sameAssignment(a, b) {
  return (
    isPrivateAssignment(a) &&
    isPrivateAssignment(b) &&
    a.schemaVersion === b.schemaVersion &&
    a.assignmentId === b.assignmentId &&
    a.studentId === b.studentId &&
    a.practiceType === b.practiceType &&
    a.teacherNote === b.teacherNote &&
    a.state === b.state &&
    a.assignedAt === b.assignedAt &&
    a.revokedAt === b.revokedAt &&
    sameSourceBinding(a.sourceRef, b.sourceRef)
  )
}

function assertBatchAcknowledgement(
  acknowledgement,
  expected,
) {
  if (
    !Array.isArray(acknowledgement) ||
    !Object.isFrozen(acknowledgement) ||
    acknowledgement.length !== expected.length
  ) {
    throw new Error(
      'teacher SCORE assignment repository acknowledgement is invalid.',
    )
  }

  for (let index = 0; index < expected.length; index += 1) {
    if (
      !sameAssignment(
        acknowledgement[index],
        expected[index],
      )
    ) {
      throw new Error(
        'teacher SCORE assignment repository acknowledgement mismatch.',
      )
    }
  }

  return acknowledgement
}
```

- [ ] **Step 10: Implement service orchestration in spec order**

Continue:

```js
export function createTeacherScoreAssignmentService({
  repository,
  rosterService,
  createAssignmentId,
  createReadinessIds,
  now,
} = {}) {
  const trustedRepository =
    assertTeacherScoreAssignmentRepository(repository)

  if (
    !rosterService ||
    typeof rosterService.preflightActiveStudentIds !==
      'function'
  ) {
    throw new TypeError(
      'rosterService must provide preflightActiveStudentIds().',
    )
  }
  if (typeof createAssignmentId !== 'function') {
    throw new TypeError(
      'createAssignmentId must be a function.',
    )
  }
  if (typeof createReadinessIds !== 'function') {
    throw new TypeError(
      'createReadinessIds must be a function.',
    )
  }
  if (typeof now !== 'function') {
    throw new TypeError('now must be a function.')
  }

  function prepareScoreAssignments(input = {}) {
    assertStrictInputObject(
      input,
      PREPARE_FIELDS,
      'TeacherScoreAssignment',
    )
    if (
      PREPARE_FIELDS.some(
        (field) => !Object.hasOwn(input, field),
      )
    ) {
      throw new TypeError(
        'TeacherScoreAssignment input contains missing fields.',
      )
    }
    if (!Array.isArray(input.sourceNotes)) {
      throw new TypeError(
        'sourceNotes must be the exact automatic source NoteObject array.',
      )
    }
    if (!Array.isArray(input.studentIds)) {
      throw new TypeError(
        'studentIds must be an array.',
      )
    }

    const activeStudents =
      rosterService.preflightActiveStudentIds(
        input.studentIds,
      )
    const studentIds = activeStudents.map(
      (row) => row.studentId,
    )
    const commonTeacherNote =
      normalizeOptionalText(
        input.commonTeacherNote,
        'commonTeacherNote',
        PRIVATE_ASSIGNMENT_MAX_TEACHER_NOTE_LENGTH,
      )
    const overrides = normalizeOverrides(
      input.teacherNoteOverrides,
      studentIds,
    )
    const assignedAt = normalizeRequiredTimestamp(
      now(),
      'assignedAt',
    )

    const planned = studentIds.map(
      (studentId, index) => {
        const readinessIds =
          createReadinessIds({
            studentId,
            index,
          })
        assertStrictInputObject(
          readinessIds,
          READINESS_ID_FIELDS,
          'ScoreAssignmentReadinessIds',
        )
        if (
          READINESS_ID_FIELDS.some(
            (field) =>
              !Object.hasOwn(readinessIds, field),
          )
        ) {
          throw new TypeError(
            'ScoreAssignmentReadinessIds contains missing fields.',
          )
        }

        const sourceRef =
          createScoreAssignmentSourceBinding({
            workspace: input.workspace,
            sourceNotes: input.sourceNotes,
            studentId,
            authorizationId:
              normalizeRequiredId(
                readinessIds.authorizationId,
                'authorizationId',
              ),
            rootQualityEvidenceId:
              normalizeRequiredId(
                readinessIds.rootQualityEvidenceId,
                'rootQualityEvidenceId',
              ),
            revalidationEvidenceId:
              normalizeRequiredId(
                readinessIds.revalidationEvidenceId,
                'revalidationEvidenceId',
              ),
            createdAt: assignedAt,
          })

        const existing =
          trustedRepository.findExactScoreAssignment({
            studentId,
            sourceId: sourceRef.sourceId,
            revisionId: sourceRef.revisionId,
          })

        if (existing !== null && existing !== undefined) {
          if (
            !isPrivateAssignment(existing) ||
            existing.studentId !== studentId ||
            existing.sourceRef.sourceId !==
              sourceRef.sourceId ||
            existing.sourceRef.revisionId !==
              sourceRef.revisionId
          ) {
            throw new Error(
              'teacher SCORE assignment repository exact lookup mismatch.',
            )
          }

          throw new Error(
            `teacher-score-assignment-already-prepared:${studentId}`,
          )
        }

        const assignmentId = normalizeRequiredId(
          createAssignmentId({
            studentId,
            index,
          }),
          'assignmentId',
        )

        return createPrivateAssignment({
          assignmentId,
          studentId,
          practiceType:
            PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE,
          teacherNote: overrides.has(studentId)
            ? overrides.get(studentId)
            : commonTeacherNote,
          assignedAt,
          sourceRef,
        })
      },
    )

    const acknowledgement =
      trustedRepository.createBatch(planned)

    return assertBatchAcknowledgement(
      acknowledgement,
      planned,
    )
  }

  return Object.freeze({
    prepareScoreAssignments,
  })
}
```

- [ ] **Step 11: Run Task 2 focused tests and verify GREEN**

Run:

```bash
node --test   tests/teacherScoreAssignmentService.test.js   tests/teacherScoreAssignmentRepository.test.js   tests/privateAssignment.test.js   tests/scoreAssignmentSourceBinding.test.js   tests/teacherRosterService.test.js
```

Expected: PASS, 0 failures.

- [ ] **Step 12: Commit Task 2**

```bash
git add   src/services/teacherScoreAssignmentService.js   tests/teacherScoreAssignmentService.test.js
git commit -m "feat: add TD-04 SCORE assignment fan-out service"
```

---

### Task 3: Teacher SCORE Assignment Controller

**Files:**
- Create: `src/services/teacherScoreAssignmentController.js`
- Create: `tests/teacherScoreAssignmentController.test.js`

**Interfaces:**
- Consumes:
  - `assignmentService.prepareScoreAssignments(input)`
  - `rosterService.listStudents({ includeInactive: false })`
- Produces:
  - `createTeacherScoreAssignmentController({ assignmentService, rosterService })`
  - `controller.getViewModel()`
  - `controller.prepare(input)`

- [ ] **Step 1: Write failing controller tests**

Create `tests/teacherScoreAssignmentController.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createTeacherScoreAssignmentController,
} from '../src/services/teacherScoreAssignmentController.js'

function controller({
  students = Object.freeze([
    Object.freeze({
      studentId: 'student-a',
      displayNameOrNickname: 'Ada',
    }),
    Object.freeze({
      studentId: 'student-b',
      displayNameOrNickname: 'Bora',
    }),
  ]),
  result = Object.freeze([
    Object.freeze({
      assignmentId: 'assignment-a',
      studentId: 'student-a',
    }),
  ]),
  error = null,
} = {}) {
  return createTeacherScoreAssignmentController({
    rosterService: {
      listStudents({ includeInactive }) {
        assert.equal(includeInactive, false)
        return students
      },
    },
    assignmentService: {
      prepareScoreAssignments(input) {
        if (error) throw error
        assert.ok(input)
        return result
      },
    },
  })
}

test('TD-04 controller exposes only active roster presentation identity', () => {
  const view = controller().getViewModel()

  assert.equal(Object.isFrozen(view), true)
  assert.equal(Object.isFrozen(view.students), true)
  assert.deepEqual(view.students, [
    {
      studentId: 'student-a',
      displayNameOrNickname: 'Ada',
    },
    {
      studentId: 'student-b',
      displayNameOrNickname: 'Bora',
    },
  ])
})

test('TD-04 controller reports acknowledged assignment count as prepared, not delivered', () => {
  const assignments = Object.freeze([
    Object.freeze({
      assignmentId: 'assignment-a',
      studentId: 'student-a',
    }),
    Object.freeze({
      assignmentId: 'assignment-b',
      studentId: 'student-b',
    }),
    Object.freeze({
      assignmentId: 'assignment-c',
      studentId: 'student-c',
    }),
  ])

  const result = controller({
    result: assignments,
  }).prepare({ studentIds: [] })

  assert.equal(result.ok, true)
  assert.equal(result.message, '3 ödev hazırlandı.')
  assert.equal(result.assignments, assignments)
  assert.doesNotMatch(result.message, /gönder|teslim/i)
})

test('TD-04 controller maps inactive and missing roster failures', () => {
  assert.equal(
    controller({
      error: new Error(
        'teacher-roster-student-inactive:student-x',
      ),
    }).prepare({}).message,
    'Seçilen öğrencilerden biri aktif değil.',
  )

  assert.equal(
    controller({
      error: new Error(
        'teacher-roster-student-not-found:student-x',
      ),
    }).prepare({}).message,
    'Seçilen öğrencilerden biri bulunamadı.',
  )
})

test('TD-04 controller maps readiness, duplicate and acknowledgement failures to bounded copy', () => {
  const cases = [
    [
      'score-assignment-readiness-not-eligible:source_quality_not_eligible:none',
      'Eser bu öğrenci için ödeve hazır değil.',
    ],
    [
      'teacher-score-assignment-already-prepared:student-a',
      'Bu öğrenci için aynı ödev zaten hazırlanmış.',
    ],
    [
      'teacher SCORE assignment repository acknowledgement mismatch token=secret',
      'Ödev işlemi doğrulanamadı.',
    ],
  ]

  for (const [error, message] of cases) {
    const result = controller({
      error: new Error(error),
    }).prepare({})

    assert.deepEqual(result, {
      ok: false,
      assignments: Object.freeze([]),
      message,
    })
    assert.equal(
      JSON.stringify(result).includes('secret'),
      false,
    )
  }
})

test('TD-04 controller fallback does not leak raw technical errors', () => {
  const result = controller({
    error: new Error(
      'firebase bearer=secret revisionId=internal',
    ),
  }).prepare({})

  assert.equal(result.ok, false)
  assert.equal(
    result.message,
    'Ödevler hazırlanamadı.',
  )
  assert.equal(
    JSON.stringify(result).includes('secret'),
    false,
  )
})
```

- [ ] **Step 2: Run controller test and verify RED**

Run:

```bash
node --test tests/teacherScoreAssignmentController.test.js
```

Expected: FAIL because controller module does not exist.

- [ ] **Step 3: Implement bounded controller**

Create `src/services/teacherScoreAssignmentController.js`:

```js
function teacherMessage(error) {
  const text = String(error?.message || '')

  if (/student-inactive/i.test(text)) {
    return 'Seçilen öğrencilerden biri aktif değil.'
  }
  if (/student-not-found/i.test(text)) {
    return 'Seçilen öğrencilerden biri bulunamadı.'
  }
  if (
    /readiness-not-eligible|approval-required|approval.*required/i.test(
      text,
    )
  ) {
    return 'Eser bu öğrenci için ödeve hazır değil.'
  }
  if (/already-prepared|duplicate exact SCORE/i.test(text)) {
    return 'Bu öğrenci için aynı ödev zaten hazırlanmış.'
  }
  if (/acknowledgement|lookup mismatch/i.test(text)) {
    return 'Ödev işlemi doğrulanamadı.'
  }

  return 'Ödevler hazırlanamadı.'
}

export function createTeacherScoreAssignmentController({
  assignmentService,
  rosterService,
} = {}) {
  if (
    !assignmentService ||
    typeof assignmentService.prepareScoreAssignments !==
      'function'
  ) {
    throw new TypeError(
      'assignmentService must provide prepareScoreAssignments().',
    )
  }
  if (
    !rosterService ||
    typeof rosterService.listStudents !== 'function'
  ) {
    throw new TypeError(
      'rosterService must provide listStudents().',
    )
  }

  return Object.freeze({
    getViewModel() {
      const students = rosterService.listStudents({
        includeInactive: false,
      })

      return Object.freeze({
        students: Object.freeze(
          students.map((student) =>
            Object.freeze({
              studentId: student.studentId,
              displayNameOrNickname:
                student.displayNameOrNickname,
            }),
          ),
        ),
      })
    },

    prepare(input) {
      try {
        const assignments =
          assignmentService.prepareScoreAssignments(
            input,
          )

        return Object.freeze({
          ok: true,
          assignments,
          message:
            `${assignments.length} ödev hazırlandı.`,
        })
      } catch (error) {
        return Object.freeze({
          ok: false,
          assignments: Object.freeze([]),
          message: teacherMessage(error),
        })
      }
    },
  })
}
```

- [ ] **Step 4: Run controller + service tests and verify GREEN**

Run:

```bash
node --test   tests/teacherScoreAssignmentController.test.js   tests/teacherScoreAssignmentService.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add   src/services/teacherScoreAssignmentController.js   tests/teacherScoreAssignmentController.test.js
git commit -m "feat: add TD-04 teacher SCORE assignment controller"
```

---

### Task 4: Explicit-Mount `Ödevi Hazırla` UI

**Files:**
- Create: `src/teacherScoreAssignmentUi.js`
- Create: `src/teacherScoreAssignmentUi.css`
- Create: `tests/teacherScoreAssignmentUi.test.js`
- Create: `tests/support/fakeTeacherScoreAssignmentDom.js`

**Interfaces:**
- Consumes:
  - `controller.getViewModel()`
  - `controller.prepare(input)`
  - caller-supplied immutable `workspace`
  - caller-supplied exact `sourceNotes`
- Produces:
  - `mountTeacherScoreAssignmentUi({ root, host, controller, workspace, sourceNotes })`
  - frozen handle with `refresh()` and `destroy()`
- No automatic initialization.

- [ ] **Step 1: Create bounded fake DOM helper in the RED commit**

Create `tests/support/fakeTeacherScoreAssignmentDom.js` by copying the mechanics of `tests/support/fakeTeacherPoolDom.js` and adding selector support only for:

- `h2`
- `form`
- `button`
- class selectors
- `input[name="selectedStudentIds"]`
- `input[name="commonTeacherNote"]`
- `textarea[name="commonTeacherNote"]`
- `textarea[name="teacherNoteOverride"]`
- `input[type="checkbox"]:checked`
- `[data-student-id="..."]` only if required by the implementation tests.

Do not add a DOM package.

- [ ] **Step 2: Write failing UI tests**

Create `tests/teacherScoreAssignmentUi.test.js` with these behaviors:

```js
test('TD-04 UI explicitly mounts Ödevi Hazırla and uses no delivery wording', () => {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const fake = controllerFixture()

  const handle = mountTeacherScoreAssignmentUi({
    root,
    host,
    controller: fake.api,
    workspace: Object.freeze({ marker: 'workspace' }),
    sourceNotes: Object.freeze([]),
  })

  assert.equal(
    host.querySelector('h2').textContent,
    'Ödevi Hazırla',
  )
  assert.equal(typeof handle.refresh, 'function')
  assert.equal(typeof handle.destroy, 'function')
  assert.doesNotMatch(
    host.textContent || '',
    /gönderildi|teslim edildi/i,
  )
})

test('TD-04 UI keeps duplicate names separate by stable studentId', () => {
  // two students share the same displayNameOrNickname
  // checkbox values/ids must remain student-a and student-b.
})

test('TD-04 UI submits selected IDs, common note and selected-student overrides', () => {
  // select student-a + student-b
  // set common note
  // set only student-b override
  // submit
  // assert controller.prepare receives:
  // workspace, sourceNotes, studentIds in selection order,
  // commonTeacherNote,
  // teacherNoteOverrides: [{ studentId: 'student-b', teacherNote: '...' }]
})

test('TD-04 UI excludes stale override after student is deselected', () => {
  // select student-b; type override; then deselect student-b;
  // submit with only student-a selected;
  // assert no student-b override is submitted.
})

test('TD-04 UI displays bounded failure without clearing teacher input', () => {
  // controller returns { ok:false, assignments:[], message:'...' }
  // assert status text;
  // selected checkboxes and note values remain unchanged.
})

test('TD-04 UI destroy removes only its own mounted section', () => {
  // sentinel sibling remains.
})
```

Write each test fully with concrete fake controller data; do not leave comments in place of assertions in the committed test file.

- [ ] **Step 3: Run UI test and verify RED**

Run:

```bash
node --test tests/teacherScoreAssignmentUi.test.js
```

Expected: FAIL because `src/teacherScoreAssignmentUi.js` does not exist.

- [ ] **Step 4: Implement explicit-mount UI structure**

Create `src/teacherScoreAssignmentUi.js` with:

```js
function element(root, tag, className = '') {
  const node = root.createElement(tag)
  if (className) node.className = className
  return node
}

export function mountTeacherScoreAssignmentUi({
  root = document,
  host,
  controller,
  workspace,
  sourceNotes,
} = {}) {
  if (!host?.appendChild) {
    throw new TypeError(
      'host must be a DOM container.',
    )
  }
  if (
    !controller ||
    typeof controller.getViewModel !== 'function' ||
    typeof controller.prepare !== 'function'
  ) {
    throw new TypeError(
      'controller must provide getViewModel() and prepare().',
    )
  }
  if (!Array.isArray(sourceNotes)) {
    throw new TypeError(
      'sourceNotes must be an array.',
    )
  }

  const section = element(
    root,
    'section',
    'teacher-score-assignment',
  )
  const heading = element(root, 'h2')
  heading.textContent = 'Ödevi Hazırla'

  const form = element(
    root,
    'form',
    'teacher-score-assignment__form',
  )
  const studentList = element(
    root,
    'div',
    'teacher-score-assignment__students',
  )
  const commonNote = element(root, 'textarea')
  commonNote.name = 'commonTeacherNote'

  const submit = element(root, 'button')
  submit.type = 'submit'
  submit.textContent = 'Ödevi Hazırla'

  const status = element(
    root,
    'div',
    'teacher-score-assignment__status',
  )
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  form.appendChild(studentList)
  form.appendChild(commonNote)
  form.appendChild(submit)
  section.appendChild(heading)
  section.appendChild(form)
  section.appendChild(status)
  host.appendChild(section)

  function renderStudents(rows) {
    const prior = new Map()

    for (
      const row of studentList.querySelectorAll(
        'textarea[name="teacherNoteOverride"]',
      )
    ) {
      prior.set(
        row.dataset.studentId,
        row.value,
      )
    }

    studentList.replaceChildren()

    for (const row of rows) {
      const wrapper = element(
        root,
        'div',
        'teacher-score-assignment__student',
      )
      wrapper.dataset.studentId = row.studentId

      const checkbox = element(root, 'input')
      checkbox.type = 'checkbox'
      checkbox.name = 'selectedStudentIds'
      checkbox.value = row.studentId
      checkbox.id =
        `teacher-score-assignment-${row.studentId}`

      const label = element(root, 'span')
      label.textContent =
        row.displayNameOrNickname

      const override = element(root, 'textarea')
      override.name = 'teacherNoteOverride'
      override.dataset.studentId = row.studentId
      override.hidden = true
      override.value =
        prior.get(row.studentId) ?? ''

      checkbox.addEventListener('change', () => {
        override.hidden = !checkbox.checked
      })

      wrapper.appendChild(checkbox)
      wrapper.appendChild(label)
      wrapper.appendChild(override)
      studentList.appendChild(wrapper)
    }
  }

  function selectedStudentIds() {
    return [
      ...studentList.querySelectorAll(
        'input[type="checkbox"]:checked',
      ),
    ].map((node) => node.value)
  }

  function selectedOverrides(ids) {
    const selected = new Set(ids)
    return [
      ...studentList.querySelectorAll(
        'textarea[name="teacherNoteOverride"]',
      ),
    ]
      .filter(
        (node) =>
          selected.has(node.dataset.studentId) &&
          node.value !== '',
      )
      .map((node) => ({
        studentId: node.dataset.studentId,
        teacherNote: node.value,
      }))
  }

  function refresh() {
    const view = controller.getViewModel()
    renderStudents(view.students)
    return view
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault()

    const studentIds = selectedStudentIds()
    const result = controller.prepare({
      workspace,
      sourceNotes,
      studentIds,
      commonTeacherNote: commonNote.value,
      teacherNoteOverrides:
        selectedOverrides(studentIds),
    })

    status.textContent = result.message
  })

  refresh()

  return Object.freeze({
    refresh,
    destroy() {
      section.remove()
    },
  })
}
```

**Ruling for explicit empty override:** the UI cannot infer whether an empty visible textarea means “no override” or “explicitly clear common note” without a separate opt-in. Therefore the UI must include an override-enabled control per selected student if explicit empty override is to be expressible. Implement each student row with an `overrideEnabled` checkbox plus textarea; submit a row whenever override is enabled, including empty text. Tests must cover this. Do not use the simplified `node.value !== ''` filter above in the final implementation; it is structural pseudocode only for mount shape. The committed code must implement the approved C model exactly.

- [ ] **Step 5: Implement explicit override-enabled behavior**

For every student row add:

- selection checkbox: `name="selectedStudentIds"`;
- override-enabled checkbox: `name="teacherNoteOverrideEnabled"`;
- override textarea: `name="teacherNoteOverride"`.

Rules:

```text
student not selected
→ override-enabled hidden/disabled for submission
→ textarea hidden

student selected, override-enabled false
→ common note applies
→ no override row submitted

student selected, override-enabled true, textarea "Metronom 60"
→ override row submitted with text

student selected, override-enabled true, textarea ""
→ override row submitted with empty text
→ service creates explicit empty teacherNote
```

The test fixture must assert all four cases.

- [ ] **Step 6: Add scoped CSS**

Create `src/teacherScoreAssignmentUi.css`:

```css
.teacher-score-assignment {
  display: grid;
  gap: 1rem;
}

.teacher-score-assignment__form,
.teacher-score-assignment__students {
  display: grid;
  gap: 0.75rem;
}

.teacher-score-assignment__student {
  display: grid;
  gap: 0.35rem;
}

.teacher-score-assignment [hidden] {
  display: none;
}
```

Do not alter global shell/layout selectors.

- [ ] **Step 7: Run UI + controller tests and verify GREEN**

Run:

```bash
node --test   tests/teacherScoreAssignmentUi.test.js   tests/teacherScoreAssignmentController.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add   src/teacherScoreAssignmentUi.js   src/teacherScoreAssignmentUi.css   tests/teacherScoreAssignmentUi.test.js   tests/support/fakeTeacherScoreAssignmentDom.js
git commit -m "feat: add TD-04 explicit SCORE assignment UI"
```

---

### Task 5: Security Boundary and Implementation Documentation

**Files:**
- Create: `tests/teacherScoreAssignmentSecurity.test.js`
- Create: `docs/teacher-delivery-td04-score-private-assignment.md`
- Read-only checks:
  - `main.js`
  - `src/app.js`
  - `src/appShell.js`
  - `src/services/stageLShareReadiness.js`

- [ ] **Step 1: Write security source-boundary tests**

Create `tests/teacherScoreAssignmentSecurity.test.js`:

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const td04Sources = [
  '../src/services/teacherScoreAssignmentRepository.js',
  '../src/services/teacherScoreAssignmentService.js',
  '../src/services/teacherScoreAssignmentController.js',
  '../src/teacherScoreAssignmentUi.js',
]

test('TD-04 contains no provider, network, browser persistence or Student App implementation', () => {
  for (const path of td04Sources) {
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

test('TD-04 does not production-mount SCORE assignment UI', () => {
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
      /teacherScoreAssignmentUi|mountTeacherScoreAssignmentUi|teacher-score-assignment/i,
      path,
    )
  }
})

test('TD-04 source exposes no assignment lifecycle, revoke or Chord Board producer surface', () => {
  const combined = td04Sources
    .map((path) =>
      readFileSync(
        new URL(path, import.meta.url),
        'utf8',
      ),
    )
    .join('\n')

  assert.doesNotMatch(
    combined,
    /transitionAssignment|completeAssignment|promoteToRepertoire|revokeAssignment|CHORD_BOARD|chord-board/i,
  )
})

test('TD-04 UI copy prepares assignments and never claims delivery', () => {
  const source = readFileSync(
    new URL(
      '../src/teacherScoreAssignmentUi.js',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(source, /Ödevi Hazırla/)
  assert.doesNotMatch(
    source,
    /Gönderildi|Teslim edildi|Öğrenciye gönder/i,
  )
})

test('TD-04 does not change Stage L delivery boundary', () => {
  const source = readFileSync(
    new URL(
      '../src/services/stageLShareReadiness.js',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(
    source,
    /STAGE_L_DELIVERY_STATE = 'not_implemented'/,
  )
  assert.match(
    source,
    /deliveryAllowed:\s*false/,
  )
})
```

- [ ] **Step 2: Run security test**

Run:

```bash
node --test tests/teacherScoreAssignmentSecurity.test.js
```

Expected: PASS once Tasks 1–4 are complete.

- [ ] **Step 3: Write implemented contract documentation**

Create `docs/teacher-delivery-td04-score-private-assignment.md` with these exact sections:

```markdown
# TD-04 — SCORE Private Assignment

## Boundary

TD-04 prepares teacher-owned SCORE PrivateAssignment batches. It does not deliver them to Student App.

## Fan-out

One teacher action may select multiple active students. The domain creates one independent PrivateAssignment per normalized stable studentId.

## Notes

A common teacher note is the default. A per-student override replaces it. An explicitly enabled empty override clears the common note for that student.

## Exact SCORE source

Every student receives a fresh action-time ScoreAssignmentSourceBinding. Old UI readiness is not accepted as authority.

## Duplicate protection

Same studentId + sourceId + revisionId + SCORE is rejected as an existing exact assignment. A newer revision is a distinct assignment source.

## Atomic repository truth

The TD-04 in-memory reference repository validates the full batch before mutation. createBatch returns one frozen acknowledgement in deterministic order. Teacher success is reported only after exact acknowledgement validation.

## Teacher UI boundary

The explicit-mount UI offers active-student selection, common note, optional per-student overrides, and Ödevi Hazırla.

It is intentionally not mounted from main.js or App Shell.

## Deferred

- lifecycle and revoke: TD-05;
- authenticated persistence/delivery and Student App visibility: TD-06;
- Chord Board assignments: TD-07.
```

- [ ] **Step 4: Run TD-01/02/03/04 focused regression matrix**

Run:

```bash
node --test   tests/privateAssignment.test.js   tests/scoreAssignmentSourceBinding.test.js   tests/teacherDeliveryContracts.test.js   tests/teacherRosterRepository.test.js   tests/teacherRosterService.test.js   tests/teacherPoolRepository.test.js   tests/teacherPoolPublishingService.test.js   tests/teacherPoolPublishingController.test.js   tests/teacherPoolPublishingUi.test.js   tests/teacherScoreAssignmentRepository.test.js   tests/teacherScoreAssignmentService.test.js   tests/teacherScoreAssignmentController.test.js   tests/teacherScoreAssignmentUi.test.js   tests/teacherScoreAssignmentSecurity.test.js   tests/appShell.test.js
```

Expected: PASS, 0 failures.

- [ ] **Step 5: Commit security/docs slice**

```bash
git add   tests/teacherScoreAssignmentSecurity.test.js   docs/teacher-delivery-td04-score-private-assignment.md
git commit -m "test: lock TD-04 SCORE assignment boundaries"
```

---

### Task 6: Full Verification and Draft Implementation PR

**Files:**
- No planned product file changes.
- Verification only; PR metadata update.

- [ ] **Step 1: Verify changed-file scope**

Run:

```bash
git status --short
git diff --check
git diff --name-only main...HEAD
```

Expected changed surface only:

```text
docs/teacher-delivery-td04-score-private-assignment.md
src/services/teacherScoreAssignmentRepository.js
src/services/teacherScoreAssignmentService.js
src/services/teacherScoreAssignmentController.js
src/teacherScoreAssignmentUi.js
src/teacherScoreAssignmentUi.css
tests/teacherScoreAssignmentRepository.test.js
tests/teacherScoreAssignmentService.test.js
tests/teacherScoreAssignmentController.test.js
tests/teacherScoreAssignmentUi.test.js
tests/support/fakeTeacherScoreAssignmentDom.js
tests/teacherScoreAssignmentSecurity.test.js
```

If `main.js`, `src/app.js`, `src/appShell.js`, Stage L, Package 12, `privateAssignment.js`, `scoreAssignmentSourceBinding.js`, provider/backend, Student App, or TD-03 Pool files appear, stop and investigate before readiness.

- [ ] **Step 2: Run complete repository tests**

Run:

```bash
npm test
```

Expected: exit 0, 0 failed tests. Record exact total/pass/fail counts.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 4: Re-run TD-04 security/UI/controller after build**

Run:

```bash
node --test   tests/teacherScoreAssignmentSecurity.test.js   tests/teacherScoreAssignmentUi.test.js   tests/teacherScoreAssignmentController.test.js   tests/appShell.test.js
```

Expected: PASS.

- [ ] **Step 5: Create draft implementation PR**

Recommended branch:

```text
feat/td04-score-private-assignment
```

PR body must state:

- one assignment per student;
- common note + explicit per-student override;
- fresh exact SCORE source binding per student;
- same exact student/source/revision duplicate protection;
- one atomic `createBatch`;
- acknowledgement-gated teacher success;
- UI says `Ödevi Hazırla`, not delivered;
- no lifecycle/revoke;
- no Firebase/persistence/auth;
- no Student App/cross-repo;
- no Stage L delivery-state change;
- no production auto-mount.

- [ ] **Step 6: Verify exact implementation PR head**

On the exact PR head require:

- `test-and-build` success;
- production build success inside that workflow;
- protected S14/STI-17/PR-C/PR-D/PR-E/PR-F browser steps success;
- Playwright protected baseline success;
- SonarQube analysis success;
- SonarCloud Code Analysis success;
- base drift = 0 before merge-readiness claim;
- changed files restricted to the TD-04 planned surface.

Do not treat a different SHA's checks as evidence.

- [ ] **Step 7: Perform one whole-branch review**

Review `main...HEAD` against:

- this plan;
- `docs/superpowers/specs/2026-09-22-td04-score-private-assignment-design.md`;
- the five Review Focus cases above.

Any Critical/Important finding gets one TDD RED→GREEN fix pass plus a fresh full suite. Minor findings are reported, not silently expanded into scope.

- [ ] **Step 8: Stop before merge**

Report:

- current `main` SHA;
- implementation branch;
- PR number;
- exact PR head SHA;
- changed files;
- focused test result;
- full test count;
- build result;
- browser/quality checks;
- base drift;
- final-review findings/fixes;
- confirmation that TD-05/06/07 work did not begin.

Do not merge TD-04 without a new explicit human approval.

---

## Plan Self-Review

### Spec coverage

- one PrivateAssignment per selected student: Tasks 1–2;
- common note + per-student override + explicit empty override: Tasks 2 and 4;
- one coherent roster preflight: Task 2;
- fresh exact SCORE binding per student: Task 2;
- duplicate exact-source rule: Tasks 1–2;
- same student + new revision allowed: Tasks 1–2;
- atomic batch repository: Task 1;
- exact acknowledgement gate: Task 2;
- bounded teacher messages: Task 3;
- explicit-mount preparation UI: Task 4;
- no partial-success presentation: Tasks 2–4;
- no lifecycle/revoke/Chord Board/provider/Student App/Stage L widening: Task 5;
- exact-head verification: Task 6.

### Placeholder scan

No `TBD`, `TODO`, `FIXME`, “Similar to Task”, or generic “add error handling” step remains.

Task 4 includes one explicit ruling that replaces structural pseudocode with an override-enabled control so the approved explicit-empty override can actually be represented in UI. The committed implementation must follow Step 5, not the simplified filter shown in Step 4.

### Type consistency

Repository API throughout:
- `list()`
- `getByAssignmentId(assignmentId)`
- `findExactScoreAssignment({ studentId, sourceId, revisionId })`
- `createBatch(assignments)`

Service API throughout:
- `prepareScoreAssignments({ workspace, sourceNotes, studentIds, commonTeacherNote, teacherNoteOverrides })`

Factory APIs throughout:
- `createAssignmentId({ studentId, index })`
- `createReadinessIds({ studentId, index })`
- `now()`

Controller API throughout:
- `getViewModel()`
- `prepare(input)`

UI API throughout:
- `mountTeacherScoreAssignmentUi({ root, host, controller, workspace, sourceNotes })`

### Review Focus coverage

1. override identity/prototype/accessor/symbol confusion → Task 2 strict-input tests;
2. duplicate lookup substitution → Task 2 exact lookup identity validation;
3. factory instability → Task 2 call-count/malformed-authority tests;
4. acknowledgement reorder/substitution → Task 2 acknowledgement tests;
5. stale override leakage after deselection → Task 4 UI test.

## Execution Gate

After human approval of this implementation plan:

1. create a fresh implementation branch from current protected `main`;
2. execute Tasks 1–6 with TDD;
3. use Native or Subagent-driven execution as explicitly selected by the human partner;
4. stop at merge-ready exact-head verification;
5. merge only after a separate explicit approval.

TD-04 approval does not authorize TD-05, TD-06, or TD-07.
