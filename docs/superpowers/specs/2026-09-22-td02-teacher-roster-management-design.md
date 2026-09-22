# TD-02 — Teacher Roster + Management Service Design

**Date:** 2026-09-22  
**Repository:** `khfy7wpr5p-maker/seslitab-guitar-reader`  
**Baseline:** `main@d8d244cb1436eb9e2fd34a3b5a7ecf127aabf090`  
**Status:** design/specification only; no product implementation is authorized by this document.

## 1. Purpose

TD-02 adds the trusted, provider-neutral roster boundary needed before teacher-side Pool and private-assignment producer flows can select students safely.

The teacher must be able to work with human-readable names or nicknames, while every authorization, targeting and later delivery operation continues to use the stable `studentId` introduced by TD-01.

TD-02 does **not** discover user accounts, authenticate teachers or students, persist roster changes, call Firebase/Admin APIs, create student accounts or expose roster data to the Student App.

## 2. Existing baseline

TD-01 is merged to protected `main` and already provides:

- immutable `StudentRosterEntry` v1;
- stable `studentId`;
- presentation-only `displayNameOrNickname`;
- explicit `active` boolean;
- strict identity/text bounds;
- no persistence/network/provider assumptions.

TD-02 consumes this existing contract rather than replacing or widening it.

Existing Package 12 sharing contracts also treat recipient identity as caller-supplied stable identity and do not authenticate or discover recipients. TD-02 must preserve that separation.

## 3. Product outcome

After TD-02, teacher-side producer code can safely ask:

- which roster entries exist;
- which are active;
- which exact stable student corresponds to a selected roster row;
- whether a selected stable student is currently eligible to be newly targeted;
- whether a multi-student selection contains only known active students.

The result is a trusted preflight boundary for TD-03 and TD-04.

TD-02 does not itself send, publish, persist or deliver anything.

## 4. Approaches considered

### A. Browser-side Firebase Authentication user listing

Rejected.

Firebase client Authentication is not a trusted directory API for listing all users, and browser-side admin credentials would violate the project security boundary.

### B. Browser-local roster persistence

Rejected.

Using localStorage, IndexedDB or another browser-only store as roster authority would create a second identity source, could drift from actual student authorization identities and would prematurely choose persistence semantics before TD-06.

### C. Provider-neutral roster repository + service

Selected.

TD-02 defines a small repository interface and a trusted management/preflight service around strict TD-01 `StudentRosterEntry` records. A reference in-memory repository is allowed for deterministic tests and non-production composition. The production identity/persistence provider remains deferred.

**Ruling:** TD-02 validates and consumes trusted roster records but does not discover identities or claim durable roster management. Cost if wrong: a browser-local or display-name-derived identity could later route private work to the wrong student.

## 5. Scope

TD-02 includes:

1. provider-neutral roster repository contract;
2. deterministic in-memory reference repository;
3. duplicate stable-ID rejection;
4. teacher-side list/lookup service;
5. active/inactive filtering;
6. exact stable-ID active-student preflight;
7. bounded multi-student selection normalization and validation;
8. teacher-safe roster projections;
9. security tests proving absence of provider/admin/network/persistence behavior.

TD-02 excludes:

- teacher UI wiring;
- roster CRUD UI;
- student account creation;
- email-based or nickname-based identity lookup;
- Firebase Admin SDK;
- Firebase Authentication user-list API;
- Firestore or any database;
- localStorage / IndexedDB;
- network fetch/WebSocket endpoints;
- production authentication;
- live security rules;
- Pool publishing;
- private assignment creation/fan-out;
- assignment lifecycle;
- Student App changes;
- Chord Board work;
- OMR/Audiveris/rendering/deployment changes.

## 6. Identity rules

`studentId` remains the only target identity.

`displayNameOrNickname` is presentation only.

Rules:

- duplicate `studentId` records are invalid;
- duplicate display names are valid;
- whitespace or alternate display spelling never changes identity;
- no lookup-by-display-name API is introduced;
- no lookup-by-email API is introduced;
- inactive entries remain visible to trusted teacher management consumers when requested;
- inactive entries cannot pass new-target preflight;
- missing entries cannot pass new-target preflight;
- Student App never receives the roster.

