# TD-06 — Secure Persistence, Authentication and Student Delivery — Firebase First-Year Design

Date: 2026-09-23  
Repository: `khfy7wpr5p-maker/seslitab-guitar-reader`  
Starting `main` SHA: `16a09c31c94224f537557d7cef499650e5d64a37`  
Path: Architectural  
Provider decision: Firebase for the first production/pilot year

## 1. Purpose

TD-06 introduces production persistence, authenticated teacher/student authority, durable student delivery, revocation visibility, and a bounded student read model for the teacher-delivery system implemented in TD-01 through TD-05.

The first-year production provider is:

- Firebase Authentication for user authentication;
- Cloud Firestore for durable storage;
- Firebase Admin SDK only inside the trusted SesliTab backend;
- the existing Express backend as the host for a new, isolated Secure Delivery subsystem.

Firebase is an adapter choice, not a domain authority. SesliTab stable IDs and domain contracts remain provider-neutral so the provider can be reconsidered after the first year without redefining TD-02 through TD-05.

This stage does not change OMR/Audiveris semantics, Package 12, Stage L readiness, SCORE source binding, or teacher-owned assignment lifecycle rules.

## 2. Existing Contracts Preserved

TD-06 preserves the current repository contracts without redefining them.

### StudentRosterEntry v1

Authority:

- stable `studentId`;
- `displayNameOrNickname` is presentation only;
- `active` controls teacher-side roster availability.

No email, Firebase UID, display name, or nickname becomes the domain authorization key.

### PoolItem v1 and PoolPublicationRecord v1

Pool behavior remains:

- `ALL` contains no recipient student IDs;
- `SELECTED` requires one or more stable student IDs;
- revocation is represented by an orthogonal publication record;
- revoked publication history is retained.

TD-06 may persist and authorize Pool records, but Student App Pool integration remains gated by the Student App's supported contract. TD-06 must not silently convert PoolItem into PracticePackage.

### PrivateAssignment v1

The original TD-04 SCORE assignment remains immutable:

- one `assignmentId`;
- one stable `studentId`;
- `practiceType = SCORE`;
- teacher note;
- `state = ACTIVE`;
- `revokedAt = null`;
- exact immutable SCORE `sourceRef`;
- exact `assignedAt`.

TD-06 does not mutate this object to represent delivery.

### ScoreAssignmentSourceBinding v1

The exact source binding remains authority for:

- `studentId`;
- `sourceId`;
- `sourceRevisionId`;
- `revisionId`;
- `revisionKind`;
- content and lineage fingerprints;
- approval/evidence identifiers;
- readiness route;
- Package 12 status;
- bound timestamp.

Internal approval/evidence/provider diagnostics may be persisted for audit but must not enter the normal Student App payload.

### AssignmentLifecycleRecord v1

Teacher-owned lifecycle remains orthogonal:

`ACTIVE -> COMPLETED -> REPERTOIRE`

Revocation remains one-way and may happen from any non-revoked lifecycle state.

The original PrivateAssignment remains unchanged.

## 3. Core Invariants

TD-06 must preserve all of the following:

`READY_EXACT_REVISION != DURABLY_PREPARED != DELIVERED_TO_STUDENT`

`PrivateAssignment != AssignmentLifecycleRecord != DeliveryRecord`

`authenticated != authorized`

`Firebase UID != studentId / teacherId`

Additional invariants:

1. Client-supplied `studentId` or `teacherId` is never authorization proof.
2. A student can read only their own active private deliveries.
3. A teacher can mutate/deliver only within explicit server-side teacher/student grants.
4. One PrivateAssignment belongs to exactly one stable student.
5. Delivery never rewrites an old assignment onto a later SCORE revision.
6. Delivery success requires durable commit plus exact server-side acknowledgement reread.
7. Multi-student delivery is all-or-nothing.
8. Revocation removes new online visibility but does not delete audit history.
9. Tokens, service-account credentials, raw provider subjects, provider diagnostics, and recipient lists do not enter normal Student App payloads.
10. Existing TD-01 through TD-05 semantics and regression tests remain valid.
11. Student App cannot create teacher approval, assignment lifecycle transitions, delivery records, or revocations.
12. OMR Gateway persistence and Secure Delivery persistence do not share authority.
13. A browser-local TD-04 assignment is not deliverable until the trusted backend has durably accepted the exact prepared assignment/package handoff.
14. Durable preparation is not delivery; preparation success must never produce student-visible delivery state by itself.

