# TD-03 — Teacher Pool Publishing Design

**Date:** 2026-09-22  
**Repository:** `khfy7wpr5p-maker/seslitab-guitar-reader`  
**Baseline:** `main@d9a25eb51152a3364681f1925695b6a23fb578df`  
**Status:** design/specification only. No product implementation is authorized by this document.

## 1. Purpose

TD-03 adds the teacher-side producer boundary for publishing text/detail announcements to the Student App Pool.

The teacher must be able to:

- create a Pool publication;
- target either all students or selected students;
- select only trusted roster identities for `SELECTED`;
- see teacher-owned published Pool records;
- revoke a publication without deleting its history.

TD-03 does not deliver SCORE practice content, MusicXML, notation, playback, Practice Packages or Chord Board payloads.

## 2. Existing baseline

TD-01 already provides immutable `PoolItem` v1:

- `poolItemId`;
- title;
- short description;
- optional detail text;
- publication timestamp;
- audience mode `ALL | SELECTED`;
- selected stable `recipientStudentIds`;
- no score/practice payload.

TD-02 already provides trusted roster preflight:

- stable `studentId` is the only targeting identity;
- duplicate stable IDs fail closed;
- unknown/inactive students fail selected-target preflight;
- multi-target preflight deduplicates in first-selection order;
- display name/nickname is presentation-only.

TD-03 consumes these contracts without changing their identity meaning.

## 3. Product outcome

After TD-03, teacher-side code can perform this bounded flow:

```text
Teacher draft
  -> normalize/validate form
  -> audience decision
     -> ALL: no recipient expansion
     -> SELECTED: TD-02 active roster preflight
  -> create immutable PoolItem
  -> repository.publish(...)
  -> require repository acknowledgement
  -> teacher-visible publication record
```

Revocation flow:

```text
Teacher selects own Pool publication
  -> repository lookup
  -> reject unknown/already-revoked record
  -> repository.revoke(...)
  -> require acknowledgement
  -> teacher-visible revoked publication record
```

Publication success is never reported before repository acknowledgement.

## 4. Selected architecture

### Provider-neutral producer service + provider-neutral repository + minimal teacher controller/UI boundary

This is the selected approach.

TD-03 introduces:

1. a Pool publication lifecycle record;
2. a provider-neutral Pool publication repository contract;
3. an immutable in-memory reference repository;
4. a teacher Pool publishing service;
5. a minimal teacher controller/view-model boundary for future `Havuza Gönder` UI wiring.

Real Firebase/backend persistence remains deferred to TD-06.

### Rejected alternatives

#### Service only, no teacher flow boundary

Rejected because TD-03 is intended to establish the actual teacher publication workflow that later persistence can plug into.

#### Direct Firebase/Firestore implementation

Rejected because it would select production persistence/auth before TD-06 security review.

#### Mutating or widening TD-01 PoolItem for revocation

Rejected because `PoolItem` v1 is already an immutable active publication contract. TD-03 should not weaken TD-01 validation by turning the same record into multiple lifecycle shapes.

## 5. Pool publication lifecycle record

TD-03 introduces a separate immutable `PoolPublicationRecord`.

Conceptual shape:

```text
PoolPublicationRecord v1
- schemaVersion
- item: exact immutable PoolItem
- revokedAt: null | normalized timestamp
```

Rules:

- `item` must pass `isPoolItem`;
- `revokedAt === null` means active publication;
- a non-null `revokedAt` means teacher-revoked tombstone;
- revocation never mutates `item`;
- publication identity remains `item.poolItemId`;
- a revoked record remains listable to the teacher;
- no restore/unrevoke transition exists in TD-03;
- no hard delete exists in TD-03.

**Ruling:** lifecycle metadata wraps the immutable TD-01 PoolItem instead of modifying it. Cost if wrong: widening PoolItem itself could break existing validators and blur active-vs-revoked semantics.

## 6. Audience semantics

### ALL

For `ALL`:

- `recipientStudentIds` remains empty;
- TD-03 does not expand ALL into a roster snapshot;
- TD-02 selected-student preflight is not called;
- the record declares audience intent only.

This preserves the existing PoolItem contract.

Whether a particular authenticated student may read an `ALL` item is a later delivery/auth decision owned by TD-06 and Student App consumer wiring.

### SELECTED

For `SELECTED`:

1. teacher provides selected stable student IDs;
2. TD-02 `preflightActiveStudentIds` validates one coherent active roster snapshot;
3. unknown or inactive target fails the whole publication attempt;
4. duplicate selected IDs normalize to one stable ID in first-selection order;
5. returned exact stable IDs are passed to `createPoolItem`.

