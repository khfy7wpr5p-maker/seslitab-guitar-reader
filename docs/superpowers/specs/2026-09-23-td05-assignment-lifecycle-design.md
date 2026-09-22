# TD-05 — Assignment Lifecycle and Revoke Design

**Status:** written specification awaiting human review before implementation planning.

**Repository:** khfy7wpr5p-maker/seslitab-guitar-reader

**Fresh-read baseline:** main at 33a6df9424c917e18fda8f67a77acca3d80accb1

## 1. Purpose

TD-05 adds teacher-owned lifecycle management for already prepared SCORE PrivateAssignment records.

TD-04 creates immutable assignment records in their initial form: one stable studentId per assignment, practiceType SCORE, state ACTIVE, revokedAt null, an exact immutable SCORE sourceRef, and no Student App delivery.

TD-05 lets the teacher list and manage those records, mark ACTIVE as Tamamlandı, move COMPLETED to Repertuara Ekle, and Geri Çek an assignment while preserving immutable audit history.

The core invariant remains:

READY_EXACT_REVISION != DELIVERED_TO_STUDENT

## 2. Existing authority reused unchanged

TD-05 reuses PrivateAssignment v1, ScoreAssignmentSourceBinding v1, the TD-04 SCORE assignment repository/source truth, TD-02 stable roster identity, Package 12 / Stage L readiness, and teacher revision/approval authority.

Fresh-read confirms that current isPrivateAssignment() deliberately accepts only the original prepared SCORE form: ACTIVE, revokedAt null, strict frozen record, exact SCORE source binding.

TD-04 repository acknowledgement depends on that contract. TD-05 therefore must not silently widen isPrivateAssignment() to accept completed, repertoire, or revoked variants.

## 3. Chosen architecture

TD-05 keeps the original PrivateAssignment immutable and introduces a separate lifecycle authority.

Conceptually:

PrivateAssignment v1
→ immutable assignment identity + exact SCORE source

AssignmentLifecycleRecord
→ current teacher-owned state + revoke tombstone + immutable history

The original assignment remains source of truth for assignmentId, studentId, practiceType, teacherNote, assignedAt and exact sourceRef.

The lifecycle overlay becomes source of truth for current teacher-managed state, revocation and lifecycle history.

## 4. Why the original assignment is not mutated

Directly evolving PrivateAssignment would require widening its validator, changing TD-04 repository validation, changing TD-04 exact acknowledgement checks, and weakening existing tests proving that callers cannot pre-mark assignments completed, repertoire, or revoked.

The overlay preserves a stronger invariant: a teacher lifecycle action changes management state, never the exact assignment source.

No lifecycle operation may alter or replace sourceRef.

## 5. Lifecycle state machine

The existing state machine remains authoritative:

ACTIVE → COMPLETED → REPERTOIRE

Allowed forward transitions:
- ACTIVE → COMPLETED
- COMPLETED → REPERTOIRE

Rejected transitions include:
- ACTIVE → REPERTOIRE
- COMPLETED → ACTIVE
- REPERTOIRE → COMPLETED
- REPERTOIRE → ACTIVE

No reverse transition is introduced.

## 6. Missing-overlay compatibility

Existing TD-04 assignments do not yet have TD-05 lifecycle overlays.

If a valid original SCORE PrivateAssignment exists and no lifecycle record exists, its effective management state is ACTIVE and unrevoked.

TD-05 must not require migration of all existing prepared assignments merely to list them. The first real TD-05 mutation materializes lifecycle authority.

## 7. Lifecycle record contract

A v1 lifecycle record must contain enough strict authority to prove exact identity and history, including:
- schema version
- exact assignmentId
- exact stable studentId
- exact original PrivateAssignment reference
- current lifecycle state
- revokedAt or null
- transition timestamp
- immutable prior/history lineage or repository-maintained immutable history

The record must be frozen and strictly validated.

It is invalid if it references a malformed or non-SCORE initial assignment, substitutes assignmentId/studentId/sourceRef, uses an unsupported state/timestamp, or contains unsupported authority fields.

## 8. Revoke model

Revocation is orthogonal to ACTIVE / COMPLETED / REPERTOIRE.

A teacher may revoke an assignment from any non-revoked lifecycle state.

Revocation:
- preserves the current lifecycle state
- sets a one-way revoke tombstone
- preserves the original assignment
- creates an immutable auditable result
- exposes no restore/unrevoke action in TD-05

Once revoked, no further lifecycle transition is allowed.

TD-06 later decides authenticated student visibility for revoked assignments. TD-05 does not implement that read model.

## 9. Idempotency

Duplicate clicks/retries must be safe.

If the assignment is already in the exact requested state, the transition is an idempotent replay: return the current valid lifecycle acknowledgement and do not append another event.