## 4. Architecture

The trusted flow is:

```text
Teacher UI / Student App
        |
        | Firebase ID token
        v
SesliTab Secure Delivery Express API
        |
        | verify Firebase ID token
        v
Identity Mapping
Firebase UID -> stable teacherId / studentId
        |
        v
SesliTab Authorization Policy
        |
        v
Provider-neutral domain services
        |
        v
Firebase repository adapters
        |
        v
Cloud Firestore
```

The current OMR Gateway remains a separate subsystem.

Secure Delivery must not reuse:

- OMR job storage;
- OMR job IDs as user authority;
- OMR worker state;
- OMR provider credentials;
- MusicXML job retention as assignment persistence.

The subsystems may share one Node/Express deployment initially, but their routes, repositories, configuration, authorization and storage concerns remain separately bounded.

## 5. Firebase First-Year Decision

Firebase is selected for the first year because the pilot should be operationally simple and should not depend on a provider that pauses an inactive free project after a short inactivity window.

This decision is intentionally limited to the provider adapter layer.

The domain-facing interfaces must not expose:

- Firestore DocumentReference values;
- Firebase UID as domain student/teacher identity;
- Firebase Auth token shapes;
- Firebase Admin objects;
- Firebase-specific timestamps as public domain types.

A future provider review may replace the adapter while preserving the same stable IDs and delivery semantics.

Supabase/PostgreSQL is not part of the active TD-06 implementation plan.

## 6. Authentication and Identity Mapping

### 6.1 Authentication

Firebase Authentication proves the external account identity.

Teacher and Student App clients obtain Firebase ID tokens using supported Firebase Authentication flows.

The client sends the ID token to Secure Delivery API.

The backend verifies the token with Firebase Admin SDK.

A token is necessary but not sufficient for authorization.

### 6.2 Identity Mapping

A trusted mapping converts Firebase provider identity to SesliTab domain identity.

Logical record:

```text
FirebaseIdentityMapping
firebaseUid
role: TEACHER | STUDENT
teacherId: required only for TEACHER
studentId: required only for STUDENT
active
createdAt
disabledAt: nullable
```

Rules:

- one active UID maps to one domain role/identity;
- role ambiguity fails closed;
- disabled/missing mapping yields no private authority;
- nickname/display name/email is never used as authorization key;
- client cannot create or extend its own identity mapping.

For the first pilot, identity mappings are created through controlled provisioning, not through self-service client writes.

## 7. Teacher Authority

A teacher login alone does not authorize access to every student.

Logical authority:

```text
TeacherStudentGrant
teacherId
studentId
active
createdAt
revokedAt: nullable
```

A teacher operation on a student requires:

- verified teacher session;
- active Firebase identity mapping;
- active TeacherStudentGrant;
- exact domain student identity match;
- valid target domain record.

A batch containing one unauthorized student fails before any new delivery write.

The teacher client cannot self-grant arbitrary students.

## 8. Firestore Logical Collections

The initial Firestore adapter uses the following logical collections.

### 8.1 `identityMappings/{firebaseUid}`

Server-private authority mapping.

Contains:

- role;
- stable domain teacherId or studentId;
- active/disabled state;
- bounded audit timestamps.

Direct client write is forbidden.

### 8.2 `teacherStudentGrants/{grantId}`

Server-private teacher/student authority.

The document identity is deterministic from the stable teacher/student pair or otherwise uniquely constrained by adapter preflight.

Contains:

- teacherId;
- studentId;
- active;
- createdAt;
- revokedAt.

### 8.3 `studentRoster/{studentId}`

Durable TD-02 roster representation.

Contains the exact StudentRosterEntry semantic fields plus bounded persistence metadata.

### 8.4 `poolItems/{poolItemId}`

Immutable TD-03 PoolItem payload.

