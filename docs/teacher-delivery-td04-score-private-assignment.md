# TD-04 — SCORE Private Assignment

## Boundary

TD-04 prepares teacher-owned SCORE PrivateAssignment batches. It does not deliver them to Student App.

## Fan-out

One teacher action may select multiple active students. The domain creates one independent PrivateAssignment per normalized stable studentId.

## Notes

A common teacher note is the default. A per-student override replaces it. An explicitly enabled empty override clears the common note for that student.

## Exact SCORE source

Every student receives a fresh action-time ScoreAssignmentSourceBinding. Old UI readiness is not accepted as authority.

## Duplicate protection

Same studentId + sourceId + revisionId + SCORE is rejected as an existing exact assignment. A different exact revision is a distinct assignment source.

## Atomic repository truth

The TD-04 in-memory reference repository validates the full batch before mutation. createBatch returns one frozen acknowledgement in deterministic order. Teacher success is reported only after exact acknowledgement validation.

## Teacher UI boundary

The explicit-mount UI offers active-student selection, common note, optional per-student overrides, and Ödevi Hazırla.

It is intentionally not mounted from main.js or App Shell.

## Security and scope

TD-04 adds no Firebase/Admin implementation, browser persistence, network delivery endpoint, Student App write, cross-repository write, assignment lifecycle transition, revoke behavior, or Chord Board producer.

Stage L remains readiness-only with deliveryState = not_implemented and deliveryAllowed = false.

## Deferred

- lifecycle and revoke: TD-05;
- authenticated persistence/delivery and Student App visibility: TD-06;
- Chord Board assignments: TD-07.
