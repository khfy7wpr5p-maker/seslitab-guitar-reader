# TD-04 — SCORE Private Assignment Design

**Status:** written design specification; no product implementation authorized by this document alone.

**Repository:** `khfy7wpr5p-maker/seslitab-guitar-reader`

**Base:** `main` at `be81fde6fc3cf558156b9e572943f5aac6a330a0`

## 1. Purpose

TD-04 adds the teacher-side producer boundary for preparing one SCORE assignment per selected student from one exact, currently approved and currently ready teacher revision.

The teacher experiences one batch action:

1. select the SCORE work;
2. select one or more active students;
3. enter one common teacher note;
4. optionally override that note for individual students;
5. choose **Ödevi Hazırla**;
6. receive success only if every selected student passes preflight and the repository acknowledges the complete batch.

The domain result is not one multi-recipient assignment. It is N independent immutable `PrivateAssignment` records, one for each selected stable `studentId`.

TD-04 prepares teacher-owned assignment records only. It does not deliver them to Student App and does not claim that a student has received anything.

## 2. Existing authority reused unchanged

TD-04 builds on existing merged contracts and does not redefine them:

- `StudentRosterEntry v1` and TD-02 roster service;
- `ScoreAssignmentSourceBinding v1`;
- `PrivateAssignment v1`;
- Package 12 / Stage L readiness;
- teacher revision and exact approval contracts.

The following invariant remains unchanged:

`READY_EXACT_REVISION != DELIVERED_TO_STUDENT`

Stage L remains:

- `deliveryState = "not_implemented"`;
- `deliveryAllowed = false`.

TD-04 must not widen Stage L into a delivery system.

## 3. Core assignment model

A multi-student teacher action fans out to independent assignments:

```text
selected stable studentIds
→ one coherent TD-02 active-roster preflight
→ exact SCORE source binding per student
→ duplicate preflight per student + exact revision
→ deterministic batch of PrivateAssignment records
→ one atomic repository createBatch acknowledgement
```

For three selected students:

```text
student-a → ScoreAssignmentSourceBinding-a → PrivateAssignment-a
student-b → ScoreAssignmentSourceBinding-b → PrivateAssignment-b
student-c → ScoreAssignmentSourceBinding-c → PrivateAssignment-c
```

There is no private recipient array and no shared assignment record.

This preserves the existing TD-01 privacy rule: one student's assignment identity, note, and lifecycle state cannot become another student's data.

## 4. Teacher note model

TD-04 supports the approved combined note model:

- `commonTeacherNote` is the default for every selected student;
- a selected student may have one explicit override;
- when an override entry exists, its note replaces the common note for that student;
- an explicit empty override is valid and means that student's assignment has no teacher note;
- no override entry means use the common note.

Producer input uses stable IDs, not display names:

```js
{
  studentIds: [
    'student-a',
    'student-b',
    'student-c',
  ],
  commonTeacherNote: '1–8. ölçüleri yavaş çalış.',
  teacherNoteOverrides: [
    {
      studentId: 'student-b',
      teacherNote: 'Metronom 60 BPM ile çalış.',
    },
  ],
}
```

Result:

- student-a → common note;
- student-b → override note;
- student-c → common note.

Override rules:

- every override `studentId` must be in the selected student set;
- duplicate override rows fail closed;
- display name/nickname is never accepted as an override key;
- teacher-note length remains governed by the existing `PrivateAssignment` contract.

## 5. Stable target preflight

The service calls TD-02 `preflightActiveStudentIds(studentIds)` once for the batch.

That preflight owns:

- ID normalization;
- first-selection-order deduplication;
- unknown-student rejection;
- inactive-student rejection;
- coherent roster snapshot validation.

No assignment ID, SCORE binding, or repository write occurs before roster preflight succeeds.

The normalized student order returned by TD-02 becomes the deterministic fan-out order.

## 6. Exact SCORE readiness per student

Every selected student receives a fresh `ScoreAssignmentSourceBinding`.

For each normalized stable `studentId`, TD-04 invokes the existing SCORE source-binding path with:

- the exact supplied teacher workspace;
- the exact source NoteObject array;
- that student's stable ID;
- caller-supplied/generated authorization evidence identity;
- root quality evidence identity;
- revalidation evidence identity;
- the batch action timestamp.

The source-binding contract already requires:

- current teacher revision;
- currently applicable exact approval;
- live applicable Package 12 / Stage L readiness;
- `READY_EXACT_REVISION`;
- exact recipient binding;
- no delivery permission.

TD-04 must not reuse a readiness result shown earlier in the UI.

A binding prepared for student A cannot be copied to student B.

A later correction or undo does not mutate an already prepared assignment. A new current revision requires a new approval/readiness pass and a new teacher preparation action.

## 7. Duplicate assignment rule

TD-04 prevents accidental duplicate preparation for the same student and the same exact SCORE revision.

The logical duplicate key is:

```text
studentId
+ practiceType = SCORE
+ sourceRef.sourceId
+ sourceRef.revisionId
```

