# TD-03 Teacher Pool Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-neutral teacher Pool publishing workflow that creates ALL or roster-preflighted SELECTED announcements, requires repository acknowledgement before success, preserves immutable publication history, and supports teacher-owned revocation without selecting a production persistence provider.

**Architecture:** TD-03 keeps TD-01 `PoolItem` immutable and wraps it in a separate `PoolPublicationRecord` lifecycle record. A provider-neutral repository and publishing service enforce uniqueness, TD-02 stable-ID preflight, acknowledgement validation and revoke tombstones. A controller plus explicitly mounted DOM UI module makes the teacher flow testable without wiring a fake roster/provider into `main.js`; production mounting remains deferred until a real authenticated provider composition exists.

**Tech Stack:** Node.js 24, browser-compatible ES modules, Node `node:test`, DOM-compatible UI helpers, existing TD-01/TD-02 services, Vite production build. No new dependency.

**Spec:** `docs/superpowers/specs/2026-09-22-td03-pool-publishing-design.md`

## Global Constraints

- Implement from a fresh protected `main` after confirming TD-02 is merged.
- Use a dedicated implementation branch/worktree; never implement on `main`.
- `PoolItem` v1 remains immutable and unchanged unless a focused compatibility defect proves modification unavoidable.
- Pool content remains title + short description + optional detail only.
- No SCORE, MusicXML, notation, playback, Practice Package or Chord Board payload enters Pool.
- `studentId` is the only SELECTED recipient identity.
- Display name/nickname is presentation-only.
- ALL keeps `recipientStudentIds` empty and is not expanded into a roster snapshot.
- SELECTED must pass TD-02 `preflightActiveStudentIds` before repository publish.
- Publication/revocation success requires a valid exact repository acknowledgement.
- Revoke creates a tombstone; no hard delete and no restore/unrevoke.
- No Firebase/Admin SDK, Firebase Authentication user listing, Firestore/database, browser persistence, network delivery endpoint or production authentication rule.
- No Student App repository write.
- No Stage L, Package 12 SCORE authorization, SCORE source binding or Practice Package dependency.
- No cross-repository write.
- No new dependency.
- Do not add a teacher feature to `APP_SHELL_FEATURES`; current `tests/appShell.test.js` explicitly pins the shell to workspace+tuner.
- Do not production-mount teacher Pool UI from `main.js` in TD-03; current `main.js` explicitly states former teacher presentation is intentionally not initialized there. The UI module must be explicitly mountable by a future authenticated/provider composition.
- TD-04/05/06/07 remain outside this implementation.

## File Structure

### Create

- `src/services/poolPublicationRecord.js`
  - immutable active/revoked lifecycle wrapper around exact TD-01 `PoolItem`.
- `src/services/teacherPoolRepository.js`
  - provider-neutral repository assertion;
  - deterministic in-memory reference repository;
  - unique Pool identity and revoke tombstone behavior.
- `src/services/teacherPoolPublishingService.js`
  - strict producer flow;
  - ALL vs SELECTED audience handling;
  - TD-02 preflight;
  - ID/time injection;
  - publish/revoke acknowledgement validation.
- `src/services/teacherPoolPublishingController.js`
  - teacher-facing view-model actions and status mapping;
  - no DOM/provider logic.
- `src/teacherPoolPublishingUi.js`
  - explicitly mounted, minimal accessible DOM form/list using a supplied controller;
  - no automatic production initialization.
- `src/teacherPoolPublishingUi.css`
  - scoped styles for the explicitly mounted teacher Pool surface.
- `tests/poolPublicationRecord.test.js`
- `tests/teacherPoolRepository.test.js`
- `tests/teacherPoolPublishingService.test.js`
- `tests/teacherPoolPublishingController.test.js`
- `tests/teacherPoolPublishingUi.test.js`
- `tests/support/fakeTeacherPoolDom.js`
- `tests/teacherPoolPublishingSecurity.test.js`
- `docs/teacher-delivery-td03-pool-publishing.md`

### Reuse without semantic widening

- `src/services/poolItem.js`
- `src/services/teacherRosterService.js`
- `src/services/teacherDeliveryContractValidation.js`

### Do not modify unless a focused regression proves it unavoidable

- `main.js`
- `src/app.js`
- `src/appShell.js`
- `src/appShell.css`
- `index.html`
- `src/services/privateAssignment.js`
- `src/services/scoreAssignmentSourceBinding.js`
- Stage L / Package 12 SCORE modules
- Student App repository
- backend/deployment/provider configuration

## Review Focus

1. **Acknowledgement substitution:** repository returns a valid record for a different Pool item; service must reject identity/content mismatch rather than report success.
2. **Mutable/forged adapter records:** custom repository returns a mutable or extra-field publication record; list/publish/revoke paths must revalidate and fail closed.
3. **Time/ID generator inconsistency:** injected `createPoolItemId()` or `now()` returns malformed/unstable values; producer must validate exact outputs and never retry silently.
4. **SELECTED roster changes between calls:** selected-target validation must use the single TD-02 preflight result to construct recipients, not re-resolve names or identities later.
5. **Accidental production UI/provider creep:** TD-03 UI must not auto-mount from `main.js`, add a teacher shell feature, or introduce Firebase/network/browser persistence.

---

### Task 1: Immutable Pool Publication Lifecycle Record

**Files:**
- Create: `src/services/poolPublicationRecord.js`
- Create: `tests/poolPublicationRecord.test.js`
- Reuse: `src/services/poolItem.js`
- Reuse: `src/services/teacherDeliveryContractValidation.js`

**Interfaces:**
- Consumes:
  - `isPoolItem(value)`
  - `normalizeRequiredTimestamp(value, fieldName)`
- Produces:
  - `POOL_PUBLICATION_RECORD_SCHEMA_VERSION`
  - `createActivePoolPublicationRecord(item)`
  - `revokePoolPublicationRecord(record, revokedAt)`
  - `isPoolPublicationRecord(value)`

- [ ] **Step 1: Write failing lifecycle tests**

Create `tests/poolPublicationRecord.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  POOL_AUDIENCE_MODE,
  createPoolItem,
} from '../src/services/poolItem.js'
import {
  createActivePoolPublicationRecord,
  isPoolPublicationRecord,
  revokePoolPublicationRecord,
} from '../src/services/poolPublicationRecord.js'

function item(id = 'pool-1') {
  return createPoolItem({
    poolItemId: id,
    title: 'Yeni repertuar',
    shortDescription: 'Bu hafta çalışılacak eserler',
    detailText: 'Duyuru ayrıntısı.',
    publishedAt: '2026-09-22T18:00:00Z',
    audienceMode: POOL_AUDIENCE_MODE.ALL,
    recipientStudentIds: [],
  })
}

test('TD-03 active lifecycle record wraps the exact immutable PoolItem', () => {
  const poolItem = item()
  const record = createActivePoolPublicationRecord(poolItem)

  assert.equal(record.item, poolItem)
  assert.equal(record.revokedAt, null)
  assert.equal(Object.isFrozen(record), true)
  assert.equal(isPoolPublicationRecord(record), true)
})

test('TD-03 revocation creates a tombstone without mutating PoolItem', () => {
  const poolItem = item()
  const active = createActivePoolPublicationRecord(poolItem)
  const revoked = revokePoolPublicationRecord(
    active,
    '2026-09-22T19:00:00Z',
  )

  assert.notEqual(revoked, active)
  assert.equal(revoked.item, poolItem)
  assert.equal(active.revokedAt, null)
  assert.equal(revoked.revokedAt, '2026-09-22T19:00:00Z')
  assert.equal(isPoolPublicationRecord(revoked), true)
})

test('TD-03 lifecycle rejects forged item, malformed revoke time and double revoke', () => {
  const poolItem = item()
  const active = createActivePoolPublicationRecord(poolItem)

  assert.throws(
    () => createActivePoolPublicationRecord(structuredClone(poolItem)),
    /PoolItem/i,
  )
  assert.throws(
    () => revokePoolPublicationRecord(active, ''),
    /revokedAt/i,
  )

  const revoked = revokePoolPublicationRecord(
    active,
    '2026-09-22T19:00:00Z',
  )
  assert.throws(
    () =>
      revokePoolPublicationRecord(
        revoked,
        '2026-09-22T20:00:00Z',
      ),
    /already.*revoked/i,
  )
})

test('TD-03 lifecycle record exposes no restore/delete mutation surface', () => {
  const record = createActivePoolPublicationRecord(item())

  for (const forbidden of [
    'restore',
    'unrevoke',
    'delete',
    'remove',
    'update',
  ]) {
    assert.equal(forbidden in record, false, forbidden)
  }
})
```

