# TEACHER-DELIVERY-01 — Teacher Delivery & Assignment Management Design

**Date:** 2026-09-22  
**Status:** Written architecture spec only. Product-code implementation is not authorized by this document.  
**Repository:** `khfy7wpr5p-maker/seslitab-guitar-reader`  
**Spec baseline:** protected `main` at `d92670f6c659236902f41e46871c2ddd916eb7d1`  
**Required protected-main check observed:** `test-and-build`

## 1. Purpose

TEACHER-DELIVERY-01 adds the teacher-owned producer and management boundary that begins **after** the existing Package 12 / Stage L exact-revision readiness decision.

The product goal is deliberately narrow:

- publish simple repertoire/announcement items to the Pool;
- create private student assignments from teacher-approved work;
- let the teacher manage completion, repertoire placement and revocation;
- preserve student isolation and exact-revision safety;
- prepare a provider-neutral boundary for later secure persistence/delivery;
- keep Student App read-only for teacher-owned publication and assignment lifecycle.

This program does **not** redefine Package 12, Stage L, teacher approval, quality routing, OMR, renderer or correction authority.

## 2. Repository reality confirmed before this spec

Protected `main` currently states and implements:

- Package 8 keeps automatic, teacher-corrected and teacher-approved revision layers separate.
- Package 12 T1–T4 provide exact-revision authorization, quality eligibility and corrected-revision revalidation contracts.
- Stage L composes those contracts only into bounded readiness metadata.
- `READY_EXACT_REVISION != DELIVERED_TO_STUDENT`.
- Stage L always returns `deliveryState = not_implemented` and `deliveryAllowed = false`.
- Stage L does not create authenticated student accounts, persistent grants, tokens, URLs, payloads or network delivery.
- Current Stage L recipient text is caller-supplied and is explicitly not an authenticated identity.
- Protected `main` is protected and requires `test-and-build`.

The new program must therefore be additive: readiness remains readiness, while teacher delivery management is a distinct later boundary.

## 3. Cross-repository context

### ST Student App

Read-only baseline observed:

- merged `main`: `a5ede988f198c49b70021d621554b55e6b961502`;
- STUDENT-08/09 draft PR #9 remains design-only.

That draft direction is compatible with this teacher-side design:

- Pool is card/detail only;
- private assignments are one record per student;
- states are `ACTIVE | COMPLETED | REPERTOIRE`;
- state changes are teacher-owned;
- assignment types are `SCORE | CHORD_BOARD`;
- Student App has no teacher lifecycle write authority.

This teacher spec does not treat the Student App draft as a finalized cross-repository runtime contract.

### ST Guitar Chord Board

Read-only baseline observed: `6f8b869c32e9c2c5045449f79f4a686c0a67bb6d`.

Current Chord Board evidence confirms that exact voicings are represented with six-string fret/finger data, barre metadata, canonical chord identity and exact string/fret-to-MIDI evidence. TEACHER-DELIVERY-01 does not write to that repository.

## 4. Approaches considered

### Approach A — Extend Stage L until it becomes delivery

Rejected.

Stage L is intentionally bounded readiness. Reusing `READY_EXACT_REVISION` as a delivery flag would collapse approval, authorization, readiness and actual delivery into one state and would invalidate existing safety documentation and tests.

### Approach B — Add a new post-readiness teacher producer/management domain

Selected.

Package 12 / Stage L remains unchanged. The new domain receives stable teacher-management identities, re-checks exact current SCORE eligibility when necessary, materializes teacher-owned Pool/Assignment records and later passes them to a dedicated secure persistence/delivery adapter.

This keeps existing authority intact and permits backend/security work to remain a separately reviewed stage.

### Approach C — Let Student App own assignment state and publication writes

Rejected.

Student App is a read-only consumer for teacher-owned content. Giving the student product publication, completion, repertoire or revocation authority would violate the approved product boundary and increase security risk.

## 5. Core architecture ruling

**Ruling: TEACHER-DELIVERY-01 is a new post-readiness producer/management layer — Package 12 and Stage L remain exact-revision readiness authorities, not delivery authorities — cost if wrong: stale or unverified work could be treated as student-delivered merely because a readiness flag existed.**

Target flow:

```text
PDF / MusicXML / OMR intake
→ teacher correction
→ exact current revision
→ exact teacher approval
→ existing Package 12 / Stage L readiness evaluation
→ NEW Teacher Delivery Management
   ├─ PoolItem
   └─ PrivateAssignment
→ secure persistence / delivery adapter
→ Student App read-only consumption
```

## 6. Domain boundaries

The first implementation stages create provider-neutral domain contracts. They do not assume Firebase, provision cloud services or ship admin credentials to the browser.

### 6.1 StudentRosterEntry

Purpose: allow a teacher to select a human-readable student while authorization and storage use a stable identity.

Version-1 minimum fields:

```text
studentId
displayNameOrNickname
active
```

Rules:

- `studentId` is the only authorization/storage identity.
- display name or nickname is presentation only.
- inactive students cannot be newly targeted.
- duplicate stable IDs are invalid.
- roster access belongs to a trusted teacher-management boundary.
- the browser must not behave as though Firebase client Authentication can securely list all users.
- Student App contracts must never expose the teacher roster.

**Ruling: display names never authorize access — stable `studentId` is the target identity — cost if wrong: duplicate or changed nicknames could route private work to the wrong person.**

### 6.2 PoolItem

Pool is a lightweight repertoire/announcement publication domain. It is not a score-practice payload.

Version-1 minimum fields:

```text
schemaVersion
poolItemId
title
shortDescription
detailText
publishedAt
audienceMode: ALL | SELECTED
recipientStudentIds[]
revokedAt | null
```

Rules:

- `ALL` is the default audience.
- `ALL` forbids recipient IDs.
- `SELECTED` requires at least one unique, active `studentId`.
- selected recipients are normalized and deduplicated before persistence.
- students must never receive the selected-recipient list as consumer-visible data.
- PoolItem contains no MusicXML, notation runtime state, playback plan, teacher revision internals or Practice Package payload.
- revocation sets `revokedAt`; it does not hard-delete the audit record.

**Ruling: targeted Pool visibility uses a separate PoolItem contract — existing Practice Package `public_pool` is not overloaded — cost if wrong: a score-publication contract could gain recipient semantics it currently forbids and student authorization would become ambiguous.**

### 6.3 PrivateAssignment

A private assignment is student-specific metadata plus an exact source binding.

Version-1 minimum fields:

```text
schemaVersion
assignmentId
studentId
practiceType: SCORE | CHORD_BOARD
teacherNote
state: ACTIVE | COMPLETED | REPERTOIRE
assignedAt
revokedAt | null
sourceRef or immutableSnapshot
```

Rules:

- exactly one `studentId` per assignment;
- no shared recipient list;
- teacher note belongs to this student-specific assignment;
- students never see other recipients;
- assignment lifecycle is teacher-owned;
- revoked records remain auditable but are no longer active delivery.

**Ruling: a multi-student send fans out to N independent PrivateAssignment records — no private multi-recipient record exists — cost if wrong: recipient lists, notes or lifecycle state could leak across students.**

## 7. SCORE source binding

SCORE is the first delivery path.

A SCORE assignment may be created only from the exact current revision that is teacher-approved and currently eligible through the applicable Package 12 route.

The assignment source binding must preserve enough immutable identity to prevent later silent movement:

```text
sourceId
revisionId
contentFingerprint or equivalent exact immutable binding
approvalId
practicePackageRef or later immutable delivery artifact reference
```

The consumer-facing payload must not expose internal revision IDs, Package 12 reason codes, provider names or raw diagnostics.

Creation rules:

1. resolve the current teacher revision;
2. resolve the currently applicable exact approval;
3. use the stable target `studentId` as the recipient identity supplied to the existing readiness/eligibility path;
4. evaluate current applicable Package 12 readiness;
5. require `READY_EXACT_REVISION`;
6. bind the new assignment to that exact revision;
7. never reinterpret a later corrected revision as the same assignment source.

A correction or undo after assignment creation does not mutate the existing assignment. A new revision requires a new applicable approval and a new assignment/publishing action if the teacher wants the changed work delivered.

**Ruling: readiness is re-evaluated at assignment creation time for the selected stable student ID — old UI readiness results are never cached as delivery truth — cost if wrong: Smoosic or another correction path could create a newer revision while an old readiness result is still displayed.**

