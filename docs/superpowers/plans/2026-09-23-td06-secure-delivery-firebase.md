# TD-06 Firebase Secure Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the provider-neutral TD-06 secure-delivery backend and a Firebase Auth/Firestore adapter that can durably prepare and atomically deliver exact SCORE assignments without changing TD-01–TD-05 semantics or enabling production rollout by default.

**Architecture:** Keep all TD-06 business rules in provider-neutral records/services and put Firebase behind async adapter ports. Teacher and Student App requests enter an isolated Express router with a verified Firebase identity, map to stable SesliTab IDs, then use server-side authorization and atomic store operations. Firestore/Admin initialization is lazy and feature-flagged so existing OMR production behavior remains unchanged until a separately approved pilot activation.

**Tech Stack:** Node.js 24, ECMAScript modules, existing `node:test`, Express 4, Firebase Admin SDK 14.4.0, Firebase JS SDK 12.19.0 for emulator clients only, `@firebase/rules-unit-testing` 5.0.2, Firebase CLI 15.30.2, Firestore/Auth emulators.

**Spec:** `docs/superpowers/specs/2026-09-23-td06-secure-delivery-firebase-design.md`

## Global Constraints

- First-year provider: Firebase Authentication + Cloud Firestore.
- Firebase is an adapter; stable SesliTab `teacherId` / `studentId` remain domain authority.
- `READY_EXACT_REVISION != DURABLY_PREPARED != DELIVERED_TO_STUDENT`.
- `PrivateAssignment != AssignmentLifecycleRecord != DeliveryRecord`.
- Client-supplied `teacherId` and `studentId` never grant authority.
- One PrivateAssignment remains bound to one exact student and one exact SCORE source revision.
- Multi-student prepare/deliver requests are all-or-nothing; application-level maximum is 40 assignments.
- Revoke is one-way; audit records are retained.
- No Student App write, production Firebase project creation, Auth-provider activation, production Security Rules/index deployment, credential addition, billing, deployment, pilot activation or merge without its own explicit human approval.
- Existing OMR Gateway storage/job/provider state must remain separate from Secure Delivery.
- Feature flags default closed: Secure Delivery off, writes off, Student reads off.
- No raw Firebase token, UID, service-account material, provider diagnostic, revision/evidence ID, recipient list, stack trace or Firestore path in normal Student App responses.
- TD-07 CHORD_BOARD remains out of scope.

## Review Focus

1. **Mutable JSON snapshots crossing HTTP:** wire codecs must reject unknown/malformed fields and rebuild strict immutable TD-02–TD-05 records before any authority decision.
2. **Exact replay versus conflicting replay:** same assignment/package fingerprint must be idempotent; same assignment ID with a different student, revision, package recipient or fingerprint must fail closed.
3. **One bad item inside a 40-item request:** prepare and delivery batches must produce zero new committed rows when any item fails preflight or the atomic store operation fails.
4. **Provider/Admin success with wrong acknowledgement:** a Firestore write is not success until exact server-side reread matches assignment, package, student, teacher, lifecycle and timestamps.
5. **Revocation/read race:** after revoke commit completes, a fresh authenticated Student read must never return the revoked delivery while history/immutable payload remains available to server audit.

---

## File Structure Locked by This Plan

### Shared provider-neutral contracts

- `src/services/teacherDeliveryWireCodec.js` — strict rehydration of TD-02–TD-05 JSON snapshots into existing immutable contracts.
- `src/services/secureDeliveryIdentity.js` — provider-neutral identity mapping/principal records.
- `src/services/teacherStudentGrant.js` — immutable teacher/student authorization grant.
- `src/services/studentPracticePackageV1.js` — local compatibility contract for the already-defined Student App PracticePackage v1 and private SCORE assembly.
- `src/services/preparedAssignmentRecord.js` — immutable durable-preparation acknowledgement model.
- `src/services/deliveryRecord.js` — immutable delivered/revoked record.

### Secure Delivery backend

- `backend/delivery/authorization/secureDeliveryAuthorization.js` — provider-subject → stable principal and grant policy.
- `backend/delivery/integrity/packageFingerprint.js` — canonical SHA-256 package fingerprint.
- `backend/delivery/repositories/secureDeliveryStore.js` — async store port assertion.
- `backend/delivery/repositories/inMemorySecureDeliveryStore.js` — deterministic transactional reference adapter.
- `backend/delivery/services/preparedAssignmentService.js` — authenticated durable prepared-assignment batch.
- `backend/delivery/services/teacherDeliveryService.js` — atomic delivery plus teacher lifecycle actions/revoke.
- `backend/delivery/services/studentDeliveryReadService.js` — sanitized student list/detail.
- `backend/delivery/http/bearerToken.js` — bounded Authorization header parser.
- `backend/delivery/http/errorResponse.js` — bounded public error mapping.
- `backend/delivery/http/router.js` — isolated `/api/secure-delivery/v1` router.
- `backend/delivery/config.js` — closed-by-default feature flags.
- `backend/delivery/firebase/firebaseAdmin.js` — lazy Admin initialization.
- `backend/delivery/firebase/firebaseTokenVerifier.js` — Firebase ID-token verification adapter.
- `backend/delivery/firebase/firestoreSecureDeliveryStore.js` — Firestore store implementation and atomic transactions.
- `backend/delivery/composition.js` — fake/emulator/production composition without OMR coupling.

### Firebase test/deploy descriptors

- `firebase.json` — local emulator configuration only until production deployment is separately approved.
- `firestore.rules` — first-pilot deny-direct-client-access rules.
- `firestore.indexes.json` — versioned index definitions; production deployment remains a human gate.

### Client transport, not production login UI

- `src/services/secureDeliveryApiClient.js` — authenticated HTTP transport that obtains an injected ID token and never stores credentials.

### Tests

- `tests/teacherDeliveryWireCodec.test.js`
- `tests/secureDeliveryContracts.test.js`
- `tests/studentPracticePackageV1.test.js`
- `tests/secureDeliveryAuthorization.test.js`
- `tests/inMemorySecureDeliveryStore.test.js`
- `tests/preparedAssignmentService.test.js`
- `tests/teacherSecureDeliveryService.test.js`
- `tests/studentDeliveryReadService.test.js`
- `tests/secureDeliveryHttp.test.js`
- `tests/secureDeliveryApiClient.test.js`
- `tests/secureDeliveryFirebaseEmulator.test.js`
- `tests/secureDeliveryFirestoreRules.test.js`
- `tests/secureDeliverySecurity.test.js`