- [ ] **Step 2: Run lifecycle test and verify RED**

Run:

```bash
node --test tests/poolPublicationRecord.test.js
```

Expected: FAIL because `src/services/poolPublicationRecord.js` does not exist.

- [ ] **Step 3: Implement the minimal lifecycle record**

Create `src/services/poolPublicationRecord.js`:

```js
import { isPoolItem } from './poolItem.js'
import {
  isStrictFrozenRecord,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

export const POOL_PUBLICATION_RECORD_SCHEMA_VERSION = 1

const RECORD_FIELDS = Object.freeze([
  'schemaVersion',
  'item',
  'revokedAt',
])

function assertPoolItem(item) {
  if (!isPoolItem(item)) {
    throw new TypeError('item must be a valid immutable PoolItem.')
  }
  return item
}

export function createActivePoolPublicationRecord(item) {
  return Object.freeze({
    schemaVersion: POOL_PUBLICATION_RECORD_SCHEMA_VERSION,
    item: assertPoolItem(item),
    revokedAt: null,
  })
}

export function revokePoolPublicationRecord(record, revokedAt) {
  if (!isPoolPublicationRecord(record)) {
    throw new TypeError(
      'record must be a valid immutable PoolPublicationRecord.',
    )
  }
  if (record.revokedAt !== null) {
    throw new Error('Pool publication is already revoked.')
  }

  return Object.freeze({
    schemaVersion: POOL_PUBLICATION_RECORD_SCHEMA_VERSION,
    item: record.item,
    revokedAt: normalizeRequiredTimestamp(
      revokedAt,
      'revokedAt',
    ),
  })
}

export function isPoolPublicationRecord(value) {
  try {
    if (
      value?.schemaVersion !==
        POOL_PUBLICATION_RECORD_SCHEMA_VERSION ||
      !isStrictFrozenRecord(value, RECORD_FIELDS) ||
      !isPoolItem(value.item)
    ) {
      return false
    }

    if (value.revokedAt === null) return true

    return (
      normalizeRequiredTimestamp(value.revokedAt, 'revokedAt') ===
      value.revokedAt
    )
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run focused lifecycle + TD-01 Pool tests and verify GREEN**

Run:

```bash
node --test   tests/poolPublicationRecord.test.js   tests/poolItem.test.js
```

Expected: PASS, 0 failures.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/services/poolPublicationRecord.js tests/poolPublicationRecord.test.js
git commit -m "feat: add TD-03 Pool publication lifecycle"
```

---

### Task 2: Provider-Neutral Pool Publication Repository

**Files:**
- Create: `src/services/teacherPoolRepository.js`
- Create: `tests/teacherPoolRepository.test.js`
- Reuse: `src/services/poolPublicationRecord.js`
- Reuse: `src/services/teacherDeliveryContractValidation.js`

**Interfaces:**
- Produces:
  - `assertTeacherPoolRepository(repository)`
  - `createInMemoryTeacherPoolRepository(initialRecords = [])`
  - repository `list() -> frozen PoolPublicationRecord[]`
  - repository `getByPoolItemId(poolItemId) -> PoolPublicationRecord | null`
  - repository `publish(record) -> PoolPublicationRecord`
  - repository `revoke({ poolItemId, revokedAt }) -> PoolPublicationRecord`

- [ ] **Step 1: Write failing repository tests**

Create `tests/teacherPoolRepository.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import { createPoolItem } from '../src/services/poolItem.js'
import {
  createActivePoolPublicationRecord,
} from '../src/services/poolPublicationRecord.js'
import {
  assertTeacherPoolRepository,
  createInMemoryTeacherPoolRepository,
} from '../src/services/teacherPoolRepository.js'

function record(id, publishedAt = '2026-09-22T18:00:00Z') {
  return createActivePoolPublicationRecord(
    createPoolItem({
      poolItemId: id,
      title: `Duyuru ${id}`,
      shortDescription: 'Kısa',
      detailText: '',
      publishedAt,
      audienceMode: 'ALL',
      recipientStudentIds: [],
    }),
  )
}

test('TD-03 repository preserves publication order and exact identity lookup', () => {
  const a = record('pool-a')
  const b = record('pool-b', '2026-09-22T18:01:00Z')
  const repository = createInMemoryTeacherPoolRepository([a, b])

  assert.equal(Object.isFrozen(repository), true)
  assert.equal(Object.isFrozen(repository.list()), true)
  assert.deepEqual(repository.list(), [a, b])
  assert.equal(repository.getByPoolItemId(' pool-a '), a)
  assert.equal(repository.getByPoolItemId('missing'), null)
  assert.equal(assertTeacherPoolRepository(repository), repository)
})

test('TD-03 repository rejects duplicate publication identity', () => {
  assert.throws(
    () =>
      createInMemoryTeacherPoolRepository([
        record('pool-a'),
        record('pool-a'),
      ]),
    /duplicate.*poolItemId/i,
  )

  const repository = createInMemoryTeacherPoolRepository([
    record('pool-a'),
  ])

  assert.throws(
    () => repository.publish(record('pool-a')),
    /duplicate.*poolItemId/i,
  )
})

test('TD-03 publish acknowledges the exact stored record', () => {
  const repository = createInMemoryTeacherPoolRepository()
  const next = record('pool-a')

  const acknowledged = repository.publish(next)

  assert.equal(acknowledged, next)
  assert.equal(repository.getByPoolItemId('pool-a'), next)
})

test('TD-03 revoke replaces only lifecycle state and preserves PoolItem identity', () => {
  const original = record('pool-a')
  const repository = createInMemoryTeacherPoolRepository([
    original,
  ])

  const revoked = repository.revoke({
    poolItemId: 'pool-a',
    revokedAt: '2026-09-22T19:00:00Z',
  })

  assert.equal(revoked.item, original.item)
  assert.equal(revoked.revokedAt, '2026-09-22T19:00:00Z')
  assert.equal(
    repository.getByPoolItemId('pool-a'),
    revoked,
  )
  assert.deepEqual(repository.list(), [revoked])
})

test('TD-03 revoke fails for unknown or already-revoked publication', () => {
  const repository = createInMemoryTeacherPoolRepository([
    record('pool-a'),
  ])

  assert.throws(
    () =>
      repository.revoke({
        poolItemId: 'missing',
        revokedAt: '2026-09-22T19:00:00Z',
      }),
    /not-found/i,
  )

  repository.revoke({
    poolItemId: 'pool-a',
    revokedAt: '2026-09-22T19:00:00Z',
  })

  assert.throws(
    () =>
      repository.revoke({
        poolItemId: 'pool-a',
        revokedAt: '2026-09-22T20:00:00Z',
      }),
    /already.*revoked/i,
  )
})

test('TD-03 repository exposes no delete/restore surface', () => {
  const repository = createInMemoryTeacherPoolRepository()

  for (const forbidden of [
    'delete',
    'remove',
    'restore',
    'unrevoke',
    'save',
    'sync',
  ]) {
    assert.equal(forbidden in repository, false, forbidden)
  }
})
```

- [ ] **Step 2: Run repository test and verify RED**

Run:

```bash
node --test tests/teacherPoolRepository.test.js
```

Expected: FAIL because `teacherPoolRepository.js` does not exist.

- [ ] **Step 3: Implement minimal repository**

Create `src/services/teacherPoolRepository.js` with:

```js
import {
  isPoolPublicationRecord,
  revokePoolPublicationRecord,
} from './poolPublicationRecord.js'
import {
  normalizeRequiredId,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

export function assertTeacherPoolRepository(repository) {
  if (
    repository === null ||
    typeof repository !== 'object' ||
    typeof repository.list !== 'function' ||
    typeof repository.getByPoolItemId !== 'function' ||
    typeof repository.publish !== 'function' ||
    typeof repository.revoke !== 'function'
  ) {
    throw new TypeError(
      'teacher Pool repository must provide list(), getByPoolItemId(), publish() and revoke().',
    )
  }

  return repository
}

export function createInMemoryTeacherPoolRepository(
  initialRecords = [],
) {
  if (!Array.isArray(initialRecords)) {
    throw new TypeError(
      'initial Pool publication snapshot must be an array.',
    )
  }

  const order = []
  const byId = new Map()

  for (const record of initialRecords) {
    if (!isPoolPublicationRecord(record)) {
      throw new TypeError(
        'initial Pool publication records must be valid immutable PoolPublicationRecord values.',
      )
    }

    const id = record.item.poolItemId
    if (byId.has(id)) {
      throw new Error(
        `duplicate poolItemId in Pool publication snapshot: ${id}`,
      )
    }

    order.push(id)
    byId.set(id, record)
  }

  function list() {
    return Object.freeze(
      order.map((id) => byId.get(id)),
    )
  }

  return Object.freeze({
    list,

    getByPoolItemId(poolItemId) {
      const id = normalizeRequiredId(
        poolItemId,
        'poolItemId',
      )
      return byId.get(id) ?? null
    },

    publish(record) {
      if (!isPoolPublicationRecord(record)) {
        throw new TypeError(
          'record must be a valid immutable PoolPublicationRecord.',
        )
      }
      if (record.revokedAt !== null) {
        throw new Error(
          'New Pool publication must be active.',
        )
      }

      const id = record.item.poolItemId
      if (byId.has(id)) {
        throw new Error(
          `duplicate poolItemId in Pool repository: ${id}`,
        )
      }

      order.push(id)
      byId.set(id, record)
      return record
    },

    revoke({ poolItemId, revokedAt } = {}) {
      const id = normalizeRequiredId(
        poolItemId,
        'poolItemId',
      )
      const timestamp = normalizeRequiredTimestamp(
        revokedAt,
        'revokedAt',
      )
      const current = byId.get(id) ?? null

      if (current === null) {
        throw new Error(
          `teacher-pool-publication-not-found:${id}`,
        )
      }

      const revoked = revokePoolPublicationRecord(
        current,
        timestamp,
      )
      byId.set(id, revoked)
      return revoked
    },
  })
}
```

- [ ] **Step 4: Run repository/lifecycle tests and verify GREEN**

Run:

```bash
node --test   tests/teacherPoolRepository.test.js   tests/poolPublicationRecord.test.js   tests/poolItem.test.js
```

Expected: PASS, 0 failures.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/services/teacherPoolRepository.js tests/teacherPoolRepository.test.js
git commit -m "feat: add TD-03 Pool repository"
```

---

### Task 3: Teacher Pool Publishing Service

**Files:**
- Create: `src/services/teacherPoolPublishingService.js`
- Create: `tests/teacherPoolPublishingService.test.js`
- Reuse: `src/services/poolItem.js`
- Reuse: `src/services/poolPublicationRecord.js`
- Reuse: `src/services/teacherPoolRepository.js`
- Reuse: `src/services/teacherRosterService.js`

**Interfaces:**
- Produces:
  - `createTeacherPoolPublishingService({ repository, rosterService, createPoolItemId, now })`
  - `publishPoolItem(input)`
  - `listPoolPublications()`
  - `revokePoolPublication(poolItemId)`

- [ ] **Step 1: Write failing publishing service tests**

Create `tests/teacherPoolPublishingService.test.js` with these fixtures:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import { POOL_AUDIENCE_MODE } from '../src/services/poolItem.js'
import { createStudentRosterEntry } from '../src/services/studentRosterEntry.js'
import { createTeacherRosterService } from '../src/services/teacherRosterService.js'
import { createInMemoryTeacherRosterRepository } from '../src/services/teacherRosterRepository.js'
import { createInMemoryTeacherPoolRepository } from '../src/services/teacherPoolRepository.js'
import { createTeacherPoolPublishingService } from '../src/services/teacherPoolPublishingService.js'

function rosterService() {
  return createTeacherRosterService({
    repository: createInMemoryTeacherRosterRepository([
      createStudentRosterEntry({
        studentId: 'student-a',
        displayNameOrNickname: 'Deniz',
        active: true,
      }),
      createStudentRosterEntry({
        studentId: 'student-b',
        displayNameOrNickname: 'Ece',
        active: false,
      }),
      createStudentRosterEntry({
        studentId: 'student-c',
        displayNameOrNickname: 'Ada',
        active: true,
      }),
    ]),
  })
}

function service({
  repository = createInMemoryTeacherPoolRepository(),
  roster = rosterService(),
  id = 'pool-1',
  times = [
    '2026-09-22T18:00:00Z',
    '2026-09-22T19:00:00Z',
  ],
} = {}) {
  let index = 0
  return createTeacherPoolPublishingService({
    repository,
    rosterService: roster,
    createPoolItemId() {
      return id
    },
    now() {
      return times[index++] ?? times.at(-1)
    },
  })
}
```

Add tests:

```js
test('TD-03 ALL publishes with empty recipients and skips roster preflight', () => {
  let preflightCalls = 0
  const fakeRoster = {
    preflightActiveStudentIds() {
      preflightCalls += 1
      throw new Error('must not be called for ALL')
    },
  }
  const publishing = service({ roster: fakeRoster })

  const record = publishing.publishPoolItem({
    title: 'Yeni repertuar',
    shortDescription: 'Bu hafta',
    detailText: '',
    audienceMode: POOL_AUDIENCE_MODE.ALL,
    selectedStudentIds: [],
  })

  assert.equal(preflightCalls, 0)
  assert.equal(record.item.audienceMode, 'ALL')
  assert.deepEqual(record.item.recipientStudentIds, [])
})

test('TD-03 SELECTED uses active TD-02 preflight result as exact recipients', () => {
  const publishing = service()

  const record = publishing.publishPoolItem({
    title: 'Seçili öğrenciler',
    shortDescription: 'Duyuru',
    detailText: '',
    audienceMode: POOL_AUDIENCE_MODE.SELECTED,
    selectedStudentIds: [
      ' student-c ',
      'student-a',
      'student-c',
    ],
  })

  assert.deepEqual(
    record.item.recipientStudentIds,
    ['student-c', 'student-a'],
  )
})

test('TD-03 SELECTED fails before publish for unknown or inactive student', () => {
  let publishCalls = 0
  const base = createInMemoryTeacherPoolRepository()
  const repository = {
    ...base,
    publish(record) {
      publishCalls += 1
      return base.publish(record)
    },
  }
  const publishing = service({ repository })

  assert.throws(
    () =>
      publishing.publishPoolItem({
        title: 'Duyuru',
        shortDescription: 'Kısa',
        detailText: '',
        audienceMode: 'SELECTED',
        selectedStudentIds: ['student-b'],
      }),
    /student-inactive/i,
  )

  assert.equal(publishCalls, 0)
})

test('TD-03 rejects ALL recipients and empty SELECTED', () => {
  const publishing = service()

  assert.throws(
    () =>
      publishing.publishPoolItem({
        title: 'Duyuru',
        shortDescription: 'Kısa',
        detailText: '',
        audienceMode: 'ALL',
        selectedStudentIds: ['student-a'],
      }),
    /ALL.*selected/i,
  )

  assert.throws(
    () =>
      publishing.publishPoolItem({
        title: 'Duyuru',
        shortDescription: 'Kısa',
        detailText: '',
        audienceMode: 'SELECTED',
        selectedStudentIds: [],
      }),
    /SELECTED.*student/i,
  )
})

test('TD-03 publish fails closed on malformed or substituted acknowledgement', () => {
  const base = createInMemoryTeacherPoolRepository()
  const publishing = service({
    repository: {
      ...base,
      publish(record) {
        base.publish(record)
        return structuredClone(record)
      },
    },
  })

  assert.throws(
    () =>
      publishing.publishPoolItem({
        title: 'Duyuru',
        shortDescription: 'Kısa',
        detailText: '',
        audienceMode: 'ALL',
        selectedStudentIds: [],
      }),
    /acknowledgement/i,
  )
})

test('TD-03 list revalidates repository rows instead of trusting adapter shape', () => {
  const publishing = service({
    repository: {
      list() {
        return [Object.freeze({ forged: true })]
      },
      getByPoolItemId() {
        return null
      },
      publish(record) {
        return record
      },
      revoke() {
        throw new Error('unused')
      },
    },
  })

  assert.throws(
    () => publishing.listPoolPublications(),
    /PoolPublicationRecord/i,
  )
})

test('TD-03 revoke requires exact acknowledgement and preserves item identity', () => {
  const repository = createInMemoryTeacherPoolRepository()
  const publishing = service({ repository })

  const active = publishing.publishPoolItem({
    title: 'Duyuru',
    shortDescription: 'Kısa',
    detailText: '',
    audienceMode: 'ALL',
    selectedStudentIds: [],
  })

  const revoked = publishing.revokePoolPublication(
    active.item.poolItemId,
  )

  assert.equal(revoked.item, active.item)
  assert.equal(revoked.revokedAt, '2026-09-22T19:00:00Z')
})

test('TD-03 validates injected producer ID/time exactly once per action', () => {
  let idCalls = 0
  let timeCalls = 0
  const publishing = createTeacherPoolPublishingService({
    repository: createInMemoryTeacherPoolRepository(),
    rosterService: rosterService(),
    createPoolItemId() {
      idCalls += 1
      return 'pool-once'
    },
    now() {
      timeCalls += 1
      return '2026-09-22T18:00:00Z'
    },
  })

  publishing.publishPoolItem({
    title: 'Duyuru',
    shortDescription: 'Kısa',
    detailText: '',
    audienceMode: 'ALL',
    selectedStudentIds: [],
  })

  assert.equal(idCalls, 1)
  assert.equal(timeCalls, 1)
})
```

