# SesliTab Project Charter

## Purpose

SesliTab is an inclusive and accessible music education project for blind, low-vision, and sighted students.

It supports individual teaching, group learning, inclusive classrooms, and independent student practice. The goal is not only to convert PDF files into MusicXML, but to provide music information that is accessible, reviewable, discoverable and safe for educational use.

## Core Product Decision

SesliTab must be developed as a teacher-supervised, semi-automatic learning system.

It must not claim fully automatic or error-free conversion between:

```text
PDF
→ MusicXML
→ Guitar TAB
```

Teacher verification is a core safety layer, not a temporary limitation.

## Top-Level Product Surfaces

SesliTab is organised around the following product surfaces:

- Discovery / Score Search — planned source-finding and repertoire discovery module;
- Teacher Studio — intake, review, correction, approval and sharing;
- Student Practice — approved accessible practice content;
- Library — planned application surface for admitted and shared works;
- Music Processing Core — canonical note/timing, validation and projections;
- Guitar Engine;
- Violin Engine;
- Accessible Tuner;
- Secure Teacher-to-Student Sharing;
- Simplified Rhythm Mode;
- Mobile / PWA Productisation.

Discovery / Score Search is not yet an implemented repository package. It is an accepted product-architecture module that must be introduced through a separate reviewed implementation package.

## Main Workflow

```text
Discovery or direct input
→ PDF / MusicXML / Guitar TAB intake
→ OMR where required
→ MusicXML
→ structural and rhythmic validation
→ canonical note and timing data
→ quality evaluation
→ teacher review and correction
→ teacher approval bound to one exact revision
→ secure sharing eligibility and authorization
→ Turkish speech / playback / TAB / MIDI / rhythm projections
→ accessible student practice
```

A discovered external score does not bypass intake, validation, quality, teacher review or approval.

## Intended Users

- Blind students
- Low-vision students
- Sighted students
- Music and guitar teachers
- Inclusive education groups
- Students with additional learning needs
- Violin and rhythm-training users

## Reliability Rules

The system must distinguish between:

- Located/discovered source data
- Structurally valid data
- Source-verified data
- Source-unverified data
- Data requiring review
- Unreliable data
- Teacher-corrected data
- Teacher-approved data
- Share-authorized data
- Student-deliverable data

These states are not interchangeable.

Uncertain or critical music data must not be:

- Presented as definitively correct
- Automatically played as trusted content
- Sent directly to Guitar TAB generation where quality gates reject it
- Completed by inventing missing notes or rhythms
- Shared with a student before teacher approval and applicable sharing gates

## Discovery Safety Boundary

Discovery exists to help locate repertoire and score sources. It is not a musical truth source.

```text
FOUND
  != VERIFIED
  != TEACHER-APPROVED
  != STUDENT-DELIVERABLE
```

Discovery must not silently republish, redistribute or claim ownership of third-party copyrighted score material. Licence/source metadata and musical verification must remain separate concerns.

## Data Versions

Each work should preserve:

1. Automatic OMR/source output
2. Teacher-corrected output
3. Teacher-approved exact revision
4. Sharing authorization bound to the exact revision, exact approval and exact recipient

The original automatic result must remain unchanged. Any change after approval must invalidate the previous approval. A later correction must not inherit stale automatic-source quality evidence without explicit revalidation. Only explicitly approved and otherwise eligible revisions may move toward student delivery.

## Shared Music Model

The interface, text-to-speech, playback, validation, Guitar TAB, violin guidance, rhythm projections and MIDI systems must use the same canonical note and timing data.

The same musical event must not produce different pitches or durations in different parts of the application. A visible measure number must not be treated as a unique measure identifier.

The UI is not a musical semantic authority. Presentation code must not invent pitch, duration, octave, voice, tie, fingering or provenance facts.

## Teacher / Student Separation

Teacher Studio is the supervised authority surface for review, correction and approval.

Student Practice should expose learning actions and approved educational content rather than internal OMR/debug/provenance implementation detail.

Student-facing delivery must not bypass exact approval, authorization, revocation, quality or post-correction revalidation requirements.

## Guitar TAB Safety

A note may have more than one valid guitar string and fret position.

The Guitar TAB engine must evaluate valid alternatives, preserve octave information, show ambiguity clearly, avoid fake fallback positions, and keep the final choice reviewable by the teacher.

Generated guitar fingering is evidence and must not silently become teacher-approved truth.

## Violin Safety

Generated violin positions and double-stop/string choices remain explicit non-teacher evidence. Unsupported or physically impossible structures must fail closed rather than emitting partial authoritative guidance.

## Tuner Privacy Boundary

The accessible tuner processes microphone audio locally in the browser. Microphone audio must not be uploaded, persisted or recorded by SesliTab.

## OMR Research Rules

Audiveris is the current primary OMR engine. OpenCV, homr, and MuPDF may be evaluated only through isolated benchmarks.

- Preserve every original file.
- Keep preprocessing variants separate.
- Never merge notes automatically from different OMR outputs.
- Do not change the production OMR path without measured evidence.
- Do not describe an OMR result as musically correct without teacher verification.

## Mobile / Accessibility Target

SesliTab should progress as a browser-first accessible PWA before a native rewrite is considered.

Primary compatibility targets are:

- iPhone / Safari / VoiceOver
- Android / Chrome / TalkBack
- modern desktop browsers with keyboard and screen-reader support

Accessibility requirements include semantic HTML, native controls where practical, keyboard operability, visible focus, low-vision responsive layouts, meaningful live announcements, touch-target sizing and safe browser audio/microphone lifecycle handling.

Android/TalkBack is part of the target product architecture even though device-level acceptance work remains a later mobile-productisation stage.

## Deployment Boundary

The production frontend source of truth is the GitHub repository. Bolt may be used for disposable prototypes or design references but is not the authoritative application source.

The existing Audiveris/Render production backend remains a protected infrastructure boundary. UI/product work must not silently rewrite provider/runtime, OMR worker selection, Cloud OMR Gateway, Docker or Render service wiring.

## Development Safety

- Begin with read-only inspection.
- Never work directly on `main`.
- Use a separate branch for each package or bounded documentation change.
- Work on only one implementation package at a time.
- Do not begin a later package before its prerequisites are complete.
- Preserve existing behaviour.
- Avoid unrelated refactoring.
- Do not add dependencies unless necessary and approved.
- Run focused tests, the full test suite, and the production build when application behaviour changes.
- Never describe untested behaviour as completed.
- Do not merge, deploy, or publish implementation changes without the applicable approval/gates.
- Preserve original PDF, OMR, MusicXML, teacher-corrected and teacher-approved data.
- Never present structurally valid data as proof of musical correctness.
- Do not let Discovery, UI or renderer code become a semantic authority.

## Current Roadmap Boundary

The current authoritative status documents record:

- Packages 0–11 Completed;
- Package 12 Partially implemented with T1 and T2 Completed;
- Package 12-T3 post-correction revalidation/provenance as the next application substage;
- Package 13 simplified rhythm mode Not started;
- Package 14 mobile productisation Partially implemented;
- Discovery / Score Search as a planned product-architecture module requiring a separate reviewed package before implementation.

See `docs/product-architecture.md`, `docs/current-status.md`, and `docs/package-status.md`.

## Final Principle

SesliTab must prioritise:

- Inclusive access
- Musical consistency
- Honest communication of uncertainty
- Teacher control
- Student safety
- Independent practice
- Safe discovery and source handling
- Cross-platform accessibility
- Reversible and testable development