---

### Task 1: Wire-safe TD-02–TD-05 rehydration and TD-06 immutable records

**Files:**
- Create: `src/services/teacherDeliveryWireCodec.js`
- Create: `src/services/secureDeliveryIdentity.js`
- Create: `src/services/teacherStudentGrant.js`
- Create: `src/services/preparedAssignmentRecord.js`
- Create: `src/services/deliveryRecord.js`
- Test: `tests/teacherDeliveryWireCodec.test.js`
- Test: `tests/secureDeliveryContracts.test.js`

**Interfaces:**
- Consumes existing TD-02–TD-05 schema constants/validators from `studentRosterEntry.js`, `poolItem.js`, `poolPublicationRecord.js`, `privateAssignment.js`, `scoreAssignmentSourceBinding.js`, and `assignmentLifecycleRecord.js`.
- Produces:
  - `restoreStudentRosterEntryV1(raw)`
  - `restorePoolPublicationRecordV1(raw)`
  - `restorePrivateAssignmentV1(raw)`
  - `restoreAssignmentLifecycleRecordV1(raw, assignment)`
  - `createSecureDeliveryIdentityMapping(input)`
  - `createSecureDeliveryPrincipal(mapping)`
  - `createTeacherStudentGrant(input)`
  - `createPreparedAssignmentRecord(input)`
  - `createDeliveryRecord(input)`
  - `revokeDeliveryRecord(record, revokedAt)`

- [ ] **Step 1: Write failing wire-codec tests**

Use mutable JSON-like input and require exact immutable reconstruction:

```js
test('TD-06 restores mutable PrivateAssignment JSON into the exact immutable v1 shape', () => {
  const raw = structuredClone(validPrivateAssignment())
  const restored = restorePrivateAssignmentV1(raw)

  assert.equal(Object.isFrozen(restored), true)
  assert.equal(Object.isFrozen(restored.sourceRef), true)
  assert.equal(restored.assignmentId, raw.assignmentId)
  assert.equal(restored.studentId, raw.studentId)
  assert.equal(restored.sourceRef.revisionId, raw.sourceRef.revisionId)
})

test('TD-06 rejects unknown wire fields and cross-student source substitution', () => {
  const extra = { ...structuredClone(validPrivateAssignment()), firebaseUid: 'uid-a' }
  assert.throws(() => restorePrivateAssignmentV1(extra), /field|unsupported/i)

  const mismatch = structuredClone(validPrivateAssignment())
  mismatch.sourceRef.studentId = 'student-b'
  assert.throws(() => restorePrivateAssignmentV1(mismatch), /student/i)
})
```

Also cover roster, Pool publication, lifecycle current state, mutable clone rejection after restoration, control characters, unsupported schema versions, duplicate recipient IDs, and revoked timestamps.

- [ ] **Step 2: Run the focused codec tests and confirm RED**

Run:

```bash
node --test tests/teacherDeliveryWireCodec.test.js
```

Expected: FAIL because the codec module/functions do not exist.

- [ ] **Step 3: Implement strict codecs without weakening existing constructors**

Use `assertStrictInputObject` and existing normalization helpers. For raw SCORE source binding, validate every existing v1 field, freeze the exact restored record, then require `isScoreAssignmentSourceBinding(restored) === true`. Restore PrivateAssignment by passing the restored sourceRef through the existing `createPrivateAssignment` constructor; never accept wire-supplied lifecycle state/revokedAt inside PrivateAssignment.

For lifecycle restoration, build exactly:

```js
const candidate = Object.freeze({
  schemaVersion: ASSIGNMENT_LIFECYCLE_SCHEMA_VERSION,
  assignment,
  state: raw.state,
  stateChangedAt: normalizeRequiredTimestamp(raw.stateChangedAt, 'stateChangedAt'),
  revokedAt: raw.revokedAt === null
    ? null
    : normalizeRequiredTimestamp(raw.revokedAt, 'revokedAt'),
})
if (!isAssignmentLifecycleRecord(candidate)) {
  throw new TypeError('invalid AssignmentLifecycleRecord wire snapshot.')
}
return candidate
```

- [ ] **Step 4: Write failing TD-06 record tests**

Pin the provider-neutral authority records:

```js
test('identity mapping resolves stable domain identity but principal drops provider subject', () => {
  const mapping = createSecureDeliveryIdentityMapping({
    providerSubject: 'firebase-uid-a',
    role: 'STUDENT',
    teacherId: null,
    studentId: 'student-a',
    active: true,
    createdAt: '2026-09-23T08:00:00Z',
    disabledAt: null,
  })
  const principal = createSecureDeliveryPrincipal(mapping)

  assert.deepEqual(principal, {
    role: 'STUDENT',
    teacherId: null,
    studentId: 'student-a',
  })
  assert.equal('providerSubject' in principal, false)
})

test('DeliveryRecord v1 uses assignmentId as deliveryId and revoke is one-way', () => {
  const row = createDeliveryRecord({
    assignmentId: 'assignment-a',
    packageId: 'package-a',
    teacherId: 'teacher-a',
    studentId: 'student-a',
    deliveredAt: '2026-09-23T08:01:00Z',
  })
  assert.equal(row.deliveryId, 'assignment-a')
  assert.equal(row.revokedAt, null)

  const revoked = revokeDeliveryRecord(row, '2026-09-23T08:02:00Z')
  assert.equal(revoked.revokedAt, '2026-09-23T08:02:00Z')
  assert.equal(revokeDeliveryRecord(revoked, '2026-09-23T09:00:00Z'), revoked)
})
```

- [ ] **Step 5: Run record tests and confirm RED**

Run:

```bash
node --test tests/secureDeliveryContracts.test.js
```

Expected: FAIL because the new records do not exist.

- [ ] **Step 6: Implement identity/grant/prepared/delivery records**