## 8. Interaction with Smoosic write-back PR #232

Open PR #232 introduces a possible future Smoosic → immutable teacher-corrected revision write-back path.

TEACHER-DELIVERY-01 does not modify that PR and has no current file-level overlap with its product code. The semantic interaction is important:

- a successful Smoosic write-back may create a new current teacher revision;
- previous approval/readiness must become inapplicable when existing Package 8/12 rules say so;
- assignment creation must therefore fresh-resolve current revision/approval/readiness at action time;
- existing assignments remain bound to their previous exact immutable source and are not silently upgraded.

This is a compatibility requirement, not a dependency on PR #232 being merged.

## 9. Multi-student fan-out

Teacher UI may select multiple students, but domain creation remains one assignment per student.

Proposed operation:

```text
selected stable studentIds
→ normalize + deduplicate
→ roster preflight
→ exact SCORE eligibility preflight for every selected student
→ create deterministic fan-out plan
→ persistence adapter writes one PrivateAssignment per student
```

Version-1 policy:

- invalid/inactive targets fail before write;
- duplicate targets do not create duplicate assignments;
- the UI must not claim global success after a partial write;
- the later persistence adapter should use an atomic/batched write when the selected backend supports it;
- if a backend cannot provide atomic batch semantics, it must return explicit per-record outcomes and the UI must show a bounded partial-failure state rather than “Gönderildi”.

**Ruling: no silent partial multi-student success — either a bounded batch succeeds or failures are explicitly surfaced — cost if wrong: teacher and students could disagree about who actually received an assignment.**

## 10. Assignment lifecycle

Version-1 state machine is deliberately small:

```text
ACTIVE
  └─ teacher: Tamamlandı
       ↓
COMPLETED
  └─ teacher: Repertuara Ekle
       ↓
REPERTOIRE
```

No reverse transition is included in v1.

Revocation is orthogonal:

```text
ACTIVE | COMPLETED | REPERTOIRE
→ teacher: Geri Çek
→ revokedAt != null
```

Rules:

- `COMPLETED` never automatically implies `REPERTOIRE`;
- student cannot transition any state;
- revoked assignment keeps its last lifecycle state for audit but is excluded from active consumer delivery;
- hard deletion is not part of normal lifecycle.

**Ruling: completion and repertoire are explicit teacher transitions, revocation is a separate tombstone — cost if wrong: audit history would be lost or repertoire could be populated automatically against teacher intent.**

## 11. Teacher management services

The target service boundary is split by responsibility rather than by provider.

### Roster service

Responsibilities:

- list teacher-visible active/inactive roster entries;
- resolve stable IDs;
- reject malformed/ambiguous entries.

No browser admin secret.

### Pool management service

Responsibilities:

- validate and create PoolItem;
- revoke PoolItem;
- produce consumer-safe projection that omits internal recipient lists where required.

### Assignment management service

Responsibilities:

- validate SCORE/CHORD_BOARD assignment contracts;
- perform SCORE exact-revision readiness preflight;
- build per-student fan-out;
- perform teacher-only lifecycle transitions;
- revoke assignments.

### Persistence / delivery port

Introduced only in TD-06 after security review.

Responsibilities:

- persist producer records;
- enforce target-student reads;
- enforce teacher-only writes;
- provide bounded atomicity for fan-out/state transitions/revocation;
- return an explicit success/failure receipt.

No domain service may claim student delivery merely because an in-memory object was built.

**Ruling: a teacher-facing “Gönderildi” success state requires persistence/delivery-port acknowledgement, not object construction — cost if wrong: UI could report delivery even though nothing durable or readable exists.**

## 12. Production enablement before TD-06

TD-01 through TD-05 may define/test contracts and provider-neutral presentation wiring, but production must not pretend persistence exists.

Until a reviewed secure adapter is available:

- no live Firebase/admin writes;
- no student-facing delivery success;
- no hidden network endpoint;
- no production credentials;
- no billing/provisioning;
- any UI surface that cannot complete a real durable action remains disabled, hidden from normal production flow or explicitly bounded to a non-production/test adapter.

This prevents the earlier Stage L “readiness only” boundary from being relabeled as sending.

## 13. Teacher UI

