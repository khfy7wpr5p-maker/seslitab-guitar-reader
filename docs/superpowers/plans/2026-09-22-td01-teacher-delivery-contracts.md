# TD-01 Teacher Delivery Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first provider-neutral Teacher Delivery contracts for stable student identity, Pool publication metadata, exact-current SCORE assignment source binding, isolated one-student PrivateAssignment records, and the teacher-owned assignment state machine without adding UI, persistence, Firebase, authentication, network delivery or Chord Board transport.

**Architecture:** TD-01 stays entirely inside pure immutable domain/services. Existing Package 8 exact-revision approval and Package 12 / Stage L readiness remain authoritative; the new SCORE source-binding factory calls the existing readiness evaluator at assignment-creation time and refuses to build a source reference unless the exact current revision is approved and `READY_EXACT_REVISION`. PoolItem and PrivateAssignment are strict frozen records with allow-listed fields so they cannot smuggle MusicXML, recipient lists or delivery claims into the wrong domain.

**Tech Stack:** Node.js 24, browser-compatible ES modules, Node `node:test`, existing Package 8 / Package 12 domain services, Vite production build. No new dependency.

**Spec:** `docs/superpowers/specs/2026-09-22-teacher-delivery-assignment-management-design.md`

## Scope and sequencing

This plan implements **TD-01 only**. It is intentionally the first bounded implementation PR.

Later stages require their own reviewed plans after TD-01 is merged and re-read:

- TD-02 — trusted roster repository/service;
- TD-03 — Pool publishing UI/service;
- TD-04 — SCORE private-assignment UI/service and multi-student fan-out;
- TD-05 — teacher lifecycle management UI/service;
- TD-06 — secure persistence/delivery adapter after a dedicated backend/security review;
- TD-07 — Chord Board adapter only after the SCORE delivery path is stable.

This is not a placeholder. TD-01 deliberately exports the stable contracts that those later stages consume while refusing capabilities that are not yet authorized.

## Global Constraints

- Protected `main` baseline at plan authoring: `d92670f6c659236902f41e46871c2ddd916eb7d1`.
- Protected-main required check observed: `test-and-build`.
- Use a dedicated implementation branch/worktree; never work directly on `main`.
- No UI wiring in TD-01.
- No `main.js`, `src/app.js`, Smoosic UI, Stage L UI or CSS changes in TD-01.
- No Firebase, backend, database, localStorage, IndexedDB, fetch, WebSocket, token, URL, email or messaging implementation.
- No OMR/Audiveris/Render/Docker/deployment change.
- No cross-repository write.
- No new dependency.
- `READY_EXACT_REVISION != DELIVERED_TO_STUDENT` remains true.
- Stage L must remain `deliveryState = not_implemented` and `deliveryAllowed = false`.
- SCORE binding must resolve the current teacher revision and current applicable approval at action time; cached UI readiness is not an input.
- A later correction or undo must not inherit an older approval or assignment source binding.
- Multi-student records are not implemented in TD-01; the PrivateAssignment contract must represent exactly one student so TD-04 can fan out N records safely.
- `CHORD_BOARD` is part of the practice-type vocabulary but creation must fail closed in TD-01 until TD-07 defines the exact immutable voicing snapshot.
- Caller supplies identifiers and timestamps; TD-01 domain code generates no UUID and no current time.
- Student-facing content is not produced in TD-01.
- All new records are strict frozen plain-data objects and validators reject mutable or extra-field records.

## Contract bounds selected for TD-01

These values are implementation bounds presented for review in this plan:

- IDs: maximum 256 characters.
- Human display name/nickname: maximum 160 characters.
- Pool title: maximum 160 characters.
- Pool short description: maximum 500 characters.
- Pool detail text: maximum 4000 characters.
- Per-student teacher note: maximum 2000 characters.
- Timestamp/audit label strings: maximum 128 characters.
- ID fields reject all C0 control characters and DEL.
- Human prose fields allow tab/newline/carriage return but reject other unsafe control characters.

## File Structure

### Create

- `src/services/teacherDeliveryContractValidation.js`
  - shared strict plain-input validation and bounded text/id helpers only;
  - no domain state and no provider code.
- `src/services/studentRosterEntry.js`
  - immutable `StudentRosterEntry` v1 model and validator.
- `src/services/poolItem.js`
  - immutable `PoolItem` v1, `ALL | SELECTED` audience rules and recipient normalization.
- `src/services/scoreAssignmentSourceBinding.js`
  - exact-current SCORE source reference built only through Package 8 + Stage L readiness.
- `src/services/privateAssignment.js`
  - immutable one-student `PrivateAssignment` v1, `SCORE | CHORD_BOARD` vocabulary and allowed teacher state transitions.
- `tests/studentRosterEntry.test.js`
- `tests/poolItem.test.js`
- `tests/scoreAssignmentSourceBinding.test.js`
- `tests/privateAssignment.test.js`
- `tests/teacherDeliveryContracts.test.js`
- `docs/teacher-delivery-td01-contracts.md`
  - bounded implemented-contract note after tests are green; do not edit current-status/package-status/teacher-score-editor-architecture while PR #192 remains open.

### Do not modify

- `src/services/stageLShareReadiness.js`
- `src/stageLShareUi.js`
- `src/services/teacherShareAuthorization.js`
- `src/services/teacherShareEligibility.js`
- `src/services/teacherCorrectionRevalidation.js`
- `src/services/teacherStructuralCorrectionRevalidation.js`
- `src/services/teacherWorkspaceModel.js`
- `main.js`
- `src/app.js`
- OMR/backend/deployment files
- cross-repository sources

## Review Focus

1. **Oversized/control-character identity input:** an ID such as `"student\u0000x"` or 257 characters must be rejected before it can become roster, Pool recipient or assignment identity. Task 1 pins this.
2. **Audience ambiguity:** `ALL` with recipients and `SELECTED` with an empty post-normalization list must fail; whitespace duplicates such as `" student-1 "` and `"student-1"` must become one stable recipient. Task 2 pins this.
3. **Stale approval after correction/undo:** a workspace that was approved and then changed must not produce a SCORE source binding until the new exact current revision is approved and ready. Task 3 pins this.
4. **Missing/downgraded source quality:** exact teacher approval alone must not create a SCORE binding; the Package 12 readiness route must still reject missing live source-quality evidence. Task 3 pins this.
5. **Premature Chord Board transport:** asking TD-01 to create a `CHORD_BOARD` PrivateAssignment must fail closed rather than accepting an arbitrary snapshot/object. Task 4 pins this.

---

### Task 1: Shared Contract Validation + StudentRosterEntry

**Files:**
- Create: `src/services/teacherDeliveryContractValidation.js`
- Create: `src/services/studentRosterEntry.js`
- Create: `tests/studentRosterEntry.test.js`

**Interfaces:**
- Consumes: no product domain service.
- Produces:
  - `DELIVERY_MAX_ID_LENGTH = 256`
  - `DELIVERY_MAX_DISPLAY_NAME_LENGTH = 160`
  - `DELIVERY_MAX_TIMESTAMP_LENGTH = 128`
  - `assertStrictInputObject(input, allowedFields, label)`
  - `normalizeRequiredId(value, fieldName)`
  - `normalizeRequiredText(value, fieldName, maxLength)`
  - `normalizeOptionalText(value, fieldName, maxLength)`
  - `normalizeRequiredTimestamp(value, fieldName)`
  - `normalizeNullableTimestamp(value, fieldName)`
  - `isStrictFrozenRecord(value, fields)`
  - `STUDENT_ROSTER_ENTRY_SCHEMA_VERSION = 1`
  - `createStudentRosterEntry(input)`
  - `isStudentRosterEntry(value)`

- [ ] **Step 1: Write the failing StudentRosterEntry tests**

