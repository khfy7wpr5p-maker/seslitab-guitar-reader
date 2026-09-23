# TD-07 — Chord Board assignment runtime and verification

Date: 2026-09-23  
Repository: `khfy7wpr5p-maker/seslitab-guitar-reader`  
Feature branch: `feat/td07-chord-board-assignment`  
Pull request: `#249` (draft at the time of this document)

## Scope delivered

TD-07 adds a teacher-side SesliTab workflow for assigning an exact immutable guitar-chord voicing to one or more students.

The implementation includes:

- a pinned Chord Board catalog snapshot,
- an exact immutable six-string voicing contract,
- deterministic browser/backend SHA-256 voicing fingerprints,
- recipient-bound `CHORD_BOARD` assignment source bindings,
- strict `PrivateAssignment` SCORE/CHORD_BOARD discrimination,
- teacher-side batch assignment creation,
- TD-05 lifecycle and revoke compatibility,
- `StudentChordBoardPackageV1`,
- a strict SCORE/CHORD_BOARD Secure Delivery package union,
- TD-06 prepare/deliver/read support for CHORD_BOARD,
- Firestore emulator persistence/round-trip support,
- an explicit-mount SesliTab teacher UI named `Akor Ata`,
- exact status separation between local assignment, durable preparation and delivered state.

## Chord Board source boundary

The teacher catalog is pinned from:

```text
repository: khfy7wpr5p-maker/st-guitar-chord-board
source revision: 6f8b869c32e9c2c5045449f79f4a686c0a67bb6d
```

Fresh verification on 2026-09-23 confirmed that this is also the current `st-guitar-chord-board/main` revision.

TD-07 does not modify `st-guitar-chord-board`.

The standalone student-facing Chord Board app therefore does not receive:

- an `SesliTab'a aktar` button,
- teacher controls,
- roster/student assignment data,
- Firebase Admin capability,
- Secure Delivery authority.

The catalog is imported as a reviewed static snapshot in SesliTab. There is no runtime dependency on the standalone Chord Board app.

Catalog refresh is explicit:

```bash
CHORD_BOARD_SOURCE_DIR=/path/to/read-only/st-guitar-chord-board-at-6f8b869c32e9c2c5045449f79f4a686c0a67bb6d node scripts/generateChordBoardCatalogSnapshot.mjs
```

A future Chord Board catalog update must be regenerated, diffed, tested and accepted as a separate SesliTab change.

## Exact voicing authority

String-array order is:

```text
index:  0  1  2  3  4  5
string: 6  5  4  3  2  1
        low E          high E
```

Fret semantics are:

- `-1` muted,
- `0` open,
- `1..20` fretted.

Finger semantics are:

- `-1` muted,
- `0` open/no finger,
- `1..4` left-hand finger.

Barres preserve exact `finger`, `fret`, `fromString`, `toString` geometry.

Durable assignment authority is the exact immutable snapshot:

```text
ChordBoardVoicingSnapshotV1
  schemaVersion
  sourceKind = chord_board_exact_voicing
  chord
    canonicalSymbol
    canonicalRoot
    quality
    displayRoot
    displaySymbol
  voicing
    frets[6]
    fingers[6]
    barres[]
    shape
    generated
    curated
  provenance
    sourceRepository
    sourceCommit
    catalogFingerprint
  voicingFingerprint
```

`symbol + voicingIndex` is not durable authority.

The assigned voicing is never reconstructed later from a chord symbol or mutable catalog order.

## Fingerprints

`voicingFingerprint` is SHA-256 over canonical musical content:

- schema version,
- source kind,
- chord identity/presentation fields,
- exact voicing fields.

Catalog provenance is intentionally outside the musical voicing hash and remains separately auditable.

Browser and backend fingerprint implementations share the same canonical JSON semantics.

The backend recomputes the exact voicing fingerprint before durable Secure Delivery preparation.

Fingerprint equality alone is not treated as sufficient exact-replay proof where structural equality can also be checked.

## PrivateAssignment

`PrivateAssignment` is now a strict discriminated union.

For:

```text
practiceType = SCORE
```

the existing `ScoreAssignmentSourceBinding` remains unchanged.

For:

```text
practiceType = CHORD_BOARD
```

the source must be a valid immutable `ChordBoardAssignmentSourceBindingV1`.

Each binding is recipient-specific and binds exactly one stable `studentId`.

The old TD-01 fail-closed placeholder for CHORD_BOARD has been replaced by the real strict contract.

## Teacher Akor Ata workflow

The teacher-side flow is:

```text
SesliTab
  -> Akor Ata
  -> choose chord
  -> choose exact voicing
  -> preview six-string exact snapshot
  -> choose active student(s)
  -> optional common/per-student note
  -> Öğrenciye Ata
  -> local CHORD_BOARD PrivateAssignment
  -> TD-06 durable preparation
  -> TD-06 delivery
```

The UI renders fret/finger values directly from the selected exact snapshot.

It does not derive a new voicing from the chord symbol.

The UI is explicit-mount only in TD-07. It is not auto-mounted from `main.js`, `src/app.js` or `src/appShell.js`.

Production teacher-auth/roster activation remains a separate gate.

## Multi-student behavior