### 8.5 `poolPublications/{poolItemId}`

Current Pool publication overlay.

For `SELECTED` audience, recipient authorization is represented by normalized server-private recipient records rather than exposing a recipient array to the Student App.

Suggested subcollection:

`poolPublications/{poolItemId}/recipients/{studentId}`

`ALL` must have zero recipient records.

### 8.6 `privateAssignments/{assignmentId}`

Durable immutable TD-04 assignment envelope.

Logical shape:

```text
teacherId          # production authority metadata
assignment          # exact PrivateAssignment v1 logical payload
createdAt
```

The wrapper's `teacherId` does not mutate the PrivateAssignment domain record.

The nested assignment retains the exact SCORE sourceRef.

Once committed, assignment/sourceRef fields are immutable.

### 8.7 `assignmentLifecycle/{assignmentId}`

Current TD-05 lifecycle overlay.

Logical content preserves:

- assignmentId;
- current state;
- stateChangedAt;
- revokedAt.

It must be cross-validated against the immutable assignment.

### 8.8 `assignmentLifecycle/{assignmentId}/history/{eventId}`

Append-only lifecycle audit history.

History is never exposed as normal Student App data.

### 8.9 `practicePackages/{packageId}`

Immutable student-facing PracticePackage snapshot.

For private SCORE delivery the package must pass the existing Student App PracticePackage v1 contract:

- `schemaVersion = 1.0.0`;
- packageId;
- workId;
- title;
- `approvedRevision.revisionId`;
- `approvedRevision.state = teacher_approved`;
- approvedAt;
- `publication.scope = student_private`;
- `publication.recipientStudentId`;
- MusicXML score data;
- canonical events;
- supported practice settings/content fields.

The persisted package includes a deterministic content fingerprint or equivalent exact integrity evidence selected in the implementation plan.

A package is immutable after commit.

### 8.10 `deliveries/{assignmentId}`

TD-06 uses one durable delivery authority per PrivateAssignment.

The Firestore document key is the assignmentId. This makes duplicate exact delivery naturally idempotent for the first TD-06 model.

Logical DeliveryRecord:

```text
schemaVersion
deliveryId          # equals assignmentId in TD-06 v1
assignmentId
packageId
teacherId
studentId
deliveredAt
revokedAt: nullable
```

Rules:

- assignmentId/studentId must match the immutable assignment;
- teacherId must be authorized for the student;
- package recipient/revision must exactly match the assignment;
- repeated active delivery of the same exact assignment returns the existing exact record;
- revoked delivery is not silently restored;
- no second delivery record is created for the same assignment.

## 9. PracticePackage Assembly

TD-06 must not claim delivery from assignment metadata alone.

A private SCORE delivery requires a student-consumable immutable PracticePackage.

A provider-neutral `PracticePackageAssembler` boundary takes trusted exact inputs:

```text
PrivateAssignment
+ exact ScoreAssignmentSourceBinding
+ exact approved revision
+ exact MusicXML
+ canonicalEvents
+ supported practice metadata
        |
        v
PracticePackage v1 candidate
        |
        v
Student App contract validation
        |
        v
immutable package + integrity evidence
```

Required checks:

1. assignment studentId equals sourceRef studentId;
2. package recipientStudentId equals assignment studentId;
3. package approvedRevision.revisionId equals sourceRef revisionId;
4. package revision state is `teacher_approved`;
5. MusicXML is present in the required student package format;
6. canonicalEvents is an array;
7. teacher-only, OMR/provider/debug/internal evidence fields are not included;
8. malformed or incomplete package fails before delivery commit.

A later approved SCORE revision creates a new exact package/assignment decision. Existing delivered packages are not rewritten in place.

## 9A. Durable Prepared-Assignment Handoff

TD-04 and TD-05 currently operate through provider-neutral in-memory teacher repositories. The Secure Delivery backend therefore needs an explicit trusted handoff before an `assignmentId` can be used by the delivery endpoint.

TD-06 adds a teacher-only durable preparation endpoint:

`POST /api/secure-delivery/v1/teacher/prepared-assignments`

The request carries a bounded batch of exact prepared assignment material required for server-side reconstruction and validation:

- immutable `PrivateAssignment v1`;
- exact `ScoreAssignmentSourceBinding v1`;
- exact approved revision identity;
- exact MusicXML required for the student package;
- canonical events required for PracticePackage v1;
- bounded package metadata required by the Student App contract.

The backend never trusts client-supplied `teacherId`. Teacher identity comes only from the verified Firebase session and identity mapping.

For every submitted assignment the backend must:

1. verify the authenticated teacher;
2. map Firebase UID to stable `teacherId`;
3. verify an active TeacherStudentGrant for the assignment's stable `studentId`;
4. validate the immutable PrivateAssignment shape;
5. validate exact assignment/sourceRef/student identity equality;
6. assemble and validate the exact PracticePackage candidate;
7. require package recipient studentId to equal assignment studentId;
8. require package approved revisionId to equal sourceRef revisionId;
9. require the approved revision state to remain `teacher_approved`;
10. reject mutable, substituted, malformed, duplicate-conflicting or authority-mismatched records;
11. persist the prepared assignment envelope and immutable PracticePackage in one atomic operation;
12. reread the committed records and verify exact acknowledgement before reporting success.

A preparation batch is all-or-nothing. One invalid record prevents all new prepared records in that request from becoming durable.

Idempotent replay is allowed only when the existing durable assignment/package pair is exactly equivalent to the submitted pair. A conflicting assignment, student, revision, package fingerprint or package recipient fails closed.

Successful durable preparation means only:

`DURABLY_PREPARED`

It does not mean:

`DELIVERED_TO_STUDENT`

The delivery endpoint remains:

`POST /api/secure-delivery/v1/teacher/deliveries`

and accepts only `assignmentId` references that already exist in the trusted durable prepared-assignment repository.

This yields the explicit authority progression:

```text
READY_EXACT_REVISION
        ↓
local TD-04 PrivateAssignment prepared
        ↓
trusted durable prepared-assignment handoff
        ↓
DURABLY_PREPARED
        ↓
teacher delivery transaction
        ↓
DELIVERED_TO_STUDENT
```

The durable prepared-assignment handoff is a TD-06 backend boundary. It does not grant Student App visibility and it does not alter TD-04/TD-05 domain semantics.

## 10. Secure Delivery API

All private pilot data goes through the trusted API.

### Teacher endpoints

`POST /api/secure-delivery/v1/teacher/prepared-assignments`

Durably persists a bounded batch of already-prepared TD-04 assignments plus exact PracticePackage material after authenticated server-side revalidation. Success means DURABLY_PREPARED only, never delivered.

`POST /api/secure-delivery/v1/teacher/deliveries`

Request contains assignment IDs only as target references.

The request does not gain authority from a client-supplied teacherId or studentId.

`GET /api/secure-delivery/v1/teacher/deliveries`

Returns a bounded management read model for the authenticated teacher's authorized scope.

`POST /api/secure-delivery/v1/teacher/assignments/:assignmentId/actions`

Allowed TD-06 v1 actions:

- COMPLETE;
- REPERTOIRE;
- REVOKE.

The endpoint reuses TD-05 lifecycle rules; it does not invent a second lifecycle.

`GET /api/secure-delivery/v1/teacher/roster`

Returns only the roster scope authorized for the authenticated teacher.

Pool management endpoints may be added behind the same teacher authority boundary:

- publish;
- revoke;
- list authorized Pool state.

### Student endpoints

`GET /api/secure-delivery/v1/student/assignments`

Returns only active deliveries for the authenticated mapped student.

`GET /api/secure-delivery/v1/student/assignments/:deliveryId`

Returns the exact bounded student read model only when the delivery belongs to the authenticated mapped student and remains visible.

`GET /api/secure-delivery/v1/student/pool`

May expose authorized Pool records only after the Student App Pool contract is explicitly implemented and approved. TD-06 does not assume that contract already exists.

## 11. Student Read Model

Student App receives a sanitized read model, not raw repository documents.

A private assignment response may contain:

- deliveryId;
- packageId;
- bounded assignment title/work identity;
- teacher note if explicitly part of the approved student experience;
- deliveredAt;
- validated PracticePackage payload.