**Ruling:** duplicate human-readable names are allowed but stable IDs must be unique. Cost if wrong: two students sharing a name could become ambiguous and private work could be misrouted.

## 7. Repository boundary

Create a provider-neutral repository interface with this conceptual read surface:

```text
list()
getByStudentId(studentId)
```

TD-02 also provides an in-memory reference implementation constructed from immutable TD-01 `StudentRosterEntry` records.

### Repository construction rules

- input must be an array;
- every entry must be a valid strict frozen `StudentRosterEntry`;
- duplicate `studentId` fails construction;
- input order is preserved;
- repository output arrays are frozen;
- records remain immutable;
- no mutation methods are exposed.

The reference repository deliberately does **not** expose:

```text
add
create
update
rename
activate
deactivate
delete
save
persist
sync
```

Those behaviors would imply a source-of-truth/persistence model that TD-02 is not authorized to select.

**Ruling:** TD-02's repository is a trusted read snapshot, not durable CRUD. Cost if wrong: UI could appear to modify a roster even though the authoritative identity provider was unchanged.

## 8. Teacher roster service

Create a provider-neutral teacher roster service around the repository.

Conceptual public surface:

```text
listStudents({ includeInactive = true })
getStudent(studentId)
requireActiveStudent(studentId)
preflightActiveStudentIds(studentIds)
```

Naming may follow repository conventions during implementation, but the behavior below is binding.

### listStudents

- returns teacher-safe roster records only;
- can include or exclude inactive entries;
- does not add email, role, auth claims or provider metadata;
- result is immutable.

### getStudent

- requires a stable `studentId`;
- returns the exact roster entry or null;
- never resolves a display name as identity.

### requireActiveStudent

- requires a stable `studentId`;
- returns the exact active roster entry;
- unknown student fails closed;
- inactive student fails closed.

This is intended for future single-target producer preflight.

### preflightActiveStudentIds

Input is a list of stable IDs selected by the teacher UI.

Behavior:

1. require an array;
2. normalize each ID using TD-01 identity bounds;
3. deduplicate while preserving first-selection order;
4. reject an empty post-normalization selection;
5. resolve each ID from the repository;
6. reject the entire preflight if any selected ID is unknown;
7. reject the entire preflight if any selected entry is inactive;
8. return a frozen ordered list of exact active roster entries.

No partial success result is produced in TD-02.

This matches the later TD-04 requirement that multi-student assignment fan-out preflight all targets before any write.

**Ruling:** selected IDs are deduplicated, but repository duplicate identities are rejected. Cost if wrong: repeated UI selections could create duplicate assignments while duplicate authority records could hide inconsistent roster state.

## 9. Teacher-safe projection

The teacher may see:

- `studentId` internally as the stable selection value;
- `displayNameOrNickname`;
- `active`.

Normal future UI should primarily show the display name/nickname and active/inactive state; raw stable IDs need not be prominent.

TD-02 does not define final UI copy or layout.

No projection may add:

- email;
- phone;
- password/auth token;
- provider UID aliases;
- authorization roles;
- assignment data;
- teacher notes;
- other students' private work.

## 10. Security boundary

Hard requirements:

- browser never receives Firebase Admin credentials;
- TD-02 never calls an admin user-list endpoint;
- no provider is assumed;
- no network call exists in the TD-02 domain/service modules;
- no browser persistence exists;
- no roster record is authorized by display name;
- inactive student cannot be newly targeted;
- unknown student cannot be newly targeted;
- duplicate stable IDs fail closed;
- Student App imports no TD-02 roster module;
- roster data is teacher-management data only.

TD-02 does not claim that a caller is an authenticated teacher. That application/security authority is selected with the production persistence/auth boundary in TD-06.

## 11. Relationship to TD-03 and TD-04

### TD-03 — Pool publishing

For `SELECTED` Pool publication, TD-03 must use TD-02 preflight before constructing/persisting a targeted PoolItem.

TD-03 must not trust an arbitrary caller-supplied recipient array merely because the PoolItem contract can structurally represent it.

### TD-04 — SCORE private assignment

Before multi-student fan-out, TD-04 must use TD-02 preflight.

Each returned active `StudentRosterEntry.studentId` becomes one independent PrivateAssignment target.