The teacher assignment service:

- requires active roster entries,
- normalizes duplicate student selections,
- supports one common teacher note,
- supports per-student note overrides,
- supports at most 40 recipients,
- preflights before repository mutation,
- creates a separate assignment ID/source binding per student,
- uses the same exact voicing snapshot for all selected recipients,
- fails closed rather than silently accepting a partial batch,
- recognizes exact idempotent retry,
- rejects conflicting retry semantics.

## Lifecycle

CHORD_BOARD reuses the TD-05 lifecycle:

```text
ACTIVE -> COMPLETED -> REPERTOIRE
```

Backward transitions remain disallowed.

Revoke remains one-way.

Student-facing code does not gain lifecycle authority.

## Secure Delivery package

CHORD_BOARD is not encoded as fake MusicXML and is not forced into `StudentPracticePackageV1`.

Secure Delivery now uses a strict package union:

```text
SecureDeliveryPackage
  = StudentPracticePackageV1
  | StudentChordBoardPackageV1
```

The SCORE package retains its existing meaning.

`StudentChordBoardPackageV1` contains only student-safe assignment data, including:

- package/assignment identity,
- private recipient binding,
- teacher-assigned timestamp authority,
- exact immutable chord snapshot,
- student-safe practice metadata.

The generic delivery paths reject mixed or ambiguous SCORE/CHORD_BOARD payloads.

## Delivery status semantics

TD-07 preserves:

```text
READY_EXACT_REVISION
  != DURABLY_PREPARED
  != DELIVERED_TO_STUDENT
```

The teacher UI therefore reports:

- local assignment failure separately,
- durable prepare failure separately,
- `hazırlandı ancak gönderilemedi` when preparation succeeded but delivery failed,
- `gönderildi` only after exact delivery acknowledgement.

Raw provider errors, tokens and internal authorization diagnostics are not surfaced to the teacher UI.

## Firestore/emulator behavior

The existing TD-06 collections and authorization boundaries are reused.

Firestore persistence now round-trips both SCORE and CHORD_BOARD secure package variants.

CHORD_BOARD tests cover:

- nested exact `frets/fingers/barres` persistence,
- package/source restoration,
- package fingerprint verification,
- teacher grant enforcement,
- recipient isolation,
- lifecycle/revoke integration,
- atomic/fail-closed batch behavior.

Direct Firestore client access remains denied by the existing TD-06 Rules posture.

No Rules/index deployment is performed by TD-07.

## Student App boundary

TD-07 does not modify `khfy7wpr5p-maker/st-student-app`.

Fresh verification on 2026-09-23 observed:

```text
st-student-app/main = 3d6f77d4376df21d66e66179b492535808f6ee9c
```

The backend secure-delivery read model can preserve/return the student-safe package union, but Student App rendering/practice support for CHORD_BOARD remains a separate cross-repository design and approval gate.

## Production gates still closed

TD-07 does not authorize or perform:

- production Firebase project creation/selection,
- production Authentication provider activation,
- production Firestore creation/modification,
- production Firestore Rules/index deployment,
- Firebase Admin production credentials,
- billing/payment method changes,
- production environment variables,
- real teacher/student identity mappings or grants,
- production Secure Delivery feature-flag activation,
- backend production deployment,
- production auto-mount of `Akor Ata`,
- Student App changes,
- Chord Board app changes,
- merge of PR #249.

## Main synchronization

Before final verification, current `main` was merged into the TD-07 feature branch through maintenance PR #253.

Synchronized source main:

```text
main = 2dc5e16cd815e8fa17e6ab6796ed0e3afcb9045b
```

Post-sync implementation head before this documentation commit:

```text
d958494ac1cc85d7ebca5da487f4f6ba55cb84a8
```

At that head the feature branch was:

```text
ahead of main: 51 commits
behind main: 0 commits
```

## Verification evidence for synchronized implementation head

Evidence for `d958494ac1cc85d7ebca5da487f4f6ba55cb84a8`:

### CI run #981

- Firebase emulator boundary: PASS
- emulator tests: 14 PASS / 0 FAIL
- full Node suite: 2008 tests
- PASS: 1994
- FAIL: 0
- SKIP: 14
- production build: PASS
- protected real-browser CI checks: PASS

### Regression Quality run #318

- Playwright protected baseline: PASS
- SonarQube Cloud analysis: PASS

## Diff boundary review

The TD-07 diff against synchronized `main` changes only the SesliTab repository.

Not changed by TD-07:

- `main.js`,
- `src/app.js`,
- `src/appShell.js`,
- production Firebase configuration,
- standalone Chord Board repository,
- Student App repository.

Security/semantic review specifically checks for:

- no durable `voicingIndex` authority,
- no chord-symbol-to-voicing reconstruction in assignment/delivery,
- no mutable catalog-only assignment authority,
- no raw token/provider UID exposure in teacher UI,
- no production Firebase activation,
- no silent prepared-as-delivered status,
- no browser import of `node:crypto`.

## Merge readiness rule

This document does not authorize merge.

After this documentation commit, CI and Regression Quality must run again on the new exact TD-07 head.

Only after that exact-head verification and final review may PR #249 be presented for explicit human merge approval.