It must not expose:

- another student's ID;
- any recipient list;
- teacher Firebase UID;
- student Firebase UID;
- raw Firebase provider subject;
- ID token or refresh token;
- Admin/service-account credentials;
- SCORE approval/evidence IDs;
- Package 12 diagnostics;
- Stage L diagnostics;
- OMR provider metadata;
- lifecycle history;
- raw Firestore document paths;
- backend stack traces.

Authorization failures must not reveal another student's record ownership.

## 12. Atomic Multi-Student Delivery

TD-06 supports bounded teacher batch delivery.

The first-year pilot application-level maximum is 40 assignments per delivery request.

This is a product safety limit, not a claim about Firebase's provider limit.

Preflight validates the complete requested batch before mutation:

1. authenticate teacher;
2. map Firebase UID to stable teacherId;
3. validate every assignment ID;
4. validate every teacher/student grant;
5. validate every immutable PrivateAssignment;
6. validate every lifecycle/revoke state;
7. assemble/validate every required PracticePackage;
8. resolve idempotent existing deliveries;
9. ensure the entire requested write fits one Firestore atomic operation;
10. perform one transaction/batched atomic commit;
11. reread exact committed records;
12. validate exact acknowledgement;
13. only then report success.

If any item fails preflight or commit:

- no new partial delivery set is accepted;
- teacher UI must not claim that the batch was delivered.

The service must not silently split one logical teacher request into multiple independently committed batches.

## 13. Delivery Semantics

TD-06 defines:

`DELIVERED_TO_STUDENT`

as:

A valid exact PracticePackage and DeliveryRecord have been durably committed under authenticated/authorized server control and are available to that student's current authenticated online read model.

It does not mean:

- the student opened the application;
- the student viewed the assignment;
- the student downloaded it;
- the student practiced it;
- the student completed it.

Therefore:

`READY != ASSIGNED != DELIVERED != OPENED != COMPLETED`

TD-06 owns the boundary through DELIVERED only.

Student completion remains teacher-owned under the existing TD-05 lifecycle unless a separately reviewed future design changes that rule.

## 14. Revocation

Teacher revoke is one-way.

For a delivered assignment, the authoritative revoke operation must update the durable lifecycle/delivery visibility atomically or fail closed.

After successful revoke:

- lifecycle audit remains;
- original assignment remains;
- PracticePackage remains as immutable audit payload;
- DeliveryRecord remains;
- delivery `revokedAt` is set;
- new authenticated online Student App reads exclude the delivery.

TD-06 does not claim to erase content already cached/downloaded offline. Offline revocation is a separate problem.

No restore/unrevoke endpoint exists in TD-06.

## 15. Firestore Security Rules and Admin Boundary

Firebase Admin SDK bypasses Firestore Security Rules.

Therefore Security Rules cannot be the sole authorization control for backend writes.

The trusted backend must always perform:

- ID token verification;
- identity mapping;
- role validation;
- teacher/student grant checks;
- record identity checks;
- lifecycle/revocation checks;
- exact acknowledgement validation.

For the first pilot, internal collections default to no direct client write.

Private assignment, lifecycle, package, grant, mapping and delivery collections are accessed through Secure Delivery API.

Security Rules are defense in depth and must fail closed for direct client access not explicitly approved.

No `serviceAccount`, Admin private key, raw credential, or privileged Firebase configuration is shipped to frontend clients.

Firebase web-client configuration is not treated as authorization authority.

## 16. Error Semantics

Server-facing/domain errors should remain explicit enough for tests and bounded enough for UI mapping.

Required classes/results include:

- unauthenticated;
- identity mapping missing/disabled;
- wrong role;
- teacher/student grant missing/revoked;
- assignment not found;
- assignment authority mismatch;
- lifecycle revoked;
- illegal lifecycle transition;
- package assembly invalid;
- package revision mismatch;
- package recipient mismatch;
- duplicate conflict not eligible for idempotent replay;
- Firestore atomic commit failure;
- acknowledgement mismatch.

Student-facing errors must not confirm ownership of another student's private data.