Use schema version `1` for TD-06 internal records. Enforce exact field sets, normalized IDs/timestamps, one role, exactly one matching stable ID per role, active/disabled consistency, and frozen records. `PreparedAssignmentRecord` contains:

```text
schemaVersion
teacherId
assignment
packageId
packageFingerprint
preparedAt
```

It must keep the exact restored immutable `assignment` object.

- [ ] **Step 7: Run Task 1 tests**

Run:

```bash
node --test tests/teacherDeliveryWireCodec.test.js tests/secureDeliveryContracts.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/services/teacherDeliveryWireCodec.js src/services/secureDeliveryIdentity.js src/services/teacherStudentGrant.js src/services/preparedAssignmentRecord.js src/services/deliveryRecord.js tests/teacherDeliveryWireCodec.test.js tests/secureDeliveryContracts.test.js
git commit -m "feat: add secure delivery wire contracts"
```

---

### Task 2: Student PracticePackage v1 compatibility and deterministic integrity

**Files:**
- Create: `src/services/studentPracticePackageV1.js`
- Create: `backend/delivery/integrity/packageFingerprint.js`
- Test: `tests/studentPracticePackageV1.test.js`

**Interfaces:**
- Produces:
  - `STUDENT_PRACTICE_PACKAGE_SCHEMA_VERSION = '1.0.0'`
  - `validateStudentPracticePackageV1(value) -> { ok, errors }`
  - `createStudentPrivatePracticePackageV1(input) -> frozen package`
  - `canonicalPackageJson(value) -> string`
  - `fingerprintPracticePackage(value) -> lowercase 64-char SHA-256 hex`

- [ ] **Step 1: Write failing compatibility tests using the current Student App contract**

```js
test('private SCORE package requires exact recipient/revision/MusicXML/canonical events', () => {
  const pkg = createStudentPrivatePracticePackageV1({
    packageId: 'package-a',
    workId: 'work-a',
    title: 'Etüt',
    revisionId: 'revision-a',
    approvedAt: '2026-09-23T08:00:00Z',
    studentId: 'student-a',
    musicXml: '<score-partwise version="4.0"></score-partwise>',
    canonicalEvents: [],
    practice: { tempoBpm: 80 },
  })

  assert.equal(validateStudentPracticePackageV1(pkg).ok, true)
  assert.equal(pkg.publication.scope, 'student_private')
  assert.equal(pkg.publication.recipientStudentId, 'student-a')
  assert.equal(pkg.approvedRevision.state, 'teacher_approved')
})

test('teacher-only and OMR top-level fields are rejected', () => {
  const pkg = structuredClone(validPackage())
  pkg.omr = { provider: 'audiveris' }
  assert.match(
    validateStudentPracticePackageV1(pkg).errors.join('\n'),
    /unsupported top-level field: omr/,
  )
})
```

Mirror the already-read Student App v1 allowed top-level keys exactly: `schemaVersion, packageId, workId, title, approvedRevision, publication, content, practice`.

- [ ] **Step 2: Run tests and confirm RED**

```bash
node --test tests/studentPracticePackageV1.test.js
```

- [ ] **Step 3: Implement the local compatibility contract and assembler**

Require:
- `approvedRevision.state === 'teacher_approved'`;
- `publication.scope === 'student_private'`;
- private `recipientStudentId`;
- `content.score.format === 'musicxml'`;
- non-empty MusicXML string;
- `content.canonicalEvents` array;
- no unsupported top-level fields.

Freeze nested objects/arrays created by the assembler so repository acknowledgements can be compared deterministically.

- [ ] **Step 4: Add deterministic fingerprint tests**

```js
test('fingerprint is stable across object insertion order and changes with package content', () => {
  const a = validPackage()
  const b = reorderObjectKeysDeep(a)
  assert.equal(fingerprintPracticePackage(a), fingerprintPracticePackage(b))

  const changed = structuredClone(a)
  changed.content.score.data += '<!-- changed -->'
  assert.notEqual(fingerprintPracticePackage(a), fingerprintPracticePackage(changed))
})
```

- [ ] **Step 5: Implement canonical JSON + SHA-256**

Canonical JSON rules:
- recursively sort object keys lexicographically;
- preserve array order;
- reject `undefined`, functions, symbols, non-finite numbers and cyclic structures;
- hash UTF-8 bytes with `node:crypto.createHash('sha256')`.

- [ ] **Step 6: Run Task 2 tests**

```bash
node --test tests/studentPracticePackageV1.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/studentPracticePackageV1.js backend/delivery/integrity/packageFingerprint.js tests/studentPracticePackageV1.test.js
git commit -m "feat: add student practice package contract"
```

---

### Task 3: Provider-neutral authorization and transactional reference store

**Files:**
- Create: `backend/delivery/authorization/secureDeliveryAuthorization.js`
- Create: `backend/delivery/repositories/secureDeliveryStore.js`
- Create: `backend/delivery/repositories/inMemorySecureDeliveryStore.js`
- Test: `tests/secureDeliveryAuthorization.test.js`
- Test: `tests/inMemorySecureDeliveryStore.test.js`

**Interfaces:**
- Store port methods are async:
  - `getIdentityMapping(providerSubject)`
  - `getTeacherStudentGrant(teacherId, studentId)`
  - `getPreparedAssignment(assignmentId)`
  - `getPracticePackage(packageId)`
  - `getLifecycle(assignmentId)`
  - `getDelivery(assignmentId)`
  - `listDeliveriesForTeacher(teacherId)`
  - `listActiveDeliveriesForStudent(studentId)`
  - `commitPreparedBatch(rows)`
  - `commitDeliveryBatch(rows)`
  - `commitLifecycleMutation(input)`
  - `putRosterEntriesForProvisioning(entries)`
  - `putPoolPublicationsForProvisioning(records)`
- Authorization:
  - `createSecureDeliveryAuthorization({ store })`
  - `resolvePrincipal(providerSubject, expectedRole)`
  - `requireTeacherStudent(teacherId, studentId)`

- [ ] **Step 1: Write failing authorization tests**

Cover missing mapping, disabled mapping, wrong role, active grant, revoked/missing grant, and forged display/email irrelevance:

```js
await assert.rejects(
  () => auth.resolvePrincipal('uid-student', 'TEACHER'),
  /wrong-role/i,
)
await assert.rejects(
  () => auth.requireTeacherStudent('teacher-a', 'student-b'),
  /grant/i,
)
```

- [ ] **Step 2: Implement minimal authorization service and run tests**

```bash
node --test tests/secureDeliveryAuthorization.test.js
```

Expected: PASS.

- [ ] **Step 3: Write failing in-memory atomicity tests**

The store must stage mutations in shadow Maps and publish them only after the whole batch validates.

```js
test('commitPreparedBatch is all-or-nothing', async () => {
  const store = createInMemorySecureDeliveryStore()
  await assert.rejects(() => store.commitPreparedBatch([
    validPreparedRow('assignment-a'),
    conflictingPreparedRow('assignment-a'),
  ]), /conflict/i)

  assert.equal(await store.getPreparedAssignment('assignment-a'), null)
})

test('exact prepared replay is idempotent but conflicting fingerprint fails', async () => {
  const store = createInMemorySecureDeliveryStore()
  const row = validPreparedRow('assignment-a')
  const first = await store.commitPreparedBatch([row])
  const second = await store.commitPreparedBatch([row])
  assert.equal(second[0], first[0])

  await assert.rejects(
    () => store.commitPreparedBatch([{ ...row, packageFingerprint: 'f'.repeat(64) }]),
    /conflict/i,
  )
})
```

- [ ] **Step 4: Implement the async reference store**

Use frozen snapshots on reads. Validate all input before publishing any Map changes. Exact idempotent replay returns the existing stored object and does not create new timestamps/history.

`commitLifecycleMutation` input:

```text
teacherId
assignment
currentLifecycle
nextLifecycle
deliveryBefore
deliveryAfter
historyEventId
```

It atomically updates current lifecycle, appends history, and updates delivery only when revoke requires it.

- [ ] **Step 5: Run Task 3 tests**

```bash
node --test tests/secureDeliveryAuthorization.test.js tests/inMemorySecureDeliveryStore.test.js
```

- [ ] **Step 6: Commit**

```bash
git add backend/delivery/authorization backend/delivery/repositories tests/secureDeliveryAuthorization.test.js tests/inMemorySecureDeliveryStore.test.js
git commit -m "feat: add secure delivery authorization store"
```

---

### Task 4: Authenticated durable prepared-assignment handoff

**Files:**
- Create: `backend/delivery/services/preparedAssignmentService.js`
- Test: `tests/preparedAssignmentService.test.js`

**Interfaces:**
- Consumes `authorization`, async `store`, `fingerprintPracticePackage`, `now`.
- Produces:
  - `createPreparedAssignmentService(deps)`
  - `prepareBatch({ providerSubject, items }) -> Promise<frozen PreparedAssignmentRecord[]>`
- Each item is wire JSON:
  - `assignment`: PrivateAssignment v1 snapshot;
  - `package`: Student PracticePackage v1 snapshot.

- [ ] **Step 1: Write failing happy-path and exact-cross-check tests**

```js
test('authorized teacher durably prepares exact assignment/package without delivering', async () => {
  const result = await service.prepareBatch({
    providerSubject: 'uid-teacher',
    items: [{ assignment: rawAssignmentA(), package: rawPackageA() }],
  })

  assert.equal(result.length, 1)
  assert.equal(result[0].assignment.assignmentId, 'assignment-a')
  assert.equal(result[0].packageId, 'package-a')
  assert.equal(await store.getDelivery('assignment-a'), null)
})
```

Also require failures for:
- package recipient ≠ assignment student;
- package revisionId ≠ sourceRef revisionId;
- package not `teacher_approved`;
- teacher lacks grant;
- mutable extra/unknown wire fields;
- assignment/sourceRef student mismatch;
- 41-item batch;
- duplicate assignment IDs with different package fingerprints.

- [ ] **Step 2: Run and confirm RED**

```bash
node --test tests/preparedAssignmentService.test.js
```

- [ ] **Step 3: Implement complete preflight before any store write**

Order:
1. require non-empty array with max 40;
2. resolve TEACHER principal from providerSubject;
3. restore every assignment via wire codec;
4. validate every package;
5. compare student/revision exactly;
6. require every grant;
7. fingerprint every package;
8. detect duplicate IDs/conflicts inside request;
9. call one `store.commitPreparedBatch(rows)`;
10. exact reread each assignment/package;
11. compare teacherId, exact assignment fields, packageId/fingerprint, preparedAt;
12. return success only after reread.

Do not call `now()` for an exact idempotent replay if the store already exposes an exact prepared row during preflight.

- [ ] **Step 4: Add acknowledgement-substitution tests**

Inject a store whose commit succeeds but whose reread substitutes student/revision/package fingerprint. Expect `acknowledgement-mismatch` and no success result.

- [ ] **Step 5: Run Task 4 tests**

```bash
node --test tests/preparedAssignmentService.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/delivery/services/preparedAssignmentService.js tests/preparedAssignmentService.test.js
git commit -m "feat: add durable prepared assignment handoff"
```

---

### Task 5: Atomic delivery and teacher-owned lifecycle/revoke

**Files:**
- Create: `backend/delivery/services/teacherDeliveryService.js`
- Test: `tests/teacherSecureDeliveryService.test.js`

**Interfaces:**
- Produces:
  - `createTeacherSecureDeliveryService({ authorization, store, now, createHistoryEventId })`
  - `deliverBatch({ providerSubject, assignmentIds })`
  - `listDeliveries({ providerSubject })`
  - `applyAssignmentAction({ providerSubject, assignmentId, action })`
- Allowed actions exactly: `COMPLETE | REPERTOIRE | REVOKE`.

- [ ] **Step 1: Write failing delivery tests**

```js
test('delivery accepts only durably prepared exact assignments and is idempotent', async () => {
  const first = await service.deliverBatch({
    providerSubject: 'uid-teacher',
    assignmentIds: ['assignment-a'],
  })
  const second = await service.deliverBatch({
    providerSubject: 'uid-teacher',
    assignmentIds: ['assignment-a'],
  })

  assert.equal(first[0], second[0])
  assert.equal(first[0].deliveryId, 'assignment-a')
})

test('one unauthorized or revoked item rolls back a mixed batch', async () => {
  await assert.rejects(
    () => service.deliverBatch({
      providerSubject: 'uid-teacher',
      assignmentIds: ['assignment-a', 'assignment-b'],
    }),
    /grant|revoked/i,
  )
  assert.equal(await store.getDelivery('assignment-a'), null)
  assert.equal(await store.getDelivery('assignment-b'), null)
})
```