Create `tests/studentRosterEntry.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STUDENT_ROSTER_ENTRY_SCHEMA_VERSION,
  createStudentRosterEntry,
  isStudentRosterEntry,
} from '../src/services/studentRosterEntry.js'

test('TD-01 StudentRosterEntry is strict immutable stable-id data', () => {
  const entry = createStudentRosterEntry({
    studentId: ' student-1 ',
    displayNameOrNickname: ' Deniz ',
    active: true,
  })

  assert.equal(STUDENT_ROSTER_ENTRY_SCHEMA_VERSION, 1)
  assert.equal(Object.isFrozen(entry), true)
  assert.equal(entry.studentId, 'student-1')
  assert.equal(entry.displayNameOrNickname, 'Deniz')
  assert.equal(entry.active, true)
  assert.equal(isStudentRosterEntry(entry), true)
})

test('TD-01 display name never replaces stable authorization identity', () => {
  const a = createStudentRosterEntry({
    studentId: 'student-a',
    displayNameOrNickname: 'Deniz',
    active: true,
  })
  const b = createStudentRosterEntry({
    studentId: 'student-b',
    displayNameOrNickname: 'Deniz',
    active: true,
  })

  assert.equal(a.displayNameOrNickname, b.displayNameOrNickname)
  assert.notEqual(a.studentId, b.studentId)
})

test('TD-01 rejects malformed, control-character and oversized roster identity', () => {
  assert.throws(
    () => createStudentRosterEntry({
      studentId: '',
      displayNameOrNickname: 'Deniz',
      active: true,
    }),
    /studentId/,
  )

  assert.throws(
    () => createStudentRosterEntry({
      studentId: 'student\u0000x',
      displayNameOrNickname: 'Deniz',
      active: true,
    }),
    /studentId/,
  )

  assert.throws(
    () => createStudentRosterEntry({
      studentId: 's'.repeat(257),
      displayNameOrNickname: 'Deniz',
      active: true,
    }),
    /studentId/,
  )
})

test('TD-01 rejects unsupported roster input fields and forged records', () => {
  assert.throws(
    () => createStudentRosterEntry({
      studentId: 'student-1',
      displayNameOrNickname: 'Deniz',
      active: true,
      authorizationRole: 'admin',
    }),
    /unsupported field/,
  )

  const valid = createStudentRosterEntry({
    studentId: 'student-1',
    displayNameOrNickname: 'Deniz',
    active: false,
  })
  assert.equal(isStudentRosterEntry(structuredClone(valid)), false)
  assert.equal(
    isStudentRosterEntry(Object.freeze({ ...valid, authorizationRole: 'admin' })),
    false,
  )
})

test('TD-01 active must be an explicit boolean', () => {
  for (const active of [undefined, null, 1, 'true']) {
    assert.throws(
      () => createStudentRosterEntry({
        studentId: 'student-1',
        displayNameOrNickname: 'Deniz',
        active,
      }),
      /active/,
    )
  }
})
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
node --test tests/studentRosterEntry.test.js
```

Expected: FAIL because `src/services/studentRosterEntry.js` does not exist.

- [ ] **Step 3: Add strict shared validation helpers**

Create `src/services/teacherDeliveryContractValidation.js` with this public shape:

```js
export const DELIVERY_MAX_ID_LENGTH = 256
export const DELIVERY_MAX_DISPLAY_NAME_LENGTH = 160
export const DELIVERY_MAX_TIMESTAMP_LENGTH = 128

const ID_CONTROL = /[\u0000-\u001f\u007f]/u
const PROSE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u

export function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function assertStrictInputObject(input, allowedFields, label) {
  if (!isPlainObject(input)) {
    throw new TypeError(`${label} input must be a plain object.`)
  }

  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !allowedFields.includes(key)) {
      throw new TypeError(`${label} input contains an unsupported field.`)
    }
  }

  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(input))) {
    if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new TypeError(`${label} input field ${key} must be enumerable plain data.`)
    }
  }
}

export function normalizeRequiredId(value, fieldName) {
  if (typeof value !== 'string') throw new TypeError(`${fieldName} must be a string.`)
  const normalized = value.trim()
  if (
    normalized === '' ||
    normalized.length > DELIVERY_MAX_ID_LENGTH ||
    ID_CONTROL.test(normalized)
  ) {
    throw new TypeError(`${fieldName} contains unsupported identity text.`)
  }
  return normalized
}

export function normalizeRequiredText(value, fieldName, maxLength) {
  if (typeof value !== 'string') throw new TypeError(`${fieldName} must be text.`)
  const normalized = value.trim()
  if (normalized === '' || normalized.length > maxLength || PROSE_CONTROL.test(normalized)) {
    throw new TypeError(`${fieldName} contains unsupported text.`)
  }
  return normalized
}

export function normalizeOptionalText(value, fieldName, maxLength) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value !== 'string') throw new TypeError(`${fieldName} must be text.`)
  const normalized = value.trim()
  if (normalized.length > maxLength || PROSE_CONTROL.test(normalized)) {
    throw new TypeError(`${fieldName} contains unsupported text.`)
  }
  return normalized
}

export function normalizeRequiredTimestamp(value, fieldName) {
  if (typeof value !== 'string') throw new TypeError(`${fieldName} must be text.`)
  const normalized = value.trim()
  if (
    normalized === '' ||
    normalized.length > DELIVERY_MAX_TIMESTAMP_LENGTH ||
    ID_CONTROL.test(normalized)
  ) {
    throw new TypeError(`${fieldName} contains unsupported timestamp text.`)
  }
  return normalized
}

export function normalizeNullableTimestamp(value, fieldName) {
  if (value === null || value === undefined) return null
  return normalizeRequiredTimestamp(value, fieldName)
}

export function isStrictFrozenRecord(value, fields) {
  if (!isPlainObject(value) || !Object.isFrozen(value)) return false
  const keys = Reflect.ownKeys(value)
  if (
    keys.length !== fields.length ||
    keys.some((key) => typeof key !== 'string' || !fields.includes(key))
  ) {
    return false
  }

  const descriptors = Object.getOwnPropertyDescriptors(value)
  return fields.every((field) => {
    const descriptor = descriptors[field]
    return Boolean(
      descriptor &&
      descriptor.enumerable &&
      descriptor.configurable === false &&
      descriptor.writable === false &&
      Object.prototype.hasOwnProperty.call(descriptor, 'value'),
    )
  })
}
```

The helper must not import browser, backend, Firebase or storage code.

- [ ] **Step 4: Implement StudentRosterEntry**

Create `src/services/studentRosterEntry.js`:

```js
import {
  DELIVERY_MAX_DISPLAY_NAME_LENGTH,
  assertStrictInputObject,
  isStrictFrozenRecord,
  normalizeRequiredId,
  normalizeRequiredText,
} from './teacherDeliveryContractValidation.js'

export const STUDENT_ROSTER_ENTRY_SCHEMA_VERSION = 1

const INPUT_FIELDS = Object.freeze([
  'studentId',
  'displayNameOrNickname',
  'active',
])

const RECORD_FIELDS = Object.freeze([
  'schemaVersion',
  'studentId',
  'displayNameOrNickname',
  'active',
])

export function createStudentRosterEntry(input = {}) {
  assertStrictInputObject(input, INPUT_FIELDS, 'StudentRosterEntry')

  const studentId = normalizeRequiredId(input.studentId, 'studentId')
  const displayNameOrNickname = normalizeRequiredText(
    input.displayNameOrNickname,
    'displayNameOrNickname',
    DELIVERY_MAX_DISPLAY_NAME_LENGTH,
  )
  if (typeof input.active !== 'boolean') {
    throw new TypeError('active must be a boolean.')
  }

  return Object.freeze({
    schemaVersion: STUDENT_ROSTER_ENTRY_SCHEMA_VERSION,
    studentId,
    displayNameOrNickname,
    active: input.active,
  })
}

export function isStudentRosterEntry(value) {
  try {
    return (
      value?.schemaVersion === STUDENT_ROSTER_ENTRY_SCHEMA_VERSION &&
      isStrictFrozenRecord(value, RECORD_FIELDS) &&
      normalizeRequiredId(value.studentId, 'studentId') === value.studentId &&
      normalizeRequiredText(
        value.displayNameOrNickname,
        'displayNameOrNickname',
        DELIVERY_MAX_DISPLAY_NAME_LENGTH,
      ) === value.displayNameOrNickname &&
      typeof value.active === 'boolean'
    )
  } catch {
    return false
  }
}
```