Display names are never written into recipient identity fields.

**Ruling:** `SELECTED` is an immutable identity snapshot; `ALL` remains a symbolic audience declaration. Cost if wrong: expanding ALL could create large duplicated identity lists and change TD-01 semantics.

## 7. Publication input

Teacher-facing publication draft contains:

```text
title
shortDescription
detailText
audienceMode
selectedStudentIds
```

Producer-owned metadata contains:

```text
poolItemId
publishedAt
```

TD-03 must not silently invent user-visible content.

ID/time generation may be injected as deterministic producer dependencies:

```text
createPoolItemId()
now()
```

The service must validate their output through existing TD-01 normalizers/PoolItem creation.

No random/provider-specific identity is accepted from browser display names.

## 8. Repository boundary

Conceptual repository API:

```text
list()
getByPoolItemId(poolItemId)
publish(record)
revoke({ poolItemId, revokedAt })
```

The production implementation remains deferred.

TD-03 provides an in-memory reference implementation for deterministic tests and local composition.

### Repository invariants

- stored values must be valid immutable `PoolPublicationRecord` records;
- `poolItemId` is unique;
- duplicate publish fails closed;
- `list()` order is deterministic and preserves publication order;
- `getByPoolItemId` uses normalized exact ID;
- publish returns the exact acknowledged stored record;
- revoke returns the exact acknowledged revoked record;
- revoking unknown publication fails;
- revoking an already revoked publication fails;
- hard delete is absent;
- restore/unrevoke is absent;
- records and returned arrays are frozen.

## 9. Acknowledgement contract

Teacher UI/controller must not report success merely because a domain object was constructed.

### Publish acknowledgement

The publishing service must verify that repository `publish(record)` returns:

- a valid immutable `PoolPublicationRecord`;
- the same `poolItemId`;
- the same exact `PoolItem` content/identity;
- `revokedAt === null`.

Mismatch, null, malformed or thrown acknowledgement fails closed.

### Revoke acknowledgement

The revoke service must verify that repository `revoke(...)` returns:

- the same publication identity;
- the same immutable original `PoolItem`;
- the requested normalized `revokedAt`;
- a valid immutable lifecycle record.

No success state is emitted from a malformed acknowledgement.

**Ruling:** repository acknowledgement is part of producer truth, even for the in-memory adapter. Cost if wrong: UI could claim “sent” while persistence failed or acknowledged a different record.

## 10. Teacher Pool publishing service

Conceptual API:

```text
createTeacherPoolPublishingService({
  repository,
  rosterService,
  createPoolItemId,
  now,
})

publishPoolItem({
  title,
  shortDescription,
  detailText,
  audienceMode,
  selectedStudentIds,
})

listPoolPublications()

revokePoolPublication(poolItemId)
```

### publishPoolItem

- accepts only strict expected fields;
- validates audience mode;
- for ALL, requires selected IDs to be absent or empty;
- for SELECTED, requires at least one selected ID;
- SELECTED calls TD-02 active-student preflight before constructing PoolItem;
- obtains producer-owned ID/time from injected dependencies;
- constructs TD-01 `PoolItem`;
- wraps it as active `PoolPublicationRecord`;
- calls repository publish;
- validates acknowledgement;
- returns the acknowledged frozen record.

### listPoolPublications

- returns validated immutable publication records;
- includes active and revoked items;
- does not expose provider diagnostics;
- does not query Student App.

### revokePoolPublication

- normalizes exact `poolItemId`;
- requires an existing active publication;
- gets revocation timestamp from injected `now()`;
- calls repository revoke;
- validates acknowledgement;
- returns the acknowledged revoked record.

## 11. Teacher controller / minimal UI boundary

TD-03 may add a minimal teacher-facing controller/view-model for future product wiring.

Required product concepts:

- `Havuza Gönder`;
- title field;
- short description field;
- optional detail field;
- audience choice:
  - `Tüm öğrenciler`;
  - `Seçili öğrenciler`;
- selected-student picker uses TD-02 roster presentation rows;
- teacher publication list;
- active/revoked state;
- `Geri Çek` only for active records.

The UI must not:

- show a student write action;
- expose raw provider/auth metadata;
- expose Firebase/Admin controls;
- attach SCORE/MusicXML/practice payload;
- claim delivery before service acknowledgement.

Final visual placement and styling may follow existing teacher UI conventions during implementation, but the domain/controller boundary must remain independently testable.

## 12. Error handling

Fail closed on:

- malformed publication input;
- unsupported audience mode;
- ALL with selected recipients;
- SELECTED with no recipients;
- selected unknown student;
- selected inactive student;
- duplicate repository identity;
- malformed producer-generated ID/time;
- malformed repository acknowledgement;
- acknowledgement identity/content mismatch;
- unknown revoke target;
- already-revoked target;
- malformed revoke timestamp;
- provider/repository exception.

Teacher UI later converts domain failures to short human-readable messages.

Raw provider diagnostics are not surfaced to students.

## 13. Security boundary

TD-03 must preserve:

- `studentId` as the only selected-recipient identity;
- display name/nickname as presentation only;
- no browser Firebase Admin credentials;
- no Firebase Authentication user listing;
- no Firestore/database selection;
- no localStorage/IndexedDB persistence;
- no network delivery endpoint;
- no production authentication policy;
- no Student App roster access;
- no student publication mutation;
- no score/practice payload in Pool;
- no cross-repository write.

## 14. Relationship to Student App

TD-03 produces teacher-side Pool publication records only.

It does not modify `khfy7wpr5p-maker/st-student-app`.

Later Student App production wiring may read active Pool publications through the TD-06 secure adapter.

Revoked publications must become unreadable to student consumers once the production adapter/consumer exists, but that read enforcement is not implemented in TD-03.

## 15. Relationship to Stage L / SCORE delivery

Pool publishing is independent of exact-score readiness.

TD-03 must not call:

- Stage L readiness;
- Package 12 score share authorization;
- SCORE assignment source binding;
- Practice Package creation.

`READY_EXACT_REVISION != DELIVERED_TO_STUDENT` remains unchanged.

SCORE private assignment producer work belongs to TD-04.

## 16. Proposed implementation files

Likely create:

- `src/services/poolPublicationRecord.js`
- `src/services/teacherPoolRepository.js`
- `src/services/teacherPoolPublishingService.js`
- `src/services/teacherPoolPublishingController.js`
- `tests/poolPublicationRecord.test.js`
- `tests/teacherPoolRepository.test.js`
- `tests/teacherPoolPublishingService.test.js`
- `tests/teacherPoolPublishingSecurity.test.js`
- `tests/teacherPoolPublishingController.test.js`
- `docs/teacher-delivery-td03-pool-publishing.md`

Potential minimal UI integration files must be identified from fresh repository exploration during implementation planning. No broad UI file is pre-authorized by this spec.

Reuse:

- `src/services/poolItem.js`
- `src/services/teacherRosterService.js`
- TD-01 validation helpers.

Do not modify TD-01/TD-02 contracts unless a focused regression test proves an unavoidable compatibility defect.

## 17. Verification requirements

Tests must prove at minimum:

1. active lifecycle record wraps exact immutable PoolItem;
2. revocation creates immutable tombstone without mutating PoolItem;
3. no unrevoke/delete surface exists;
4. duplicate pool identity fails;
5. ALL keeps recipients empty;
6. ALL does not call selected-student preflight;
7. SELECTED uses TD-02 preflight;
8. inactive/unknown selected target fails before repository publish;
9. duplicate selected IDs produce one recipient in first-selection order;
10. publish does not succeed without valid repository acknowledgement;
11. mismatched publish acknowledgement fails;
12. revoke does not succeed without valid repository acknowledgement;
13. revoke preserves original PoolItem identity/content;
14. unknown/already-revoked publication fails;
15. list includes active and revoked teacher records;
16. Pool source contains no SCORE/MusicXML/practice payload;
17. TD-03 source contains no Firebase/Admin/network/browser-storage implementation;
18. no Student App or Stage L dependency is introduced;
19. teacher controller never fabricates success before service acknowledgement;
20. full repository test/build/browser regressions remain green.

## 18. Completion definition

TD-03 is complete only when fresh evidence proves:

- teacher can construct ALL and SELECTED publication requests;
- SELECTED targeting is based only on trusted active stable IDs;
- publication identity is unique;
- repository acknowledgement gates success;
- teacher can list publication history;
- teacher can revoke without delete;
- revoke is irreversible in TD-03;
- Pool remains text/detail only;
- no production provider/persistence/auth decision is introduced;
- no Student App code is changed;
- exact-head CI and required quality checks pass.

## 19. Deferred to later stages

### TD-04

SCORE private assignment producer, exact score source binding and multi-student assignment fan-out.

### TD-05

Persisted teacher assignment lifecycle management.

### TD-06

Production authenticated persistence/delivery adapter, security rules and real provider integration for roster/Pool/assignments.

### TD-07

Chord Board immutable voicing snapshot delivery.

No later stage is implicitly authorized by this spec.