This does not make skipped transitions legal. ACTIVE → REPERTOIRE still fails closed.

Repeated revoke is also idempotent: return the existing revoked record and preserve the original revokedAt. No new revoke timestamp is generated.

## 10. Repository design

TD-05 uses a provider-neutral lifecycle repository port.

Conceptual operations:
- list()
- getByAssignmentId(assignmentId)
- transition({ assignmentId, toState, transitionedAt })
- revoke({ assignmentId, revokedAt })
- history(assignmentId)

The exact API may be refined in the implementation plan, but it must support deterministic listing, exact lookup, immutable current records, immutable history, forward-only state validation, one-way revoke, exact acknowledgements, no hard delete and no restore/unrevoke.

The TD-05 reference implementation remains in memory. Production persistence belongs to TD-06.

## 11. Relationship to TD-04 repository

The TD-04 SCORE assignment repository remains source of truth for original assignments.

TD-05 lifecycle operations must resolve the exact original assignment before mutation.

A caller-supplied clone is never authority merely because assignmentId matches.

The service composes:
- TD-04 assignment repository for original assignment lookup
- TD-05 lifecycle repository for current lifecycle authority

This separates creation/source authority from management authority.

## 12. Exact acknowledgement gate

Teacher success must not be reported merely because a repository method returned.

A transition acknowledgement must prove:
- exact assignmentId
- exact studentId
- exact original assignment/sourceRef
- requested effective state
- expected revoke status
- valid immutable lifecycle record
- no authority substitution

A revoke acknowledgement must prove:
- exact assignment identity
- exact original assignment/source
- unchanged lifecycle state
- valid non-null revokedAt
- repeated revoke preserves the same revoke record/time

Malformed, mutable, substituted or mismatched acknowledgements fail closed.

## 13. Service boundary

Conceptual service:

createTeacherAssignmentLifecycleService({
  assignmentRepository,
  lifecycleRepository,
  now,
})

Operations:
- listAssignments()
- markCompleted(assignmentId)
- moveToRepertoire(assignmentId)
- revokeAssignment(assignmentId)

Responsibilities:
1. validate assignment IDs
2. resolve exact original SCORE assignment
3. resolve current lifecycle state
4. enforce transition/revoke rules
5. obtain a timestamp only for a new mutation
6. call lifecycle repository
7. verify exact acknowledgement
8. return immutable teacher-safe results

The service exposes no Firebase/Admin, Firestore, authentication provider, network delivery, Student App writes, Package 12 readiness mutation, or Chord Board producer behavior.

## 14. Time semantics

Time is dependency-injected.

A new transition or first revoke obtains one normalized action timestamp.

Idempotent replay must not call now() just to generate a discarded timestamp.

Tests must prove:
- one new transition → one timestamp
- first revoke → one timestamp
- repeated same-state transition → no new timestamp
- repeated revoke → no new timestamp

## 15. Teacher controller boundary

The controller translates domain outcomes into short bounded messages.

Suggested success copy:
- Ödev tamamlandı.
- Ödev repertuara eklendi.
- Ödev geri çekildi.

Suggested failure copy:
- Ödev bulunamadı.
- Bu işlem mevcut ödev durumunda yapılamaz.
- Geri çekilmiş ödev değiştirilemez.
- Ödev işlemi doğrulanamadı.
- fallback: Ödev güncellenemedi.

Normal teacher UI must not receive raw revision IDs, evidence IDs, authorization IDs, provider diagnostics, stack traces, tokens or credentials.

## 16. Teacher management UI

TD-05 may provide an explicitly mounted teacher-only management UI.

Before TD-06, it must not claim student delivery.

Preferred visible wording:
- Hazırlanan Ödevler / Ödev Yönetimi
- ACTIVE action: Tamamlandı
- COMPLETED action: Repertuara Ekle
- any non-revoked state: Geri Çek

Revoked rows expose no forward lifecycle action.

Normal UI should show only useful teacher-facing information and avoid raw assignmentId, source/revision/evidence identifiers, provider state, authorization tokens or recipient lists.

The UI is not auto-mounted from main.js or App Shell. Production authenticated composition remains TD-06.

## 17. No delivery semantics

TD-05 manages prepared teacher records only.

It must not use copy such as Gönderildi, Öğrenciye teslim edildi, Öğrenci aldı, or equivalent delivery confirmation.

Stage L remains deliveryState = not_implemented and deliveryAllowed = false.

Lifecycle state is not delivery state.

COMPLETED means teacher-managed lifecycle status only. It does not prove a student received, opened, performed or completed anything.

## 18. Security and privacy boundaries

TD-05 preserves:
- stable studentId as identity authority
- display name/nickname as presentation only
- one student per PrivateAssignment
- no private recipient list
- immutable exact source binding
- teacher-only lifecycle authority
- no student lifecycle writes
- no browser/local persistence provider
- no network backend
- no credentials/tokens
- no cross-repository write
- no production security-rule change