Normal UI/API errors must not include:

- stack traces;
- Firebase Admin errors containing credentials;
- service-account data;
- raw provider tokens;
- internal document paths unnecessary for the user.

## 17. Attack and Abuse Cases Required in Tests

TD-06 must cover at least:

1. Student A guesses Student B delivery ID -> no access.
2. Student sends forged studentId -> ignored/rejected; server session identity wins.
3. Teacher sends forged teacherId -> ignored/rejected; server session identity wins.
4. Teacher attempts delivery outside active grant -> entire batch rejected.
5. Missing/disabled identity mapping -> no private authority.
6. Wrong role mapping -> no cross-role authority.
7. Replay of exact active delivery -> idempotent; no duplicate record.
8. Different assignment/revision cannot overwrite existing delivery.
9. Revoked lifecycle cannot be newly delivered.
10. Revoked delivery is absent from new online student reads.
11. Revocation and student read race resolves fail-closed for new reads after commit.
12. Malformed repository/Firestore acknowledgement -> teacher success denied.
13. One invalid record in a 40-item batch -> no partial new delivery set.
14. Provider/Admin errors do not leak credentials.
15. Student cannot write assignment/lifecycle/delivery collections.
16. Client cannot create its own teacher/student grant.
17. Client cannot create/change identity mapping authority.
18. Student response contains no other recipient identity/list.
19. Student response contains no approval/evidence/provider diagnostics.
20. Existing TD-01 through TD-05 regression tests remain green.

## 18. Production Repository Adapter Boundaries

Firestore adapters must conform to provider-neutral repository/service contracts rather than changing domain rules to fit Firestore.

TD-06 should introduce narrowly scoped adapters for:

- roster persistence;
- Pool publication persistence;
- SCORE PrivateAssignment persistence;
- assignment lifecycle current/history persistence;
- PracticePackage persistence;
- DeliveryRecord persistence;
- identity mapping;
- teacher/student grants.

Adapter methods must return validated domain/read records, not raw Firestore snapshots.

All mutable timestamps that matter to domain semantics are normalized into the existing timestamp representation before returning to domain services.

## 19. Migration and Composition Strategy

TD-06 must not switch all production behavior in one step.

Implementation sequence:

### Phase A — contracts and Firebase adapter scaffolding

- provider-neutral interfaces;
- pure auth/authorization policy;
- deterministic fake adapters;
- no production Firebase dependency in normal app path.

### Phase B — Firebase emulator/test integration

- Firebase Auth verification abstraction;
- Firestore adapter tests;
- Security Rules tests;
- atomic transaction tests;
- no production credentials required.

### Phase C — shadow persistence

- existing TD-02 through TD-05 behavior remains authority;
- Firebase adapter receives bounded shadow writes;
- shadow results are compared;
- mismatch prevents promotion to active delivery mode.

### Phase D — teacher pilot delivery

- small controlled teacher/student identity mappings;
- explicit grants;
- bounded assignment set;
- delivery API enabled behind server-side feature flag.

### Phase E — Student App read pilot

Requires separate explicit approval for cross-repository Student App changes.

Student App uses Firebase Auth for login and Secure Delivery API for private reads.

### Phase F — first-year operation

- Firebase remains the selected provider;
- monitor usage/quotas and operational reliability;
- preserve provider-neutral domain interfaces;
- no automatic migration to another provider at year end.

A provider review after the first year is a separate architectural decision.

## 20. Kill Switch and Rollback

TD-06 requires server-side feature controls.

Logical controls:

```text
SECURE_DELIVERY_ENABLED
SECURE_DELIVERY_WRITES_ENABLED
STUDENT_DELIVERY_READS_ENABLED
```

Exact configuration mechanism is selected during implementation.

Rollback behavior:

- new delivery writes can be disabled;
- student private reads can return a bounded safe-unavailable response;
- audit records remain;
- assignments remain;
- lifecycle history remains;
- PracticePackages remain;
- OMR Gateway remains unaffected.

Rollback must not depend on deleting Firestore collections.

Early schema evolution is additive. Destructive migration is out of scope for the first pilot.

## 21. Operational and Secret Boundary