- [ ] **Step 5: Run focused test and verify GREEN**

Run:

```bash
node --test tests/studentRosterEntry.test.js
```

Expected: PASS, 0 failures.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/services/teacherDeliveryContractValidation.js src/services/studentRosterEntry.js tests/studentRosterEntry.test.js
git commit -m "feat: add TD-01 student roster contract"
```

---

### Task 2: PoolItem Contract and Audience Isolation

**Files:**
- Create: `src/services/poolItem.js`
- Create: `tests/poolItem.test.js`
- Reuse: `src/services/teacherDeliveryContractValidation.js`

**Interfaces:**
- Consumes:
  - `normalizeRequiredId`
  - `normalizeRequiredText`
  - `normalizeOptionalText`
  - `normalizeRequiredTimestamp`
  - `isStrictFrozenRecord`
- Produces:
  - `POOL_ITEM_SCHEMA_VERSION = 1`
  - `POOL_AUDIENCE_MODE.ALL = 'ALL'`
  - `POOL_AUDIENCE_MODE.SELECTED = 'SELECTED'`
  - `createPoolItem(input)`
  - `isPoolItem(value)`

- [ ] **Step 1: Write the failing PoolItem tests**

Create `tests/poolItem.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  POOL_AUDIENCE_MODE,
  POOL_ITEM_SCHEMA_VERSION,
  createPoolItem,
  isPoolItem,
} from '../src/services/poolItem.js'

test('TD-01 PoolItem defaults to ALL and contains no score/practice payload', () => {
  const item = createPoolItem({
    poolItemId: 'pool-1',
    title: 'Yeni repertuar',
    shortDescription: 'Bu hafta çalışılacak eserler',
    detailText: 'Ayrıntılı öğretmen duyurusu.',
    publishedAt: '2026-09-22T16:00:00Z',
  })

  assert.equal(POOL_ITEM_SCHEMA_VERSION, 1)
  assert.equal(item.audienceMode, POOL_AUDIENCE_MODE.ALL)
  assert.deepEqual(item.recipientStudentIds, [])
  assert.equal(item.revokedAt, null)
  assert.equal(Object.isFrozen(item), true)
  assert.equal(Object.isFrozen(item.recipientStudentIds), true)
  assert.equal(isPoolItem(item), true)

  for (const forbidden of [
    'musicXml',
    'practicePackage',
    'notation',
    'playbackPlan',
    'revisionId',
    'provider',
  ]) {
    assert.equal(Object.hasOwn(item, forbidden), false)
  }
})

test('TD-01 SELECTED normalizes and deduplicates stable student IDs', () => {
  const item = createPoolItem({
    poolItemId: 'pool-2',
    title: 'Seçili öğrenciler',
    shortDescription: 'Duyuru',
    detailText: '',
    publishedAt: '2026-09-22T16:01:00Z',
    audienceMode: POOL_AUDIENCE_MODE.SELECTED,
    recipientStudentIds: [' student-1 ', 'student-2', 'student-1'],
  })

  assert.deepEqual(item.recipientStudentIds, ['student-1', 'student-2'])
})

test('TD-01 ALL forbids recipients and SELECTED requires recipients', () => {
  assert.throws(
    () => createPoolItem({
      poolItemId: 'pool-all-bad',
      title: 'Duyuru',
      shortDescription: 'Kısa',
      detailText: '',
      publishedAt: '2026-09-22T16:02:00Z',
      audienceMode: POOL_AUDIENCE_MODE.ALL,
      recipientStudentIds: ['student-1'],
    }),
    /ALL.*recipient/i,
  )

  assert.throws(
    () => createPoolItem({
      poolItemId: 'pool-selected-bad',
      title: 'Duyuru',
      shortDescription: 'Kısa',
      detailText: '',
      publishedAt: '2026-09-22T16:02:00Z',
      audienceMode: POOL_AUDIENCE_MODE.SELECTED,
      recipientStudentIds: [],
    }),
    /SELECTED.*recipient/i,
  )
})

test('TD-01 PoolItem rejects malformed recipients and unsupported payload fields', () => {
  assert.throws(
    () => createPoolItem({
      poolItemId: 'pool-3',
      title: 'Duyuru',
      shortDescription: 'Kısa',
      detailText: '',
      publishedAt: '2026-09-22T16:03:00Z',
      audienceMode: POOL_AUDIENCE_MODE.SELECTED,
      recipientStudentIds: ['student\u0000x'],
    }),
    /recipientStudentIds/,
  )

  assert.throws(
    () => createPoolItem({
      poolItemId: 'pool-4',
      title: 'Duyuru',
      shortDescription: 'Kısa',
      detailText: '',
      publishedAt: '2026-09-22T16:03:00Z',
      musicXml: '<score-partwise/>',
    }),
    /unsupported field/,
  )
})