Normal teacher UI should remain concise.

### Ready work actions

On an exact approved/eligible work, the target primary actions are:

- **Havuza Gönder**
- **Öğrenciye Gönder**

Technical Package 12, revision, Firebase/provider and evidence vocabulary stays out of the normal flow.

### Havuza Gönder

Minimal form:

- title;
- short description;
- optional detail text;
- audience: `ALL` default or `SELECTED`;
- student multi-select only when `SELECTED`.

No MusicXML/practice payload is attached to PoolItem.

### Öğrenciye Gönder

Minimal form:

- student multi-select;
- optional teacher note field per selected student;
- send action.

A selected student row may expose its own note field; the assignment record owns that note.

### Gönderilenler

Teacher-only management view shows only required lifecycle actions:

- Tamamlandı;
- Repertuara Ekle;
- Geri Çek.

Internal IDs remain hidden in normal presentation.

### Existing Stage L panel

This spec does not delete or change Stage L.

While TEACHER-DELIVERY-01 is incomplete, Stage L stays truthful readiness UI. A later integration stage may move the legacy readiness panel out of the normal daily surface only after the new producer/delivery path is verified, while continuing to reuse the same underlying Package 12 authority.

## 14. Accessibility

Teacher UI requirements:

- native semantic controls where practical;
- full keyboard operability;
- visible focus;
- screen-reader label/status text;
- no mouse-only action;
- touch targets consistent with existing SesliTab rules;
- error/success state announced without raw technical diagnostics;
- multi-select and per-student note controls must remain understandable by screen reader.

Student projection requirements:

- teacher note is available only to the target student;
- other recipients and roster metadata are absent;
- Pool card/detail remains simple and does not open practice content.

## 15. Security and privacy

Hard requirements:

- nickname/display name never authorizes;
- one student's private assignment or teacher note is never readable by another student;
- selected-recipient arrays are not exposed to non-target students;
- UI never invents approval/readiness/delivery truth;
- stale approval is never reused after correction/undo;
- no production Firebase/admin secret in repository or browser bundle;
- no live migration, security-rule deployment, credential creation/rotation or paid-service provisioning without explicit human approval;
- Student App cannot create, publish, revoke, complete or promote teacher-owned assignments;
- student read authorization uses exact stable student identity;
- provider errors are sanitized before presentation.

## 16. CHORD_BOARD deferred adapter

CHORD_BOARD starts only after SCORE delivery is stable.

It does not generate MusicXML for transport.

Version-1 immutable snapshot direction:

```text
schemaVersion
displaySymbol
canonicalChordIdentity
frets[6]
fingers[6]
barres[]
bounded exact MIDI/audio evidence needed by consumer
```

Validation must ensure six-string shape and bounded metadata. Unsupported or malformed voicings fail closed.

Old assignments must keep the exact selected snapshot even if Chord Board later changes catalog ranking or ordering.

**Ruling: Chord Board assignment stores the exact selected voicing snapshot rather than a catalog index — cost if wrong: an old homework item could silently change fingering after a future catalog reorder.**

No cross-repository source write is authorized by this spec.

## 17. Error handling

Fail closed for:

- malformed or ambiguous IDs;
- missing/inactive roster target;
- empty `SELECTED` Pool audience;
- recipient list present with `ALL`;
- stale/non-current SCORE revision;
- missing/inapplicable approval;
- non-ready applicable Package 12 result;
- unsupported revision kind;
- malformed assignment lifecycle transition;
- unavailable persistence adapter;
- provider write/read failure;
- malformed Chord Board snapshot.

UI copy is short and human-readable. Raw exception messages, revision IDs and provider internals are not shown to normal users.

## 18. Implementation decomposition

The program is intentionally split into bounded stages.

### TD-01 — Teacher Delivery Contracts

- versioned `StudentRosterEntry`, `PoolItem`, `PrivateAssignment`;
- lifecycle rules;
- SCORE exact source binding;
- no Firebase writes;
- no product UI.

### TD-02 — Teacher Roster + Management Service

- provider-neutral trusted roster;
- human-readable selection → stable studentId;
- inactive-target rejection;
- no browser admin secret.

### TD-03 — Pool Publishing

- Havuza Gönder producer/UI boundary;
- ALL / SELECTED;
- revoke;
- Pool card/detail data only.