The following require explicit human approval at their own execution gate:

- creating/selecting a Firebase project;
- enabling Firebase Authentication providers;
- creating production Firestore databases;
- changing Firestore Security Rules in production;
- adding Firebase Admin credentials/service account;
- adding/changing Render or other deployment environment variables;
- adding billing/payment methods;
- production deployment;
- cross-repository Student App writes;
- production data import/migration;
- merge.

No credential value is committed to Git.

No production secret appears in test fixtures, PR text, logs, normal UI, or architecture documentation.

## 22. Student App Contract Boundary

Current Student App PracticePackage v1 already requires:

- schemaVersion `1.0.0`;
- packageId/workId/title;
- teacher-approved revision;
- publication scope;
- private recipient ID for `student_private`;
- MusicXML content;
- canonical events.

TD-06 private SCORE delivery must produce a package that validates against that boundary.

TD-06 does not automatically write to the Student App repository.

Student App integration remains a separately approved cross-repository implementation step.

## 23. Pool Boundary

SesliTab PoolItem v1 is a teacher publication text/detail contract and is not equivalent to the Student App PracticePackage score contract.

TD-06 may persist and authorize PoolItems.

TD-06 must not invent MusicXML/PracticePackage data for a PoolItem.

If Student App needs PoolItem display, a dedicated Student App Pool contract must be reviewed before cross-repository implementation.

## 24. Verification Requirements

Before TD-06 may be called merge-ready:

1. focused auth/identity tests pass;
2. teacher/student grant tests pass;
3. Firestore adapter tests pass;
4. durable prepared-assignment handoff tests pass, including exact acknowledgement and conflict/idempotency behavior;
5. Security Rules/emulator tests pass;
6. atomic batch delivery tests pass;
7. idempotency tests pass;
8. PracticePackage exact-revision tests pass;
9. revoke visibility tests pass;
10. IDOR/forged-ID/security tests pass;
11. credential-leak security tests pass;
12. TD-01 through TD-05 regressions pass;
13. full repository test suite passes;
14. production build passes;
15. protected browser/Playwright baseline passes;
16. Sonar checks pass;
17. exact PR head is verified;
18. branch is not behind current main;
19. security-sensitive provider configuration is reviewed separately;
20. no production credential or deployment change occurs without explicit approval.

## 25. Completion Boundary

TD-06 domain/backend implementation is complete when:

- Firebase Authentication identity can be verified through the trusted backend abstraction;
- Firebase UID maps to stable SesliTab teacher/student identity;
- server-side teacher/student authorization is fail-closed;
- TD-02 through TD-05 records persist durably without semantic drift;
- browser-local TD-04 prepared assignments have an authenticated, atomic, exact durable handoff before delivery;
- exact PracticePackage is assembled and validated;
- bounded multi-student delivery is atomic;
- delivery acknowledgement is exact and durable;
- Student read model is isolated and sanitized;
- revoke visibility is durable and auditable;
- provider-specific objects do not leak into domain APIs;
- full verification is green.

Production rollout is not implied by implementation completion.

Cross-repository Student App changes and production Firebase provisioning remain separately approved actions.

## 26. Explicit Non-Goals

Not part of TD-06:

- CHORD_BOARD assignment producer (TD-07);
- student-controlled COMPLETE/REPERTOIRE;
- messaging/chat;
- social features;
- classes/groups beyond explicit teacher/student grants;
- gamification;
- billing/payments;
- offline remote deletion guarantees;
- OMR redesign;
- changing Package 12 or Stage L semantics;
- replacing the existing MusicXML/TAB engines;
- moving OMR job persistence into Firestore;
- automatic provider migration after the first year.

## 27. Human Gates After This Spec

Approval of this written design allows only creation of the implementation plan.

The implementation plan must separately identify gates for:

1. Firebase emulator/dev dependency introduction;
2. Firebase project selection/creation;
3. Authentication provider activation;
4. Firestore rules/index changes;
5. production credentials;
6. deployment/environment changes;
7. Student App cross-repository work;
8. production pilot activation;
9. merge.

No later gate is pre-approved by approval of this spec.
