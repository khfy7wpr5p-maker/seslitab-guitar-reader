# TD-05 — Assignment Lifecycle and Revoke

## Boundary

TD-05 manages teacher-owned lifecycle state for prepared SCORE `PrivateAssignment` records.

It does not deliver assignments to Student App and does not change Package 12 or Stage L delivery semantics.

The invariant remains:

`READY_EXACT_REVISION != DELIVERED_TO_STUDENT`

## Model

`PrivateAssignment v1` remains immutable and continues to represent only the originally prepared SCORE assignment:

- one stable `studentId`;
- `state = ACTIVE`;
- `revokedAt = null`;
- exact immutable SCORE `sourceRef`.

TD-05 adds an orthogonal immutable `AssignmentLifecycleRecord`.

A prepared TD-04 assignment with no TD-05 overlay has effective lifecycle state:

- `ACTIVE`;
- unrevoked.

The first real lifecycle mutation materializes the overlay.

## Lifecycle

Forward lifecycle transitions are:

`ACTIVE -> COMPLETED -> REPERTOIRE`

No reverse or skipped transition is allowed.

Revocation is orthogonal to lifecycle state and may occur from:

- ACTIVE;
- COMPLETED;
- REPERTOIRE.

Revocation is one-way. A revoked assignment cannot transition further.

No hard delete, restore, or unrevoke surface is provided.

## Idempotency

A repeated request for the assignment's current lifecycle state returns the existing record without:

- adding a new history entry;
- generating a new timestamp.

A repeated revoke returns the existing revoked record and preserves the original `revokedAt`.

## Repository truth

The TD-04 SCORE assignment repository remains authority for:

- original assignment identity;
- stable student identity;
- exact SCORE `sourceRef`.

The TD-05 lifecycle repository owns:

- current lifecycle overlay;
- immutable transition/revoke history.

The in-memory lifecycle repository is provider-neutral reference infrastructure only. Production persistence remains TD-06 scope.

Teacher success requires exact lifecycle acknowledgement revalidation, including:

- exact original assignment object;
- exact student/source identity;
- expected lifecycle state;
- expected state-change timestamp;
- expected revoke state/timestamp.

Malformed, mutable, duplicated, substituted, or mismatched authority fails closed.

## Teacher service

`createTeacherAssignmentLifecycleService(...)` provides:

- `listAssignments()`;
- `markCompleted(assignmentId)`;
- `moveToRepertoire(assignmentId)`;
- `revokeAssignment(assignmentId)`;
- `getAssignmentHistory(assignmentId)`.

Before point mutation, the service validates the complete TD-04 assignment snapshot so a custom adapter cannot hide duplicate or substituted assignment authority.

Missing lifecycle overlay is presented as an immutable effective ACTIVE record without mutating the lifecycle repository.

## Teacher controller

The controller exposes bounded presentation data only:

- internal action `assignmentId`;
- display name/nickname;
- teacher note;
- lifecycle state;
- revoked flag.

It does not expose SCORE source, revision, authorization, evidence, provider, token, or recipient-list diagnostics to normal teacher UI.

If roster presentation is missing, lifecycle management remains available with the bounded label `Öğrenci`; raw stable identity is not substituted into visible copy.

## UI boundary

The explicit-mount teacher UI is **Ödev Yönetimi**.

Actions are state-scoped:

- ACTIVE → **Tamamlandı**;
- COMPLETED → **Repertuara Ekle**;
- any non-revoked state → **Geri Çek**.

Revoked rows expose no mutation action.

The assignment ID is used only as internal action identity and is not shown as visible teacher text.

The UI never claims:

- Gönderildi;
- Teslim edildi;
- Öğrenciye gönderildi;
- Öğrenci aldı.

The TD-05 UI is not mounted from `main.js`, `src/app.js`, or `src/appShell.js`.

## Security and scope

TD-05 contains no:

- Firebase / Firestore / Admin implementation;
- authentication provider;
- browser persistence;
- network delivery;
- Student App write;
- student lifecycle mutation authority;
- cross-repository write;
- migration or security-rule change;
- credential/service-account work;
- CHORD_BOARD producer.

## TD-04 compatibility

TD-05 leaves the TD-04 SCORE producer contract unchanged.

The original exact-assignment duplicate identity remains:

`studentId + SCORE + sourceId + revisionId`

Lifecycle completion, repertoire, or revoke does not erase that original assignment from duplicate history.

A later corrected SCORE revision remains a distinct exact assignment source; lifecycle actions never move an old assignment to a newer revision.

## Deferred

### TD-06 — Secure Persistence and Delivery

TD-06 owns:

- production persistence;
- authenticated teacher/student authority;
- student-scoped read model;
- revoke visibility to Student App;
- durable atomic writes;
- migrations/indexes/security rules;
- production composition and delivery acknowledgement.

### TD-07 — Chord Board Assignment

TD-07 owns:

- exact immutable Chord Board voicing snapshot;
- `CHORD_BOARD` source contract;
- Chord Board assignment producer.

## Verification

Exact-head implementation verification evidence follows.


## Exact-head verification record

Implementation head verified before this documentation-only record:

`4aef103db8be17a2789e0da3a5ab9d832527dc9c`

Evidence on that implementation head:

- full Node test suite: 1875 tests, 1875 passed, 0 failed;
- production build: PASS;
- S14 protected real-browser checks: PASS;
- STI-17 protected real-browser checks: PASS;
- PR-C / PR-D / PR-E / PR-F protected browser checks: PASS;
- Playwright protected baseline: PASS;
- SonarQube Cloud analysis: PASS;
- base SHA: `33a6df9424c917e18fda8f67a77acca3d80accb1`;
- base drift at verification: 0 commits behind main;
- no changes to TD-04 `PrivateAssignment v1`, SCORE source binding, Stage L, Package 12, production entry points, Student App, or provider configuration.

A final documentation-only commit records this evidence. Its own CI must also pass before merge readiness is claimed.
