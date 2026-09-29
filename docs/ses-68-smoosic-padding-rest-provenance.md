# SES-68 — Deterministic Smoosic padding-rest provenance

## Purpose

Smoosic may add rests while importing MusicXML so its internal voices are
rectangular. Those rests are editor implementation detail, not SesliTab source
events. SES-68 allows a supported pitch-only edit to write back without adding
those rests to the product revision, while preserving every source-authored
rest and rejecting structural ambiguity.

This boundary never classifies a rest from duration, voice, measure, hidden
state, `print-object`, position, rest count, silence interval, or musical shape.

## Trust boundary

The same-origin editor creates a fresh tracker for each successful
`XmlToSmo.convert`. Only note objects created by
`SmoMeasure.createRestNoteWithDuration` during that exact import scope are
marked. Source rests and later teacher-created rests are outside the scope and
cannot acquire the mark.

For a host-requested export, the editor:

1. serializes the current Smoosic score once;
2. walks the current rendered score in deterministic part/staff/measure/voice
   order;
3. proves that each registered object still has its captured identity,
   locator, and duration;
4. expands each multi-pitch model note to the exact MusicXML chord span and
   validates every continuation marker; and
5. emits protocol envelope version 2 with provenance version 1.

The proof is bound to the exact numeric `sourceRevision`. Each entry contains
`staffIndex`, `measureIndex`, `voiceIndex`, `noteIndex`, `rawNoteOrdinal`, the
captured `noteIdentity`, and `durationTicks`. Entries are strictly ordered by
raw ordinal and bounded by `rawNoteCount`.

The host retains the existing origin, `event.source`, request-id, and revision
correlation checks. It then securely parses the raw MusicXML and validates the
complete manifest before changing a clone. Only a certified rest at its exact
ordinal and locator, with its exact explicit duration, becomes a timing-
preserving `<forward>` carrying duration and optional voice/staff children.
All other rests remain notes.

Smoosic canonicalizes a single part id, voice labels, and the MusicXML timing
grid. The host accepts those representations only after topology is proven.
Candidate durations are projected from the Smoosic 4096-divisions grid to the
source grid. Smoosic may serialize an exact tuplet as a positive fractional
tick value (for example `2730.6666666666665`); the projection must produce a
positive source integer exactly or be within the documented one-candidate-tick
rounding bound. The normal structural/rhythmic validator runs on the projected
MusicXML. This timing-grid conversion is not rest provenance and does not
identify or remove any event.

## Fail-closed conditions

Write-back returns `UNSUPPORTED_STRUCTURE` and preserves the accepted
authority/revision when any of these conditions occurs:

- proof is missing, malformed, wrong-version, stale, or revision-mismatched;
- raw note count or entry bounds disagree;
- ordinals are duplicate, unordered, out of range, or disagree with locators;
- an identity is missing/duplicate, replaced, moved, or has changed duration;
- model traversal and raw MusicXML chord expansion disagree;
- a certified target is pitched, lacks one explicit duration, or is not the
  exact certified rest;
- part/staff/voice mapping is ambiguous;
- divisions projection is ambiguous or exceeds one candidate tick;
- note insertion, deletion, source-rest mutation, voice relocation, or another
  unsupported structural change remains after normalization.

Malformed/oversized MusicXML remains `INVALID_XML`. A truthful identical
candidate remains `NO_CHANGE`. No failure path mutates the current immutable
product revision.

## Evidence contract

The protected S15 Chromium proof uses
`tests/fixtures/real-omr/gesi-clean.xml`. A supported pitch edit must prove:

- source: 112 notes, 104 pitched notes, 8 rests;
- raw Smoosic: 126 notes, 104 pitched notes, 22 rests;
- 14 exact padding entries in measure indexes 7, 18, and 19;
- normalized: 112 notes, 104 pitched notes, 8 source rests; and
- terminal `APPLIED`, fresh product publication, and continued editor use.

The same artifact records truthful no-change plus rejection of source-rest
mutation, teacher-rest insertion, deletion, voice relocation, and a tampered
ordinal. Every rejected case must retain byte-identical accepted MusicXML and
the same committed source revision.

## Merge and operations stop conditions

Do not merge when proof is missing, identity or traversal drifts after a
Smoosic upgrade, any source rest changes, the S15 browser proof fails, CI
fails, Sonar did not actually scan the exact head, the quality gate is not OK,
or a new security hotspot remains unreviewed.

This work does not change Render, Firebase, OMR/Audiveris, backend workers,
deployment configuration, secrets, Dockerfile, or `render.yaml`. It does not
authorize merge or deployment. Physical iPhone Safari/VoiceOver acceptance is
a separate post-deployment human gate.
