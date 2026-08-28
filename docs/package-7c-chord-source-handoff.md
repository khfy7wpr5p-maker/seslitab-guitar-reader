# Package 7C — Exact MusicXML Chord Source Handoff

Status: implementation candidate; authoritative acceptance requires exact-head CI, review/freshness, merge, and exact-main CI.

## Purpose

Package 7C connects the exact raw MusicXML already held by the production application to the Package 6 harmony parser and Package 7A/B presentation model without deriving chords from notes.

## Production chain

```text
raw MusicXML + exact NoteObject[]
        ↓
prepareMusicXmlQualityGate()
        ↓
exact-array MusicXML source registry
        ↓
Package 6 parseMusicXmlHarmony()
        ↓
Package 7A/B chord presentation
        ↓
source-only chord consumer
```

## Identity rule

Raw MusicXML is registered in a `WeakMap` against the exact `NoteObject[]` identity. An equivalent cloned array has no source registration and must return `no-source`.

The registry:

- does not clone MusicXML,
- does not clone notes,
- does not parse or normalize music,
- does not change Package 2D quality decisions,
- does not promote source verification.

## Source-only truth boundary

A successful chord result is explicitly:

- `sourceOnly = true`
- `definitive = false`
- `teacherApproved = false`

The consumer presents only MusicXML `<harmony>` evidence. It never derives a chord from pitches, NoteObject arrays, TAB, or a harmony-analysis model.

## Fail-closed states

- missing exact source identity → `no-source`
- Package 6 review → `review-required`, zero display/speech bytes
- Package 6 invalid → `invalid`, zero display/speech bytes
- valid MusicXML with no `<harmony>` → `empty`, no invented chord
- contradictory Package 7A/B provenance/teacher state → `invalid`

## Safety boundary

Package 7C does not modify:

- Audiveris provider/runtime/preflight,
- OMR worker/provider,
- gateway,
- production MusicXML parser,
- E2E workflow,
- deployment configuration,
- external dependencies.

Package 7D–7F UI/TTS activation is intentionally outside this slice.