- [ ] **Step 2: Run service tests and verify RED**

Run:

```bash
node --test tests/teacherPoolPublishingService.test.js
```

Expected: FAIL because service module does not exist.

- [ ] **Step 3: Implement strict producer and acknowledgement helpers**

Create `src/services/teacherPoolPublishingService.js`.

Required structure:

```js
import {
  POOL_AUDIENCE_MODE,
  createPoolItem,
} from './poolItem.js'
import {
  createActivePoolPublicationRecord,
  isPoolPublicationRecord,
} from './poolPublicationRecord.js'
import {
  assertTeacherPoolRepository,
} from './teacherPoolRepository.js'
import {
  normalizeRequiredId,
  normalizeRequiredTimestamp,
} from './teacherDeliveryContractValidation.js'

const PUBLISH_FIELDS = Object.freeze([
  'title',
  'shortDescription',
  'detailText',
  'audienceMode',
  'selectedStudentIds',
])

function assertStrictPublishInput(input) {
  if (
    input === null ||
    typeof input !== 'object' ||
    Array.isArray(input)
  ) {
    throw new TypeError(
      'Pool publication input must be an object.',
    )
  }

  const keys = Object.keys(input)
  if (
    keys.length !== PUBLISH_FIELDS.length ||
    keys.some((key) => !PUBLISH_FIELDS.includes(key))
  ) {
    throw new TypeError(
      'Pool publication input contains unsupported or missing fields.',
    )
  }
}

function sameItem(a, b) {
  return (
    a === b ||
    (
      a?.poolItemId === b?.poolItemId &&
      a?.title === b?.title &&
      a?.shortDescription === b?.shortDescription &&
      a?.detailText === b?.detailText &&
      a?.publishedAt === b?.publishedAt &&
      a?.audienceMode === b?.audienceMode &&
      Array.isArray(a?.recipientStudentIds) &&
      Array.isArray(b?.recipientStudentIds) &&
      a.recipientStudentIds.length ===
        b.recipientStudentIds.length &&
      a.recipientStudentIds.every(
        (id, index) =>
          id === b.recipientStudentIds[index],
      )
    )
  )
}

function assertPublicationAcknowledgement(
  acknowledgement,
  expectedRecord,
  expectedRevokedAt,
) {
  if (!isPoolPublicationRecord(acknowledgement)) {
    throw new Error(
      'teacher Pool repository acknowledgement is invalid.',
    )
  }

  if (
    acknowledgement.item.poolItemId !==
      expectedRecord.item.poolItemId ||
    !sameItem(
      acknowledgement.item,
      expectedRecord.item,
    ) ||
    acknowledgement.revokedAt !== expectedRevokedAt
  ) {
    throw new Error(
      'teacher Pool repository acknowledgement mismatch.',
    )
  }

  return acknowledgement
}
```

Implement the service with this exact control flow after the helper functions above:

```js
export function createTeacherPoolPublishingService({
  repository,
  rosterService,
  createPoolItemId,
  now,
} = {}) {
  const trustedRepository =
    assertTeacherPoolRepository(repository)

  if (
    !rosterService ||
    typeof rosterService.preflightActiveStudentIds !== 'function'
  ) {
    throw new TypeError(
      'rosterService must provide preflightActiveStudentIds().',
    )
  }
  if (typeof createPoolItemId !== 'function') {
    throw new TypeError(
      'createPoolItemId must be a function.',
    )
  }
  if (typeof now !== 'function') {
    throw new TypeError('now must be a function.')
  }

  function listPoolPublications() {
    const rows = trustedRepository.list()
    if (!Array.isArray(rows)) {
      throw new TypeError(
        'teacher Pool repository list() must return an array.',
      )
    }

    const seen = new Set()
    const validated = rows.map((row) => {
      if (!isPoolPublicationRecord(row)) {
        throw new TypeError(
          'teacher Pool repository row must be a valid immutable PoolPublicationRecord.',
        )
      }

      const id = row.item.poolItemId
      if (seen.has(id)) {
        throw new Error(
          `duplicate poolItemId returned by teacher Pool repository: ${id}`,
        )
      }
      seen.add(id)
      return row
    })

    return Object.freeze(validated)
  }

  function publishPoolItem(input = {}) {
    assertStrictPublishInput(input)

    if (!Array.isArray(input.selectedStudentIds)) {
      throw new TypeError(
        'selectedStudentIds must be an array.',
      )
    }

    let recipients = []

    if (input.audienceMode === POOL_AUDIENCE_MODE.ALL) {
      if (input.selectedStudentIds.length !== 0) {
        throw new Error(
          'ALL Pool publication must not contain selected students.',
        )
      }
    } else if (
      input.audienceMode === POOL_AUDIENCE_MODE.SELECTED
    ) {
      if (input.selectedStudentIds.length === 0) {
        throw new Error(
          'SELECTED Pool publication requires at least one selected student.',
        )
      }

      const activeStudents =
        rosterService.preflightActiveStudentIds(
          input.selectedStudentIds,
        )
      recipients = activeStudents.map(
        (student) => student.studentId,
      )
    } else {
      throw new TypeError(
        'audienceMode must be ALL or SELECTED.',
      )
    }

    const poolItemId = normalizeRequiredId(
      createPoolItemId(),
      'poolItemId',
    )
    const publishedAt = normalizeRequiredTimestamp(
      now(),
      'publishedAt',
    )

    const item = createPoolItem({
      poolItemId,
      title: input.title,
      shortDescription: input.shortDescription,
      detailText: input.detailText,
      publishedAt,
      audienceMode: input.audienceMode,
      recipientStudentIds: recipients,
    })
    const expected =
      createActivePoolPublicationRecord(item)

    const acknowledgement =
      trustedRepository.publish(expected)

    return assertPublicationAcknowledgement(
      acknowledgement,
      expected,
      null,
    )
  }

  function revokePoolPublication(poolItemId) {
    const id = normalizeRequiredId(
      poolItemId,
      'poolItemId',
    )
    const current =
      trustedRepository.getByPoolItemId(id)

    if (current === null || current === undefined) {
      throw new Error(
        `teacher-pool-publication-not-found:${id}`,
      )
    }
    if (!isPoolPublicationRecord(current)) {
      throw new TypeError(
        'teacher Pool repository lookup result must be a valid immutable PoolPublicationRecord.',
      )
    }
    if (current.item.poolItemId !== id) {
      throw new Error(
        `teacher-pool-identity-mismatch:${id}`,
      )
    }
    if (current.revokedAt !== null) {
      throw new Error(
        `teacher-pool-publication-already-revoked:${id}`,
      )
    }

    const revokedAt = normalizeRequiredTimestamp(
      now(),
      'revokedAt',
    )
    const acknowledgement =
      trustedRepository.revoke({
        poolItemId: id,
        revokedAt,
      })

    return assertPublicationAcknowledgement(
      acknowledgement,
      current,
      revokedAt,
    )
  }

  return Object.freeze({
    publishPoolItem,
    listPoolPublications,
    revokePoolPublication,
  })
}
```

Use the producer-created record as acknowledgement truth. Never reconstruct expected publication identity from adapter output.

- [ ] **Step 4: Run service/repository/roster tests and verify GREEN**

Run:

```bash
node --test   tests/teacherPoolPublishingService.test.js   tests/teacherPoolRepository.test.js   tests/poolPublicationRecord.test.js   tests/poolItem.test.js   tests/teacherRosterService.test.js
```

Expected: PASS, 0 failures.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/services/teacherPoolPublishingService.js tests/teacherPoolPublishingService.test.js
git commit -m "feat: add TD-03 Pool publishing service"
```

---

### Task 4: Teacher Pool Controller and Explicitly Mounted UI Module

**Files:**
- Create: `src/services/teacherPoolPublishingController.js`
- Create: `src/teacherPoolPublishingUi.js`
- Create: `src/teacherPoolPublishingUi.css`
- Create: `tests/teacherPoolPublishingController.test.js`
- Create: `tests/teacherPoolPublishingUi.test.js`
- Create: `tests/support/fakeTeacherPoolDom.js`
- Do not modify: `main.js`, `src/appShell.js`, `index.html`

**Interfaces:**
- Controller consumes:
  - publishing service:
    - `publishPoolItem(input)`
    - `listPoolPublications()`
    - `revokePoolPublication(poolItemId)`
  - roster service:
    - `listStudents({ includeInactive: false })`
- Controller produces:
  - `createTeacherPoolPublishingController({ publishingService, rosterService })`
  - `getViewModel()`
  - `publish(input)`
  - `revoke(poolItemId)`
- UI produces:
  - `mountTeacherPoolPublishingUi({ root, host, controller })`
  - returned frozen handle with `refresh()` and `destroy()`

- [ ] **Step 1: Write failing controller tests**

Create `tests/teacherPoolPublishingController.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createTeacherPoolPublishingController,
} from '../src/services/teacherPoolPublishingController.js'

function student(studentId, displayNameOrNickname) {
  return Object.freeze({
    schemaVersion: 1,
    studentId,
    displayNameOrNickname,
    active: true,
  })
}

function record(id, revokedAt = null) {
  return Object.freeze({
    schemaVersion: 1,
    item: Object.freeze({
      schemaVersion: 1,
      poolItemId: id,
      title: `Duyuru ${id}`,
      shortDescription: 'Kısa',
      detailText: '',
      publishedAt: '2026-09-22T18:00:00Z',
      audienceMode: 'ALL',
      recipientStudentIds: Object.freeze([]),
      revokedAt: null,
    }),
    revokedAt,
  })
}

function controller({
  students = [
    student('student-a', 'Deniz'),
    student('student-c', 'Ada'),
  ],
  publications = [record('pool-a')],
  publishResult = record('pool-new'),
  publishError = null,
  revokeResult = record(
    'pool-a',
    '2026-09-22T19:00:00Z',
  ),
  revokeError = null,
} = {}) {
  return createTeacherPoolPublishingController({
    rosterService: {
      listStudents({ includeInactive }) {
        assert.equal(includeInactive, false)
        return Object.freeze(students)
      },
    },
    publishingService: {
      listPoolPublications() {
        return Object.freeze(publications)
      },
      publishPoolItem() {
        if (publishError) throw publishError
        return publishResult
      },
      revokePoolPublication() {
        if (revokeError) throw revokeError
        return revokeResult
      },
    },
  })
}

test('TD-03 controller view model lists active roster presentation rows and Pool history', () => {
  const value = controller().getViewModel()

  assert.deepEqual(
    value.students.map((row) => [
      row.studentId,
      row.displayNameOrNickname,
    ]),
    [
      ['student-a', 'Deniz'],
      ['student-c', 'Ada'],
    ],
  )
  assert.equal(Object.isFrozen(value), true)
  assert.equal(Object.isFrozen(value.students), true)
  assert.equal(Object.isFrozen(value.publications), true)
})

test('TD-03 duplicate display names remain separate stable identities', () => {
  const value = controller({
    students: [
      student('student-a', 'Aynı Ad'),
      student('student-b', 'Aynı Ad'),
    ],
  }).getViewModel()

  assert.deepEqual(
    value.students.map((row) => row.studentId),
    ['student-a', 'student-b'],
  )
})

test('TD-03 controller reports publish success only after service success', () => {
  const result = controller().publish({
    title: 'Duyuru',
    shortDescription: 'Kısa',
    detailText: '',
    audienceMode: 'ALL',
    selectedStudentIds: [],
  })

  assert.equal(result.ok, true)
  assert.equal(result.message, 'Havuza gönderildi.')
  assert.equal(result.record.item.poolItemId, 'pool-new')
})

test('TD-03 controller maps service failure to bounded teacher message', () => {
  const result = controller({
    publishError: new Error(
      'teacher Pool repository acknowledgement mismatch token=secret',
    ),
  }).publish({
    title: 'Duyuru',
    shortDescription: 'Kısa',
    detailText: '',
    audienceMode: 'ALL',
    selectedStudentIds: [],
  })

  assert.deepEqual(result, {
    ok: false,
    record: null,
    message: 'Havuz işlemi doğrulanamadı.',
  })
  assert.equal(
    JSON.stringify(result).includes('secret'),
    false,
  )
})

test('TD-03 controller maps revoke success and already-revoked failure', () => {
  const success = controller().revoke('pool-a')
  assert.equal(success.ok, true)
  assert.equal(
    success.message,
    'Havuz yayını geri çekildi.',
  )

  const failure = controller({
    revokeError: new Error(
      'teacher-pool-publication-already-revoked:pool-a',
    ),
  }).revoke('pool-a')

  assert.deepEqual(failure, {
    ok: false,
    record: null,
    message: 'Bu Havuz yayını zaten geri çekilmiş.',
  })
})
```

- [ ] **Step 2: Verify controller RED**

Run:

```bash
node --test tests/teacherPoolPublishingController.test.js
```

Expected: FAIL because controller module does not exist.

- [ ] **Step 3: Implement the controller**

Create `src/services/teacherPoolPublishingController.js` with this pure dependency-injected shape:

```js
function teacherMessage(error) {
  const text = String(error?.message || '')
  if (/student-inactive/i.test(text)) {
    return 'Seçilen öğrencilerden biri aktif değil.'
  }
  if (/student-not-found/i.test(text)) {
    return 'Seçilen öğrencilerden biri bulunamadı.'
  }
  if (/acknowledgement/i.test(text)) {
    return 'Havuz işlemi doğrulanamadı.'
  }
  if (/already.*revoked/i.test(text)) {
    return 'Bu Havuz yayını zaten geri çekilmiş.'
  }
  return 'Havuz işlemi tamamlanamadı.'
}