Also test: missing prepared assignment, 41 items, duplicate target normalization, conflicting existing delivery, reordered/substituted acknowledgement, teacher mismatch, wrong package/student.

- [ ] **Step 2: Implement delivery preflight + atomic commit**

A delivery row uses the existing prepared record and exact package. Missing lifecycle overlay means effective ACTIVE. Any `revokedAt !== null` blocks new delivery. State may be ACTIVE, COMPLETED or REPERTOIRE; revocation, not state name, controls visibility/delivery eligibility under the approved spec.

One store call commits all missing delivery rows. Exact existing active rows are idempotent.

- [ ] **Step 3: Write failing lifecycle/revoke tests**

```js
test('REVOKE atomically revokes lifecycle and existing delivery', async () => {
  const revoked = await service.applyAssignmentAction({
    providerSubject: 'uid-teacher',
    assignmentId: 'assignment-a',
    action: 'REVOKE',
  })

  assert.notEqual(revoked.lifecycle.revokedAt, null)
  assert.equal(revoked.delivery.revokedAt, revoked.lifecycle.revokedAt)
})

test('revoked assignment cannot transition and repeated revoke preserves first timestamp', async () => {
  const first = await service.applyAssignmentAction({ providerSubject: 'uid-teacher', assignmentId: 'assignment-a', action: 'REVOKE' })
  const second = await service.applyAssignmentAction({ providerSubject: 'uid-teacher', assignmentId: 'assignment-a', action: 'REVOKE' })
  assert.equal(second.lifecycle.revokedAt, first.lifecycle.revokedAt)
  await assert.rejects(
    () => service.applyAssignmentAction({ providerSubject: 'uid-teacher', assignmentId: 'assignment-a', action: 'COMPLETE' }),
    /revoked/i,
  )
})
```

- [ ] **Step 4: Implement actions by reusing TD-05 transition functions**

Use `transitionAssignmentLifecycleRecord` and `revokeAssignmentLifecycleRecord`. Never create an alternative lifecycle policy. For REVOKE, create `deliveryAfter = revokeDeliveryRecord(deliveryBefore, revokedAt)` when a delivery exists, then pass lifecycle + delivery updates to one `commitLifecycleMutation`.

- [ ] **Step 5: Add fresh-reread acknowledgement tests**

After commit, reread lifecycle and delivery and verify:
- exact assignment ID/student/source binding;
- expected state;
- expected stateChangedAt;
- exact revokedAt;
- exact delivery teacher/student/package;
- no resurrected delivery.

- [ ] **Step 6: Run Task 5 tests**

```bash
node --test tests/teacherSecureDeliveryService.test.js
```

- [ ] **Step 7: Commit**

```bash
git add backend/delivery/services/teacherDeliveryService.js tests/teacherSecureDeliveryService.test.js
git commit -m "feat: add atomic teacher delivery lifecycle"
```

---

### Task 6: Student-safe authenticated read model

**Files:**
- Create: `backend/delivery/services/studentDeliveryReadService.js`
- Test: `tests/studentDeliveryReadService.test.js`

**Interfaces:**
- Produces:
  - `createStudentDeliveryReadService({ authorization, store })`
  - `listAssignments({ providerSubject })`
  - `getAssignment({ providerSubject, deliveryId })`

- [ ] **Step 1: Write failing isolation tests**

```js
test('Student A cannot read Student B even with the exact deliveryId', async () => {
  await assert.rejects(
    () => studentA.getAssignment({
      providerSubject: 'uid-student-a',
      deliveryId: 'assignment-b',
    }),
    /not-found|forbidden/i,
  )
})

test('revoked delivery disappears from new online reads', async () => {
  const before = await studentA.listAssignments({ providerSubject: 'uid-student-a' })
  assert.equal(before.length, 1)

  await revokeAsTeacher()
  const after = await studentA.listAssignments({ providerSubject: 'uid-student-a' })
  assert.deepEqual(after, [])
})
```

- [ ] **Step 2: Add sanitization test**

Recursively inspect returned JSON and reject forbidden key/name patterns:

```js
const serialized = JSON.stringify(result)
for (const forbidden of [
  'firebaseUid', 'providerSubject', 'authorizationId',
  'qualityEvidenceId', 'revalidationEvidenceId',
  'readinessRoute', 'package12Status', 'firestorePath',
  'serviceAccount', 'token',
]) {
  assert.equal(serialized.includes(forbidden), false, forbidden)
}
```

The student's own `recipientStudentId` inside validated PracticePackage v1 is allowed; another student's ID or a recipient list is not.

- [ ] **Step 3: Implement list/detail read service**

Always derive student identity from `resolvePrincipal(providerSubject, 'STUDENT')`. List only the store's active rows for that stable student. Detail must return the same bounded shape and use a non-enumerating not-found/forbidden result for foreign IDs.

- [ ] **Step 4: Add review-focus race test**

Simulate a read queued before revoke but resolved after the store's revoke commit; force the service to validate current delivery state at response assembly so the fresh post-commit response is empty/denied.

- [ ] **Step 5: Run Task 6 tests**

```bash
node --test tests/studentDeliveryReadService.test.js
```

- [ ] **Step 6: Commit**

```bash
git add backend/delivery/services/studentDeliveryReadService.js tests/studentDeliveryReadService.test.js
git commit -m "feat: add student secure delivery reads"
```

---

### Task 7: Secure Delivery HTTP boundary and closed-by-default feature flags

**Files:**
- Create: `backend/delivery/config.js`
- Create: `backend/delivery/http/bearerToken.js`
- Create: `backend/delivery/http/errorResponse.js`
- Create: `backend/delivery/http/router.js`
- Test: `tests/secureDeliveryHttp.test.js`
- Test: `tests/secureDeliverySecurity.test.js`
- Modify later in this task only after router tests pass: `backend/server.js`