Teacher note, approval ID, authorization ID, and timestamps are not part of duplicate identity.

Therefore:

- same student + same exact source/revision → duplicate, reject;
- same student + newer revision → allowed;
- different student + same revision → allowed;
- same revision ID under a different source ID → treated as a different source.

Duplicate checking happens after exact source bindings have been created for all selected students and before batch creation.

If any selected target is already assigned to that exact source revision, the whole action fails before repository write.

## 8. All-or-nothing batch semantics

TD-04 uses an atomic batch repository port.

Required repository interface:

```text
list()
getByAssignmentId(assignmentId)
findExactScoreAssignment({
  studentId,
  sourceId,
  revisionId,
})
createBatch(assignments)
```

The in-memory TD-04 reference repository must make `createBatch(assignments)` atomic:

1. validate the full proposed batch;
2. reject malformed records;
3. reject duplicate assignment IDs;
4. reject duplicate exact SCORE assignment keys against existing records;
5. reject duplicate exact SCORE assignment keys inside the proposed batch;
6. only after all checks pass, append all records;
7. return one immutable acknowledgement containing the exact created records in deterministic order.

No partial append is allowed.

A production persistence adapter is not chosen in TD-04. TD-06 will own authenticated persistence/delivery. Any later provider that cannot honor the required atomic producer contract needs a separately approved policy; TD-04 must not silently degrade to partial writes.

## 9. Acknowledgement gate

The service must not treat `repository.createBatch(...)` as successful merely because the call returned.

It revalidates the acknowledgement.

A valid acknowledgement must:

- contain exactly N records;
- preserve deterministic selected-student order;
- contain valid immutable `PrivateAssignment` records;
- contain the expected assignment IDs;
- preserve exact `studentId`;
- preserve exact teacher note chosen for each student;
- preserve `practiceType = SCORE`;
- preserve `state = ACTIVE`;
- preserve `revokedAt = null`;
- preserve exact source binding semantics;
- contain no unexpected or substituted recipient.

Missing, reordered, substituted, forged, or mutable acknowledgement data fails closed.

Teacher-facing success exists only after this acknowledgement gate passes.

## 10. Assignment identity and time generation

TD-04 does not invent hidden nondeterministic authority inside domain objects.

The producer receives explicit dependencies for:

- assignment ID generation;
- per-student authorization/evidence IDs needed by `ScoreAssignmentSourceBinding`;
- current action timestamp.

The batch action obtains one normalized action timestamp and uses it consistently for the assignments/source-binding action unless the existing source contract requires a separately identified value.

Every generated ID is validated before repository write.

The implementation plan must require tests proving ID/time factories are not silently retried after malformed output.

## 11. Service boundary

The proposed provider-neutral service is responsible for orchestration only.

Conceptual API:

```text
createTeacherScoreAssignmentService({
  repository,
  rosterService,
  createAssignmentId,
  createReadinessIds,
  now,
})

prepareScoreAssignments({
  workspace,
  sourceNotes,
  studentIds,
  commonTeacherNote,
  teacherNoteOverrides,
})
```

The service performs, in order:

1. strict input validation;
2. one coherent roster preflight;
3. strict override validation;
4. one fresh exact SCORE source binding per student;
5. duplicate exact-source preflight;
6. assignment ID/time validation;
7. `PrivateAssignment` creation per student;
8. one atomic `createBatch`;
9. exact acknowledgement validation;
10. return frozen acknowledged assignment records.

The service exposes no Firebase, network, authentication, Student App, delete, lifecycle transition, revoke, or Chord Board behavior.

## 12. Controller boundary

The teacher controller translates domain outcomes into bounded presentation results.

Conceptual actions:

```text
getViewModel()
prepareScoreAssignments(input)
```

The view model exposes:

- active students for selection;
- stable `studentId`;
- presentation-only display name/nickname;
- no raw provider/debug data.

Success example:

```js
{
  ok: true,
  message: '3 ödev hazırlandı.',
  assignments: [/* acknowledged records */],
}
```

Failure examples:

- `Seçilen öğrencilerden biri aktif değil.`
- `Seçilen öğrencilerden biri bulunamadı.`
- `Eser bu öğrenci için ödeve hazır değil.`
- `Bu öğrenci için aynı ödev zaten hazırlanmış.`
- `Ödev işlemi doğrulanamadı.`
- fallback: `Ödevler hazırlanamadı.`

Raw exception text, revision IDs, authorization IDs, provider names, tokens, stack traces, and other internal diagnostics are never returned to normal teacher UI.

## 13. Explicit-mount UI boundary

TD-04 may provide a small explicitly mounted teacher UI module, following the TD-03 isolation pattern.

The visible flow is:

1. **Öğrenciler** — active-student multi-select;
2. **Ortak not** — optional common note;
3. each selected row may reveal **Öğrenciye özel not**;
4. **Ödevi Hazırla** action;
5. bounded result message.

The UI must use stable IDs as action values and display name/nickname only as labels.

The UI must not say:

- `Gönderildi`;
- `Öğrenciye teslim edildi`;
- or equivalent delivery language.

