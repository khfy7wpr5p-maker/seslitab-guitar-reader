# SES-238: historical Piece list read reduction

Stage 1 prepares the backend and tests only. No production backfill, index
deployment, environment update, merge or service deployment is performed by
this change.

## Persistence and authority

`pieceAssignments.studentListEligible` is a boolean persistence-only projection.
New Pieces write `true`. Actual lifecycle mutations update it to
`nextLifecycle.revokedAt === null` in the same transaction as lifecycle and
child cascade writes. COMPLETED and REPERTOIRE remain eligible. Immutable
Piece contracts, API responses, lifecycle validation, student ownership checks
and offline revocation authority remain unchanged. Exact creation replays do
not resurrect revoked Pieces or change legacy records.

Creation remains one Piece write. A lifecycle mutation adds at most one Piece
write when eligibility changes or a legacy projection needs initialization;
transitions that retain an existing `true` do not rewrite it. Index storage and
the separately approved one-time backfill also have costs.

The projection is only a query prefilter. Current Piece and lifecycle snapshots
are still batched and validated; stale `true` cannot override a lifecycle revoke.
The existing SES-193 path deduplication is retained.

## Activation gate and deployment order

`STUDENT_PIECE_INDEXED_READS_ENABLED` defaults to disabled. Only the explicit
value `true` (case-insensitive, trimmed) adds `studentListEligible == true` to
the existing studentId query. Missing fields are excluded by that query.
Do not enable it before verified backfill: doing so would hide valid legacy
Pieces. There is deliberately no automatic full-history fallback on index
failure.

Separately authorized production steps must be ordered as follows:

1. Deploy this compatible reader/writer release to the existing Student API
   with the flag disabled. All writers must run the new release before final
   backfill verification; an old writer can otherwise create an unmarked Piece.
2. Deploy the `pieceAssignments(studentId, studentListEligible)` index and wait
   for readiness. Backfill each existing Piece from its validated current
   lifecycle in a transaction, checking student/immutable Piece authority.
   A missing lifecycle means initial active only when current validation accepts
   it. Invalid or conflicting records must be reported, not guessed. A later
   stage must provide a dry-run, bounded apply, resume and verification tool.
3. Verify complete coverage and lifecycle consistency, including records created
   during backfill. Then enable the flag on the existing API and verify lists,
   exact-ID revoke denial, all work folders and offline revalidation.

Disabling the flag restores the broad query while retaining lifecycle checks.
Do not roll the binary back to a pre-SES-238 reader after metadata is written:
that reader rejects additional persistence fields. Roll back filtering using
the flag while keeping the compatible reader/writer.

## Expected reads and limits

With P total Pieces and E eligible Pieces, the normal Piece list path changes
from P query documents plus 2P batch references to E plus 2E. Each added revoked
Piece no longer contributes three document accesses when the filter is enabled.
Principal lookup remains; empty queries still have minimum billing. Batch RPC
count and document billing are different quantities. Test doubles count
requested/returned paths, not billed production reads.

Actual per-student billed savings still require P, E and endpoint frequencies.
The 18 October 19:39 event, later console reads and the 17 October teacher event
remain separate; this change does not establish attribution for those peaks.
