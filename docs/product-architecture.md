# SesliTab Product Architecture

**Architecture review:** 2026-08-29  
**Source baseline:** protected `main` at `139963335243085877d1d003b56e6a2dc3aada50`  
**Roadmap position:** Packages 0–11 Completed; Package 12 Partially implemented with T1–T2 Completed; Package 12-T3 is next.

## 1. Product definition

SesliTab is an inclusive, accessible and teacher-supervised music learning platform for blind, low-vision and sighted students. It is not a fully automatic score-conversion product and it must not present unverified musical inference as fact.

The product combines:

- score discovery and library intake;
- PDF / MusicXML / Guitar TAB input;
- OMR and MusicXML processing;
- one canonical note/timing model;
- quality and provenance gates;
- teacher review, correction and exact-revision approval;
- Guitar TAB and violin guidance;
- Turkish rhythmic text, TTS, Web Audio playback and MIDI;
- accessible tuner;
- secure teacher-to-student sharing;
- simplified rhythm training;
- mobile-first accessible PWA delivery for iOS, Android and desktop browsers.

## 2. Top-level product map

```text
SesliTab
├── Discovery / Score Search        [planned product module]
├── Teacher Studio                  [teacher workflow]
├── Student Practice                [student workflow]
├── Library                         [planned application surface]
├── Music Processing Core           [verified foundations]
├── Guitar Engine                   [Package 9 Completed]
├── Violin Engine                   [Package 10 Completed]
├── Accessible Tuner                [Package 11 Completed]
├── Secure Sharing                  [Package 12 Partially implemented]
├── Simplified Rhythm Mode          [Package 13 Not started]
└── Mobile / PWA Productisation     [Package 14 Partially implemented]
```

`Discovery / Score Search` is a newly accepted product-architecture module. It is not yet an implemented repository package and does not change the current strict package order. It must be scheduled through a separate reviewed package before implementation.

## 3. Discovery / score search boundary

Discovery exists to help a teacher or student locate repertoire and admissible score sources. It may eventually support search by:

- work title;
- composer;
- instrument;
- difficulty;
- PDF / MusicXML availability;
- public-domain or licence state;
- existing SesliTab library records.

Discovery is a source-finding layer only.

```text
FOUND
  != SOURCE-VERIFIED
  != MUSICALLY VERIFIED
  != TEACHER-APPROVED
```

An external PDF or MusicXML result must not become student-trusted content merely because it was found by Discovery. External intake must re-enter the normal SesliTab verification pipeline.

```text
Discovery
  -> source selection
  -> intake
  -> OMR / MusicXML processing
  -> structural + quality validation
  -> teacher review/correction
  -> exact teacher approval
  -> secure sharing
  -> student practice
```

Discovery must not silently download, redistribute, republish or treat third-party copyrighted scores as SesliTab-owned content. Licence and source metadata must remain distinct from musical correctness evidence.

## 4. Input and OMR boundary

Current supported inputs:

```text
PDF ---------> Cloud OMR Gateway -> Audiveris -> MusicXML
MusicXML ---------------------------------------> MusicXML
Guitar TAB text -------------------------------> bounded TAB input
```

The existing Audiveris provider/runtime, OMR worker/provider selection, Cloud OMR Gateway, backend OMR path, Docker and Render deployment connection remain protected infrastructure boundaries unless a separately reviewed package explicitly changes them.

OMR output is untrusted evidence. Valid XML is not proof of musical correctness.

## 5. Canonical music core

All student-facing musical projections must consume the same canonical note and timing data.

```text
MusicXML
  -> parser
  -> structural/rhythmic validation
  -> canonical NoteObject[] / timing model
  -> provenance + quality gates
  -> bounded projections
```

The UI, TTS, playback, MIDI, Guitar TAB and violin systems must not independently invent pitch, duration, octave, voice, tie or measure semantics.

## 6. Teacher Studio

Teacher Studio is the authority surface for supervised correction and approval.

```text
Teacher Studio
├── New work
│   ├── PDF
│   ├── MusicXML
│   └── Guitar TAB
├── Processing result
├── Source / provenance view
├── Quality warnings
├── Score / text / TAB projections
├── Correction
├── Revision history / undo
├── Exact-revision approval
└── Share with student
```

The system must preserve three distinct states:

```text
AUTOMATIC SOURCE
      -> TEACHER-CORRECTED REVISION
      -> TEACHER-APPROVED EXACT REVISION
```

A later edit must not inherit an older approval automatically.

## 7. Secure teacher-to-student sharing

Package 12 remains the current application boundary.

```text
approved exact revision
  -> exact authorization binding            [T1 Completed]
  -> exact-revision safety/quality gate      [T2 Completed]
  -> post-correction revalidation            [T3 next]
  -> authenticated recipient access          [later]
  -> persistence                             [later]
  -> network delivery                        [later]
  -> Student Practice
```