export function createTeacherPoolPublishingController({
  publishingService,
  rosterService,
} = {}) {
  if (
    !publishingService ||
    typeof publishingService.publishPoolItem !== 'function' ||
    typeof publishingService.listPoolPublications !== 'function' ||
    typeof publishingService.revokePoolPublication !== 'function'
  ) {
    throw new TypeError(
      'publishingService must provide Pool publish/list/revoke operations.',
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

  function getViewModel() {
    const students = rosterService.listStudents({
      includeInactive: false,
    })
    const publications =
      publishingService.listPoolPublications()

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
      publications,
    })
  }

  function publish(input) {
    try {
      const record =
        publishingService.publishPoolItem(input)
      return Object.freeze({
        ok: true,
        record,
        message: 'Havuza gönderildi.',
      })
    } catch (error) {
      return Object.freeze({
        ok: false,
        record: null,
        message: teacherMessage(error),
      })
    }
  }

  function revoke(poolItemId) {
    try {
      const record =
        publishingService.revokePoolPublication(
          poolItemId,
        )
      return Object.freeze({
        ok: true,
        record,
        message: 'Havuz yayını geri çekildi.',
      })
    } catch (error) {
      return Object.freeze({
        ok: false,
        record: null,
        message: teacherMessage(error),
      })
    }
  }

  return Object.freeze({
    getViewModel,
    publish,
    revoke,
  })
}
```

The controller returns only bounded teacher messages and never returns raw errors, stacks or provider diagnostics.

- [ ] **Step 4: Run controller tests and verify GREEN**

Run:

```bash
node --test   tests/teacherPoolPublishingController.test.js   tests/teacherPoolPublishingService.test.js
```

Expected: PASS.

- [ ] **Step 5: Write failing explicitly-mounted UI tests**

Create `tests/teacherPoolPublishingUi.test.js` with a small fake DOM that implements only the methods used by TD-03: `createElement`, `createTextNode`, `appendChild`, `replaceChildren`, `remove`, `setAttribute`, `addEventListener`, `querySelectorAll`, `dataset`, `hidden`, `textContent`, `value`, `checked`, `name`, `type`, and `id`.

The behavioral tests must be:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  mountTeacherPoolPublishingUi,
} from '../src/teacherPoolPublishingUi.js'
import {
  createFakeDocument,
} from './support/fakeTeacherPoolDom.js'

function activeRecord(id = 'pool-a') {
  return Object.freeze({
    schemaVersion: 1,
    item: Object.freeze({
      schemaVersion: 1,
      poolItemId: id,
      title: 'Etüt duyurusu',
      shortDescription: 'Kısa',
      detailText: '',
      publishedAt: '2026-09-22T18:00:00Z',
      audienceMode: 'ALL',
      recipientStudentIds: Object.freeze([]),
      revokedAt: null,
    }),
    revokedAt: null,
  })
}

function controller({
  students = Object.freeze([
    Object.freeze({
      studentId: 'student-a',
      displayNameOrNickname: 'Aynı Ad',
    }),
    Object.freeze({
      studentId: 'student-b',
      displayNameOrNickname: 'Aynı Ad',
    }),
  ]),
  publications = Object.freeze([
    activeRecord(),
  ]),
  publishResult = Object.freeze({
    ok: true,
    record: activeRecord('pool-new'),
    message: 'Havuza gönderildi.',
  }),
} = {}) {
  const calls = {
    publish: [],
    revoke: [],
  }

  return {
    calls,
    api: {
      getViewModel() {
        return Object.freeze({
          students,
          publications,
        })
      },
      publish(input) {
        calls.publish.push(input)
        return publishResult
      },
      revoke(id) {
        calls.revoke.push(id)
        return Object.freeze({
          ok: true,
          record: Object.freeze({
            ...activeRecord(id),
            revokedAt: '2026-09-22T19:00:00Z',
          }),
          message: 'Havuz yayını geri çekildi.',
        })
      },
    },
  }
}

test('TD-03 UI mounts Havuza Gönder without auto-mounting elsewhere', () => {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const fake = controller()

  const handle = mountTeacherPoolPublishingUi({
    root,
    host,
    controller: fake.api,
  })

  assert.equal(host.children.length, 1)
  assert.equal(
    host.children[0].querySelector('h2').textContent,
    'Havuza Gönder',
  )
  assert.equal(typeof handle.refresh, 'function')
  assert.equal(typeof handle.destroy, 'function')
})

test('TD-03 UI keeps duplicate names distinct by stable checkbox ID/value', () => {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const fake = controller()

  mountTeacherPoolPublishingUi({
    root,
    host,
    controller: fake.api,
  })

  const checkboxes =
    host.querySelectorAll(
      'input[name="selectedStudentIds"]',
    )

  assert.deepEqual(
    checkboxes.map((node) => [node.id, node.value]),
    [
      [
        'teacher-pool-student-student-a',
        'student-a',
      ],
      [
        'teacher-pool-student-student-b',
        'student-b',
      ],
    ],
  )
})

test('TD-03 UI submits SELECTED stable IDs and shows acknowledged success', () => {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const fake = controller()

  mountTeacherPoolPublishingUi({
    root,
    host,
    controller: fake.api,
  })

  const title =
    host.querySelector('input[name="title"]')
  const shortDescription =
    host.querySelector(
      'input[name="shortDescription"]',
    )
  const detail =
    host.querySelector('textarea[name="detailText"]')
  const selected =
    host.querySelector(
      'input[value="SELECTED"]',
    )
  const checkboxes =
    host.querySelectorAll(
      'input[name="selectedStudentIds"]',
    )

  title.value = 'Yeni çalışma'
  shortDescription.value = 'Bu hafta'
  detail.value = 'Detay'
  selected.checked = true
  selected.dispatchEvent({ type: 'change' })
  checkboxes[1].checked = true

  host
    .querySelector('form')
    .dispatchEvent({
      type: 'submit',
      preventDefault() {},
    })

  assert.deepEqual(fake.calls.publish, [{
    title: 'Yeni çalışma',
    shortDescription: 'Bu hafta',
    detailText: 'Detay',
    audienceMode: 'SELECTED',
    selectedStudentIds: ['student-b'],
  }])

  assert.equal(
    host.querySelector(
      '.teacher-pool-publishing__status',
    ).textContent,
    'Havuza gönderildi.',
  )
})

test('TD-03 UI does not refresh success state for failed publish', () => {
  const root = createFakeDocument()
  const host = root.createElement('div')
  let viewCalls = 0
  const fake = controller({
    publishResult: Object.freeze({
      ok: false,
      record: null,
      message: 'Havuz işlemi doğrulanamadı.',
    }),
  })
  const originalGetViewModel =
    fake.api.getViewModel

  fake.api.getViewModel = () => {
    viewCalls += 1
    return originalGetViewModel()
  }

  mountTeacherPoolPublishingUi({
    root,
    host,
    controller: fake.api,
  })
  assert.equal(viewCalls, 1)

  host
    .querySelector('form')
    .dispatchEvent({
      type: 'submit',
      preventDefault() {},
    })

  assert.equal(viewCalls, 1)
  assert.equal(
    host.querySelector(
      '.teacher-pool-publishing__status',
    ).textContent,
    'Havuz işlemi doğrulanamadı.',
  )
})

test('TD-03 UI renders Geri Çek only for active history and destroy removes only its section', () => {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const sentinel = root.createElement('p')
  sentinel.textContent = 'koru'
  host.appendChild(sentinel)

  const revoked = Object.freeze({
    ...activeRecord('pool-old'),
    revokedAt: '2026-09-22T17:00:00Z',
  })
  const fake = controller({
    publications: Object.freeze([
      activeRecord('pool-a'),
      revoked,
    ]),
  })

  const handle = mountTeacherPoolPublishingUi({
    root,
    host,
    controller: fake.api,
  })

  assert.equal(
    host.querySelectorAll('button')
      .filter((node) => node.textContent === 'Geri Çek')
      .length,
    1,
  )

  handle.destroy()

  assert.equal(host.children.includes(sentinel), true)
  assert.equal(
    host.querySelector(
      '.teacher-pool-publishing',
    ),
    null,
  )
})
```

Create `tests/support/fakeTeacherPoolDom.js` in the same RED commit with this bounded helper:

```js
function matchesSelector(node, selector) {
  if (selector === 'h2') return node.tagName === 'H2'
  if (selector === 'form') return node.tagName === 'FORM'
  if (selector === 'button') return node.tagName === 'BUTTON'

  if (selector.startsWith('.')) {
    const className = selector.slice(1)
    return String(node.className || '')
      .split(/\s+/)
      .includes(className)
  }

  const match = selector.match(
    /^(input|textarea)(?:\[name="([^"]+)"\])?(?:\[value="([^"]+)"\])?$/,
  )
  if (match) {
    const [, tag, name, value] = match
    if (node.tagName !== tag.toUpperCase()) return false
    if (name && node.name !== name) return false
    if (value && node.value !== value) return false
    return true
  }

  const checked = selector.match(
    /^input\[type="checkbox"\]:checked$/,
  )
  if (checked) {
    return (
      node.tagName === 'INPUT' &&
      node.type === 'checkbox' &&
      node.checked === true
    )
  }

  return false
}

class FakeNode {
  constructor(tagName = '#text', text = '') {
    this.tagName = tagName.toUpperCase()
    this.children = []
    this.parentElement = null
    this.className = ''
    this.dataset = {}
    this.hidden = false
    this.textContent = text
    this.value = ''
    this.checked = false
    this.required = false
    this.type = ''
    this.name = ''
    this.id = ''
    this.attributes = new Map()
    this.listeners = new Map()
  }

  appendChild(child) {
    child.parentElement = this
    this.children.push(child)
    return child
  }

  replaceChildren(...children) {
    for (const child of this.children) {
      child.parentElement = null
    }
    this.children = []
    for (const child of children) {
      this.appendChild(child)
    }
  }

  remove() {
    if (!this.parentElement) return
    const parent = this.parentElement
    parent.children = parent.children.filter(
      (child) => child !== this,
    )
    this.parentElement = null
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value))
  }

  addEventListener(type, listener) {
    const current = this.listeners.get(type) ?? []
    current.push(listener)
    this.listeners.set(type, current)
  }

  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(event)
    }
  }

  querySelectorAll(selector) {
    const matches = []
    const visit = (node) => {
      for (const child of node.children) {
        if (matchesSelector(child, selector)) {
          matches.push(child)
        }
        visit(child)
      }
    }
    visit(this)
    return matches
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null
  }
}

export function createFakeDocument() {
  return Object.freeze({
    createElement(tagName) {
      return new FakeNode(tagName)
    },
    createTextNode(text) {
      return new FakeNode('#text', String(text))
    },
  })
}
```

