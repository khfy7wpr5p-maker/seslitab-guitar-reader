# Package 12-T3 — Bounded Teacher-Corrected Revalidation / Provenance

Status: **Completed.**

## Purpose

Package 12-T3 closes the first safe gap between teacher correction and Package 12 sharing eligibility.

T1 proves explicit authorization for one exact approved revision and recipient. T2 proves that an unmodified automatic revision still owns live exact-array Package 7C/2C/2D evidence. T3 adds a deliberately bounded path for a `teacher_corrected` revision without pretending that the original raw MusicXML also contains the teacher's later edit.

T3 returns **revalidation metadata only**. It does not build or expose a student payload.

## Critical provenance rule

A Package 8 teacher revision is an immutable snapshot. After a teacher edit, its corrected content is not the same source artifact as the original raw MusicXML.

T3 therefore does **not**:

- register the old MusicXML against the corrected revision content;
- copy Package 7C exact-array provenance from the automatic array to corrected notes;
- reuse inherited `sourceVerificationState` as proof that the edited values were verified;
- describe a teacher edit as OMR or MusicXML source truth.

Instead, T3 records a separate `teacher_corrected_revalidated` provenance record bound to the exact correction history and exact corrected revision.

## Root safety baseline

Before any corrected revision can be revalidated, T3 requires the original automatic root to remain live and eligible under Package 12-T2.

The caller supplies:

- the exact automatic source `NoteObject[]`;
- the exact previously issued automatic T2 quality evidence;
- the immutable Package 8 revision history.

T3 replays `createTeacherShareQualityEvidence(...)` against the current exact source array. Source mutation, removed/replaced Package 7C evidence, removed/downgraded Package 2C report, or Package 2D gate regression invalidates the corrected-revision evidence.

## Bounded correction scope v1

T3 v1 accepts only direct primitive pitch/position corrections on existing note indexes:

- `step`
- `alter`
- `octave`
- `noteName`
- `midi`
- `frequency`
- `fret`

All other correction fields fail closed in this stage.

In particular, T3 v1 does not authorize corrections to duration, beats, MusicXML duration values, dots, voice, staff, tie state, or string identity. Undo-created histories are also excluded. Those cases require a later structural/rhythmic post-correction validation stage.

No insertion/deletion/reordering of notes is introduced.

## Exact correction provenance

T3 consumes the strict Package 8 history rather than a caller-supplied summary. The existing history validator replays correction audit events against every immutable revision transition.

T3 additionally binds its evidence to:

- history ID;
- source ID and automatic source revision ID;
- automatic root content + lineage fingerprints;
- exact target revision ID, parent ID, timestamp, content fingerprint and lineage fingerprint;
- current automatic T2 evidence ID and MusicXML source fingerprint;
- correction event count;
- correction operation count;
- deterministic corrected target set;
- deterministic full correction-chain fingerprint;
- deterministic T3 revalidation fingerprint.

Evidence identity and timestamps remain caller-supplied. T3 generates neither.

## Corrected-state validation

For every note touched by the accepted scope, T3 validates the final corrected state rather than trusting copied verification metadata.

Pitch validation uses the existing canonical pitch resolver over written pitch plus MIDI/frequency. The resolved MIDI and note name must equal the final corrected note fields.

When guitar position evidence is present, T3 reuses Package 4A's written-pitch candidate resolver and requires the final string/fret position to be a real candidate under the existing standard-tuning, 24-fret, written-guitar-transposition contract. T3 never selects a new fingering.

If pitch identity changed, existing tie topology is checked conservatively. A malformed/dangling tie after the edit fails closed. Editing tie state itself is outside T3 v1.

## Live evaluation

`evaluateTeacherCorrectedShareEligibility(...)` first applies the existing T1 authorization/recipient/revocation rules. It then requires:

1. the exact revision to be the exact current object in the supplied valid history;
2. strict immutable T3 evidence bound to that history/revision;
3. live automatic-root T2 replay to remain eligible;
4. the correction scope to remain inside T3 v1;
5. the final corrected pitch/position state to remain mechanically valid;
6. the freshly derived correction targets/chain/revalidation fingerprints to match the issued evidence.

A later correction makes earlier T3 evidence stale/non-current. Evidence cannot move between histories or revisions.

## Eligibility states

T3 uses explicit fail-closed states:

- `eligible_corrected_revision`
- `authorization_not_applicable`
- `recipient_mismatch`
- `revoked`
- `revalidation_evidence_missing`
- `revalidation_evidence_invalid`
- `revalidation_evidence_not_applicable`
- `revalidation_evidence_stale`
- `history_not_current`
- `root_quality_not_eligible`
- `unsupported_correction_scope`
- `corrected_state_invalid`

Only `eligible_corrected_revision` returns `eligible: true`.

## Verified implementation evidence

- issue **#131** defined the bounded T3 scope;
- implementation PR **#133** merged to protected `main`;
- final implementation PR head SHA `762deb461ae2284efbeec148a2872f3866bfcdaa`;
- protected-main implementation SHA `fe940cd0b633055845e06504eeeb4287aed3f4d1`;
- implementation-branch CI **#342 / run `33262049864`, job `99125548995` — SUCCESS**;
- exact-main CI **#343 / run `33262154615`, job `99125825785` — SUCCESS**;
- **1406 / 1406 tests PASS**, **235 suites**, 0 failed/skipped/cancelled;
- **0 vulnerabilities**;
- production build **PASS**;
- real Chrome score render + cursor runtime proof **PASS**.

The focused T3 regressions verify inherited verification rejection, invalid fret rejection, multi-hop bounded correction provenance, unsupported rhythm/voice/staff/tie rejection, undo rejection, live root-evidence invalidation, source mutation detection, cross-history rejection, stale-revision rejection, authorization/revocation precedence, strict evidence tamper rejection and source isolation.

## Explicit non-goals

T3 does not:

- return corrected revision content or MusicXML;
- create payload bytes, links, tokens or invite codes;
- authenticate teacher/student identities;
- persist revision, approval, authorization or revalidation evidence;
- add a database or backend/API endpoint;
- send network requests, email or messages;
- rewrite MusicXML;
- modify OMR/Audiveris/provider/runtime/model selection;
- change `Dockerfile`, `render.yaml` or Render wiring;
- add dependencies.

## Completion result and next boundary

All T3 completion gates are satisfied: focused regressions, full tests, production build, Chrome runtime proof, protected-main merge and exact-main CI are green.

Parent Package 12 remains **Partially implemented** after T3. The next safe substage is **Package 12-T4 — structural/rhythmic post-correction revalidation** for correction classes intentionally excluded from T3 v1, including duration/rhythm, voice/staff, tie/string identity and undo histories. Authenticated recipient access, persistence and real network delivery remain later reviewed security/application stages.
