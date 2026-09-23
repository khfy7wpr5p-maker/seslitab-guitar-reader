# TD-07 — Chord Board exact voicing assignment design

Date: 2026-09-23  
Repository: `khfy7wpr5p-maker/seslitab-guitar-reader`  
Design base: `7ac590bd45f4df770beaf3e0b26b1f02358e091d`  
Reference Chord Board repository: `khfy7wpr5p-maker/st-guitar-chord-board`  
Reference Chord Board revision inspected during design: `6f8b869c32e9c2c5045449f79f4a686c0a67bb6d`

## 1. Goal

TD-07 enables a teacher to create a private `CHORD_BOARD` assignment in SesliTab from an exact guitar chord voicing, then pass that assignment through the existing TD-05 lifecycle and TD-06 secure-delivery boundary.

The selected voicing is immutable assignment source authority. The system must never reconstruct an assigned guitar position later from a chord symbol, a voicing index, a generator, or a mutable catalog order.

The intended teacher flow is:

```text
SesliTab teacher
  -> Akor Ata
  -> choose chord
  -> choose exact voicing
  -> preview exact diagram
  -> choose one or more active students
  -> optional teacher note
  -> create CHORD_BOARD PrivateAssignment
  -> prepare through TD-06 Secure Delivery
  -> deliver through TD-06 Secure Delivery
```

## 2. Explicit scope

TD-07 includes:

- an immutable exact Chord Board voicing snapshot contract,
- a recipient-bound Chord Board assignment source binding,
- `PrivateAssignment.practiceType = CHORD_BOARD`,
- a teacher-side `Akor Ata` producer/workflow in SesliTab,
- a pinned Chord Board catalog snapshot available inside SesliTab,
- TD-05 lifecycle support for CHORD_BOARD assignments,
- TD-06 prepared/delivery support for CHORD_BOARD assignments,
- fail-closed validation, wire restore, persistence and integrity semantics,
- regression protection for all existing SCORE behavior.

TD-07 does not include:

- modifying the student-facing `st-guitar-chord-board` UI,
- adding `SesliTab'a aktar`, teacher controls, student lists, Firebase credentials or delivery authority to `st-guitar-chord-board`,
- changing the public/student Chord Board link,
- Student App rendering or practice UI for chord assignments,
- Student App cross-repository changes,
- production Firebase provisioning, billing, credentials, Firestore deployment, production flags or production backend deployment,
- automatic runtime synchronization with the Chord Board repository.

Student App consumption is a separate cross-repository gate after TD-07.

## 3. Application boundary

`st-guitar-chord-board` remains a standalone student-facing application.

All teacher assignment authority remains in SesliTab.

The Chord Board repository is a design/source-data reference only for TD-07. SesliTab must not depend on it at runtime.

There is no teacher-only button added to the student-facing Chord Board application.

## 4. Pinned catalog snapshot

SesliTab receives a reviewed catalog snapshot derived from a specific Chord Board source revision.

The first TD-07 baseline is derived from:

```text
repository: khfy7wpr5p-maker/st-guitar-chord-board
revision:   6f8b869c32e9c2c5045449f79f4a686c0a67bb6d
```

The imported catalog snapshot is versioned and contains the exact supported chord identities and exact voicing records required by the teacher UI.

A future Chord Board change does not silently update existing SesliTab assignments and does not silently update the teacher catalog. Catalog refresh is an explicit reviewed change with tests.

The snapshot must include provenance sufficient to identify the source repository revision and a deterministic catalog fingerprint.

## 5. Chord identity

A chord selection must preserve both semantic identity and user-facing spelling when available.

The contract should represent:

- canonical chord identity,
- canonical root,
- quality,
- display root,
- display symbol.

Display spelling is presentation data. Exact guitar voicing is the assignment authority.

## 6. Exact voicing snapshot

Introduce a dedicated immutable contract, conceptually:

```text
ChordBoardVoicingSnapshotV1
  schemaVersion
  sourceKind = "chord_board_exact_voicing"
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

The exact field names may be refined during implementation planning, but the semantic contract above is normative.

### 6.1 String ordering

The six-element string arrays follow the inspected Chord Board model:

```text
index:  0  1  2  3  4  5
string: 6  5  4  3  2  1
        low E          high E