**Interfaces:**
- `parseBearerToken(header) -> token`
- `createSecureDeliveryRouter({ tokenVerifier, preparedService, teacherService, studentService, config })`
- token verifier: `verifyIdToken(token) -> Promise<{ uid: string }>`
- closed defaults:
  - `SECURE_DELIVERY_ENABLED=false`
  - `SECURE_DELIVERY_WRITES_ENABLED=false`
  - `STUDENT_DELIVERY_READS_ENABLED=false`

- [ ] **Step 1: Write failing bearer/error tests**

Require:
- one Bearer scheme only;
- non-empty bounded token (max 8192 chars);
- no token echoed in errors;
- 401 for missing/invalid auth;
- 403/404 bounded authority errors;
- 503 when feature/read/write flag is closed.

- [ ] **Step 2: Implement parser/config/error mapper and run focused tests**

```bash
node --test tests/secureDeliveryHttp.test.js
```

- [ ] **Step 3: Write route tests with fake verifier and in-memory services**

Pin endpoints:
- `POST /api/secure-delivery/v1/teacher/prepared-assignments`
- `POST /api/secure-delivery/v1/teacher/deliveries`
- `GET /api/secure-delivery/v1/teacher/deliveries`
- `POST /api/secure-delivery/v1/teacher/assignments/:assignmentId/actions`
- `GET /api/secure-delivery/v1/student/assignments`
- `GET /api/secure-delivery/v1/student/assignments/:deliveryId`

Explicitly test that request-body `teacherId`/`studentId` does not change authority.

- [ ] **Step 4: Implement router with injected dependencies**

Verify token once per request, pass only `decoded.uid` as `providerSubject` into services, and discard the raw token. Never log Authorization headers.

- [ ] **Step 5: Add security source tests**

Read source files and assert no:
- token persistence;
- localStorage/sessionStorage;
- direct Student App repository write;
- OMR job manager/storage import from `backend/delivery/**`;
- service-account literal;
- production Firebase project ID literal.

Also assert `backend/server.js` can start with all Secure Delivery flags false and no Firebase environment variables.

- [ ] **Step 6: Mount the isolated router in `backend/server.js` without initializing Firebase when disabled**

Use a composition factory that returns a disabled router/no-op when `SECURE_DELIVERY_ENABLED !== true`. Existing OMR health/jobs/discovery routes and startup order remain unchanged.

- [ ] **Step 7: Run HTTP/security + existing API boundary tests**

```bash
node --test tests/secureDeliveryHttp.test.js tests/secureDeliverySecurity.test.js tests/apiBoundarySecurity.test.js
```

- [ ] **Step 8: Commit**

```bash
git add backend/delivery/config.js backend/delivery/http backend/server.js tests/secureDeliveryHttp.test.js tests/secureDeliverySecurity.test.js
git commit -m "feat: add secure delivery HTTP boundary"
```

---

## HUMAN GATE A — Firebase local toolchain dependency approval

Stop before Task 8.

Task 8 changes `package.json` / `package-lock.json` and adds Firebase emulator tooling. It does **not** create a Firebase cloud project, use credentials, deploy Security Rules/indexes, enable billing or change production environment variables.

Required explicit approval before execution:
- add `firebase-admin@14.4.0`;
- add dev dependencies `firebase@12.19.0`, `@firebase/rules-unit-testing@5.0.2`, `firebase-tools@15.30.2`;
- add emulator-only config/rules/index descriptor files.

---

### Task 8: Firebase emulator toolchain and deny-direct-client rules

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `firebase.json`
- Create: `firestore.rules`
- Create: `firestore.indexes.json`
- Test: `tests/secureDeliveryFirestoreRules.test.js`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Adds script:
  - `test:td06:emulator`
- No production Firebase project identifier is committed.

- [ ] **Step 1: Install exact reviewed versions**

Run:

```bash
npm install --save-exact firebase-admin@14.4.0
npm install --save-dev --save-exact firebase@12.19.0 @firebase/rules-unit-testing@5.0.2 firebase-tools@15.30.2
```

- [ ] **Step 2: Add emulator configuration**

`firebase.json`:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "ui": { "enabled": false }
  }
}
```

Use demo project ID only in the npm test script: `demo-seslitab-td06`.

- [ ] **Step 3: Add first-pilot Firestore Rules**

Because all private pilot access goes through the trusted Express API/Admin SDK, direct client Firestore access is denied:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

This is intentionally stricter than a client-RLS design.

- [ ] **Step 4: Add index descriptor without deploying it**

Version indexes required by planned Admin queries:
- `deliveries`: `studentId ASC, revokedAt ASC`;
- `deliveries`: `teacherId ASC, deliveredAt DESC`.

Production index deployment remains a later human gate.

- [ ] **Step 5: Write rules tests**

Using `@firebase/rules-unit-testing`, prove unauthenticated, STUDENT-like and TEACHER-like direct Firestore clients cannot read/write `identityMappings`, `teacherStudentGrants`, `privateAssignments`, `assignmentLifecycle`, `practicePackages`, or `deliveries`.

- [ ] **Step 6: Add emulator script**

```json
"test:td06:emulator": "firebase emulators:exec --project demo-seslitab-td06 --only auth,firestore \"node --test tests/secureDeliveryFirestoreRules.test.js tests/secureDeliveryFirebaseEmulator.test.js\""
```

- [ ] **Step 7: Add CI local-emulator verification**

In CI, set up Java 21 before the emulator test and run `npm run test:td06:emulator`. Do not add cloud credentials/secrets.

- [ ] **Step 8: Run rules tests**

```bash
npm run test:td06:emulator
```

Expected: direct client rules tests PASS; Firestore adapter test may still be RED until Task 9.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json firebase.json firestore.rules firestore.indexes.json tests/secureDeliveryFirestoreRules.test.js .github/workflows/ci.yml
git commit -m "test: add TD-06 Firebase emulator boundary"
```

---

### Task 9: Firebase ID-token adapter and Firestore transactional store

**Files:**
- Create: `backend/delivery/firebase/firebaseAdmin.js`
- Create: `backend/delivery/firebase/firebaseTokenVerifier.js`
- Create: `backend/delivery/firebase/firestoreSecureDeliveryStore.js`
- Create: `tests/secureDeliveryFirebaseEmulator.test.js`