test('TD-01 PoolItem validator rejects mutable and extra-field records', () => {
  const valid = createPoolItem({
    poolItemId: 'pool-5',
    title: 'Duyuru',
    shortDescription: 'Kısa',
    detailText: '',
    publishedAt: '2026-09-22T16:04:00Z',
  })

  assert.equal(isPoolItem(structuredClone(valid)), false)
  assert.equal(isPoolItem(Object.freeze({ ...valid, safeToShare: true })), false)
})
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
node --test tests/poolItem.test.js
```

Expected: FAIL because `src/services/poolItem.js` does not exist.

- [ ] **Step 3: Implement PoolItem with explicit audience rules**

Create `src/services/poolItem.js` with these constants and normalization rules:

```js
import {
  assertStrictInputObject,
  isStrictFrozenRecord,
  normalizeOptionalText,
  normalizeRequiredId,
  normalizeRequiredText,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

export const POOL_ITEM_SCHEMA_VERSION = 1
export const POOL_ITEM_MAX_TITLE_LENGTH = 160
export const POOL_ITEM_MAX_SHORT_DESCRIPTION_LENGTH = 500
export const POOL_ITEM_MAX_DETAIL_TEXT_LENGTH = 4000

export const POOL_AUDIENCE_MODE = Object.freeze({
  ALL: 'ALL',
  SELECTED: 'SELECTED',
})

const INPUT_FIELDS = Object.freeze([
  'poolItemId',
  'title',
  'shortDescription',
  'detailText',
  'publishedAt',
  'audienceMode',
  'recipientStudentIds',
])

const RECORD_FIELDS = Object.freeze([
  'schemaVersion',
  'poolItemId',
  'title',
  'shortDescription',
  'detailText',
  'publishedAt',
  'audienceMode',
  'recipientStudentIds',
  'revokedAt',
])

function normalizeRecipients(value) {
  if (!Array.isArray(value)) {
    throw new TypeError('recipientStudentIds must be an array.')
  }

  const seen = new Set()
  const normalized = []
  for (const raw of value) {
    const studentId = normalizeRequiredId(raw, 'recipientStudentIds entry')
    if (seen.has(studentId)) continue
    seen.add(studentId)
    normalized.push(studentId)
  }
  return Object.freeze(normalized)
}

export function createPoolItem(input = {}) {
  assertStrictInputObject(input, INPUT_FIELDS, 'PoolItem')

  const audienceMode = input.audienceMode ?? POOL_AUDIENCE_MODE.ALL
  if (!Object.values(POOL_AUDIENCE_MODE).includes(audienceMode)) {
    throw new TypeError('audienceMode must be ALL or SELECTED.')
  }

  const recipients = normalizeRecipients(input.recipientStudentIds ?? [])
  if (audienceMode === POOL_AUDIENCE_MODE.ALL && recipients.length !== 0) {
    throw new Error('ALL PoolItem must not contain recipientStudentIds.')
  }
  if (audienceMode === POOL_AUDIENCE_MODE.SELECTED && recipients.length === 0) {
    throw new Error('SELECTED PoolItem requires at least one recipientStudentIds entry.')
  }

  return Object.freeze({
    schemaVersion: POOL_ITEM_SCHEMA_VERSION,
    poolItemId: normalizeRequiredId(input.poolItemId, 'poolItemId'),
    title: normalizeRequiredText(input.title, 'title', POOL_ITEM_MAX_TITLE_LENGTH),
    shortDescription: normalizeRequiredText(
      input.shortDescription,
      'shortDescription',
      POOL_ITEM_MAX_SHORT_DESCRIPTION_LENGTH,
    ),
    detailText: normalizeOptionalText(
      input.detailText,
      'detailText',
      POOL_ITEM_MAX_DETAIL_TEXT_LENGTH,
    ),
    publishedAt: normalizeRequiredTimestamp(input.publishedAt, 'publishedAt'),
    audienceMode,
    recipientStudentIds: recipients,
    revokedAt: null,
  })
}
```

Implement `isPoolItem(value)` as a strict frozen-record validator over exactly `RECORD_FIELDS`. It must:

- validate every scalar field with the same normalization functions;
- require `revokedAt === null` in TD-01-created records;
- require `recipientStudentIds` to be frozen;
- require recipient IDs to already be normalized and unique;
- enforce the same ALL/SELECTED invariants;
- return `false` rather than throw.

Do not add a revoke mutation/factory in TD-01; revocation behavior belongs to TD-03.

- [ ] **Step 4: Run focused test and verify GREEN**

Run:

```bash
node --test tests/poolItem.test.js
```

Expected: PASS, 0 failures.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/services/poolItem.js tests/poolItem.test.js
git commit -m "feat: add TD-01 pool item contract"
```

---

### Task 3: Exact-Current SCORE Assignment Source Binding

**Files:**
- Create: `src/services/scoreAssignmentSourceBinding.js`
- Create: `tests/scoreAssignmentSourceBinding.test.js`
- Read-only dependency: `src/services/teacherWorkspaceModel.js`
- Read-only dependency: `src/services/stageLShareReadiness.js`

**Interfaces:**
- Consumes:
  - `getTeacherWorkspaceCurrentRevision(workspace)`
  - `getTeacherWorkspaceApplicableApproval(workspace)`
  - `evaluateStageLShareReadiness({...})`
  - `STAGE_L_SHARE_READINESS_STATUS.READY_EXACT_REVISION`
  - `STAGE_L_DELIVERY_STATE`
- Produces:
  - `SCORE_ASSIGNMENT_SOURCE_SCHEMA_VERSION = 1`
  - `SCORE_ASSIGNMENT_SOURCE_KIND = 'score_exact_revision'`
  - `createScoreAssignmentSourceBinding(input)`
  - `isScoreAssignmentSourceBinding(value)`

The source binding is teacher-side internal evidence. It is not a Student App payload.

Record fields:

```text
schemaVersion
sourceKind
studentId
sourceId
sourceRevisionId
revisionId
revisionKind
contentFingerprint
lineageFingerprint
approvalId
authorizationId
qualityEvidenceId
revalidationEvidenceId
readinessRoute
package12Status
boundAt
```

- [ ] **Step 1: Write the failing SCORE binding tests**

Create `tests/scoreAssignmentSourceBinding.test.js`.

Use the repository's established Package 2C DOMParser polyfill and an exact minimal verified fixture:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import '../scripts/runOmrQualityReport.js'

import {
  CANONICAL_NOTE_SCHEMA_VERSION,
  CANONICAL_VERIFICATION_STATUS,
} from '../noteTheory.js'
import { prepareMusicXmlQualityGate } from '../src/services/appQualityGate.js'
import {
  applyTeacherWorkspaceCorrection,
  approveTeacherWorkspace,
  createTeacherWorkspace,
} from '../src/services/teacherWorkspaceModel.js'
import {
  createScoreAssignmentSourceBinding,
  isScoreAssignmentSourceBinding,
} from '../src/services/scoreAssignmentSourceBinding.js'

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
    pitch: { valid: true, status: CANONICAL_VERIFICATION_STATUS.VERIFIED },
    time: { valid: true, status: CANONICAL_VERIFICATION_STATUS.VERIFIED },
  }
}

function verifiedNotes() {
  return ['Do', 'Re', 'Mi', 'Fa'].map((noteName, index) => ({
    partId: 'P1',
    measureNumber: 1,
    measureKey: 'P1:0',
    measureIndex: 0,
    voice: 1,
    staff: 1,
    startBeat: index,
    beats: 1,
    noteName,
    sourceVerificationState: verificationState(),
  }))
}

function workspaceFor(notes) {
  return createTeacherWorkspace({
    content: notes,
    actorId: 'teacher-1',
    sourceId: 'score-1',
    automaticRevisionId: 'auto-1',
    historyId: 'history-1',
    createdAt: '2026-09-22T16:10:00Z',
  })
}

function approve(workspace, approvalId = 'approval-1') {
  return approveTeacherWorkspace({
    workspace,
    approvalId,
    createdAt: '2026-09-22T16:11:00Z',
  })
}

function bind(workspace, notes) {
  return createScoreAssignmentSourceBinding({
    workspace,
    sourceNotes: notes,
    studentId: 'student-1',
    authorizationId: 'td01-auth-1',
    rootQualityEvidenceId: 'td01-quality-1',
    revalidationEvidenceId: 'td01-revalidation-1',
    createdAt: '2026-09-22T16:12:00Z',
  })
}

test('TD-01 creates a frozen SCORE source binding only from current ready exact revision', () => {
  const notes = verifiedNotes()
  prepareMusicXmlQualityGate(notes, VALID_XML)
  const workspace = approve(workspaceFor(notes))

  const binding = bind(workspace, notes)

  assert.equal(Object.isFrozen(binding), true)
  assert.equal(binding.sourceKind, 'score_exact_revision')
  assert.equal(binding.studentId, 'student-1')
  assert.equal(binding.sourceId, 'score-1')
  assert.equal(binding.revisionId, 'auto-1')
  assert.equal(binding.approvalId, 'approval-1')
  assert.equal(binding.authorizationId, 'td01-auth-1')
  assert.equal(isScoreAssignmentSourceBinding(binding), true)

  for (const forbidden of [
    'content',
    'payload',
    'bytes',
    'musicXml',
    'token',
    'url',
    'deliveryAllowed',
    'studentContent',
  ]) {
    assert.equal(Object.hasOwn(binding, forbidden), false)
  }
})

test('TD-01 exact approval alone is insufficient without live Package 12 readiness', () => {
  const notes = verifiedNotes()
  const workspace = approve(workspaceFor(notes))

  assert.throws(
    () => bind(workspace, notes),
    /score-assignment-readiness-not-eligible/,
  )
})

test('TD-01 refuses SCORE binding before exact current teacher approval', () => {
  const notes = verifiedNotes()
  prepareMusicXmlQualityGate(notes, VALID_XML)

  assert.throws(
    () => bind(workspaceFor(notes), notes),
    /score-assignment-approval-required/,
  )
})