```

### 6.2 Fret semantics

For `frets`:

- `-1` = muted,
- `0` = open,
- positive integer = fretted position.

The TD-07 validator must enforce the bounded fret range supported by the pinned catalog and must reject non-integers, malformed arrays and unsupported values.

### 6.3 Finger semantics

`fingers` contains exactly six bounded integer values consistent with the Chord Board model:

- muted/open positions may use the catalog's non-finger sentinel values,
- fretted positions use valid left-hand finger identifiers,
- the snapshot is validated against a strict contract rather than trusted as arbitrary JSON.

### 6.4 Barre semantics

Each barre is exact source data and must include bounded:

- finger,
- fret,
- fromString,
- toString.

Invalid string ranges, invalid finger values, invalid fret values and contradictory barre geometry fail closed.

### 6.5 Shape and provenance metadata

`shape`, `generated` and `curated` are preserved from the pinned source snapshot where available.

They are not allowed to replace the exact fret/finger/barre data.

## 7. Fingerprint authority

A deterministic `voicingFingerprint` is computed from canonical exact voicing content.

The fingerprint must cover at least:

- canonical chord identity,
- exact frets,
- exact fingers,
- exact barres,
- exact shape,
- relevant generated/curated flags.

Repository revision and catalog provenance are retained separately. Runtime validity must not depend on re-reading the source repository.

Two snapshots that differ musically or structurally must not share the same canonical fingerprint.

## 8. No voicing-index authority

`symbol + voicingIndex` is forbidden as assignment source authority.

A voicing index may exist transiently in teacher UI state, but it must not be sufficient to reconstruct, restore, persist or deliver an assignment.

Reason: catalog order can change between application revisions.

The immutable snapshot itself is the authority.

## 9. Recipient-bound source binding

Separate the recipient-neutral exact voicing snapshot from the per-student assignment binding.

Conceptually:

```text
ChordBoardAssignmentSourceBindingV1
  schemaVersion
  sourceKind = "chord_board_exact_voicing"
  studentId
  snapshot
  voicingFingerprint
  boundAt
```

The source binding must be deeply immutable and must bind exactly one stable `studentId`.

`PrivateAssignment.studentId` must exactly match `sourceRef.studentId`.

The same selected voicing may be assigned to multiple students, but each student receives a separate assignment and a separate recipient-bound source binding.

## 10. Teacher approval semantics

Selecting a chord or changing a voicing in the teacher UI is not itself a durable assignment.

The teacher's explicit `Öğrenciye Ata` action is the authorization point for assignment creation.

The system must not infer teacher approval from:

- merely opening the chord UI,
- highlighting a voicing,
- a saved local selection,
- a chord symbol,
- a catalog default.

## 11. PrivateAssignment union

The current `PrivateAssignment` contract is extended as a strict discriminated union.

For `practiceType = SCORE`:

- existing `ScoreAssignmentSourceBinding` semantics remain unchanged.

For `practiceType = CHORD_BOARD`:

- `sourceRef` must be a valid immutable `ChordBoardAssignmentSourceBindingV1`.

The TD-01 fail-closed placeholder:

```text
chord-board-source-contract-deferred-to-td-07
```

is removed only when the complete CHORD_BOARD source contract is implemented and tested.

No SCORE source validator may be weakened to make CHORD_BOARD pass.

## 12. Teacher-side "Akor Ata" workflow

SesliTab receives a dedicated teacher-side chord assignment UI.

Minimum workflow:

1. choose chord,
2. view the pinned valid voicings for that chord,
3. choose one exact voicing,
4. preview the exact diagram,
5. select one or more active students,
6. optionally enter a common teacher note and per-student override,
7. submit `Öğrenciye Ata`.

The UI may reuse the existing teacher roster and note-entry interaction pattern, but the source producer is CHORD_BOARD-specific.

The teacher UI must not expose internal Firebase tokens, provider diagnostics, evidence identifiers or recipient authority details.

## 13. Batch semantics

Multi-student assignment follows the existing teacher-delivery safety model.

Requirements:

- at least one active student,
- duplicate student selections normalize safely,
- inactive or missing students fail preflight,
- maximum batch size remains bounded consistently with TD-06,
- one invalid assignment prevents partial batch creation,
- one invalid secure-delivery preparation prevents silent partial success,
- each student receives a distinct assignment ID,
- the exact selected voicing snapshot remains identical across recipients except for recipient-bound fields.

## 14. Lifecycle

CHORD_BOARD uses the same teacher-controlled TD-05 lifecycle:

```text
ACTIVE -> COMPLETED -> REPERTOIRE
```

No backward transition is allowed.

Student-facing code does not gain authority to mark an assignment COMPLETED, REPERTOIRE or ready.

Revoke remains one-way. A revoked assignment is not reactivated; a new assignment is created when needed.

The lifecycle implementation must accept both SCORE and CHORD_BOARD assignments without weakening existing validation.

## 15. Secure Delivery integration

TD-06 remains the delivery authority.

The semantic ladder remains:

```text
READY_EXACT_REVISION
  != DURABLY_PREPARED
  != DELIVERED_TO_STUDENT