No UI may treat T1 or T2 metadata as proof that student payload delivery is currently implemented.

## 8. Student Practice

Student Practice should expose learning actions rather than internal OMR/debug/provenance implementation detail.

Target surface:

```text
Student Practice
├── My works
├── Open approved work
├── Accessible score / note representation
├── Guitar TAB where eligible
├── Turkish rhythmic text
├── TTS
├── Web Audio playback
├── selected-measure practice
├── tempo / repetition controls
├── MIDI where eligible
└── Tuner
```

Only content that passes the applicable safety and exact-approval boundaries may be presented as trusted teacher-shared content.

## 9. Guitar and violin engines

### Guitar

Package 9 is Completed. The advanced path supports quality-gated chords, simultaneous voices, sustained polyphony, tie continuity and bounded deterministic string assignment. Generated fingering remains evidence, not automatic teacher approval.

### Violin

Package 10 is Completed. The advanced path supports bounded first/second/third-position alternatives, string crossings, two-note double stops, simultaneous voices/staves, sustain locking and tie continuity. Generated positions remain explicit non-teacher evidence.

## 10. Accessible tuner

Package 11 is Completed.

```text
device microphone
  -> browser-local Web Audio
  -> bounded pitch detector
  -> note + octave / Hz / cents
  -> Pes / Çok yakın / Akortta / Tiz
```

Microphone audio remains local and must not be uploaded, persisted or recorded by SesliTab.

## 11. Rhythm mode

Package 13 remains Not started. Simplified rhythm training should remain a bounded learning mode rather than a second music-semantic authority. It may consume verified musical timing or teacher-authored rhythm patterns but must not silently rewrite canonical score facts.

## 12. Frontend architecture

The production frontend source of truth is the GitHub repository, not Bolt. Bolt may be used only as a disposable prototype/reference environment.

Current framework direction remains Vite + browser technologies. Do not migrate to React, Next.js or another framework merely to begin UI architecture.

Target logical structure:

```text
src/
├── ui/
│   ├── app-shell/
│   ├── discovery/
│   ├── teacher/
│   ├── student/
│   ├── library/
│   ├── rhythm/
│   ├── tuner/
│   ├── shared/
│   └── accessibility/
├── services/
│   ├── api/
│   ├── discovery/
│   ├── omr/
│   ├── audio/
│   ├── speech/
│   └── sharing/
└── domain/
    └── existing verified music/domain modules
```

This is a target UI architecture, not permission to refactor current verified domain modules without a bounded implementation package.

## 13. Accessibility and mobile target

SesliTab should be mobile-first and progressively productised as an accessible PWA.

Primary compatibility target:

```text
iPhone / Safari / VoiceOver
Android / Chrome / TalkBack
Desktop modern browsers / keyboard + screen reader
```

Common requirements include:

- semantic HTML and native controls where practical;
- full keyboard operability;
- visible focus;
- low-vision responsive layouts;
- large touch targets;
- bounded and meaningful live-region announcements;
- Turkish TTS;
- browser audio lifecycle handling;
- microphone permission and privacy handling;
- no semantic dependence on visual-only colour or position.

Android/TalkBack is now part of the product target. This is an architecture decision; device-level closure still belongs to later reviewed mobile-productisation work.

## 14. Deployment target

Near-term product deployment should keep the architecture simple:

```text
GitHub
  -> Vite/PWA frontend -> Render Static Site
  -> Express/Docker API -> existing Render Web Service
                         -> Audiveris
```

Future persistence and identity infrastructure must be introduced only after Package 12 contracts define their exact semantics. A managed database may later store accounts, library metadata, revisions and sharing state, but selecting an identity provider or database does not belong in current domain code by assumption.

## 15. Non-negotiable safety rules

- UI is not a musical semantic authority.
- Discovery is not a verification authority.
- Valid XML is not proof of musical correctness.
- Never invent missing pitch, duration, octave, voice, tie or source evidence.
- Preserve automatic, corrected and approved revisions separately.
- Do not share unapproved or stale-approved content.
- Do not make Package 12 T1/T2 expose content they intentionally do not deliver.
- Do not silently change Audiveris/Render production boundaries.
- Do not add external dependencies or identity semantics without explicit review.
- Keep development bounded, reversible, tested and branch-based.

## 16. Current implementation sequence

The architecture does not replace the strict implementation order.

```text
NOW: Package 12-T3 — post-correction revalidation/provenance
THEN: remaining Package 12 authenticated access / persistence / delivery stages
THEN: Package 13 simplified rhythm mode
THEN: Package 14 iOS + Android + desktop accessibility/PWA closure
SEPARATE REVIEWED PACKAGE: Discovery / Score Search
UI ARCHITECTURE WORK: may define the accessible product shell without bypassing those domain/security prerequisites
```

This document is the top-level product-architecture reference. Package-specific status and evidence remain authoritative in `docs/current-status.md` and `docs/package-status.md`.
