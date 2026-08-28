# Package 7C — Exact MusicXML Chord Source Handoff

Status: **Completed as part of Package 7**.

## Purpose

Package 7C connects the exact raw MusicXML already held by the production application to the Package 6 harmony parser and Package 7A/B presentation model without deriving chords from notes.

## Production chain

```text
raw MusicXML + exact NoteObject[]
        ↓
prepareMusicXmlQualityGate()
        ↓
atomic exact-array MusicXML source registry
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

## Atomic source preparation

Every new `prepareMusicXmlQualityGate()` attempt first invalidates older MusicXML evidence for that exact note-array identity. The current source is registered only after the current structural validation and quality-report construction succeed.

Therefore:

- blank replacement MusicXML leaves no source association;
- malformed or structurally rejected replacement MusicXML leaves no source association;
- thrown preparation work leaves no source association;
- an older successful MusicXML source cannot survive a later failed preparation for the same exact array;
- invalidating one array never invalidates another array's evidence.

This behavior was added in security hotfix PR #82 after a valid late P2 review finding on the original 7C handoff.

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
- failed replacement preparation → prior source invalidated, zero stale chord output

## Verification evidence

Original 7C implementation:

- PR #79
- merge `56ba563d47f3eec45ea0de88435706c121316a0d`
- exact-main CI #199 / `33145040418`: SUCCESS

Stale-source security hotfix:

- PR #82
- accepted head `0968a439a8e5b2a8712d216277f7466c8ba84daa`
- merge `7c37057713aa8a975edafdb0928d64f575d7cd5f`
- exact-head CI #204 / `33145943788`: SUCCESS
- exact-main CI #205 / `33146058408`, job `98767251803`: SUCCESS
- final regression: **1105 / 1105 tests PASS**, 229 suites, 0 failures
- dependency audit: 120 packages, 0 vulnerabilities
- Vite 8.2.0 production build: PASS, 55 modules transformed

## Safety boundary

Package 7C did not modify:

- Audiveris provider/runtime/preflight,
- OMR worker/provider,
- gateway,
- production MusicXML parser,
- E2E workflow,
- deployment configuration,
- external dependencies.