Production success remains gated by an available persistence port.

### TD-04 — SCORE Private Assignment

- Öğrenciye Gönder producer/UI boundary;
- multi-select fan-out;
- per-student note;
- exact readiness re-check;
- revoke.

Production success remains gated by an available persistence port.

### TD-05 — Assignment Lifecycle

- teacher-only `ACTIVE → COMPLETED → REPERTOIRE`;
- Gönderilenler management view;
- no student Hazırım path.

### TD-06 — Secure Persistence / Delivery Adapter

Only after dedicated security review:

- select/confirm backend/provider boundary;
- student-isolated reads;
- teacher-only writes;
- bounded atomic fan-out/transitions;
- revocation;
- no secrets in browser/repo;
- no production provisioning without explicit approval.

### TD-07 — Chord Board Assignment Adapter

Only after SCORE path is stable:

- read exact Chord Board contract;
- immutable voicing snapshot;
- no MusicXML transport;
- no cross-repository write unless separately authorized.

## 19. Open PR conflict map

### PR #232 — S15 Smoosic write-back

Current files do not overlap this new spec path. Semantic risk exists because Smoosic write-back may create a new teacher revision. Mitigation: every SCORE assignment resolves exact current revision/approval/readiness at action time; existing assignments remain exact-source bound.

### PR #192 — STI-18 documentation synchronization

PR #192 modifies:

- `docs/current-status.md`;
- `docs/package-status.md`;
- `docs/teacher-score-editor-architecture.md`;
- integration manifest.

This spec branch intentionally does not modify those files.

Any later TEACHER-DELIVERY documentation refresh that needs those files must fresh-read/rebase after PR #192 disposition and must not overwrite its integration reality.

## 20. Verification direction

Each implementation stage requires focused tests plus the applicable repository gates.

Contract/security test themes:

- malformed/bounded ID rejection;
- Pool ALL/SELECTED invariants;
- recipient normalization/deduplication;
- one PrivateAssignment per student;
- student A cannot see student B assignment/note;
- inactive roster target rejection;
- stale/non-approved/non-ready SCORE rejection;
- exact revision source binding;
- correction/undo never silently mutates an existing assignment source;
- legal/illegal lifecycle transitions;
- revocation excludes consumer visibility while preserving audit record;
- Student App has no lifecycle write authority;
- no delivery success without persistence-port acknowledgement;
- provider error sanitization.

Repository verification after behavior implementation:

- focused unit/contract tests;
- full `npm test`;
- `npm run build`;
- protected-main required CI;
- browser/accessibility verification for teacher UI;
- exact PR head SHA verification;
- fresh-read main before merge-readiness claim.

## 21. Explicit non-goals

This program does not implement:

- Student App product work;
- student playback cursor/highlight;
- chat or free-form messaging;
- student Hazırım;
- student completion/repertoire writes;
- class/group management;
- gamification or practice analytics;
- push notifications;
- payments;
- OMR/Audiveris changes;
- Render/Docker/Cloud OMR Gateway changes;
- renderer/Smoosic refactor;
- Chord Board cross-repo modification;
- native app rewrite.

## 22. Intentionally deferred decisions

These are deliberate review gates, not missing requirements:

1. **Concrete persistence provider/configuration** — deferred to TD-06 security review. The domain remains provider-neutral.
2. **Production authentication/roster backing** — must match the trusted management and Student App authorization model selected at TD-06; no Firebase assumption is made here.
3. **Final cross-repository student payload mapping** — teacher contracts are designed for compatibility, but Student App PR #9 remains design-only and is not treated as finalized runtime authority.
4. **Chord Board runtime/export contract** — deferred to TD-07 after SCORE delivery is stable.

## 23. YAGNI self-check

Excluded from v1 on purpose:

- messaging;
- student state writes;
- automatic repertoire promotion;
- assignment editing that retargets an existing exact score source;
- group/class abstractions;
- notification infrastructure;
- analytics;
- automatic Chord Board rhythm/progression grading;
- backend/provider choice before security review.

The first product value is only: teacher selects an eligible exact work, chooses students, creates isolated assignments, and later manages their simple teacher-owned lifecycle without weakening existing SesliTab safety boundaries.