test('TD-01 old approval does not survive a later correction', () => {
  const notes = verifiedNotes()
  prepareMusicXmlQualityGate(notes, VALID_XML)
  const approved = approve(workspaceFor(notes))
  const corrected = applyTeacherWorkspaceCorrection({
    workspace: approved,
    fieldKey: '0:beats',
    value: 2,
    revisionId: 'corrected-1',
    eventId: 'correction-1',
    operationId: 'operation-1',
    createdAt: '2026-09-22T16:13:00Z',
  })

  assert.throws(
    () => bind(corrected, notes),
    /score-assignment-approval-required/,
  )
})

test('TD-01 source binding cannot be forged by clone or extra delivery field', () => {
  const notes = verifiedNotes()
  prepareMusicXmlQualityGate(notes, VALID_XML)
  const valid = bind(approve(workspaceFor(notes)), notes)

  assert.equal(isScoreAssignmentSourceBinding(structuredClone(valid)), false)
  assert.equal(
    isScoreAssignmentSourceBinding(Object.freeze({ ...valid, delivered: true })),
    false,
  )
})
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
node --test tests/scoreAssignmentSourceBinding.test.js
```

Expected: FAIL because `scoreAssignmentSourceBinding.js` does not exist.

- [ ] **Step 3: Implement the exact-current SCORE source factory**

Create `src/services/scoreAssignmentSourceBinding.js`:

```js
import {
  getTeacherWorkspaceApplicableApproval,
  getTeacherWorkspaceCurrentRevision,
} from './teacherWorkspaceModel.js'
import {
  STAGE_L_DELIVERY_STATE,
  STAGE_L_SHARE_READINESS_STATUS,
  evaluateStageLShareReadiness,
} from './stageLShareReadiness.js'
import {
  assertStrictInputObject,
  isStrictFrozenRecord,
  normalizeNullableTimestamp,
  normalizeRequiredId,
} from './teacherDeliveryContractValidation.js'

export const SCORE_ASSIGNMENT_SOURCE_SCHEMA_VERSION = 1
export const SCORE_ASSIGNMENT_SOURCE_KIND = 'score_exact_revision'

const INPUT_FIELDS = Object.freeze([
  'workspace',
  'sourceNotes',
  'studentId',
  'authorizationId',
  'rootQualityEvidenceId',
  'revalidationEvidenceId',
  'createdAt',
])

const RECORD_FIELDS = Object.freeze([
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
])

function nullableId(value, fieldName) {
  if (value === null) return null
  return normalizeRequiredId(value, fieldName)
}

export function createScoreAssignmentSourceBinding(input = {}) {
  assertStrictInputObject(input, INPUT_FIELDS, 'ScoreAssignmentSourceBinding')

  const studentId = normalizeRequiredId(input.studentId, 'studentId')
  const authorizationId = normalizeRequiredId(input.authorizationId, 'authorizationId')
  const rootQualityEvidenceId = normalizeRequiredId(
    input.rootQualityEvidenceId,
    'rootQualityEvidenceId',
  )
  const revalidationEvidenceId = normalizeRequiredId(
    input.revalidationEvidenceId,
    'revalidationEvidenceId',
  )
  const boundAt = normalizeNullableTimestamp(input.createdAt, 'createdAt')

  if (!Array.isArray(input.sourceNotes)) {
    throw new TypeError('sourceNotes must be the exact automatic source NoteObject array.')
  }

  const revision = getTeacherWorkspaceCurrentRevision(input.workspace)
  const approval = getTeacherWorkspaceApplicableApproval(input.workspace)
  if (!approval) {
    throw new Error('score-assignment-approval-required')
  }

  const readiness = evaluateStageLShareReadiness({
    workspace: input.workspace,
    sourceNotes: input.sourceNotes,
    recipientId: studentId,
    authorizationId,
    rootQualityEvidenceId,
    revalidationEvidenceId,
    createdAt: boundAt,
  })

  if (
    readiness.deliveryState !== STAGE_L_DELIVERY_STATE ||
    readiness.deliveryAllowed !== false
  ) {
    throw new Error('stage-l-delivery-boundary-changed')
  }

  if (
    readiness.status !== STAGE_L_SHARE_READINESS_STATUS.READY_EXACT_REVISION ||
    readiness.eligible !== true
  ) {
    throw new Error(
      `score-assignment-readiness-not-eligible:${readiness.status}:${readiness.package12Status ?? 'none'}`,
    )
  }

  if (
    readiness.revisionId !== revision.revisionId ||
    readiness.recipientId !== studentId
  ) {
    throw new Error('score-assignment-readiness-binding-mismatch')
  }

  return Object.freeze({
    schemaVersion: SCORE_ASSIGNMENT_SOURCE_SCHEMA_VERSION,
    sourceKind: SCORE_ASSIGNMENT_SOURCE_KIND,
    studentId,
    sourceId: revision.sourceId,
    sourceRevisionId: revision.sourceRevisionId,
    revisionId: revision.revisionId,
    revisionKind: revision.revisionKind,
    contentFingerprint: revision.contentFingerprint,
    lineageFingerprint: revision.lineageFingerprint,
    approvalId: approval.approvalId,
    authorizationId: readiness.authorizationId,
    qualityEvidenceId: readiness.qualityEvidenceId,
    revalidationEvidenceId: readiness.revalidationEvidenceId,
    readinessRoute: readiness.route,
    package12Status: readiness.package12Status,
    boundAt,
  })
}
```

Implement `isScoreAssignmentSourceBinding(value)` as a strict frozen validator over `RECORD_FIELDS`:

- exact schema/kind;
- normalized IDs;
- `qualityEvidenceId` required for a ready result;
- `revalidationEvidenceId` may be null for the automatic T2 route;
- `boundAt` may be null or a normalized timestamp;
- no extra fields;
- return false rather than throw.

Do not add any network/persistence code and do not modify Stage L.

- [ ] **Step 4: Run SCORE binding tests and existing Stage L regressions**

Run:

```bash
node --test tests/scoreAssignmentSourceBinding.test.js tests/stageLShareReadiness.test.js tests/teacherShareAuthorization.test.js tests/teacherShareEligibility.test.js tests/teacherCorrectionRevalidation.test.js tests/teacherStructuralCorrectionRevalidation.test.js
```

Expected: PASS, 0 failures.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/services/scoreAssignmentSourceBinding.js tests/scoreAssignmentSourceBinding.test.js
git commit -m "feat: bind TD-01 score assignments to exact readiness"
```

---

### Task 4: One-Student PrivateAssignment + Teacher State Machine

**Files:**
- Create: `src/services/privateAssignment.js`
- Create: `tests/privateAssignment.test.js`

**Interfaces:**
- Consumes:
  - `isScoreAssignmentSourceBinding(sourceRef)`
  - shared TD-01 bounded validators.
- Produces:
  - `PRIVATE_ASSIGNMENT_SCHEMA_VERSION = 1`
  - `PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE = 'SCORE'`
  - `PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD = 'CHORD_BOARD'`
  - `PRIVATE_ASSIGNMENT_STATE.ACTIVE = 'ACTIVE'`
  - `PRIVATE_ASSIGNMENT_STATE.COMPLETED = 'COMPLETED'`
  - `PRIVATE_ASSIGNMENT_STATE.REPERTOIRE = 'REPERTOIRE'`
  - `createPrivateAssignment(input)`
  - `isPrivateAssignment(value)`
  - `isAllowedTeacherAssignmentTransition(fromState, toState)`

TD-01 construction always creates `ACTIVE` with `revokedAt = null`. No caller-provided initial state/revocation is accepted.

- [ ] **Step 1: Write the failing PrivateAssignment tests**