**Interfaces:**
- `createFirebaseTokenVerifier({ auth })` implements `verifyIdToken(token)`.
- `createFirestoreSecureDeliveryStore({ firestore })` implements the Task 3 async store port.
- Firebase Admin initialization is lazy and accepts injected app/auth/firestore for tests.

- [ ] **Step 1: Write failing token-verifier unit tests**

Use fake Auth object; prove raw token is only passed to `auth.verifyIdToken(token, true)` and returned public result is bounded to `{ uid }`.

- [ ] **Step 2: Implement lazy Admin adapter**

Do not call `initializeApp()` at import time. Export a factory that initializes only when Secure Delivery composition is enabled and required configuration is present.

In emulator mode use `projectId: 'demo-seslitab-td06'` and emulator host variables; no credential object.

- [ ] **Step 3: Write failing Firestore emulator tests for prepared atomicity**

Seed identity mapping/grant through Admin context. Then test:
- two-item prepare succeeds atomically;
- one conflict causes zero new documents;
- exact replay returns existing durable data;
- conflicting package fingerprint fails;
- package/assignment cross-links reread exactly.

- [ ] **Step 4: Implement Firestore prepared transaction**

Use `firestore.runTransaction(async tx => { ... })`. Read all potentially conflicting docs before writes. For each new row write:
- `privateAssignments/{assignmentId}` wrapper with teacherId, packageId, packageFingerprint, preparedAt and serialized immutable assignment;
- `practicePackages/{packageId}` immutable package.

Reject a packageId already bound to different content.

- [ ] **Step 5: Write failing delivery batch tests**

For up to 40 prepared assignments:
- exact active replay idempotent;
- one missing/revoked/foreign row rejects whole transaction;
- no silent splitting;
- exact delivery reread.

- [ ] **Step 6: Implement Firestore delivery transaction**

Write `deliveries/{assignmentId}` only for missing exact deliveries. Use transaction reads to validate prepared rows/lifecycle and existing delivery conflicts.

- [ ] **Step 7: Write/implement lifecycle mutation tests**

Persist:
- current `assignmentLifecycle/{assignmentId}`;
- append-only `assignmentLifecycle/{assignmentId}/history/{eventId}`;
- revoke delivery in the same transaction when present.

Repeated revoke must not append a second history event or change the original revoke timestamp.

- [ ] **Step 8: Add roster/Pool persistence round-trip coverage**

Implement provider-adapter methods used for controlled provisioning/shadow state:
- roster entries stored by stable studentId;
- PoolItem + publication overlay preserved;
- SELECTED recipients stored as normalized server-private recipient documents;
- ALL creates zero recipient documents.

No Student Pool API is activated.

- [ ] **Step 9: Run emulator suite**

```bash
npm run test:td06:emulator
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/delivery/firebase tests/secureDeliveryFirebaseEmulator.test.js
git commit -m "feat: add Firebase secure delivery adapter"
```

---

### Task 10: Composition, shadow-safe transport and no-production-default wiring

**Files:**
- Create: `backend/delivery/composition.js`
- Create: `src/services/secureDeliveryApiClient.js`
- Test: `tests/secureDeliveryApiClient.test.js`
- Modify: `tests/secureDeliverySecurity.test.js`
- Modify: `docs/teacher-delivery-td06-secure-delivery.md` (create if absent)

**Interfaces:**
- `createSecureDeliveryComposition({ env, firebaseFactories, now, createHistoryEventId })`
- `createSecureDeliveryApiClient({ baseUrl, fetchImpl, getIdToken })`
- client methods:
  - `prepareAssignments(items)`
  - `deliverAssignments(assignmentIds)`
  - `listTeacherDeliveries()`
  - `applyAssignmentAction(assignmentId, action)`
  - `listStudentAssignments()`
  - `getStudentAssignment(deliveryId)`

- [ ] **Step 1: Write failing closed-default composition tests**

With no Secure Delivery env variables:
- composition returns disabled router behavior;
- Firebase Admin factory is never called;
- OMR Gateway starts normally;
- no Firestore network/client is created.

- [ ] **Step 2: Implement composition**

Only when `SECURE_DELIVERY_ENABLED=true` create Firebase adapters. Writes additionally require `SECURE_DELIVERY_WRITES_ENABLED=true`; Student reads require `STUDENT_DELIVERY_READS_ENABLED=true`.

Do not read service-account JSON from repository files. Production credential mechanism remains deferred to Human Gate B.

- [ ] **Step 3: Write failing API-client tests**

```js
test('client injects a fresh bearer token per call and never persists it', async () => {
  const tokens = ['token-1', 'token-2']
  const calls = []
  const client = createSecureDeliveryApiClient({
    baseUrl: 'https://example.invalid',
    getIdToken: async () => tokens.shift(),
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return jsonResponse({ success: true, data: [] })
    },
  })

  await client.listTeacherDeliveries()
  await client.listTeacherDeliveries()

  assert.equal(calls[0].init.headers.Authorization, 'Bearer token-1')
  assert.equal(calls[1].init.headers.Authorization, 'Bearer token-2')
  assert.equal('token' in client, false)
})
```

- [ ] **Step 4: Implement transport only, not login UI**

The client receives `getIdToken` injection. It never imports Firebase directly and never stores the token. This preserves provider-neutral UI call sites and allows a later teacher-login integration to supply Firebase tokens.

- [ ] **Step 5: Add explicit non-wiring assertions**

Security tests must prove:
- no automatic mount of TD-06 teacher UI/client in `main.js`, `src/app.js`, or `src/appShell.js`;
- no Student App cross-repo code;
- no production project ID/credential;
- no claim that PREPARED means DELIVERED.

- [ ] **Step 6: Add TD-06 architecture/runtime documentation**

Document collection names, endpoint shapes, flags, emulator command, deny-direct rules, exact semantic ladder:

```text
READY_EXACT_REVISION
→ local PrivateAssignment
→ DURABLY_PREPARED
→ DELIVERED_TO_STUDENT
```

and list all still-closed production gates.

- [ ] **Step 7: Run Task 10 tests**