TD-06 defines authenticated teacher/student authorization.

## 19. TD-04 duplicate protection remains unchanged

TD-04 duplicate identity remains:

studentId + SCORE + sourceId + revisionId

TD-05 lifecycle changes do not mutate that identity.

Completed, repertoire or revoked lifecycle state does not erase the original exact assignment from TD-04 duplicate history.

Reassigning the same exact revision after completion/revoke would require a separate explicit product decision; TD-05 does not introduce it implicitly.

## 20. Later score revisions

If the score is corrected or undone after an assignment was prepared:
- the original assignment remains bound to its original exact revision
- the lifecycle record remains attached to that assignment
- lifecycle actions do not move it to a newer revision
- a newer revision follows approval/readiness and may become a distinct later assignment

## 21. TD-06 boundary

TD-06 owns:
- production persistence provider
- authenticated teacher authority
- authenticated student identity mapping
- student-scoped read model
- durable atomic writes
- revoked visibility rules
- migrations/indexes/security rules
- live delivery acknowledgement
- production composition

TD-05 makes no provider choice.

## 22. TD-07 boundary

TD-07 owns exact immutable CHORD_BOARD source snapshots.

TD-05 must not weaken the current fail-closed Chord Board boundary or infer guitar voicing from chord symbols.

## 23. Error handling

The domain fails closed on:
- unknown assignment
- malformed lifecycle record
- source substitution
- student substitution
- illegal skipped/reverse transition
- transition after revoke
- malformed timestamp
- malformed repository acknowledgement
- mutable/forged acknowledgement
- unsupported input fields

Failures must not partially mutate lifecycle history.

## 24. Test strategy

Focused tests must cover at least:

### Lifecycle record
- effective initial ACTIVE
- ACTIVE → COMPLETED
- COMPLETED → REPERTOIRE
- skipped/reverse rejection
- source/identity substitution rejection
- frozen strict record validation
- revoked record validation

### Repository
- deterministic list/current lookup
- immutable history
- transition acknowledgement
- revoke acknowledgement
- repeated same-state idempotency
- repeated revoke idempotency
- no partial mutation on failure
- unknown assignment rejection
- no hard delete/restore surface

### Service
- exact original assignment lookup
- correct state progression
- revoke from ACTIVE / COMPLETED / REPERTOIRE
- transition blocked after revoke
- idempotent retry does not call time factory
- malformed/substituted acknowledgement fails closed
- TD-04 assignment/source unchanged

### Controller/UI
- concise lifecycle messages
- correct actions by state
- revoked rows expose no mutation action
- UI never claims delivery
- no raw internal/provider diagnostics
- explicit mount only

### Regression/security
- PrivateAssignment validator semantics unchanged
- TD-04 still creates ACTIVE + revokedAt null
- TD-04 duplicate behavior unchanged
- Stage L delivery boundary unchanged
- no provider/network/Student App implementation
- no production auto-mount

## 25. Expected implementation isolation

Unless a proven compatibility defect receives separate approval, these remain behaviorally unchanged:
- src/services/privateAssignment.js
- src/services/scoreAssignmentSourceBinding.js
- TD-04 SCORE preparation semantics
- Stage L / Package 12 code
- main.js
- src/app.js
- src/appShell.js
- Student App repository
- production backend/provider configuration

TD-05 should prefer dedicated lifecycle repository/service/controller/UI modules and focused tests.

## 26. Explicitly out of scope

TD-05 does not include:
- Firebase / Firestore / Auth
- production database/provider
- Student App implementation
- student-side completion/repertoire/Ready actions
- live delivery/read receipts
- Package 12 / Stage L semantic changes
- CHORD_BOARD source contract
- cross-repository writes
- production deployment
- security-rule deployment
- schema/index migration
- credentials/service accounts
- billing/resource provisioning
- native rewrite
- unrelated renderer/Smoosic/OMR/Audiveris work

## 27. Implementation-plan constraints

After this specification is approved, the implementation plan must:
1. start from fresh current main in isolation
2. use TDD before production behavior changes
3. preserve TD-04 assignment creation and acknowledgement semantics
4. implement lifecycle authority in isolated modules
5. verify focused TD-05 tests
6. verify TD-01/02/03/04 regressions
7. run full npm test
8. run production build
9. run applicable protected browser/Playwright checks
10. verify SonarQube/SonarCloud where required
11. verify exact PR head and base drift before merge-readiness
12. stop before merge for explicit human approval

## 28. Human gates

This written specification is the current gate.

After human approval of this file:
- write the detailed TD-05 implementation plan
- stop again for plan review and execution-method selection

Implementation must not begin before both gates are complete.

TD-06 and TD-07 must not start in parallel with TD-05.