Create `tests/privateAssignment.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import '../scripts/runOmrQualityReport.js'

import {
  CANONICAL_NOTE_SCHEMA_VERSION,
  CANONICAL_VERIFICATION_STATUS,
} from '../noteTheory.js'
import { prepareMusicXmlQualityGate } from '../src/services/appQualityGate.js'
import {
  approveTeacherWorkspace,
  createTeacherWorkspace,
} from '../src/services/teacherWorkspaceModel.js'
import { createScoreAssignmentSourceBinding } from '../src/services/scoreAssignmentSourceBinding.js'
import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  PRIVATE_ASSIGNMENT_STATE,
  createPrivateAssignment,
  isAllowedTeacherAssignmentTransition,
  isPrivateAssignment,
} from '../src/services/privateAssignment.js'

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
    pitch: { valid: true, status: CANONICAL_VERIFICATION_STATUS.VERIFIED },
    time: { valid: true, status: CANONICAL_VERIFICATION_STATUS.VERIFIED },
  }
}

function scoreSource(studentId = 'student-1') {
  const notes = ['Do', 'Re', 'Mi', 'Fa'].map((noteName, index) => ({
    partId: 'P1',
    measureNumber: 1,
    measureKey: 'P1:0',
    measureIndex: 0,
    voice: 1,
    staff: 1,
    startBeat: index,
    beats: 1,
    noteName,
    sourceVerificationState: verificationState(),
  }))
  prepareMusicXmlQualityGate(notes, VALID_XML)
  let workspace = createTeacherWorkspace({
    content: notes,
    actorId: 'teacher-1',
    sourceId: 'score-1',
    automaticRevisionId: 'auto-1',
    historyId: 'history-1',
    createdAt: '2026-09-22T16:20:00Z',
  })
  workspace = approveTeacherWorkspace({
    workspace,
    approvalId: 'approval-1',
    createdAt: '2026-09-22T16:21:00Z',
  })
  return createScoreAssignmentSourceBinding({
    workspace,
    sourceNotes: notes,
    studentId,
    authorizationId: `auth-${studentId}`,
    rootQualityEvidenceId: `quality-${studentId}`,
    revalidationEvidenceId: `revalidation-${studentId}`,
    createdAt: '2026-09-22T16:22:00Z',
  })
}

test('TD-01 creates exactly one ACTIVE SCORE assignment for exactly one student', () => {
  const assignment = createPrivateAssignment({
    assignmentId: 'assignment-1',
    studentId: 'student-1',
    practiceType: PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE,
    teacherNote: 'Ölçü 1-4 yavaş çalış.',
    assignedAt: '2026-09-22T16:23:00Z',
    sourceRef: scoreSource('student-1'),
  })

  assert.equal(Object.isFrozen(assignment), true)
  assert.equal(assignment.studentId, 'student-1')
  assert.equal(assignment.state, PRIVATE_ASSIGNMENT_STATE.ACTIVE)
  assert.equal(assignment.revokedAt, null)
  assert.equal(assignment.sourceRef.studentId, 'student-1')
  assert.equal(isPrivateAssignment(assignment), true)
  assert.equal(Object.hasOwn(assignment, 'recipientStudentIds'), false)
})

test('TD-01 assignment studentId must match exact SCORE source recipient', () => {
  assert.throws(
    () => createPrivateAssignment({
      assignmentId: 'assignment-2',
      studentId: 'student-2',
      practiceType: PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE,
      teacherNote: '',
      assignedAt: '2026-09-22T16:24:00Z',
      sourceRef: scoreSource('student-1'),
    }),
    /studentId.*sourceRef/i,
  )
})

test('TD-01 caller cannot pre-mark assignment completed, repertoire or revoked', () => {
  for (const extra of [
    { state: PRIVATE_ASSIGNMENT_STATE.COMPLETED },
    { state: PRIVATE_ASSIGNMENT_STATE.REPERTOIRE },
    { revokedAt: '2026-09-22T16:25:00Z' },
  ]) {
    assert.throws(
      () => createPrivateAssignment({
        assignmentId: 'assignment-3',
        studentId: 'student-1',
        practiceType: PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE,
        teacherNote: '',
        assignedAt: '2026-09-22T16:24:00Z',
        sourceRef: scoreSource('student-1'),
        ...extra,
      }),
      /unsupported field/,
    )
  }
})

test('TD-01 teacher assignment state machine allows only ACTIVE -> COMPLETED -> REPERTOIRE', () => {
  assert.equal(
    isAllowedTeacherAssignmentTransition(
      PRIVATE_ASSIGNMENT_STATE.ACTIVE,
      PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    ),
    true,
  )
  assert.equal(
    isAllowedTeacherAssignmentTransition(
      PRIVATE_ASSIGNMENT_STATE.COMPLETED,
      PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
    ),
    true,
  )

  for (const [fromState, toState] of [
    [PRIVATE_ASSIGNMENT_STATE.ACTIVE, PRIVATE_ASSIGNMENT_STATE.REPERTOIRE],
    [PRIVATE_ASSIGNMENT_STATE.COMPLETED, PRIVATE_ASSIGNMENT_STATE.ACTIVE],
    [PRIVATE_ASSIGNMENT_STATE.REPERTOIRE, PRIVATE_ASSIGNMENT_STATE.COMPLETED],
    [PRIVATE_ASSIGNMENT_STATE.REPERTOIRE, PRIVATE_ASSIGNMENT_STATE.ACTIVE],
  ]) {
    assert.equal(isAllowedTeacherAssignmentTransition(fromState, toState), false)
  }
})

test('TD-01 CHORD_BOARD creation fails closed until TD-07 exact snapshot contract exists', () => {
  assert.throws(
    () => createPrivateAssignment({
      assignmentId: 'assignment-chord-1',
      studentId: 'student-1',
      practiceType: PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD,
      teacherNote: 'C ve G akorları',
      assignedAt: '2026-09-22T16:26:00Z',
      sourceRef: Object.freeze({ frets: [0, 3, 2, 0, 1, 0] }),
    }),
    /chord-board-source-contract-deferred-to-td-07/,
  )
})

test('TD-01 PrivateAssignment validator rejects clone and recipient-list leakage', () => {
  const valid = createPrivateAssignment({
    assignmentId: 'assignment-4',
    studentId: 'student-1',
    practiceType: PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE,
    teacherNote: '',
    assignedAt: '2026-09-22T16:27:00Z',
    sourceRef: scoreSource('student-1'),
  })

  assert.equal(isPrivateAssignment(structuredClone(valid)), false)
  assert.equal(
    isPrivateAssignment(Object.freeze({ ...valid, recipientStudentIds: ['student-2'] })),
    false,
  )
})
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
node --test tests/privateAssignment.test.js
```

Expected: FAIL because `src/services/privateAssignment.js` does not exist.

- [ ] **Step 3: Implement the one-student assignment contract**

Create `src/services/privateAssignment.js`:

```js
import { isScoreAssignmentSourceBinding } from './scoreAssignmentSourceBinding.js'
import {
  assertStrictInputObject,
  isStrictFrozenRecord,
  normalizeOptionalText,
  normalizeRequiredId,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

export const PRIVATE_ASSIGNMENT_SCHEMA_VERSION = 1
export const PRIVATE_ASSIGNMENT_MAX_TEACHER_NOTE_LENGTH = 2000

export const PRIVATE_ASSIGNMENT_PRACTICE_TYPE = Object.freeze({
  SCORE: 'SCORE',
  CHORD_BOARD: 'CHORD_BOARD',
})

export const PRIVATE_ASSIGNMENT_STATE = Object.freeze({
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  REPERTOIRE: 'REPERTOIRE',
})

const INPUT_FIELDS = Object.freeze([
  'assignmentId',
  'studentId',
  'practiceType',
  'teacherNote',
  'assignedAt',
  'sourceRef',
])

const RECORD_FIELDS = Object.freeze([
  'schemaVersion',
  'assignmentId',
  'studentId',
  'practiceType',
  'teacherNote',
  'state',
  'assignedAt',
  'revokedAt',
  'sourceRef',
])

const ALLOWED_TRANSITIONS = Object.freeze({
  [PRIVATE_ASSIGNMENT_STATE.ACTIVE]: Object.freeze([
    PRIVATE_ASSIGNMENT_STATE.COMPLETED,
  ]),
  [PRIVATE_ASSIGNMENT_STATE.COMPLETED]: Object.freeze([
    PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
  ]),
  [PRIVATE_ASSIGNMENT_STATE.REPERTOIRE]: Object.freeze([]),
})

export function isAllowedTeacherAssignmentTransition(fromState, toState) {
  return Boolean(ALLOWED_TRANSITIONS[fromState]?.includes(toState))
}

export function createPrivateAssignment(input = {}) {
  assertStrictInputObject(input, INPUT_FIELDS, 'PrivateAssignment')

  const assignmentId = normalizeRequiredId(input.assignmentId, 'assignmentId')
  const studentId = normalizeRequiredId(input.studentId, 'studentId')

  if (!Object.values(PRIVATE_ASSIGNMENT_PRACTICE_TYPE).includes(input.practiceType)) {
    throw new TypeError('practiceType must be SCORE or CHORD_BOARD.')
  }

  if (input.practiceType === PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD) {
    throw new Error('chord-board-source-contract-deferred-to-td-07')
  }

  if (!isScoreAssignmentSourceBinding(input.sourceRef)) {
    throw new TypeError('sourceRef must be a valid immutable SCORE assignment source binding.')
  }
  if (input.sourceRef.studentId !== studentId) {
    throw new Error('PrivateAssignment studentId must match sourceRef studentId.')
  }

  return Object.freeze({
    schemaVersion: PRIVATE_ASSIGNMENT_SCHEMA_VERSION,
    assignmentId,
    studentId,
    practiceType: input.practiceType,
    teacherNote: normalizeOptionalText(
      input.teacherNote,
      'teacherNote',
      PRIVATE_ASSIGNMENT_MAX_TEACHER_NOTE_LENGTH,
    ),
    state: PRIVATE_ASSIGNMENT_STATE.ACTIVE,
    assignedAt: normalizeRequiredTimestamp(input.assignedAt, 'assignedAt'),
    revokedAt: null,
    sourceRef: input.sourceRef,
  })
}
```

Implement `isPrivateAssignment(value)` so it:

- requires exact frozen `RECORD_FIELDS`;
- accepts only `SCORE` in TD-01 records;
- requires `state === ACTIVE` and `revokedAt === null` for records produced by TD-01;
- requires a valid frozen SCORE sourceRef;
- requires sourceRef.studentId === assignment.studentId;
- validates teacherNote length and assignedAt;
- rejects extra fields and mutable clones.

Do not implement lifecycle mutation in TD-01. TD-05 will consume `isAllowedTeacherAssignmentTransition` and define authenticated/teacher-management mutation semantics after persistence boundaries exist.

- [ ] **Step 4: Run focused assignment tests**

Run:

```bash
node --test tests/privateAssignment.test.js tests/scoreAssignmentSourceBinding.test.js
```

Expected: PASS, 0 failures.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/services/privateAssignment.js tests/privateAssignment.test.js
git commit -m "feat: add TD-01 private assignment contract"
```

---

### Task 5: Cross-Contract Security Matrix + Bounded Contract Documentation

**Files:**
- Create: `tests/teacherDeliveryContracts.test.js`
- Create: `docs/teacher-delivery-td01-contracts.md`
- Read-only: `src/services/stageLShareReadiness.js`
- Read-only: `main.js`

**Interfaces:**
- Consumes all TD-01 factories/validators.
- Produces no new runtime API.

- [ ] **Step 1: Write the cross-contract test**

Create `tests/teacherDeliveryContracts.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

import { createStudentRosterEntry } from '../src/services/studentRosterEntry.js'
import { createPoolItem, POOL_AUDIENCE_MODE } from '../src/services/poolItem.js'
import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  PRIVATE_ASSIGNMENT_STATE,
  isAllowedTeacherAssignmentTransition,
} from '../src/services/privateAssignment.js'

