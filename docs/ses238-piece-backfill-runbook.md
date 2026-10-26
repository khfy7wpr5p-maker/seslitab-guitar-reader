# SES-238 Stage 2: bounded Piece eligibility backfill

The compatible writer release `6610646` was observed live on the existing
`st-student-api` Render service. This tool does not deploy an index, enable
indexed list reads, create a service or run automatically at startup. Keep
`STUDENT_PIECE_INDEXED_READS_ENABLED` disabled during the entire backfill.

## Execution environment

Run from a trusted admin environment that already has Application Default
Credentials for the existing Firebase project. Do not copy credentials into
chat, logs, the repository or command arguments. Production requires both an
explicit `--project` and matching `SECURE_DELIVERY_FIREBASE_PROJECT_ID`.

The currently observed Render Free service has no SSH/dashboard shell or
one-off jobs. A connected read/deploy API is not a command execution session.
Use an already authenticated admin terminal/Cloud Shell; this change does not
upgrade the service or provision a workaround. No production data has been
read or changed by the development/emulator work.

## Preflight (read-only)

Confirm all production Piece writers run the compatible release or a newer
compatible release. Review current deploys and confirm the list filter remains
disabled. Use the following environment only in the trusted session:

```bash
export SECURE_DELIVERY_FIREBASE_PROJECT_ID=st-student-app-85cde
export STUDENT_PIECE_BACKFILL_PRODUCTION_AUTHORIZED=true
node scripts/backfillPieceEligibility.mjs --production --project st-student-app-85cde --limit 50
```

Default mode is `dry-run`. It reads one page and its lifecycle documents without
writing. Repeat with `--after <nextCursor>` until `pageComplete` is true. A full
page always returns a cursor, even at the end; an extra empty page may therefore
be needed. No automatic loop or unbounded scan is included.

## Apply (one bounded page at a time)

After a complete preflight with no errors, set the apply gate in the trusted
session and execute each page explicitly:

```bash
export STUDENT_PIECE_BACKFILL_APPLY=true
node scripts/backfillPieceEligibility.mjs --production --project st-student-app-85cde --mode apply --compatible-writers-confirmed --limit 50
```

Resume using `--after <nextCursor>`. Each Piece is independently transactional:
the tool re-reads its current immutable Piece and lifecycle, rejects authority
drift since discovery, and updates only `studentListEligible` if needed.
Concurrent revocation is recomputed from current lifecycle and never undone.
ACTIVE, COMPLETED and REPERTOIRE with no revoke remain eligible. A missing
lifecycle is accepted only with a valid initial immutable Piece, matching the
existing reader contract. Malformed metadata/authority is reported, not repaired
by guesswork. Creation replays and content, child references, student identity,
lifecycle and packages are never changed by this tool.

An error stops the page immediately; earlier per-record commits remain applied.
The returned cursor is the last successful record (or the input cursor when
none succeeded). Repair/review the reported record before resuming; do not skip
it to claim completion. Re-running a successful page produces no new writes.
Errors contain a record hash and bounded code, not names, titles or document
payloads. The resume cursor is an opaque document ID; keep reports private.

## Verify and acceptance

Unset the apply gate. Run `--mode verify` from the beginning, through every page:

```bash
unset STUDENT_PIECE_BACKFILL_APPLY
node scripts/backfillPieceEligibility.mjs --production --project st-student-app-85cde --mode verify --limit 50
```

Every page must have `errors: []`, `wouldUpdate: 0`, `updated: 0`; continue until
the final `pageComplete: true`. Verify returns nonzero when a page still needs
updates. A resumed page alone does not certify global coverage. Preserve the
aggregate page counters plus the compatible writer deploy SHA and timestamp.
All writers must remain compatible during this scan; the tool does not lock the
whole collection. Any new incompatible writer invalidates that verification.

Only the later activation stage may deploy/verify the composite index, enable
the list filter and run production list/revoke/offline acceptance. This command
never claims index readiness or enables the flag. Remove the session production
authorization gate after use.

## Quota bounds

`--limit` accepts 1–100 (default 50). Dry-run/verify read at most one page of
Pieces plus one lifecycle reference per Piece (about 2L document accesses).
Apply reads the discovery page plus Piece/lifecycle in each transaction (about
3L before retries), and writes at most L projection fields. Empty-query minimum,
missing-document billing and transaction retries remain separate considerations.
These are code-derived access bounds before retries, not billed-read totals.
No other collections are queried.
