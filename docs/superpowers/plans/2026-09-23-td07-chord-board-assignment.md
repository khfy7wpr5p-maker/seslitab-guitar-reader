# TD-07 Chord Board Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add a teacher-only SesliTab workflow that assigns an exact immutable guitar-chord voicing to one or more students and carries that CHORD_BOARD assignment through the existing TD-05 lifecycle and TD-06 secure-delivery pipeline without changing the student-facing Chord Board application.

**Architecture:** Keep st-guitar-chord-board as a read-only source of a pinned catalog snapshot, never a runtime dependency or delivery authority. SesliTab owns a strict exact-voicing contract, recipient-bound CHORD_BOARD PrivateAssignment variant, teacher assignment workflow, dedicated student-safe chord delivery package, and package-union adapters that preserve the existing SCORE path unchanged. Production activation remains closed: the teacher UI is explicit-mount until real teacher auth/roster/Firebase production activation is separately approved.

**Tech Stack:** Node.js ESM >=24.0.0 <25, built-in node:test + node:assert/strict, Vite 8.2.0, Firebase emulator toolchain already pinned by TD-06, browser Web Crypto for teacher-side SHA-256 verification, Node node:crypto for backend integrity verification.

**Spec:** docs/superpowers/specs/2026-09-23-td07-chord-board-assignment-design.md

## Global Constraints

- Reference Chord Board source repository: khfy7wpr5p-maker/st-guitar-chord-board.
- Reference Chord Board source revision: 6f8b869c32e9c2c5045449f79f4a686c0a67bb6d.
- Do not modify khfy7wpr5p-maker/st-guitar-chord-board.
- Do not modify khfy7wpr5p-maker/st-student-app.
- Do not add SesliTab'a aktar, teacher controls, roster data, Firebase credentials, or hidden delivery controls to the student-facing Chord Board app.
- Chord string-array order is index 0..5 = string 6..1 = low E..high E.
- Fret semantics: -1 = muted, 0 = open, positive integer = fretted; imported TD-07 catalog must remain within the pinned Chord Board bound 0..20.
- Finger semantics: -1 = muted, 0 = open/no finger, 1..4 = left-hand finger.
- Exact voicing authority is the immutable frets + fingers + barres + shape + generated/curated snapshot, never symbol + voicingIndex.
- voicingFingerprint is SHA-256 over canonical schemaVersion + sourceKind + chord + voicing content only; source repository/commit/catalog provenance is retained separately and does not participate in the voicing hash.
- catalogFingerprint is SHA-256 over source repository/commit plus ordered catalog musical content and voicing fingerprints, excluding the catalogFingerprint field itself and excluding each embedded provenance.catalogFingerprint to avoid circular hashing.
- Preserve display spelling separately from canonical chord identity.
- Preserve READY_EXACT_REVISION != DURABLY_PREPARED != DELIVERED_TO_STUDENT.
- Preserve TD-05 forward lifecycle ACTIVE -> COMPLETED -> REPERTOIRE; revoke remains one-way.
- Preserve TD-06 maximum batch size 40 and fail-closed all-or-nothing secure-delivery writes.
- Existing SCORE PrivateAssignment, StudentPracticePackageV1, wire, lifecycle, authorization, Firestore rules and delivery behavior must remain backward compatible.
- Do not force CHORD_BOARD data into SCORE StudentPracticePackageV1.
- Do not create/modify a production Firebase project, production Firestore, production Auth, credentials, billing, environment variables, feature flags, Rules/index deployment, or backend production deployment.
- Do not auto-mount TD-07 in main.js, src/app.js, or src/appShell.js until the separate production teacher-auth/roster activation gate is approved.
- Use TDD for every production behavior slice.
- Stop after exact-head verification and review; do not merge without explicit human approval.

## File Structure

**Create**
- src/services/chordBoardVoicingCanonical.js — strict exact-voicing normalization, deep freeze, canonical JSON, structural equality.
- src/services/chordBoardVoicingFingerprint.js — browser-side async SHA-256 verifier over canonical exact-voicing JSON.
- backend/delivery/integrity/chordBoardVoicingFingerprint.js — backend synchronous SHA-256 verifier using the same canonical JSON.
- scripts/generateChordBoardCatalogSnapshot.mjs — read-only importer from a checkout pinned to the approved Chord Board commit.
- src/data/chordBoardCatalogSnapshotV1.json — generated static teacher catalog snapshot; no runtime network dependency.
- src/services/chordBoardCatalog.js — strict catalog loader/query API.
- src/services/chordBoardAssignmentSourceBinding.js — immutable recipient-bound CHORD_BOARD source contract.
- src/services/teacherChordBoardAssignmentRepository.js — provider-neutral in-memory exact-assignment repository.
- src/services/teacherChordBoardAssignmentService.js — active-roster preflight, exact source binding, notes, idempotent exact retry, batch creation.
- src/services/studentChordBoardPackageV1.js — strict student-safe chord package.
- src/services/secureDeliveryPackage.js — SCORE/CHORD_BOARD delivery-package union helpers.
- src/services/teacherChordBoardAssignmentController.js — async teacher workflow orchestration and bounded status messages.
- src/teacherChordBoardAssignmentUi.js — explicit-mount Akor Ata teacher UI.
- src/teacherChordBoardAssignmentUi.css — teacher chord selector/diagram/student-list presentation.
- tests/chordBoardVoicingCanonical.test.js
- tests/chordBoardCatalog.test.js
- tests/chordBoardAssignmentSourceBinding.test.js
- tests/teacherChordBoardAssignmentRepository.test.js
- tests/teacherChordBoardAssignmentService.test.js
- tests/studentChordBoardPackageV1.test.js
- tests/secureDeliveryPackage.test.js
- tests/teacherChordBoardAssignmentController.test.js
- tests/teacherChordBoardAssignmentUi.test.js
- tests/teacherChordBoardAssignmentSecurity.test.js
- docs/teacher-delivery-td07-chord-board-assignment.md

**Modify**
- src/services/privateAssignment.js
- src/services/teacherDeliveryWireCodec.js
- src/services/assignmentLifecycleRecord.js
- src/services/teacherAssignmentLifecycleRepository.js
- backend/delivery/integrity/packageFingerprint.js
- backend/delivery/services/preparedAssignmentService.js
- backend/delivery/services/teacherDeliveryService.js
- backend/delivery/services/studentDeliveryReadService.js
- backend/delivery/repositories/inMemorySecureDeliveryStore.js
- backend/delivery/firebase/firestoreSecureDeliveryStore.js
- tests/privateAssignment.test.js
- tests/teacherDeliveryContracts.test.js
- tests/teacherDeliveryWireCodec.test.js
- tests/assignmentLifecycleRecord.test.js
- tests/teacherAssignmentLifecycleService.test.js
- tests/preparedAssignmentService.test.js
- tests/teacherSecureDeliveryService.test.js
- tests/studentDeliveryReadService.test.js
- tests/inMemorySecureDeliveryStore.test.js
- tests/secureDeliveryFirebaseEmulator.test.js
- tests/secureDeliverySecurity.test.js
- tests/support/fakeTeacherPoolDom.js