Teacher display names never enter the PrivateAssignment authorization field.

## 12. Relationship to TD-06

TD-06 remains the first stage allowed to select/confirm the real persistence and authenticated management provider.

TD-06 may implement a production repository adapter that supplies the TD-02 repository contract, but it must preserve:

- stable `studentId`;
- duplicate-ID rejection;
- active/inactive semantics;
- teacher-only roster visibility;
- no Student App roster exposure.

TD-02 must remain testable without Firebase or any network.

## 13. Error handling

Programmer/input-shape errors fail with bounded TypeError/Error messages and no provider diagnostics.

Expected fail-closed conditions include:

- non-array roster snapshot;
- malformed roster entry;
- mutable/forged roster entry;
- duplicate `studentId`;
- malformed lookup ID;
- empty selection;
- malformed selection ID;
- unknown selection ID;
- inactive selection ID.

Error messages may identify the category and offending stable ID internally for teacher-side diagnostics, but normal later UI must convert them to short human-readable copy and must not display raw provider errors.

## 14. Proposed implementation files

Create:

- `src/services/teacherRosterRepository.js`
  - repository contract checks and in-memory reference repository;
  - no network/persistence code.
- `src/services/teacherRosterService.js`
  - list/lookup/active preflight behavior.
- `tests/teacherRosterRepository.test.js`
- `tests/teacherRosterService.test.js`
- `tests/teacherRosterSecurity.test.js`
- `docs/teacher-delivery-td02-roster.md`
  - implemented-boundary note after code is green.

Reuse without semantic widening:

- `src/services/studentRosterEntry.js`
- `src/services/teacherDeliveryContractValidation.js`

Do not modify as part of TD-02 unless a test proves an unavoidable compatibility defect:

- `src/services/poolItem.js`
- `src/services/privateAssignment.js`
- `src/services/scoreAssignmentSourceBinding.js`
- Package 12 authorization/eligibility modules;
- Stage L;
- `main.js`;
- `src/app.js`.

## 15. Verification requirements

Focused tests must prove:

1. repository accepts valid immutable roster entries;
2. duplicate stable IDs fail;
3. duplicate display names are allowed;
4. mutable/forged entries fail;
5. list order is deterministic;
6. active-only filtering is correct;
7. stable-ID lookup is exact;
8. no display-name lookup authority exists;
9. inactive target fails preflight;
10. unknown target fails preflight;
11. multi-selection deduplicates in first-selection order;
12. empty selection fails;
13. malformed/control-character IDs fail;
14. returned arrays/records cannot be mutated;
15. no network/Firebase/admin/browser-persistence implementation exists;
16. no Student App roster dependency is introduced.

Repository-level verification after implementation:

- focused TD-02 tests;
- existing TD-01 contract tests;
- relevant Package 12 identity regressions;
- full `npm test`;
- `npm run build`;
- `git diff --check`;
- protected required CI on exact PR head.

## 16. Completion definition

TD-02 is complete only when fresh evidence proves:

- one stable ID maps to at most one roster record;
- duplicate human names do not become authorization ambiguity;
- inactive and unknown students cannot pass target preflight;
- multi-target preflight is all-or-nothing;
- service uses stable IDs only;
- roster modules have no provider/network/persistence/admin implementation;
- Student App receives no roster surface;
- full repository verification passes;
- the implementation remains provider-neutral.

## 17. Non-goals

TD-02 does not create:

- a student registration screen;
- a teacher roster editing screen;
- invitation links;
- account passwords;
- class/group abstractions;
- student search by email;
- bulk CSV import;
- analytics;
- messaging;
- notification infrastructure;
- assignment fan-out;
- Pool publishing;
- Firebase collections/rules;
- production backend endpoints.

## 18. Sequencing after TD-02

After TD-02 is merged and exact-main verification is green:

1. TD-03 — Pool publishing producer/service/UI boundary;
2. TD-04 — SCORE private assignment producer + multi-student fan-out;
3. TD-05 — teacher-owned assignment lifecycle;
4. TD-06 — secure persistence/authenticated delivery adapter after dedicated security review;
5. TD-07 — Chord Board exact immutable snapshot adapter.

No later stage is implicitly authorized by this spec.
