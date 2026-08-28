# Package 7A–7B — Chord Presentation and Turkish Pronunciation

Status: implementation candidate; protected-main merge and exact-main CI are required before this stage is closed.

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
- Chord quality is derived from the structured Package 6 `kind.value`; Package 7 never reparses the rendered symbol string to discover musical meaning.
- Explicit slash bass is spoken only when Package 6 contains explicit bass evidence.
- Inversion metadata may be spoken as explicit source metadata; it never creates a slash bass.
- Degree add/alter/subtract semantics are spoken from structured degree fields.
- `N.C.` is spoken as `akor yok` and receives no invented root.
- Timing is described relative to the physical measure start. Zero is `ölçü başlangıcı`; non-zero values are `ölçü başlangıcından ... vuruş sonra`.
- Presentation uses physical `measureIndex + 1` for deterministic ordering and retains exact `measureKey` in each item.

## Fail-closed boundary

No partial display or speech text is emitted when:

- the Package 6 aggregate state is `REVIEW_REQUIRED` or `INVALID`;
- an event is not Package 6 `PARSED` + `MEASURED` evidence;
- physical identity is missing or contradictory;
- source provenance or `teacherApproved=false` is not preserved;
- structured pitch, kind, degree, inversion, staff, or symbol evidence disagrees with a fresh deterministic Package 6 normalization;
- timing is negative, missing, non-finite, or review-required.

A valid score with no `<harmony>` elements is `EMPTY`; Package 7 does not invent chords.

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

Package 7C and later stages are responsible for the raw MusicXML handoff/consumer and accessible product UI/TTS lifecycle.