test('TD-01 contracts contain no persistence/network/browser-admin implementation', () => {
  for (const path of [
    '../src/services/studentRosterEntry.js',
    '../src/services/poolItem.js',
    '../src/services/scoreAssignmentSourceBinding.js',
    '../src/services/privateAssignment.js',
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    assert.doesNotMatch(
      source,
      /fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|firebase|adminCredential|bearer|inviteCode/i,
    )
  }
})

test('TD-01 does not wire a delivery UI into production main', () => {
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')
  assert.doesNotMatch(main, /teacherDeliveryUi|teacherPoolPublishingUi|teacherPrivateAssignmentUi/)
})

test('TD-01 Stage L remains readiness-only source authority', () => {
  const stageL = readFileSync(
    new URL('../src/services/stageLShareReadiness.js', import.meta.url),
    'utf8',
  )

  assert.match(stageL, /STAGE_L_DELIVERY_STATE = 'not_implemented'/)
  assert.match(stageL, /deliveryAllowed:\s*false/)
  assert.doesNotMatch(stageL, /delivered_to_student|deliveryAllowed:\s*true/)
})

test('TD-01 pool and roster identity domains remain distinct', () => {
  const roster = createStudentRosterEntry({
    studentId: 'student-1',
    displayNameOrNickname: 'Aynı Ad',
    active: true,
  })
  const pool = createPoolItem({
    poolItemId: 'pool-1',
    title: 'Duyuru',
    shortDescription: 'Kısa',
    detailText: '',
    publishedAt: '2026-09-22T16:30:00Z',
    audienceMode: POOL_AUDIENCE_MODE.SELECTED,
    recipientStudentIds: [roster.studentId],
  })

  assert.deepEqual(pool.recipientStudentIds, ['student-1'])
  assert.equal(Object.hasOwn(pool, 'displayNameOrNickname'), false)
})

test('TD-01 student lifecycle write surface is absent', () => {
  assert.equal(
    isAllowedTeacherAssignmentTransition(
      PRIVATE_ASSIGNMENT_STATE.ACTIVE,
      PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    ),
    true,
  )

  const source = readFileSync(
    new URL('../src/services/privateAssignment.js', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(source, /student.*complete|student.*repertoire|hazırım|readyButton/i)
  assert.match(source, /CHORD_BOARD/)
  assert.match(source, /chord-board-source-contract-deferred-to-td-07/)
  assert.equal(PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE, 'SCORE')
})
```

- [ ] **Step 2: Run the cross-contract test**

Run:

```bash
node --test tests/teacherDeliveryContracts.test.js
```

Expected: PASS, 0 failures.

- [ ] **Step 3: Write the bounded TD-01 contract document**

Create `docs/teacher-delivery-td01-contracts.md` with exactly these factual sections:

```markdown
# TD-01 — Teacher Delivery Contracts

Status: implemented on the feature branch; production/merge status is determined only by the final PR and exact-main gates.

## Boundary

TD-01 adds provider-neutral immutable contracts only. It does not implement authenticated student delivery, persistence, Firebase, a database, network sending or UI wiring.

`READY_EXACT_REVISION != DELIVERED_TO_STUDENT` remains unchanged.

## Contracts

- StudentRosterEntry v1: stable `studentId`, presentation-only display name/nickname, active flag.
- PoolItem v1: text/detail publication metadata with `ALL | SELECTED` audience.
- SCORE assignment source binding v1: created only from the exact current teacher-approved revision that passes existing Package 12 / Stage L readiness for the exact target student ID.
- PrivateAssignment v1: exactly one student, SCORE source reference, per-student teacher note, initial `ACTIVE` state.
- Teacher state machine: `ACTIVE -> COMPLETED -> REPERTOIRE`; no reverse transition in v1.

## Explicitly deferred

- roster repository/provider: TD-02;
- Pool persistence/UI/revoke: TD-03;
- SCORE multi-student fan-out and send UI: TD-04;
- persisted lifecycle/revoke: TD-05;
- secure persistence/delivery adapter and production authorization enforcement: TD-06;
- CHORD_BOARD exact immutable voicing snapshot: TD-07.

TD-01 recognizes `CHORD_BOARD` in vocabulary but refuses to create that assignment type before TD-07.

## Safety

TD-01 does not change Package 8, Package 12, Stage L, OMR/Audiveris, renderer, Smoosic, deployment or Student App code.
```

Do not update `docs/current-status.md`, `docs/package-status.md` or `docs/teacher-score-editor-architecture.md` in this stage; PR #192 currently owns overlapping documentation changes.

- [ ] **Step 4: Run all TD-01 focused tests**

Run:

```bash
node --test   tests/studentRosterEntry.test.js   tests/poolItem.test.js   tests/scoreAssignmentSourceBinding.test.js   tests/privateAssignment.test.js   tests/teacherDeliveryContracts.test.js   tests/stageLShareReadiness.test.js   tests/teacherShareAuthorization.test.js   tests/teacherShareEligibility.test.js   tests/teacherCorrectionRevalidation.test.js   tests/teacherStructuralCorrectionRevalidation.test.js
```

Expected: PASS, 0 failures.

- [ ] **Step 5: Commit Task 5**

```bash
git add tests/teacherDeliveryContracts.test.js docs/teacher-delivery-td01-contracts.md
git commit -m "docs: record TD-01 delivery contract boundary"
```

---

### Task 6: Full Verification, Exact-Head Evidence and Draft PR Gate

**Files:**
- No planned product-file edits.
- Read current branch diff and CI metadata only.

**Interfaces:**
- Consumes completed TD-01 branch.
- Produces verification evidence and a draft PR only.

- [ ] **Step 1: Verify branch scope before full test**

Run:

```bash
git status --short
git diff --check
git diff --name-only main...HEAD
```

Expected:

- working tree clean after committed tasks;
- `git diff --check` exits 0;
- changed files limited to the TD-01 files named in this plan;
- no `main.js`, `src/app.js`, backend, OMR, deployment, Stage L, Package 12 or cross-repository file change.

If the branch contains unrelated files, STOP and report rather than hiding them in TD-01.

- [ ] **Step 2: Run full repository tests**

Run:

```bash
npm test
```

Expected: exit 0, 0 failed tests.

Record the exact total/pass/fail counts from the current output. Do not reuse historical counts.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: exit 0.

This may rebuild existing score/editor/Smoosic runtime assets as part of the repository's normal build command; no generated runtime source should be committed unless the existing repository workflow explicitly tracks an expected generated file and the diff proves it belongs to the build.

- [ ] **Step 4: Re-run focused security boundary tests after full build**

Run:

```bash
node --test   tests/teacherDeliveryContracts.test.js   tests/scoreAssignmentSourceBinding.test.js   tests/stageLShareReadiness.test.js
```

Expected: PASS, 0 failures.

- [ ] **Step 5: Fresh-read protected main and open PRs**

Before opening the TD-01 implementation PR, verify:

```text
protected main HEAD
required check = test-and-build
open PR #232 status/head
open PR #192 status/head
base drift of TD-01 branch
```

Rules:

- if `main` moved, compare/rebase only through an explicit safe branch operation; never force main backwards;
- if PR #232 merged, re-run the stale-current-revision tests against the new main;
- if PR #192 merged, documentation conflict may be re-evaluated, but TD-01 still does not need to edit its status files;
- unexpected base drift or file conflict is a STOP/report condition.

- [ ] **Step 6: Create a draft implementation PR**

Open a draft PR from the dedicated TD-01 branch to `main`.

PR body must state:

```markdown
## TD-01 — Teacher Delivery Contracts

- provider-neutral immutable contracts only;
- no UI wiring;
- no persistence/Firebase/backend delivery;
- no OMR/Audiveris/deployment change;
- no cross-repository write;
- Package 12 / Stage L readiness semantics unchanged;
- CHORD_BOARD creation remains fail-closed until TD-07.

### Verification
- focused TD-01 tests: insert the exact pass/fail count captured from Step 4 immediately before PR creation
- full npm test: insert the exact pass/fail count captured from Step 2 immediately before PR creation
- npm run build: state the exact exit/result captured from Step 3 immediately before PR creation
- git diff --check: state the exact result captured from Step 1 immediately before PR creation

Human stop point: do not merge without explicit approval.
```

Replace the angle-bracketed evidence with actual current command output values before creating the PR.

- [ ] **Step 7: Verify exact PR head CI**

On the exact PR head SHA, require:

- protected required `test-and-build`: success;
- other repository-required/triggered checks: report actual state;
- unresolved review blockers: 0 before merge-readiness claim;
- base drift: 0 before merge-readiness claim.

Do not call the PR merge-ready while a required check is queued, skipped unexpectedly, cancelled or failed.

- [ ] **Step 8: STOP before merge**

Report:

- current main SHA;
- implementation branch;
- exact PR head SHA;
- changed files;
- focused/full/build results;
- CI;
- conflicts/risks;
- explicit confirmation that no UI/persistence/Firebase/OMR/deployment/cross-repo write occurred;
- next required human approval.

Do not merge TD-01. Do not start TD-02.

---

## Plan Self-Review

### Spec coverage

TD-01 requirements covered by this plan:

- versioned StudentRosterEntry contract — Task 1;
- versioned PoolItem contract — Task 2;
- versioned PrivateAssignment contract — Task 4;
- exact one-student binding — Tasks 3–4;
- SCORE exact current approved/readiness gate — Task 3;
- no stale approval transfer after correction — Task 3;
- `ALL | SELECTED` Pool audience invariants — Task 2;
- recipient normalization/deduplication — Task 2;
- no MusicXML/practice payload inside PoolItem — Task 2;
- `ACTIVE | COMPLETED | REPERTOIRE` teacher state machine — Task 4;
- student lifecycle write surface absent — Tasks 4–5;
- CHORD_BOARD vocabulary recognized but transport deferred/fail-closed — Task 4;
- no Firebase/persistence/UI in TD-01 — Tasks 5–6;
- Package 12 / Stage L semantics unchanged — Tasks 3, 5 and 6.

Requirements intentionally outside TD-01 remain assigned to their already-approved later stage IDs rather than being partially implemented early.

### Placeholder scan

The executable TD-01 tasks contain no unresolved implementation markers. The only future-stage references are explicit scope boundaries with fixed stage ownership.

### Type consistency

- `studentId` is the stable identity in roster, Pool recipients, SCORE source binding and PrivateAssignment.
- `createScoreAssignmentSourceBinding()` produces exactly the `sourceRef` accepted by `createPrivateAssignment()`.
- PrivateAssignment initial state is always `ACTIVE`; lifecycle mutations are not introduced early.
- `CHORD_BOARD` is an enum value but cannot produce a TD-01 assignment record.
- Stage L readiness evidence remains separate from delivery state.

### Review Focus coverage

All five Review Focus cases have explicit tests:

1. malformed/oversized IDs — Task 1;
2. ALL/SELECTED ambiguity + dedupe — Task 2;
3. stale approval after correction — Task 3;
4. approval without live quality/readiness — Task 3;
5. premature CHORD_BOARD source object — Task 4.

## Execution Gate

After this plan is reviewed and approved, implementation starts on a fresh isolated worktree/branch using TDD. The implementation branch must not reuse this documentation branch.

Recommended implementation branch name:

```text
feat/td01-teacher-delivery-contracts
```

The implementation must stop at the draft PR / exact-head verification gate and must not merge or start TD-02 without a new explicit human approval.
