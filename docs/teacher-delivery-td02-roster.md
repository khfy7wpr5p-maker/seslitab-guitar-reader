# TD-02 — Teacher Roster + Management Service

Status: implemented on the feature branch; production/merge status is determined only by the final PR and exact-main gates.

## Boundary

TD-02 adds a provider-neutral, read-only trusted roster snapshot boundary and teacher-side target preflight.

It does not implement Firebase/Admin user discovery, persistence, authentication, roster CRUD UI, Pool publishing, private-assignment fan-out or Student App roster access.

## Identity

- `studentId` is the only targeting identity.
- `displayNameOrNickname` is presentation-only.
- duplicate stable IDs fail closed;
- duplicate display names are allowed;
- inactive and unknown students cannot pass new-target preflight.

## Repository

The TD-02 reference repository exposes only:

- `list()`;
- `getByStudentId(studentId)`.

It stores an immutable in-memory snapshot of TD-01 `StudentRosterEntry` records and exposes no mutation/persistence method.

## Teacher roster service

The service exposes only:

- `listStudents({ includeInactive })`;
- `getStudent(studentId)`;
- `requireActiveStudent(studentId)`;
- `preflightActiveStudentIds(studentIds)`.

Multi-target preflight deduplicates stable IDs in first-selection order and fails the whole preflight if any selected student is unknown or inactive.

## Deferred

- Pool producer/UI: TD-03;
- SCORE assignment fan-out/UI: TD-04;
- persisted assignment lifecycle: TD-05;
- authenticated provider/persistence and production authorization: TD-06;
- Chord Board delivery adapter: TD-07.