```bash
node --test tests/secureDeliveryApiClient.test.js tests/secureDeliverySecurity.test.js tests/apiBoundarySecurity.test.js
```

- [ ] **Step 8: Commit**

```bash
git add backend/delivery/composition.js src/services/secureDeliveryApiClient.js tests/secureDeliveryApiClient.test.js tests/secureDeliverySecurity.test.js docs/teacher-delivery-td06-secure-delivery.md
git commit -m "feat: compose TD-06 secure delivery safely"
```

---

## HUMAN GATE B — Production Firebase provisioning and pilot activation

Stop after Task 10.

The implementation may be fully green against the local Firebase emulator, but none of the following is authorized by plan approval or code completion:

- create/select a Firebase cloud project;
- enable Authentication providers;
- create/modify production Firestore database;
- deploy `firestore.rules` or indexes;
- create/add Firebase Admin credentials;
- add Render/hosting environment variables;
- add a payment method or billing plan;
- provision real teacher/student identity mappings or grants;
- enable Secure Delivery feature flags in production;
- deploy the backend;
- modify `khfy7wpr5p-maker/st-student-app`;
- merge.

These require explicit human approval at the moment of execution.

---

### Task 11: Full regression, security review and merge-ready evidence

**Files:**
- Modify only if verification reveals documentation evidence needs: `docs/teacher-delivery-td06-secure-delivery.md`
- No product behavior changes are allowed in this task without returning to TDD for the discovered defect.

**Interfaces:**
- Produces evidence only; no new feature contract.

- [ ] **Step 1: Run all TD-01–TD-06 focused tests**

```bash
node --test   tests/teacherDeliveryContracts.test.js   tests/privateAssignment.test.js   tests/teacherRosterRepository.test.js   tests/teacherRosterService.test.js   tests/teacherPoolPublishingService.test.js   tests/teacherPoolPublishingController.test.js   tests/teacherPoolPublishingUi.test.js   tests/teacherPoolPublishingSecurity.test.js   tests/teacherScoreAssignmentRepository.test.js   tests/teacherScoreAssignmentService.test.js   tests/teacherScoreAssignmentController.test.js   tests/teacherScoreAssignmentUi.test.js   tests/teacherScoreAssignmentSecurity.test.js   tests/assignmentLifecycleRecord.test.js   tests/teacherAssignmentLifecycleRepository.test.js   tests/teacherAssignmentLifecycleService.test.js   tests/teacherAssignmentLifecycleController.test.js   tests/teacherAssignmentLifecycleControllerAuthority.test.js   tests/teacherAssignmentLifecycleUi.test.js   tests/teacherAssignmentLifecycleSecurity.test.js   tests/teacherDeliveryWireCodec.test.js   tests/secureDeliveryContracts.test.js   tests/studentPracticePackageV1.test.js   tests/secureDeliveryAuthorization.test.js   tests/inMemorySecureDeliveryStore.test.js   tests/preparedAssignmentService.test.js   tests/teacherSecureDeliveryService.test.js   tests/studentDeliveryReadService.test.js   tests/secureDeliveryHttp.test.js   tests/secureDeliveryApiClient.test.js   tests/secureDeliverySecurity.test.js
```

If an existing historical filename has changed on the execution head, discover the actual corresponding TD stage test and run it; do not omit a stage.

- [ ] **Step 2: Run Firebase emulator suite**

```bash
npm run test:td06:emulator
```

Expected: PASS with no cloud project/credentials.

- [ ] **Step 3: Run full repository suite**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Run protected browser checks**

Run every existing CI browser verification command from `.github/workflows/ci.yml`, including S14, STI-17, PR-C, PR-D, PR-E and PR-F checks. No protected check may be skipped because TD-06 is backend-focused.

- [ ] **Step 6: Run Playwright protected baseline**

Use the same Node 24 / Chromium command as `.github/workflows/regression-quality.yml`.

- [ ] **Step 7: Run/inspect Sonar exact-head analysis**

Require Quality Gate success. Review new-code issues, security hotspots, coverage and duplication. Any security hotspot in auth/token/Firestore code must be explicitly resolved or reviewed before merge-ready status.

- [ ] **Step 8: Perform final security review**

Manually review the exact branch diff for:
- credentials/project IDs;
- token logging/storage;
- provider UID leakage;
- direct client Firestore authority;
- Admin SDK imports in browser code;
- OMR backend coupling;
- partial-batch paths;
- acknowledgement checks;
- revocation visibility;
- cross-repo writes;
- feature flags defaulting open.

- [ ] **Step 9: Verify branch/base state**

Fresh-read current `main`, exact PR head, compare ahead/behind, and PR mergeability. If main has moved, rebase/update through the normal reviewed branch process and rerun exact-head verification.

- [ ] **Step 10: Record verification evidence**

Append exact head SHA, test counts, build/browser/Playwright/Sonar results, emulator results and confirmation that Human Gate B remains closed.

- [ ] **Step 11: Stop for explicit merge approval**

Do not merge, deploy, provision Firebase, enable flags or start Student App cross-repo integration from this plan without the corresponding explicit human approval.

---

## Plan Self-Review Result

- **Spec coverage:** TD-06 private SCORE path, durable prepared handoff addendum, auth/identity/grants, PracticePackage compatibility, atomic delivery, lifecycle/revoke, Student read isolation, Firebase adapter, Security Rules, shadow-safe composition, kill switches and verification are mapped to Tasks 1–11.
- **Deliberately separate operational scope:** real Firebase project/Auth/credentials/rules/index deployment, billing, production deployment, real-user provisioning and Student App repository work remain Human Gate B or later cross-repo work, exactly as required by the spec.
- **Pool scope:** TD-03 Pool data gets Firestore round-trip/provisioning support in Task 9, but no Student Pool API/UI is activated because the Student App Pool contract is not yet approved.
- **Placeholder scan:** no TBD/TODO/FIXME implementation placeholders are permitted.
- **Type consistency:** provider subject exists only at auth boundary; domain principal contains stable IDs only. `assignmentId` is the TD-06 v1 delivery ID. Prepared records link one assignment to one package ID/fingerprint.
- **Review Focus:** all five listed failure modes have explicit tests in Tasks 1, 3–6 and 9.