TD-04 prepares assignments but does not deliver them.

The module is not auto-mounted from `main.js` or App Shell. Authenticated production composition remains deferred to TD-06.

## 14. No partial-success presentation

If five students are selected and one fails any preflight, duplicate check, exact readiness check, or acknowledgement check:

- no new assignment is committed;
- the controller does not report `4 ödev hazırlandı`;
- no student list of successful partial recipients is exposed as final success.

The teacher corrects the issue and retries the batch.

This is intentionally stricter than a future external provider that may expose partial outcomes. Such a provider policy belongs to a later approved delivery design, not TD-04.

## 15. Privacy and security boundaries

TD-04 must preserve:

- one student per `PrivateAssignment`;
- no recipient-list field on private assignments;
- stable IDs are authority, names are presentation;
- one student's teacher note is never copied to another except via the explicitly chosen common-note default;
- no student-facing read path;
- no student can create/update/revoke an assignment;
- no raw revision/evidence/provider diagnostics in UI;
- no credentials, tokens, URLs, or account payloads;
- no Firebase/Admin SDK;
- no Firestore/database implementation;
- no browser persistence;
- no network delivery endpoint;
- no cross-repository write.

## 16. Explicitly deferred

### TD-05 — Assignment Lifecycle

TD-05 owns:

- `ACTIVE → COMPLETED → REPERTOIRE`;
- teacher lifecycle transitions;
- assignment revoke/tombstone behavior;
- lifecycle management views.

TD-04 creates only initial `ACTIVE`, `revokedAt = null` assignments.

### TD-06 — Secure Persistence and Delivery

TD-06 owns:

- production persistence provider;
- authenticated teacher authority;
- authenticated student visibility;
- secure Student App read delivery;
- production UI composition;
- provider atomicity/security rules;
- migrations and deployment.

### TD-07 — Chord Board Assignment

TD-07 owns:

- immutable Chord Board voicing snapshot;
- `CHORD_BOARD` source contract;
- Chord Board assignment producer.

TD-04 is SCORE-only.

## 17. Files that TD-04 is expected to reuse

Without changing semantics:

- `src/services/studentRosterEntry.js`;
- `src/services/teacherRosterRepository.js`;
- `src/services/teacherRosterService.js`;
- `src/services/scoreAssignmentSourceBinding.js`;
- `src/services/privateAssignment.js`;
- `src/services/teacherDeliveryContractValidation.js`;
- existing teacher workspace / Package 12 / Stage L dependencies transitively used by SCORE source binding.

The implementation plan should prefer new TD-04 orchestration files over widening these contracts.

## 18. Files and authority TD-04 must not change

Unless a separately demonstrated compatibility defect receives new human approval:

- `main.js`;
- `src/app.js`;
- `src/appShell.js`;
- Stage L delivery semantics;
- Package 12 eligibility semantics;
- `PrivateAssignment v1` field set/state machine;
- `ScoreAssignmentSourceBinding v1` field set;
- production backend/provider configuration;
- Firebase/Auth/security rules;
- Student App repository;
- TD-03 Pool domain.

## 19. Required verification matrix

The TD-04 implementation plan must include RED→GREEN tests proving at minimum:

### Fan-out
- one selected active student → one assignment;
- three selected active students → three independent assignments;
- deterministic first-selection order;
- duplicate selected IDs do not produce duplicate assignments.

### Notes
- common note is copied to students without overrides;
- one student's override replaces only that student's common note;
- explicit empty override removes the common note only for that student;
- duplicate/unselected override target fails closed.

### Roster and readiness
- unknown target → zero writes;
- inactive target → zero writes;
- one non-ready SCORE target → zero writes;
- exact readiness is evaluated separately for each stable student ID;
- stale UI readiness cannot substitute action-time source binding.

### Exact-source duplicate protection
- same student + same source + same revision → whole batch rejected;
- same student + new revision → allowed;
- different students + same revision → allowed.

### Atomic repository
- malformed one record → zero appended records;
- duplicate assignment ID → zero appended records;
- duplicate exact-source key inside batch → zero appended records;
- custom repository partial/substituted acknowledgement → service failure, no success message.

### Security/presentation
- controller never leaks raw technical error;
- UI uses stable IDs, not names, as targets;
- UI says `Ödevi Hazırla`, not delivery success;
- no production auto-mount;
- no Firebase/network/browser persistence;
- no Student App/SCORE payload delivery;
- no Stage L delivery-state change.

### Regression
- existing TD-01 contracts remain green;
- TD-02 roster tests remain green;
- TD-03 Pool tests remain green;
- full repository tests/build/browser protected baseline/quality checks remain green.

## 20. Human gates

This written spec requires human review before an implementation plan is written.

After spec approval:

1. create a detailed TD-04 implementation plan with `superpowers:writing-plans`;
2. stop for human plan review;
3. only after plan approval choose Native or Subagent-driven execution;
4. implement with TDD;
5. stop before merge;
6. merge only with explicit human approval.

No TD-05 work is implied by TD-04 approval.