Its selector support is deliberately bounded to the selectors exercised by TD-03. Do not add a DOM library dependency.

- [ ] **Step 6: Verify UI RED**

Run:

```bash
node --test tests/teacherPoolPublishingUi.test.js
```

Expected: FAIL because UI module does not exist.

- [ ] **Step 7: Implement scoped UI module and CSS**

Create `src/teacherPoolPublishingUi.js` as an explicit mount function only. Use DOM nodes and `textContent` for teacher/student text; do not inject roster names through `innerHTML`.

The module structure must follow this exact mount/refresh/destroy pattern:

```js
function element(root, tag, className = '') {
  const node = root.createElement(tag)
  if (className) node.className = className
  return node
}

function labeledField(root, {
  labelText,
  name,
  required = false,
  multiline = false,
}) {
  const wrap = element(
    root,
    'label',
    'teacher-pool-publishing__field',
  )
  const label = element(root, 'span')
  label.textContent = labelText

  const control = element(
    root,
    multiline ? 'textarea' : 'input',
  )
  control.name = name
  if (required) control.required = true

  wrap.appendChild(label)
  wrap.appendChild(control)
  return { wrap, control }
}

export function mountTeacherPoolPublishingUi({
  root = document,
  host,
  controller,
} = {}) {
  if (!host?.appendChild) {
    throw new TypeError(
      'host must be a DOM container.',
    )
  }
  if (
    !controller ||
    typeof controller.getViewModel !== 'function' ||
    typeof controller.publish !== 'function' ||
    typeof controller.revoke !== 'function'
  ) {
    throw new TypeError(
      'controller must provide getViewModel(), publish() and revoke().',
    )
  }

  const section = element(
    root,
    'section',
    'teacher-pool-publishing',
  )
  section.setAttribute(
    'aria-labelledby',
    'teacher-pool-publishing-heading',
  )

  const heading = element(root, 'h2')
  heading.id = 'teacher-pool-publishing-heading'
  heading.textContent = 'Havuza Gönder'

  const form = element(
    root,
    'form',
    'teacher-pool-publishing__form',
  )
  const title = labeledField(root, {
    labelText: 'Başlık',
    name: 'title',
    required: true,
  })
  const shortDescription = labeledField(root, {
    labelText: 'Kısa açıklama',
    name: 'shortDescription',
    required: true,
  })
  const detail = labeledField(root, {
    labelText: 'Ayrıntı',
    name: 'detailText',
    multiline: true,
  })

  const audience = element(
    root,
    'fieldset',
    'teacher-pool-publishing__audience',
  )
  const legend = element(root, 'legend')
  legend.textContent = 'Hedef'
  audience.appendChild(legend)

  const all = element(root, 'input')
  all.type = 'radio'
  all.name = 'audienceMode'
  all.value = 'ALL'
  all.checked = true

  const allLabel = element(root, 'label')
  allLabel.appendChild(all)
  allLabel.appendChild(
    root.createTextNode('Tüm öğrenciler'),
  )

  const selected = element(root, 'input')
  selected.type = 'radio'
  selected.name = 'audienceMode'
  selected.value = 'SELECTED'

  const selectedLabel = element(root, 'label')
  selectedLabel.appendChild(selected)
  selectedLabel.appendChild(
    root.createTextNode('Seçili öğrenciler'),
  )

  audience.appendChild(allLabel)
  audience.appendChild(selectedLabel)

  const students = element(
    root,
    'div',
    'teacher-pool-publishing__students',
  )
  students.hidden = true

  const submit = element(root, 'button')
  submit.type = 'submit'
  submit.textContent = 'Havuza Gönder'

  const status = element(
    root,
    'div',
    'teacher-pool-publishing__status',
  )
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  const history = element(
    root,
    'div',
    'teacher-pool-publishing__history',
  )

  form.appendChild(title.wrap)
  form.appendChild(shortDescription.wrap)
  form.appendChild(detail.wrap)
  form.appendChild(audience)
  form.appendChild(students)
  form.appendChild(submit)

  section.appendChild(heading)
  section.appendChild(form)
  section.appendChild(status)
  section.appendChild(history)
  host.appendChild(section)

  function checkedStudentIds() {
    return [
      ...students.querySelectorAll(
        'input[type="checkbox"]:checked',
      ),
    ].map((input) => input.value)
  }

  function renderStudents(rows) {
    students.replaceChildren()
    for (const row of rows) {
      const label = element(root, 'label')
      const checkbox = element(root, 'input')
      checkbox.type = 'checkbox'
      checkbox.value = row.studentId
      checkbox.name = 'selectedStudentIds'
      checkbox.id =
        `teacher-pool-student-${row.studentId}`

      const name = element(root, 'span')
      name.textContent = row.displayNameOrNickname

      label.appendChild(checkbox)
      label.appendChild(name)
      students.appendChild(label)
    }
  }

  function renderHistory(records) {
    history.replaceChildren()

    for (const record of records) {
      const article = element(root, 'article')
      article.dataset.poolItemId =
        record.item.poolItemId

      const titleNode = element(root, 'h3')
      titleNode.textContent = record.item.title
      article.appendChild(titleNode)

      const state = element(root, 'span')
      state.textContent =
        record.revokedAt === null ? 'Aktif' : 'Geri çekildi'
      article.appendChild(state)

      if (record.revokedAt === null) {
        const revoke = element(root, 'button')
        revoke.type = 'button'
        revoke.textContent = 'Geri Çek'
        revoke.addEventListener('click', () => {
          const result = controller.revoke(
            record.item.poolItemId,
          )
          status.textContent = result.message
          refresh()
        })
        article.appendChild(revoke)
      }

      history.appendChild(article)
    }
  }

  function refresh() {
    const view = controller.getViewModel()
    renderStudents(view.students)
    renderHistory(view.publications)
    students.hidden = !selected.checked
    return view
  }

  function syncAudience() {
    students.hidden = !selected.checked
  }

  all.addEventListener('change', syncAudience)
  selected.addEventListener('change', syncAudience)

  form.addEventListener('submit', (event) => {
    event.preventDefault()

    const result = controller.publish({
      title: title.control.value,
      shortDescription:
        shortDescription.control.value,
      detailText: detail.control.value,
      audienceMode:
        selected.checked ? 'SELECTED' : 'ALL',
      selectedStudentIds:
        selected.checked ? checkedStudentIds() : [],
    })

    status.textContent = result.message
    if (result.ok) refresh()
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

Do not include any module-level `DOMContentLoaded`, implicit `document` initialization or automatic call to `mountTeacherPoolPublishingUi`.

Create `src/teacherPoolPublishingUi.css` with only `.teacher-pool-publishing...` selectors. The minimum styles are:

```css
.teacher-pool-publishing {
  display: grid;
  gap: 1rem;
}

.teacher-pool-publishing__form,
.teacher-pool-publishing__history {
  display: grid;
  gap: 0.75rem;
}

.teacher-pool-publishing__field {
  display: grid;
  gap: 0.35rem;
}

.teacher-pool-publishing__students[hidden] {
  display: none;
}
```

Do not change global shell/layout selectors.

- [ ] **Step 8: Run controller/UI tests and verify GREEN**

Run:

```bash
node --test   tests/teacherPoolPublishingController.test.js   tests/teacherPoolPublishingUi.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit Task 4**

```bash
git add   src/services/teacherPoolPublishingController.js   src/teacherPoolPublishingUi.js   src/teacherPoolPublishingUi.css   tests/teacherPoolPublishingController.test.js   tests/teacherPoolPublishingUi.test.js
git commit -m "feat: add TD-03 teacher Pool UI boundary"
```

---

### Task 5: Security Matrix, Implemented Contract Documentation and Full Verification

**Files:**
- Create: `tests/teacherPoolPublishingSecurity.test.js`
- Create: `docs/teacher-delivery-td03-pool-publishing.md`
- Read-only verification: TD-03 source + `main.js` + `src/appShell.js`

