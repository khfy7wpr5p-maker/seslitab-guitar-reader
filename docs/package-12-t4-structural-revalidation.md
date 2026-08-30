# Package 12-T4 — Bounded Structural/Rhythmic Corrected-Revision Revalidation

Status: **Implementation candidate — requires PR CI and protected-main exact verification before closure.**

## Purpose

Package 12-T4 extends the verified Package 12-T3 corrected-revision path into a deliberately bounded set of structural and rhythmic teacher edits.

The central rule remains unchanged: the original raw MusicXML is evidence for the automatic root, not for values edited later by a teacher. T4 never registers the old MusicXML against the corrected revision and never describes a teacher correction as source MusicXML truth.

T4 returns revalidation metadata only. It does not create or expose student payload content.

## Provenance boundary

T4 requires all of the following:

1. a valid immutable Package 8 revision history;
2. the exact automatic source `NoteObject[]`;
3. live Package 12-T2 quality evidence for the automatic root;
4. the exact raw MusicXML still registered to that automatic array by Package 7C;
5. a current `teacher_corrected` revision;
6. a correction/undo history restricted to the bounded T3/T4 field set.

The root T2 evidence is replayed live before corrected evidence is considered.

The raw MusicXML is then parsed only to recover immutable structural context:

- measure/part ordering;
- time signatures;
- divisions;
- backup/forward events;
- note ordering;
- original grace/rest identity;
- tuplet/beam validation evidence.

T4 verifies that this context genuinely matches the automatic root snapshot before using it. A raw MusicXML document that is structurally valid but does not match the automatic root cannot be used as T4 context.

## Bounded correction scope v1

T4 accepts mixed correction histories containing the T3 pitch/position fields:

- `step`
- `alter`
- `octave`
- `noteName`
- `midi`
- `frequency`
- `fret`

and the following structural/rhythmic fields:

- `duration`
- `beats`
- `durationValue`
- `dotCount`
- `startBeat`
- `voice`
- `staff`
- `tieStart`
- `tieStop`
- `tieContinue`
- `isChordNote`

`dotCount` correction is deliberately bounded to 0 or 1 in T4 v1.

T4 does not support:

- `isGrace` conversion or grace-ornament semantic edits;
- pitched-note/rest conversion;
- part/measure identity edits;
- divisions or time-signature edits;
- tuplet or beam edits;
- string identity edits (`stringLetter` / `stringNumber`);
- note insertion, deletion or reordering;
- nested correction paths.

## Structural reconstruction

T4 constructs a validation-only corrected structural score.

The immutable source MusicXML supplies measure-level context and source note order. The exact current teacher revision supplies only the supported corrected note fields. Source-only tuplet/beam context and measure identity remain attached to the validation clone.

This reconstructed score is not registered as MusicXML provenance and is not returned to consumers.

## Corrected-state rules

For touched timing notes, T4 requires:

- positive integer `durationValue`;
- positive finite `beats`;
- unchanged positive source `divisions`;
- `beats === durationValue / divisions`;
- `duration === beatsToDurationId(beats)`;
- bounded `dotCount` consistency;
- finite non-negative `startBeat`.

After applying corrected durations/chord state to the source-order event stream, T4 recomputes the full measure timeline. Every final note `startBeat` must equal its recomputed onset. Therefore upstream duration changes cannot leave stale downstream onset metadata.

Voice and staff must be positive integers.

Tie rules remain exact:

- `tieContinue === (tieStart && tieStop)`;
- stops require a preceding matching start;
- starts require a later matching stop;
- matching is by pitch + part + voice + staff;
- rests cannot participate in ties.

Any T3 pitch/fret changes in the same history still receive canonical pitch and physical guitar-position validation.

Finally, Package 2B structural/rhythm validation must return:

- `valid: true`;
- zero errors;
- zero warnings;
- zero findings.

## Undo

T4 permits an undo-created current revision only when every correction operation anywhere in the retained history is inside the bounded T3/T4 field set.

Undo is not evidence inheritance. The undo transition is included in the deterministic history-chain fingerprint, and the final current revision is revalidated from scratch. Approval, authorization and T4 evidence remain bound to the exact new undo-result revision.

## Deterministic evidence

T4 evidence binds:

- history/source/root/target revision identity and fingerprints;
- live root T2 evidence;
- correction event count;
- undo event count;
- correction operation count;
- exact corrected target set;
- complete correction/undo history-chain fingerprint;
- exact root structural-context fingerprint;
- corrected structural-validation fingerprint;
- final T4 revalidation fingerprint.

Caller-supplied evidence IDs and timestamps remain caller supplied; T4 does not invent identity.

## Fail-closed states

Only `eligible_structurally_revalidated_revision` is eligible.

Other explicit states include:

- `authorization_not_applicable`
- `recipient_mismatch`
- `revoked`
- `revalidation_evidence_missing`
- `revalidation_evidence_invalid`
- `revalidation_evidence_not_applicable`
- `revalidation_evidence_stale`
- `history_not_current`
- `root_quality_not_eligible`
- `structural_context_invalid`
- `unsupported_correction_scope`
- `corrected_state_invalid`

## Non-goals

T4 does not:

- return revision content or MusicXML;
- build payload bytes;
- create links, tokens or invite codes;
- authenticate teacher/student identities;
- persist revisions, approvals, authorizations or revalidation evidence;
- add a database or backend endpoint;
- perform network delivery;
- send email/messages;
- rewrite MusicXML;
- modify OMR/Audiveris/provider/runtime/model selection;
- change Docker/Render wiring;
- add dependencies;
- make the UI a musical semantic authority.

## Completion rule

T4 is not **Completed** until:

1. focused T4 regressions pass;
2. full repository tests pass;
3. production build passes;
4. real Chrome score-runtime proof passes;
5. the protected-main PR is merged;
6. exact-main CI succeeds;
7. status/closure documentation records that verified evidence.

Parent Package 12 remains **Partially implemented** after T4. Authenticated recipient access, persistence and actual student network delivery remain later separately reviewed security/application stages.
