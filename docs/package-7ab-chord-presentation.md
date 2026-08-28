# Package 7A–7B — Chord Presentation and Turkish Pronunciation

Status: **Completed**.

Verified implementation evidence:

- PR #78
- accepted final head `7256806e06ccfa184a77f859e5c8de1714656281`
- protected-main merge `ee9a95a02a75c357e74647a09b1c2b27dafdcc6c`
- exact-main CI #197 / `33144443876`: SUCCESS

## Purpose

Package 7A–7B converts only structured Package 6 MusicXML `<harmony>` evidence into deterministic plain-text display and Turkish pronunciation text.

It does not infer chords from note content and does not call speech synthesis.

## Flow

```text
Package 6 parse result
  -> complete fail-closed evidence check
  -> structured descriptor consistency check
  -> Turkish chord presentation model
       |- displayText
       |- spokenText
       `- physical measure identity
```

## Presentation rules

- Source pitch names use Do, Re, Mi, Fa, Sol, La, Si.
- Supported accidentals are read as bemol, diyez, çift bemol and çift diyez.
- Chord quality is derived from structured Package 6 `kind.value`; Package 7 never reparses the rendered symbol string to discover musical meaning.
- Explicit slash bass is spoken only when Package 6 contains explicit bass evidence.
- Inversion metadata never creates a slash bass or extra spoken meaning absent from the visible source symbol.
- Degree add/alter/subtract semantics are spoken from structured degree fields; `print-object="no"` degrees are not spoken.
- `N.C.` is spoken as `akor yok` and receives no invented root. Contradictory inversion/degree metadata on `N.C.` fails closed.
- Timing is described relative to the physical measure start. Redundant `startBeat`, `startDivisions` and `divisions` evidence must remain internally consistent.
- Presentation uses physical `measureIndex + 1` for deterministic ordering and retains exact `measureKey` in each item.

## Fail-closed boundary

No partial display or speech text is emitted when:

- the Package 6 aggregate state is `REVIEW_REQUIRED` or `INVALID`;
- an event is not Package 6 `PARSED` + `MEASURED` evidence;
- physical identity is missing or contradictory;
- source provenance or `teacherApproved=false` is not preserved;
- structured pitch, kind, degree, inversion, staff, or symbol evidence disagrees with a fresh deterministic Package 6 normalization;
- redundant timing evidence is inconsistent;
- timing is negative, missing, non-finite, or review-required.

A valid score with no `<harmony>` elements is `EMPTY`; Package 7 does not invent chords.

## Review fixes

Two valid P2 review findings were fixed before merge:

1. Package 6 redundant timing evidence is consistency-checked before presentation.
2. malformed `N.C.` events carrying inversion/degree metadata fail closed instead of silently discarding evidence.

## Safety and architecture

The presentation module:

- is pure and deterministic;
- deep-freezes public output containers;
- does not mutate Package 6 input;
- imports no UI module;
- imports no voice/speech module;
- imports no OMR/Audiveris/gateway/worker module;
- performs no filesystem or network operation;
- adds no dependency;
- performs no deployment.

Package 7C and later stages provide the raw MusicXML handoff, product UI and existing TTS lifecycle; they do not change the source-only truth boundary established here.
