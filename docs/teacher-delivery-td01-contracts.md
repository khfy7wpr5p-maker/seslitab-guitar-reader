# TD-01 — Teacher Delivery Contracts

Status: implemented on the feature branch; production/merge status is determined only by the final PR and exact-main gates.

## Boundary

TD-01 adds provider-neutral immutable contracts only. It does not implement authenticated student delivery, persistence, Firebase, a database, network sending or UI wiring.

`READY_EXACT_REVISION != DELIVERED_TO_STUDENT` remains unchanged.

## Contracts

- StudentRosterEntry v1: stable `studentId`, presentation-only display name/nickname, active flag.
- PoolItem v1: text/detail publication metadata with `ALL | SELECTED` audience.
- SCORE assignment source binding v1: created only from the exact current teacher-approved revision that passes existing Package 12 / Stage L readiness for the exact target student ID.
- PrivateAssignment v1: exactly one student, SCORE source reference, per-student teacher note, initial `ACTIVE` state.
- Teacher state machine: `ACTIVE -> COMPLETED -> REPERTOIRE`; no reverse transition in v1.

## Explicitly deferred

- roster repository/provider: TD-02;
- Pool persistence/UI/revoke: TD-03;
- SCORE multi-student fan-out and send UI: TD-04;
- persisted lifecycle/revoke: TD-05;
- secure persistence/delivery adapter and production authorization enforcement: TD-06;
- CHORD_BOARD exact immutable voicing snapshot: TD-07.

TD-01 recognizes `CHORD_BOARD` in vocabulary but refuses to create that assignment type before TD-07.

## Safety

TD-01 does not change Package 8, Package 12, Stage L, OMR/Audiveris, renderer, Smoosic, deployment or Student App code.