- [ ] **Step 1: Write security boundary tests**

Create `tests/teacherPoolPublishingSecurity.test.js`.

Pin source files:

```js
const td03Sources = [
  '../src/services/poolPublicationRecord.js',
  '../src/services/teacherPoolRepository.js',
  '../src/services/teacherPoolPublishingService.js',
  '../src/services/teacherPoolPublishingController.js',
  '../src/teacherPoolPublishingUi.js',
]
```

For each, assert absence of:

```js
/firebase|adminCredential|listUsers\s*\(|fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|firestore|database|bearer|token/i
```

Additionally assert:

```js
test('TD-03 does not production-mount teacher Pool UI', () => {
  const main = readFileSync(
    new URL('../main.js', import.meta.url),
    'utf8',
  )
  const shell = readFileSync(
    new URL('../src/appShell.js', import.meta.url),
    'utf8',
  )

  assert.doesNotMatch(
    main,
    /teacherPoolPublishingUi|mountTeacherPoolPublishingUi/,
  )
  assert.doesNotMatch(
    shell,
    /teacherPool|Havuza Gönder|id:\s*['"]teacher['"]/i,
  )
})
```

Also assert TD-03 service source contains no imports/references matching:

```text
stageL
teacherShareAuthorization
teacherShareEligibility
scoreAssignmentSourceBinding
privateAssignment
practicePackage
musicXml
```

- [ ] **Step 2: Run security tests**

Run:

```bash
node --test tests/teacherPoolPublishingSecurity.test.js
```

Expected: PASS.

- [ ] **Step 3: Write implemented boundary document**

Create `docs/teacher-delivery-td03-pool-publishing.md`:

```markdown
# TD-03 — Teacher Pool Publishing

## Boundary

TD-03 implements provider-neutral teacher Pool publication production. It does not select a production persistence/auth provider and does not modify Student App.

## Publication model

TD-01 PoolItem remains immutable. TD-03 wraps it in PoolPublicationRecord with an orthogonal revokedAt tombstone.

## Audience

- ALL keeps recipientStudentIds empty.
- SELECTED uses TD-02 active-student stable-ID preflight.
- display names are presentation-only.

## Repository truth

Publish and revoke are successful only after a valid exact repository acknowledgement.

The reference repository is in-memory and deterministic. It is not production persistence.

## Teacher UI boundary

TD-03 supplies an explicitly mounted teacher controller/UI module for Havuza Gönder, publication history and Geri Çek.

It is intentionally not auto-mounted from main.js or appShell because production authenticated/provider composition remains deferred.

## Deferred

- SCORE private assignments: TD-04;
- assignment lifecycle: TD-05;
- authenticated production persistence/delivery and teacher UI composition: TD-06;
- Chord Board delivery: TD-07.
```

- [ ] **Step 4: Run TD-01/02/03 focused regression matrix**

Run:

```bash
node --test   tests/poolItem.test.js   tests/poolPublicationRecord.test.js   tests/teacherRosterRepository.test.js   tests/teacherRosterService.test.js   tests/teacherPoolRepository.test.js   tests/teacherPoolPublishingService.test.js   tests/teacherPoolPublishingController.test.js   tests/teacherPoolPublishingUi.test.js   tests/teacherPoolPublishingSecurity.test.js   tests/teacherDeliveryContracts.test.js   tests/appShell.test.js
```

Expected: PASS, 0 failures.

- [ ] **Step 5: Verify branch scope**

Run:

```bash
git status --short
git diff --check
git diff --name-only main...HEAD
```

Expected TD-03 changed surface only:

```text
docs/teacher-delivery-td03-pool-publishing.md
src/services/poolPublicationRecord.js
src/services/teacherPoolRepository.js
src/services/teacherPoolPublishingService.js
src/services/teacherPoolPublishingController.js
src/teacherPoolPublishingUi.js
src/teacherPoolPublishingUi.css
tests/poolPublicationRecord.test.js
tests/teacherPoolRepository.test.js
tests/teacherPoolPublishingService.test.js
tests/teacherPoolPublishingController.test.js
tests/teacherPoolPublishingUi.test.js
tests/support/fakeTeacherPoolDom.js
tests/teacherPoolPublishingSecurity.test.js
```

No `main.js`, appShell, backend, provider, Stage L, Student App or deployment file is allowed in TD-03 without stopping for a new design decision.

- [ ] **Step 6: Run the full repository test suite**

Run:

```bash
npm test
```

Expected: exit 0, 0 failed tests. Record exact total/pass/fail counts from this fresh run.

- [ ] **Step 7: Run production build**

Run:

```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 8: Re-run the security/UI boundary after build**

Run:

```bash
node --test   tests/teacherPoolPublishingSecurity.test.js   tests/teacherPoolPublishingUi.test.js   tests/appShell.test.js
```

Expected: PASS.

- [ ] **Step 9: Create a draft implementation PR**

Recommended branch:

```text
feat/td03-teacher-pool-publishing
```

PR body must contain the exact fresh evidence from Steps 4–8 and explicitly state:

- Pool remains text/detail only;
- SELECTED uses TD-02 stable active student preflight;
- repository acknowledgement gates success;
- revoke is tombstone-only and irreversible in TD-03;
- teacher UI module is explicit-mount only;
- no `main.js` or appShell teacher wiring;
- no Firebase/persistence/auth/provider choice;
- no Student App/SCORE/Stage L/cross-repo change.

- [ ] **Step 10: Verify exact PR-head required checks**

On exact implementation PR head:

- current required CI/test-and-build must succeed;
- Regression Quality / current protected quality workflow must succeed;
- Playwright protected baseline must succeed when triggered;
- SonarQube/SonarCloud check must be reported exactly as observed;
- base drift must be 0 before a merge-readiness claim;
- changed files must remain within the TD-03 list above.

- [ ] **Step 11: Stop before merge**

Report:

- current main SHA;
- branch;
- PR number;
- exact PR head SHA;
- changed files;
- focused/full/build results;
- quality/browser check results;
- base drift;
- explicit confirmation that no production provider/persistence/auth/Student App/SCORE/Stage L/cross-repo write occurred.

Do not merge TD-03 and do not start TD-04 without new explicit human approval.

---

## Plan Self-Review

### Spec coverage

- separate lifecycle record preserving immutable PoolItem: Task 1;
- revoke tombstone / no delete / no unrevoke: Tasks 1–2;
- provider-neutral repository: Task 2;
- unique Pool identity: Task 2;
- deterministic teacher publication history: Task 2;
- ALL symbolic audience: Task 3;
- SELECTED TD-02 active stable-ID preflight: Task 3;
- injected producer ID/time: Task 3;
- exact publish/revoke acknowledgement: Task 3;
- teacher-safe list: Task 3;
- controller and bounded messages: Task 4;
- minimal Havuza Gönder / Geri Çek UI boundary: Task 4;
- no production auto-mount: Tasks 4–5;
- no Firebase/network/browser persistence: Task 5;
- no Student App/Stage L/SCORE dependency: Task 5;
- full verification and exact-head gate: Task 5.

No spec requirement is assigned to an unrelated subsystem.

### Placeholder scan

The plan contains no unresolved implementation marker, unnamed API or future-detail placeholder. Fresh verification values are intentionally obtained during execution and copied from the immediately preceding commands rather than guessed in advance.

### Type consistency

- `PoolPublicationRecord.item` is one exact valid immutable TD-01 `PoolItem`;
- repository lookup keys are exact normalized `poolItemId`;
- repository list returns frozen publication-record arrays;
- publishing service returns acknowledged publication records;
- roster preflight returns exact active `StudentRosterEntry` rows whose `studentId` values become SELECTED recipients;
- controller wraps service results without changing domain identity;
- UI submits stable IDs and never display names as targets.

### Review Focus coverage

1. acknowledgement substitution: Task 3 test;
2. mutable/forged adapter records: Task 3 list/ack tests;
3. ID/time generator inconsistency: Task 3 exact-call/validation tests;
4. SELECTED roster coherence: Task 3 preflight-result test;
5. production UI/provider creep: Task 5 static security test.

## Execution Gate

After this plan is reviewed and approved, implementation starts on a fresh dedicated branch/worktree using TDD.

Recommended implementation branch:

```text
feat/td03-teacher-pool-publishing
```

Implementation must stop at the draft PR / exact-head verification gate. It must not merge TD-03 or begin TD-04 without a new explicit human approval.