```

CHORD_BOARD must preserve the same distinction.

Creating a local `PrivateAssignment` is not proof of durable preparation.

Durable preparation is not proof of delivery.

UI success text must reflect the actual state. The UI must never report "Gönderildi" when only local assignment creation or durable preparation succeeded.

## 16. Delivery package strategy

TD-07 must not force CHORD_BOARD data into the existing SCORE-only `StudentPracticePackageV1`.

The current SCORE package requires MusicXML and canonical events. Those fields are not semantically valid for a chord-board assignment.

The preferred architecture is a strict delivery-package union:

```text
SecureDeliveryPackage
  = StudentPracticePackageV1          // existing SCORE package
  | StudentChordBoardPackageV1        // new TD-07 package
```

`StudentPracticePackageV1` remains backward compatible and unchanged in meaning.

`StudentChordBoardPackageV1` contains only the student-safe data needed for the exact chord assignment, including:

- package identity,
- assignment identity,
- private recipient binding,
- teacher-approved/assigned timestamp semantics,
- exact immutable chord snapshot,
- student-safe practice metadata/teacher note as appropriate.

It must not include raw auth credentials, provider diagnostics, internal authorization evidence or unnecessary backend-only metadata.

Student App support for reading/rendering `StudentChordBoardPackageV1` is explicitly deferred.

## 17. Wire codec

The current teacher-delivery wire codec is SCORE-specific.

TD-07 extends restore/compare logic by source-kind discrimination.

The wire codec must:

- restore SCORE bindings exactly as before,
- restore CHORD_BOARD bindings only through the strict TD-07 validator,
- reject unknown source kinds,
- reject mixed SCORE/CHORD_BOARD field sets,
- compare immutable source snapshots structurally and/or via trusted canonical fingerprint semantics,
- preserve deep immutability after restore.

A generic field list that accidentally treats SCORE and CHORD_BOARD as the same shape is not acceptable.

## 18. Persistence

TD-06 persistence must support both assignment types without weakening Firestore authorization.

For CHORD_BOARD persistence:

- exact source snapshot is stored with the assignment/prepared record or through an immutable content-addressed record referenced by that assignment,
- any indirection must preserve exact immutable content and integrity verification,
- a mutable catalog row must never be the sole persisted assignment authority.

The implementation plan must choose the simplest representation that preserves atomicity, bounded document size, replay/idempotence rules and existing TD-06 transaction semantics.

## 19. Idempotence and duplicate detection

Duplicate detection for CHORD_BOARD must be based on recipient plus exact immutable source identity, not voicing index.

At minimum the duplicate key semantics must include:

- student identity,
- exact voicing fingerprint,
- relevant assignment/source version identity.

Exact replay may be idempotent where TD-06 already permits exact replay. Semantically different voicings must not collapse into one assignment.

## 20. Catalog update process

The teacher-side catalog is not automatically synchronized at runtime.

A future catalog update requires:

1. identify a new Chord Board source commit,
2. regenerate/import the candidate snapshot,
3. compute deterministic catalog and voicing fingerprints,
4. compare additions/removals/changes,
5. run contract and regression tests,
6. explicitly accept the snapshot change in SesliTab.

Existing assignments keep their original exact snapshot indefinitely.

## 21. Security and privacy

TD-07 preserves the TD-06 authorization model.

The Chord Board catalog itself contains no teacher/student authorization.

Teacher roster, grants, assignment authority and delivery authority remain in SesliTab/Secure Delivery.

The student-facing `st-guitar-chord-board` application receives no Firebase Admin capability, teacher roster, private recipient metadata or hidden teacher delivery UI.

CHORD_BOARD delivery uses the same fail-closed teacher/student authorization and IDOR protections as SCORE delivery.

## 22. Error behavior

Malformed or unsupported chord data fails closed.

Examples that must be rejected:

- fewer or more than six fret entries,
- fewer or more than six finger entries,
- non-integer fret/finger values,
- out-of-range fret values,
- malformed barre ranges,
- missing chord identity,
- unsupported source kind/schema version,
- mismatched `studentId`,
- fingerprint mismatch,
- unknown catalog snapshot provenance when provenance is required,
- SCORE fields embedded into a CHORD_BOARD binding or vice versa.

Teacher-facing errors must remain bounded and must not expose internal provider diagnostics.

## 23. Compatibility requirements

TD-07 must preserve:

- existing SCORE PrivateAssignment behavior,
- TD-04 roster/multi-student semantics,
- TD-05 lifecycle and revoke behavior,
- TD-06 secure-delivery authorization, replay, preparation and delivery semantics,
- existing feature-flag fail-closed behavior,
- existing Firestore direct-client deny posture,
- production Firebase remaining unconfigured unless separately approved.

## 24. Test requirements

Implementation is not complete without tests covering at least:

### Contract tests

- valid immutable exact voicing snapshot,
- exact six-string ordering,
- fret/finger bounds,
- barre validation,
- fingerprint determinism,
- mutation resistance,
- source-kind/schema rejection.

### PrivateAssignment tests

- valid CHORD_BOARD assignment,
- student/source recipient match,
- invalid CHORD_BOARD source rejection,
- SCORE behavior unchanged,
- removal of TD-01 defer behavior only after replacement contract is active.

### Teacher producer tests

- chord and voicing selection creates exact snapshot,
- common/per-student note behavior,
- inactive/missing student preflight,
- all-or-nothing batch semantics,
- duplicate detection by exact voicing identity,
- teacher explicit action required.

### Catalog tests

- pinned source provenance,
- deterministic catalog fingerprint,
- deterministic voicing fingerprints,
- every imported voicing validates,
- no use of voicing index as durable authority.

### Wire/persistence tests

- SCORE round-trip unchanged,
- CHORD_BOARD round-trip exact,
- unknown/mixed source kinds rejected,
- immutable snapshot survives persistence/restore,
- exact fingerprint preserved.

### Lifecycle tests

- CHORD_BOARD ACTIVE -> COMPLETED -> REPERTOIRE,
- invalid/backward transitions rejected,
- revoke one-way,
- SCORE lifecycle regressions remain green.

### Secure Delivery tests

- CHORD_BOARD preparation,
- CHORD_BOARD delivery,
- authorization/grant enforcement,
- student isolation/IDOR protection,
- revoke-race fail closed,
- exact replay/idempotence,
- batch no-partial-success behavior,
- semantic status ladder preserved.

### UI tests

- teacher can choose chord/voicing,
- exact preview corresponds to selected snapshot,
- student selection works,
- status text does not conflate prepared with delivered,
- internal IDs/tokens/provider diagnostics are not exposed.

### Regression

Full existing Node, build/browser, protected CI, Playwright/Sonar or the repository's current required verification set must remain green before merge.

## 25. Completion criteria

TD-07 is complete only when all of the following are true:

- `CHORD_BOARD` is a fully supported strict `PrivateAssignment` variant,
- exact selected voicing is immutable assignment authority,
- SesliTab has a teacher-side chord assignment producer/workflow,
- the teacher catalog is pinned and provenance-traceable,
- no runtime dependency on `st-guitar-chord-board` exists,
- `st-guitar-chord-board` student UI remains unchanged,
- lifecycle/revoke work for CHORD_BOARD,
- TD-06 secure prepare/delivery works for CHORD_BOARD,
- SCORE regressions remain green,
- Student App code remains untouched in this stage,
- production Firebase/cloud actions remain behind their separate human gate.

## 26. Explicit non-goals / future gate

After TD-07, a separate cross-repository design may add Student App support for:

- discovering CHORD_BOARD deliveries,
- rendering exact chord diagrams,
- practicing assigned positions,
- student-safe playback or exercise behavior.

That future work must consume the exact immutable assignment/package produced here and must not reinterpret a chord symbol into a potentially different guitar voicing.