**Explicitly do not modify**
- khfy7wpr5p-maker/st-guitar-chord-board/**
- khfy7wpr5p-maker/st-student-app/**
- main.js
- src/app.js
- src/appShell.js
- production Firebase/cloud configuration.

## Review Focus

1. **A malformed wire snapshot changes fret data but keeps a stale fingerprint** — backend preparation must recompute SHA-256 from canonical exact voicing content and reject the mismatch. Covered in Tasks 1, 3 and 7.
2. **Two catalog entries or retries share a fingerprint but differ structurally** — duplicate/replay logic must compare canonical snapshot content in addition to fingerprint before treating them as exact. Covered in Tasks 2 and 4.
3. **A mixed SCORE/CHORD_BOARD payload passes because both contain common fields** — package/source union dispatch must be strict and reject mixed or ambiguous shapes. Covered in Tasks 3, 6 and 7.
4. **Teacher delivery reaches PREPARED but delivery fails** — controller/UI must retain exact assignment IDs and show hazırlandı ancak gönderilemedi, never Gönderildi. Covered in Task 8.
5. **Firestore/emulator round-trip rewrites nested voicing/barre data** — reread must restore an immutable exact source/package with the same canonical JSON and fingerprint. Covered in Task 9.

---

### Task 1: Exact Chord Board Voicing Contract and Cross-Runtime Fingerprint

**Files:**
- Create: src/services/chordBoardVoicingCanonical.js
- Create: src/services/chordBoardVoicingFingerprint.js
- Create: backend/delivery/integrity/chordBoardVoicingFingerprint.js
- Test: tests/chordBoardVoicingCanonical.test.js

**Interfaces:**
- Produces CHORD_BOARD_VOICING_SCHEMA_VERSION = 1.
- Produces CHORD_BOARD_SOURCE_KIND = 'chord_board_exact_voicing'.
- Produces normalizeChordBoardVoicingSnapshot(value).
- Produces isChordBoardVoicingSnapshot(value).
- Produces canonicalChordBoardVoicingJson(value).
- Produces sameChordBoardVoicingSnapshot(left, right).
- Browser produces fingerprintChordBoardVoicing(value, subtle) -> Promise<string>.
- Backend produces fingerprintChordBoardVoicingSync(value) -> string.

- [ ] **Step 1: Write the failing exact-voicing tests**

~~~js
const AM = {
  schemaVersion: 1,
  sourceKind: 'chord_board_exact_voicing',
  chord: {
    canonicalSymbol: 'Am',
    canonicalRoot: 'A',
    quality: 'm',
    displayRoot: 'A',
    displaySymbol: 'Am',
  },
  voicing: {
    frets: [-1, 0, 2, 2, 1, 0],
    fingers: [-1, 0, 2, 3, 1, 0],
    barres: [],
    shape: 'open',
    generated: false,
    curated: true,
  },
  provenance: {
    sourceRepository: 'khfy7wpr5p-maker/st-guitar-chord-board',
    sourceCommit: '6f8b869c32e9c2c5045449f79f4a686c0a67bb6d',
    catalogFingerprint: '0'.repeat(64),
  },
  voicingFingerprint: '1'.repeat(64),
}

test('TD-07 exact voicing freezes six-string data low E to high E', () => {
  const snapshot = normalizeChordBoardVoicingSnapshot(AM)
  assert.equal(Object.isFrozen(snapshot), true)
  assert.equal(Object.isFrozen(snapshot.voicing.frets), true)
  assert.deepEqual(snapshot.voicing.frets, [-1, 0, 2, 2, 1, 0])
  assert.equal(isChordBoardVoicingSnapshot(snapshot), true)
})

test('TD-07 rejects malformed fret finger and barre geometry', () => {
  assert.throws(
    () => normalizeChordBoardVoicingSnapshot({
      ...AM,
      voicing: { ...AM.voicing, frets: [-1, 0, 2] },
    }),
    /six|frets/i,
  )
  assert.throws(
    () => normalizeChordBoardVoicingSnapshot({
      ...AM,
      voicing: { ...AM.voicing, fingers: [-1, 0, 2, 3, 5, 0] },
    }),
    /finger/i,
  )
  assert.throws(
    () => normalizeChordBoardVoicingSnapshot({
      ...AM,
      voicing: {
        ...AM.voicing,
        barres: [{ finger: 1, fret: 2, fromString: 1, toString: 6 }],
      },
    }),
    /barre/i,
  )
})

test('TD-07 browser and backend fingerprints agree', async () => {
  const snapshot = normalizeChordBoardVoicingSnapshot(AM)
  const browserHash = await fingerprintChordBoardVoicing(snapshot)
  const backendHash = fingerprintChordBoardVoicingSync(snapshot)
  assert.match(browserHash, /^[a-f0-9]{64}$/u)
  assert.equal(browserHash, backendHash)
})
~~~

Also test fret 21, non-integers, muted/open/fretted finger consistency, barre string bounds 1..6, barre fret 1..20, finger 1..4, fromString >= toString, missing/extra keys, mutable clone rejection, and canonical JSON stability across object key insertion order.

- [ ] **Step 2: Run focused test and verify RED**

~~~bash
node --test tests/chordBoardVoicingCanonical.test.js
~~~

Expected: FAIL because the TD-07 modules do not exist.

- [ ] **Step 3: Implement strict canonical normalization**

~~~js
export const CHORD_BOARD_VOICING_SCHEMA_VERSION = 1
export const CHORD_BOARD_SOURCE_KIND = 'chord_board_exact_voicing'
export const CHORD_BOARD_MAX_FRET = 20

export function normalizeChordBoardVoicingSnapshot(value) {
  assertExactSnapshotKeys(value)
  const frets = normalizeSixIntegers(value.voicing.frets, 'frets', -1, 20)
  const fingers = normalizeSixIntegers(value.voicing.fingers, 'fingers', -1, 4)

  for (let index = 0; index < 6; index += 1) {
    if (frets[index] === -1 && fingers[index] !== -1) {
      throw new TypeError('muted string finger must be -1.')
    }
    if (frets[index] === 0 && fingers[index] !== 0) {
      throw new TypeError('open string finger must be 0.')
    }
    if (frets[index] > 0 && (fingers[index] < 1 || fingers[index] > 4)) {
      throw new TypeError('fretted string finger must be 1..4.')
    }
  }

  return deepFreeze({
    schemaVersion: 1,
    sourceKind: CHORD_BOARD_SOURCE_KIND,
    chord: normalizeChord(value.chord),
    voicing: {
      frets,
      fingers,
      barres: Object.freeze(value.voicing.barres.map(normalizeBarre)),
      shape: normalizeRequiredText(value.voicing.shape, 'shape'),
      generated: normalizeBoolean(value.voicing.generated, 'generated'),
      curated: normalizeBoolean(value.voicing.curated, 'curated'),
    },
    provenance: normalizeProvenance(value.provenance),
    voicingFingerprint: normalizeSha256(
      value.voicingFingerprint,
      'voicingFingerprint',
    ),
  })
}
~~~

canonicalChordBoardVoicingJson() serializes exactly { schemaVersion, sourceKind, chord, voicing }; it excludes voicingFingerprint and the entire provenance object. It sorts object keys with localeCompare using en and preserves array order exactly. This makes the musical fingerprint stable across catalog provenance changes while provenance remains separately auditable.

- [ ] **Step 4: Implement SHA-256 adapters over the same canonical JSON**

Browser:

~~~js
export async function fingerprintChordBoardVoicing(
  value,
  subtle = globalThis.crypto?.subtle,
) {
  if (!subtle?.digest) throw new Error('Web Crypto SHA-256 unavailable.')
  const bytes = new TextEncoder().encode(
    canonicalChordBoardVoicingJson(value),
  )
  const digest = await subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
~~~

Backend:

~~~js
export function fingerprintChordBoardVoicingSync(value) {
  return createHash('sha256')
    .update(canonicalChordBoardVoicingJson(value), 'utf8')
    .digest('hex')
}
~~~

- [ ] **Step 5: Run focused test and verify GREEN**

~~~bash
node --test tests/chordBoardVoicingCanonical.test.js
~~~

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

~~~bash
git add src/services/chordBoardVoicingCanonical.js src/services/chordBoardVoicingFingerprint.js backend/delivery/integrity/chordBoardVoicingFingerprint.js tests/chordBoardVoicingCanonical.test.js
git commit -m "feat: add TD-07 exact chord voicing contract"
~~~

---

### Task 2: Generate and Pin the Chord Board Catalog Snapshot

**Files:**
- Create: scripts/generateChordBoardCatalogSnapshot.mjs
- Create: src/data/chordBoardCatalogSnapshotV1.json
- Create: src/services/chordBoardCatalog.js
- Test: tests/chordBoardCatalog.test.js

**Interfaces:**
- Produces CHORD_BOARD_CATALOG_SCHEMA_VERSION = 1.
- Produces loadPinnedChordBoardCatalog().
- Produces listChordBoardSymbols().
- Produces getChordBoardVoicings(displayOrCanonicalSymbol).
- Produces isPinnedChordBoardVoicing(snapshot), which requires fingerprint lookup plus canonical structural equality against the loaded catalog.

- [ ] **Step 1: Write failing catalog tests**

~~~js
test('TD-07 pinned catalog reports approved revision and 180 chord symbols', () => {
  const catalog = loadPinnedChordBoardCatalog()
  assert.equal(catalog.schemaVersion, 1)
  assert.equal(
    catalog.provenance.sourceCommit,
    '6f8b869c32e9c2c5045449f79f4a686c0a67bb6d',
  )
  assert.match(catalog.catalogFingerprint, /^[a-f0-9]{64}$/u)
  assert.equal(listChordBoardSymbols().length, 180)

  const am = getChordBoardVoicings('Am')
  assert.equal(am.length >= 1, true)
  assert.deepEqual(am[0].voicing.frets, [-1, 0, 2, 2, 1, 0])
  assert.equal(isChordBoardVoicingSnapshot(am[0]), true)
})

test('TD-07 catalog does not expose voicingIndex as durable identity', () => {
  const [selected] = getChordBoardVoicings('Am')
  assert.equal('voicingIndex' in selected, false)
  assert.match(selected.voicingFingerprint, /^[a-f0-9]{64}$/u)
})
~~~

Also iterate every catalog row and verify strict validation, fingerprint recomputation, no duplicate exact canonical content per symbol, and flat-display spelling preservation.

- [ ] **Step 2: Run and verify RED**

~~~bash
node --test tests/chordBoardCatalog.test.js
~~~

- [ ] **Step 3: Implement a read-only catalog generator**

The generator requires CHORD_BOARD_SOURCE_DIR, dynamically imports chord-catalog.js, chord-core.js and voicing-library.js from that checkout, iterates CHORD_SYMBOLS, resolves getVoicings(symbol), normalizes each exact voicing, and computes voicingFingerprint from musical content only. Then compute catalogFingerprint from source repository/commit plus ordered chord/voicing content and voicing fingerprints while omitting every provenance.catalogFingerprint. Finally inject that completed catalogFingerprint into each snapshot provenance and the top-level catalog record; do not recompute the catalog hash after injection.

The generated file must contain:
- schemaVersion;
- provenance.sourceRepository;
- provenance.sourceCommit;
- catalogFingerprint;
- 180 ordered chord rows;
- exact voicing snapshots.

- [ ] **Step 4: Generate from the exact approved source commit**

~~~bash
rm -rf /tmp/st-guitar-chord-board-td07
git clone --filter=blob:none https://github.com/khfy7wpr5p-maker/st-guitar-chord-board.git /tmp/st-guitar-chord-board-td07
git -C /tmp/st-guitar-chord-board-td07 checkout 6f8b869c32e9c2c5045449f79f4a686c0a67bb6d
CHORD_BOARD_SOURCE_DIR=/tmp/st-guitar-chord-board-td07 node scripts/generateChordBoardCatalogSnapshot.mjs
git -C /tmp/st-guitar-chord-board-td07 status --short
~~~

Expected: generated SesliTab JSON exists and the source checkout status is empty.

- [ ] **Step 5: Implement strict frozen catalog loader/query**

The loader validates the stored repository/commit, recomputes catalogFingerprint using the same non-circular payload, normalizes every voicing through Task 1, recomputes every voicing SHA-256, freezes the result, and exposes query functions. Query normalization may accept display spelling, but returned snapshots preserve stored displaySymbol. isPinnedChordBoardVoicing(snapshot) first finds candidates by voicingFingerprint and then requires sameChordBoardVoicingSnapshot() before returning true.

- [ ] **Step 6: Run catalog tests**

~~~bash
node --test tests/chordBoardCatalog.test.js tests/chordBoardVoicingCanonical.test.js
~~~

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

~~~bash
git add scripts/generateChordBoardCatalogSnapshot.mjs src/data/chordBoardCatalogSnapshotV1.json src/services/chordBoardCatalog.js tests/chordBoardCatalog.test.js
git commit -m "feat: pin TD-07 Chord Board catalog snapshot"
~~~

---

### Task 3: Recipient-Bound CHORD_BOARD Source and PrivateAssignment Union

**Files:**
- Create: src/services/chordBoardAssignmentSourceBinding.js
- Modify: src/services/privateAssignment.js
- Modify: src/services/teacherDeliveryWireCodec.js
- Test: tests/chordBoardAssignmentSourceBinding.test.js
- Modify: tests/privateAssignment.test.js
- Modify: tests/teacherDeliveryContracts.test.js
- Modify: tests/teacherDeliveryWireCodec.test.js

**Interfaces:**
- CHORD_BOARD_ASSIGNMENT_SOURCE_SCHEMA_VERSION = 1.
- createChordBoardAssignmentSourceBinding({ studentId, snapshot, boundAt }).
- isChordBoardAssignmentSourceBinding(value).
- restoreChordBoardAssignmentSourceBindingV1(raw).
- Binding fields: schemaVersion, sourceKind, studentId, snapshot, voicingFingerprint, boundAt.

- [ ] **Step 1: Write failing source and PrivateAssignment tests**

~~~js
test('TD-07 creates recipient-bound immutable CHORD_BOARD source', () => {
  const snapshot = amSnapshot()
  const sourceRef = createChordBoardAssignmentSourceBinding({
    studentId: 'student-a',
    snapshot,
    boundAt: '2026-09-23T12:00:00Z',
  })

  assert.equal(sourceRef.studentId, 'student-a')
  assert.equal(sourceRef.snapshot, snapshot)
  assert.equal(sourceRef.voicingFingerprint, snapshot.voicingFingerprint)
  assert.equal(isChordBoardAssignmentSourceBinding(sourceRef), true)
})

test('TD-07 PrivateAssignment accepts CHORD_BOARD and keeps SCORE valid', () => {
  const chord = createPrivateAssignment({
    assignmentId: 'assignment-chord-a',
    studentId: 'student-a',
    practiceType: PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD,
    teacherNote: 'Temiz geçiş.',
    assignedAt: '2026-09-23T12:00:00Z',
    sourceRef: chordSource('student-a'),
  })

  assert.equal(isPrivateAssignment(chord), true)
  assert.equal(isPrivateAssignment(scoreAssignment()), true)
})
~~~

Replace the TD-01 defer expectation with strict CHORD_BOARD acceptance/rejection. Test student mismatch, wrong source variant, mutable source, stale duplicate fingerprint field and mixed wire fields.

- [ ] **Step 2: Run and verify RED**

~~~bash
node --test tests/chordBoardAssignmentSourceBinding.test.js tests/privateAssignment.test.js tests/teacherDeliveryWireCodec.test.js tests/teacherDeliveryContracts.test.js
~~~

- [ ] **Step 3: Implement recipient-bound source**

~~~js
export function createChordBoardAssignmentSourceBinding(input = {}) {
  assertStrictInputObject(
    input,
    ['studentId', 'snapshot', 'boundAt'],
    'ChordBoardAssignmentSourceBinding',
  )
  if (!isChordBoardVoicingSnapshot(input.snapshot)) {
    throw new TypeError('snapshot must be an immutable exact chord voicing.')
  }

  return Object.freeze({
    schemaVersion: 1,
    sourceKind: CHORD_BOARD_SOURCE_KIND,
    studentId: normalizeRequiredId(input.studentId, 'studentId'),
    snapshot: input.snapshot,
    voicingFingerprint: input.snapshot.voicingFingerprint,
    boundAt: normalizeRequiredTimestamp(input.boundAt, 'boundAt'),
  })
}
~~~

- [ ] **Step 4: Make PrivateAssignment a strict source-discriminated union**

~~~js
function validSourceFor(practiceType, sourceRef) {
  if (practiceType === PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE) {
    return isScoreAssignmentSourceBinding(sourceRef)
  }
  if (practiceType === PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD) {
    return isChordBoardAssignmentSourceBinding(sourceRef)
  }
  return false
}
~~~

Remove the TD-01 CHORD_BOARD defer throw only after this validator is in place.

- [ ] **Step 5: Make wire restore source-kind aware**

restorePrivateAssignmentV1() must require:
- SCORE + score_exact_revision -> SCORE restore;
- CHORD_BOARD + chord_board_exact_voicing -> CHORD restore;
- all cross/mixed combinations -> reject.

Variant-aware equality must compare full exact chord snapshot content plus recipient/fingerprint/boundAt.

- [ ] **Step 6: Run and verify GREEN**

~~~bash
node --test tests/chordBoardAssignmentSourceBinding.test.js tests/privateAssignment.test.js tests/teacherDeliveryWireCodec.test.js tests/teacherDeliveryContracts.test.js
~~~

- [ ] **Step 7: Commit Task 3**

~~~bash
git add src/services/chordBoardAssignmentSourceBinding.js src/services/privateAssignment.js src/services/teacherDeliveryWireCodec.js tests/chordBoardAssignmentSourceBinding.test.js tests/privateAssignment.test.js tests/teacherDeliveryWireCodec.test.js tests/teacherDeliveryContracts.test.js
git commit -m "feat: add CHORD_BOARD private assignment source"
~~~

---

### Task 4: Teacher CHORD_BOARD Repository and Batch Assignment Service

**Files:**
- Create: src/services/teacherChordBoardAssignmentRepository.js
- Create: src/services/teacherChordBoardAssignmentService.js
- Test: tests/teacherChordBoardAssignmentRepository.test.js
- Test: tests/teacherChordBoardAssignmentService.test.js

**Interfaces:**
- Repository methods: list(), getByAssignmentId(), findExactChordBoardAssignment({ studentId, voicingFingerprint }), createBatch(assignments).
- Service method: prepareChordBoardAssignments({ snapshot, studentIds, commonTeacherNote, teacherNoteOverrides }).
- Consumes existing rosterService.preflightActiveStudentIds(), the Task 2 catalog API isPinnedChordBoardVoicing(snapshot), createAssignmentId(), now().

- [ ] **Step 1: Write failing repository tests**

~~~js
test('TD-07 repository indexes recipient plus exact voicing fingerprint', () => {
  const repository = createInMemoryTeacherChordBoardAssignmentRepository()
  const assignment = chordAssignmentFixture()
  repository.createBatch([assignment])

  assert.equal(
    repository.findExactChordBoardAssignment({
      studentId: assignment.studentId,
      voicingFingerprint: assignment.sourceRef.voicingFingerprint,
    }),
    assignment,
  )
})
~~~

Also test duplicate assignmentId, same recipient/fingerprint with structurally different snapshot, empty batch, malformed rows and deterministic list order.

- [ ] **Step 2: Implement repository and verify GREEN**

Use studentId + U+0001 + voicingFingerprint only as an index key. Exact retry additionally requires sameChordBoardVoicingSnapshot().

~~~bash
node --test tests/teacherChordBoardAssignmentRepository.test.js
~~~

- [ ] **Step 3: Write failing assignment-service tests**

Cover active-roster preflight, duplicate student normalization, common/per-student notes, max 40, 41 rejection, all-or-nothing mutation, rejection of a structurally valid snapshot that is not present in the pinned catalog, exact idempotent retry and changed-note conflict.

~~~js
test('TD-07 fans one exact voicing to separate recipient-bound assignments', () => {
  const assignments = service.prepareChordBoardAssignments({
    snapshot: amSnapshot(),
    studentIds: ['student-a', 'student-b'],
    commonTeacherNote: '60 BPM ile çalış.',
    teacherNoteOverrides: [],
  })

  assert.equal(assignments.length, 2)
  assert.notEqual(assignments[0].assignmentId, assignments[1].assignmentId)
  assert.equal(assignments[0].sourceRef.snapshot, assignments[1].sourceRef.snapshot)
  assert.equal(assignments[0].sourceRef.studentId, 'student-a')
  assert.equal(assignments[1].sourceRef.studentId, 'student-b')
})
~~~

- [ ] **Step 4: Implement preflight-before-mutation**

Before roster mutation or ID allocation, require isPinnedChordBoardVoicing(input.snapshot) === true. Then build all recipient bindings and candidate assignments, resolve exact retries/conflicts before createBatch(), call createAssignmentId() and now() only for truly new rows, and validate repository acknowledgement exactly.

- [ ] **Step 5: Run Task 4 tests**

~~~bash
node --test tests/teacherChordBoardAssignmentRepository.test.js tests/teacherChordBoardAssignmentService.test.js
~~~

- [ ] **Step 6: Commit Task 4**

~~~bash
git add src/services/teacherChordBoardAssignmentRepository.js src/services/teacherChordBoardAssignmentService.js tests/teacherChordBoardAssignmentRepository.test.js tests/teacherChordBoardAssignmentService.test.js
git commit -m "feat: add teacher chord assignment producer"
~~~

---

### Task 5: TD-05 Lifecycle Compatibility for CHORD_BOARD

**Files:**
- Modify: src/services/assignmentLifecycleRecord.js
- Modify: src/services/teacherAssignmentLifecycleRepository.js
- Modify: tests/assignmentLifecycleRecord.test.js
- Modify: tests/teacherAssignmentLifecycleService.test.js
- Modify: tests/teacherAssignmentLifecycleSecurity.test.js

**Interfaces:** No new lifecycle methods or states.

- [ ] **Step 1: Add failing CHORD_BOARD lifecycle tests**

~~~js
test('TD-07 CHORD_BOARD follows ACTIVE -> COMPLETED -> REPERTOIRE and revoke', () => {
  const assignment = chordAssignmentFixture()
  const active = createInitialAssignmentLifecycleRecord(assignment)
  const completed = transitionAssignmentLifecycleRecord(
    active,
    PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    '2026-09-23T13:00:00Z',
  )
  const repertoire = transitionAssignmentLifecycleRecord(
    completed,
    PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
    '2026-09-23T14:00:00Z',
  )
  const revoked = revokeAssignmentLifecycleRecord(
    repertoire,
    '2026-09-23T15:00:00Z',
  )

  assert.equal(revoked.assignment, assignment)
  assert.equal(revoked.state, PRIVATE_ASSIGNMENT_STATE.REPERTOIRE)
  assert.equal(revoked.revokedAt, '2026-09-23T15:00:00Z')
})
~~~

- [ ] **Step 2: Run lifecycle tests**

~~~bash
node --test tests/assignmentLifecycleRecord.test.js tests/teacherAssignmentLifecycleService.test.js tests/teacherAssignmentLifecycleSecurity.test.js
~~~

- [ ] **Step 3: Generalize only SCORE-specific wording/guards**

Change error wording from valid immutable initial SCORE PrivateAssignment to valid immutable initial PrivateAssignment where required. Do not change transition, idempotence, history or revoke behavior.

- [ ] **Step 4: Run SCORE + CHORD lifecycle regression**

~~~bash
node --test tests/assignmentLifecycleRecord.test.js tests/teacherAssignmentLifecycleRepository.test.js tests/teacherAssignmentLifecycleService.test.js tests/teacherAssignmentLifecycleController.test.js tests/teacherAssignmentLifecycleControllerAuthority.test.js tests/teacherAssignmentLifecycleSecurity.test.js tests/teacherScoreAssignmentService.test.js
~~~

- [ ] **Step 5: Commit Task 5**

~~~bash
git add src/services/assignmentLifecycleRecord.js src/services/teacherAssignmentLifecycleRepository.js tests/assignmentLifecycleRecord.test.js tests/teacherAssignmentLifecycleService.test.js tests/teacherAssignmentLifecycleSecurity.test.js
git commit -m "test: extend assignment lifecycle to chord board"
~~~

---

### Task 6: StudentChordBoardPackageV1 and Secure-Delivery Package Union

**Files:**
- Create: src/services/studentChordBoardPackageV1.js
- Create: src/services/secureDeliveryPackage.js
- Modify: backend/delivery/integrity/packageFingerprint.js
- Test: tests/studentChordBoardPackageV1.test.js
- Test: tests/secureDeliveryPackage.test.js
- Modify: tests/studentPracticePackageV1.test.js

**Interfaces:**
- StudentChordBoardPackageV1 fields:
  - schemaVersion: '1.0.0'
  - packageType: 'CHORD_BOARD'
  - packageId, exactly assignment.assignmentId for v1 one-to-one delivery
  - title, derived as displaySymbol + ' akor çalışması' and normalized through the existing bounded display-name limit
  - assignmentAuthority: { assignmentId, state: 'teacher_assigned', assignedAt }
  - publication: { scope: 'student_private', recipientStudentId }
  - content: { chordBoard: exact snapshot }
  - practice: strict frozen JSON object
- createStudentPrivateChordBoardPackageV1({ assignment, practice }).
- validateStudentChordBoardPackageV1(value).
- restoreStudentChordBoardPackageV1(raw).
- SECURE_DELIVERY_PACKAGE_KIND = { SCORE, CHORD_BOARD }.
- restoreSecureDeliveryPackage(raw).
- secureDeliveryPackageKind(pkg).
- assertSecureDeliveryPackageMatchesAssignment(pkg, assignment).
- fingerprintSecureDeliveryPackage(pkg).
- Preserve fingerprintPracticePackage(pkg).

- [ ] **Step 1: Write failing chord-package tests**

~~~js
test('TD-07 creates student-safe CHORD_BOARD package from exact assignment', () => {
  const assignment = chordAssignmentFixture()
  const pkg = createStudentPrivateChordBoardPackageV1({
    assignment,
    practice: { repeatCount: 4 },
  })

  assert.equal(pkg.packageType, 'CHORD_BOARD')
  assert.equal(pkg.packageId, assignment.assignmentId)
  assert.equal(pkg.assignmentAuthority.assignmentId, assignment.assignmentId)
  assert.equal(pkg.publication.recipientStudentId, assignment.studentId)
  assert.equal(pkg.content.chordBoard, assignment.sourceRef.snapshot)
  assert.equal('providerSubject' in pkg, false)
  assert.equal('authorizationId' in pkg, false)
})
~~~

Test wrong practiceType, recipient, assignment ID, mutable/malformed snapshot, extra top-level fields, internal auth/evidence fields and unsupported practice JSON.

- [ ] **Step 2: Write failing union tests**

~~~js
test('TD-07 secure package union preserves SCORE and accepts CHORD_BOARD', () => {
  assert.equal(
    secureDeliveryPackageKind(restoreSecureDeliveryPackage(scorePackageFixture())),
    SECURE_DELIVERY_PACKAGE_KIND.SCORE,
  )
  assert.equal(
    secureDeliveryPackageKind(restoreSecureDeliveryPackage(chordPackageFixture())),
    SECURE_DELIVERY_PACKAGE_KIND.CHORD_BOARD,
  )
  assert.throws(
    () => restoreSecureDeliveryPackage(mixedScoreChordPackageFixture()),
    /invalid|ambiguous|unsupported/i,
  )
})
~~~

- [ ] **Step 3: Implement package + assignment authority matching**

For SCORE retain recipient, approved revision and teacher_approved checks. For CHORD_BOARD require recipient, assignment ID, assignedAt, exact snapshot structural equality and binding/package fingerprint equality.

- [ ] **Step 4: Add generic package fingerprint without changing SCORE semantics**

~~~js
export function fingerprintSecureDeliveryPackage(value) {
  const pkg = restoreSecureDeliveryPackage(value)
  return createHash('sha256')
    .update(canonicalPackageJson(pkg), 'utf8')
    .digest('hex')
}

export function fingerprintPracticePackage(value) {
  const validation = validateStudentPracticePackageV1(value)
  if (!validation.ok) {
    throw new TypeError(
      'cannot fingerprint invalid PracticePackage: ' +
      validation.errors.join('; '),
    )
  }
  return fingerprintSecureDeliveryPackage(value)
}
~~~

- [ ] **Step 5: Run package tests**

~~~bash
node --test tests/studentPracticePackageV1.test.js tests/studentChordBoardPackageV1.test.js tests/secureDeliveryPackage.test.js
~~~

- [ ] **Step 6: Commit Task 6**

~~~bash
git add src/services/studentChordBoardPackageV1.js src/services/secureDeliveryPackage.js backend/delivery/integrity/packageFingerprint.js tests/studentChordBoardPackageV1.test.js tests/secureDeliveryPackage.test.js tests/studentPracticePackageV1.test.js
git commit -m "feat: add chord board secure delivery package"
~~~

---

### Task 7: TD-06 Prepare, Deliver and Read Support for CHORD_BOARD

**Files:**
- Modify: backend/delivery/services/preparedAssignmentService.js
- Modify: backend/delivery/services/teacherDeliveryService.js
- Modify: backend/delivery/services/studentDeliveryReadService.js
- Modify: backend/delivery/repositories/inMemorySecureDeliveryStore.js
- Modify: tests/preparedAssignmentService.test.js
- Modify: tests/teacherSecureDeliveryService.test.js
- Modify: tests/studentDeliveryReadService.test.js
- Modify: tests/inMemorySecureDeliveryStore.test.js

**Interfaces:** Existing HTTP endpoints and store method names remain unchanged.

- [ ] **Step 1: Add failing prepared-service CHORD_BOARD tests**

Test valid prepare, backend recomputed voicing SHA-256, stale/tampered snapshot rejection, wrong recipient, wrong assignment ID, mixed package, two-item atomic failure, exact replay and collision-like same fingerprint/different content.

~~~js
await assert.rejects(
  preparedService.prepareBatch({
    providerSubject: 'teacher-provider-1',
    items: [{
      assignment: tamperedChordAssignmentWire(),
      package: tamperedChordPackageWire(),
    }],
  }),
  /fingerprint|voicing|mismatch/i,
)
assert.equal(await store.getPreparedAssignment('assignment-chord-a'), null)
~~~

- [ ] **Step 2: Replace SCORE-only package restore with strict union**

~~~js
const assignment = restorePrivateAssignmentV1(rawItem.assignment)
const pkg = restoreSecureDeliveryPackage(rawItem.package)

assertSecureDeliveryPackageMatchesAssignment(pkg, assignment)

if (assignment.practiceType === PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD) {
  const computed = fingerprintChordBoardVoicingSync(
    assignment.sourceRef.snapshot,
  )
  if (
    computed !== assignment.sourceRef.voicingFingerprint ||
    computed !== pkg.content.chordBoard.voicingFingerprint
  ) {
    throw new Error('prepared chord voicing fingerprint mismatch.')
  }
}

const fingerprint = fingerprintSecureDeliveryPackage(pkg)
~~~

Remove unconditional sourceRef.revisionId assumptions from generic paths.

- [ ] **Step 3: Add one variant-aware source identity helper**

~~~js
function assignmentSourceIdentity(assignment) {
  if (assignment.practiceType === PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE) {
    return [
      'SCORE',
      assignment.sourceRef.sourceId,
      assignment.sourceRef.revisionId,
    ].join(':')
  }
  return [
    'CHORD_BOARD',
    assignment.sourceRef.voicingFingerprint,
  ].join(':')
}
~~~

Use this only as a lookup descriptor. Exact acknowledgement still compares full source bindings.

- [ ] **Step 4: Add failing teacher-delivery tests**

Test prepared CHORD_BOARD delivery, replay, COMPLETE -> REPERTOIRE, revoke before/after delivery, grant loss, exact package fingerprint and unchanged SCORE behavior.

- [ ] **Step 5: Generalize teacher delivery validation**

loadPreparedContext() restores secure-delivery package union, validates package/assignment authority, verifies fingerprint and compares variant-aware exact source authority.

- [ ] **Step 6: Add failing student-read union tests**

Owning student may receive the student-safe CHORD_BOARD package from backend; foreign student gets not-found, revoked row disappears, malformed package fails closed, SCORE remains unchanged. This does not modify Student App.

- [ ] **Step 7: Generalize student read to package union**

Replace unconditional StudentPracticePackageV1 validation with restoreSecureDeliveryPackage() + assertSecureDeliveryPackageMatchesAssignment(). Preserve IDOR and revoke-race rereads.

- [ ] **Step 8: Run Task 7 tests**

~~~bash
node --test tests/preparedAssignmentService.test.js tests/teacherSecureDeliveryService.test.js tests/studentDeliveryReadService.test.js tests/inMemorySecureDeliveryStore.test.js tests/studentPracticePackageV1.test.js tests/studentChordBoardPackageV1.test.js
~~~

- [ ] **Step 9: Commit Task 7**

~~~bash
git add backend/delivery/services/preparedAssignmentService.js backend/delivery/services/teacherDeliveryService.js backend/delivery/services/studentDeliveryReadService.js backend/delivery/repositories/inMemorySecureDeliveryStore.js tests/preparedAssignmentService.test.js tests/teacherSecureDeliveryService.test.js tests/studentDeliveryReadService.test.js tests/inMemorySecureDeliveryStore.test.js
git commit -m "feat: deliver chord board assignments securely"
~~~

---

### Task 8: Teacher Akor Ata Controller and Explicit-Mount UI

**Files:**
- Create: src/services/teacherChordBoardAssignmentController.js
- Create: src/teacherChordBoardAssignmentUi.js
- Create: src/teacherChordBoardAssignmentUi.css
- Modify: tests/support/fakeTeacherPoolDom.js
- Create: tests/teacherChordBoardAssignmentController.test.js
- Create: tests/teacherChordBoardAssignmentUi.test.js
- Create: tests/teacherChordBoardAssignmentSecurity.test.js

**Interfaces:**
- createTeacherChordBoardAssignmentController({ catalog, assignmentService, secureDeliveryClient, createChordPackage }).
- getViewModel().
- selectChord(symbol).
- assignAndDeliver(input) -> Promise<{ ok, phase, assignments, message }>.
- Phases: LOCAL_ASSIGNMENT_ONLY, DURABLY_PREPARED, DELIVERED_TO_STUDENT.
- mountTeacherChordBoardAssignmentUi({ root, host, controller }) -> { refresh, destroy }.

- [ ] **Step 1: Add async fake-DOM event helper without changing old behavior**

~~~js
async dispatchEventAsync(event) {
  for (const listener of this.listeners.get(event.type) ?? []) {
    await listener(event)
  }
}
~~~

Run existing teacher UI tests after this edit.

- [ ] **Step 2: Write failing controller phase tests**

~~~js
test('TD-07 reports delivered only after secure delivery acknowledgement', async () => {
  const result = await controller.assignAndDeliver({
    snapshot: amSnapshot(),
    studentIds: ['student-a'],
    commonTeacherNote: '60 BPM',
    teacherNoteOverrides: [],
  })

  assert.equal(result.ok, true)
  assert.equal(result.phase, 'DELIVERED_TO_STUDENT')
  assert.equal(result.message, '1 akor ödevi gönderildi.')
})

test('TD-07 distinguishes durable prepare from failed delivery', async () => {
  fakeClient.failDelivery = true
  const result = await controller.assignAndDeliver(validInput())

  assert.equal(result.ok, false)
  assert.equal(result.phase, 'DURABLY_PREPARED')
  assert.equal(result.message, '1 akor ödevi hazırlandı ancak gönderilemedi.')
  assert.equal(/gönderildi/i.test(result.message), false)
})
~~~

Also test prepare failure -> LOCAL_ASSIGNMENT_ONLY, exact acknowledgement IDs/count, malformed catalog hash and bounded provider-error copy.

- [ ] **Step 3: Implement controller orchestration**

Controller sequence:
1. recompute browser SHA-256 and compare with selected catalog snapshot;
2. create/reuse local recipient assignments;
3. build StudentChordBoardPackageV1 for each;
4. call secureDeliveryClient.prepareAssignments(items);
5. validate exact prepared acknowledgement;
6. call secureDeliveryClient.deliverAssignments(ids);
7. validate exact delivery acknowledgement;
8. return phase-specific bounded copy.

- [ ] **Step 4: Write failing UI tests**

UI must show:
- Akor Ata heading;
- chord selector;
- exact voicing choices;
- six-string preview using exact snapshot fields;
- active students by stable studentId;
- common and per-student notes;
- Öğrenciye Ata submit;
- bounded status;
- no provider UID/token/evidence IDs.

~~~js
test('TD-07 UI previews exact Am position and submits stable student IDs', async () => {
  const { host, fake } = mountChordUi()
  const chordSelect = host.querySelector('select[name="chordSymbol"]')
  chordSelect.value = 'Am'
  await chordSelect.dispatchEventAsync({ type: 'change' })

  const positions = host.querySelectorAll('input[name="voicingFingerprint"]')
  positions[0].checked = true
  await positions[0].dispatchEventAsync({ type: 'change' })

  assert.deepEqual(
    host.querySelectorAll('[data-chord-string]')
      .map((node) => Number(node.dataset.fret)),
    [-1, 0, 2, 2, 1, 0],
  )

  const student = host.querySelector('input[name="selectedStudentIds"]')
  student.checked = true
  await host.querySelector('form').dispatchEventAsync({
    type: 'submit',
    preventDefault() {},
  })

  assert.deepEqual(fake.calls[0].studentIds, ['student-a'])
})
~~~

- [ ] **Step 5: Implement UI without re-deriving voicing**

Do not use chord symbol to calculate fret positions. Render the preview directly from selected snapshot.voicing. Use textContent for symbol/shape and DOM attributes for bounded numeric fret/finger data.

- [ ] **Step 6: Add source security/non-wiring tests**

Assert:
- no st-guitar-chord-board write/import path;
- no st-student-app path;
- no localStorage/sessionStorage assignment authority;
- no Firebase Admin in browser modules;
- no raw Authorization handling;
- no automatic mount/import from main.js, src/app.js, src/appShell.js;
- no durable voicingIndex in assignment/source/package modules.

- [ ] **Step 7: Run Task 8 tests**

~~~bash
node --test tests/teacherChordBoardAssignmentController.test.js tests/teacherChordBoardAssignmentUi.test.js tests/teacherChordBoardAssignmentSecurity.test.js tests/teacherScoreAssignmentUi.test.js tests/teacherPoolPublishingUi.test.js tests/teacherAssignmentLifecycleUi.test.js
~~~

- [ ] **Step 8: Commit Task 8**

~~~bash
git add src/services/teacherChordBoardAssignmentController.js src/teacherChordBoardAssignmentUi.js src/teacherChordBoardAssignmentUi.css tests/support/fakeTeacherPoolDom.js tests/teacherChordBoardAssignmentController.test.js tests/teacherChordBoardAssignmentUi.test.js tests/teacherChordBoardAssignmentSecurity.test.js
git commit -m "feat: add teacher Akor Ata workflow"
~~~

---

### Task 9: Firestore Emulator Exact Round-Trip and Atomic CHORD_BOARD Delivery

**Files:**
- Modify: backend/delivery/firebase/firestoreSecureDeliveryStore.js
- Modify: tests/secureDeliveryFirebaseEmulator.test.js
- Modify only if a new query truly requires it: firestore.indexes.json

**Interfaces:** Existing TD-06 collections and store port remain unchanged.

- [ ] **Step 1: Write failing emulator round-trip tests**

Seed teacher identity/grant with Admin test setup. Prepare two CHORD_BOARD items and assert:
- privateAssignments documents exist;
- practicePackages documents exist;
- frets/fingers/barres reread exactly;
- restored source/package validates;
- package fingerprint equals recomputed fingerprint.

- [ ] **Step 2: Add atomic conflict test**

Use fresh IDs and a two-item prepare where item 2 conflicts. After rejection, item 1 must not exist.

~~~js
await assert.rejects(
  preparedService.prepareBatch({
    providerSubject: teacherUid,
    items: [validChordItemA(), conflictingChordItemB()],
  }),
  /conflict|mismatch/i,
)

assert.equal(
  await rawDocExists('privateAssignments/assignment-chord-a'),
  false,
)
~~~

- [ ] **Step 3: Add delivery/lifecycle/revoke tests**

Prove all-or-nothing 2-item delivery, exact replay, COMPLETE -> REPERTOIRE, revoke transaction, foreign teacher rejection, own-student read and unchanged SCORE emulator coverage.

- [ ] **Step 4: Generalize Firestore serialization assumptions**

Any Firestore code that directly requires sourceRef.revisionId or SCORE-only package validation must call the source/package union helpers. Keep Firestore Rules unchanged: direct clients remain denied.

- [ ] **Step 5: Run emulator suite**

~~~bash
npm run test:td06:emulator
~~~

Expected: PASS.

- [ ] **Step 6: Commit Task 9**

~~~bash
git add backend/delivery/firebase/firestoreSecureDeliveryStore.js tests/secureDeliveryFirebaseEmulator.test.js
git commit -m "test: verify chord delivery in Firebase emulator"
~~~

If a proven new index is required, add firestore.indexes.json to the same commit. Do not deploy it.

---

## HUMAN GATE B REMAINS CLOSED — Production activation

TD-07 code/test completion does not authorize:
- Firebase cloud project creation/selection;
- production Auth provider enablement;
- production Firestore creation/modification;
- Firestore Rules/index deployment;
- Firebase Admin credentials;
- billing/payment method;
- production environment variables;
- real identity mappings/grants;
- production Secure Delivery flags;
- backend deployment;
- production auto-mount of Akor Ata;
- st-guitar-chord-board modification;
- st-student-app modification;
- merge.

Each production/cross-repository action needs separate explicit human approval.

---

### Task 10: Documentation, Full Regression and Merge-Ready Evidence

**Files:**
- Create: docs/teacher-delivery-td07-chord-board-assignment.md
- Modify product code only by returning to the owning TDD task if verification finds a defect.

**Interfaces:** Evidence/documentation only.

- [ ] **Step 1: Write runtime and contract documentation**

Document pinned repo/commit, catalog generation, six-string ordering, source binding, PrivateAssignment union, StudentChordBoardPackageV1, teacher phases, lifecycle/revoke, explicit-mount status and still-closed Student App/production gates.

Include the catalog refresh command:

~~~bash
CHORD_BOARD_SOURCE_DIR=/path/to/read-only/st-guitar-chord-board-at-6f8b869c32e9c2c5045449f79f4a686c0a67bb6d node scripts/generateChordBoardCatalogSnapshot.mjs
~~~

- [ ] **Step 2: Run TD-04–TD-07 focused tests**

~~~bash
node --test   tests/privateAssignment.test.js   tests/teacherDeliveryContracts.test.js   tests/teacherDeliveryWireCodec.test.js   tests/teacherRosterRepository.test.js   tests/teacherRosterService.test.js   tests/teacherScoreAssignmentRepository.test.js   tests/teacherScoreAssignmentService.test.js   tests/teacherScoreAssignmentController.test.js   tests/teacherScoreAssignmentUi.test.js   tests/teacherScoreAssignmentSecurity.test.js   tests/assignmentLifecycleRecord.test.js   tests/teacherAssignmentLifecycleRepository.test.js   tests/teacherAssignmentLifecycleService.test.js   tests/teacherAssignmentLifecycleController.test.js   tests/teacherAssignmentLifecycleControllerAuthority.test.js   tests/teacherAssignmentLifecycleUi.test.js   tests/teacherAssignmentLifecycleSecurity.test.js   tests/studentPracticePackageV1.test.js   tests/secureDeliveryContracts.test.js   tests/secureDeliveryAuthorization.test.js   tests/inMemorySecureDeliveryStore.test.js   tests/preparedAssignmentService.test.js   tests/teacherSecureDeliveryService.test.js   tests/studentDeliveryReadService.test.js   tests/secureDeliveryHttp.test.js   tests/secureDeliveryApiClient.test.js   tests/secureDeliverySecurity.test.js   tests/chordBoardVoicingCanonical.test.js   tests/chordBoardCatalog.test.js   tests/chordBoardAssignmentSourceBinding.test.js   tests/teacherChordBoardAssignmentRepository.test.js   tests/teacherChordBoardAssignmentService.test.js   tests/studentChordBoardPackageV1.test.js   tests/secureDeliveryPackage.test.js   tests/teacherChordBoardAssignmentController.test.js   tests/teacherChordBoardAssignmentUi.test.js   tests/teacherChordBoardAssignmentSecurity.test.js
~~~

Expected: PASS.

- [ ] **Step 3: Run Firebase emulator suite**

~~~bash
npm run test:td06:emulator
~~~

Expected: PASS with demo project only and no cloud credentials.

- [ ] **Step 4: Run full repository suite**

~~~bash
npm test
~~~

Expected: all tests PASS.

- [ ] **Step 5: Build**

~~~bash
npm run build
~~~

Expected: PASS; no Node-only crypto module in browser bundle.

- [ ] **Step 6: Run current protected browser checks**

Read .github/workflows/ci.yml on the execution head and run every protected browser verification command exactly as CI defines it.

- [ ] **Step 7: Run current regression-quality Playwright/Sonar checks**

Use current .github/workflows/regression-quality.yml commands and require success on the exact implementation head.

- [ ] **Step 8: Verify cross-repository non-change**

Fresh-read st-guitar-chord-board at 6f8b869... and current st-student-app main. Confirm the TD-07 implementation PR contains only seslitab-guitar-reader changes.

- [ ] **Step 9: Final security/semantic review**

Inspect exact branch diff for:
- voicingIndex used as durable authority;
- chord symbol used to reconstruct assigned voicing;
- mutable catalog row used as assignment authority;
- raw token/provider UID exposure;
- student-facing Chord Board teacher controls;
- production Firebase configuration;
- partial batch success;
- SCORE-only revisionId assumptions in generic delivery paths;
- PREPARED reported as DELIVERED;
- browser import of node:crypto.

- [ ] **Step 10: Record exact-head evidence**

Append implementation head SHA, focused/full test counts, emulator/build/browser/Playwright/Sonar results, st-guitar unchanged, Student App unchanged and Human Gate B closed.

- [ ] **Step 11: Commit verification documentation**

~~~bash
git add docs/teacher-delivery-td07-chord-board-assignment.md
git commit -m "docs: record TD-07 chord assignment verification"
~~~

- [ ] **Step 12: Stop for explicit merge approval**

Do not merge, deploy, enable production flags, modify Chord Board, or start Student App integration without explicit human approval.

---

## Plan Self-Review Result

- **Spec coverage:** exact snapshot, pinned catalog, recipient binding, CHORD_BOARD PrivateAssignment, teacher producer/UI, lifecycle, package union, TD-06 prepare/deliver/read, persistence, security, update process, non-goals and completion criteria map to Tasks 1–10.
- **Subsystem decomposition:** catalog/contract, assignment producer, package/delivery and teacher UI are tightly coupled by exact source identity and remain one implementation plan with reviewable task gates.
- **SCORE compatibility:** SCORE source/package schemas are not repurposed; new logic is variant-aware and existing SCORE regression suites remain mandatory.
- **Fingerprint consistency:** browser and backend SHA-256 use one canonical musical-content JSON producer; provenance is outside the voicing hash, catalog hashing is explicitly non-circular, and backend recomputes voicing SHA-256 before durable preparation.
- **Replay/collision safety:** fingerprint alone is insufficient for exact replay; canonical snapshot equality is also required.
- **Runtime boundary:** SesliTab contains the teacher Akor Ata module, but production auto-mount remains closed until teacher auth/roster activation is separately approved.
- **Cross-repository boundary:** st-guitar-chord-board and st-student-app remain untouched.
- **Placeholder scan:** no unresolved placeholder markers or generic unspecified implementation steps remain.
- **Type consistency:** sourceKind chord_board_exact_voicing, practiceType CHORD_BOARD and packageType CHORD_BOARD are consistent across tasks.
- **Review Focus:** all five high-risk conditions have owning-task tests.
