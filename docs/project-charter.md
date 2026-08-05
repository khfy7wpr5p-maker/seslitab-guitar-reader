# SesliTab Project Charter

## Purpose

SesliTab is an inclusive and accessible music education project for blind, low-vision, and sighted students.

It supports individual teaching, group learning, inclusive classrooms, and independent student practice. The goal is not only to convert PDF files into MusicXML, but to provide music information that is accessible, reviewable, and safe for educational use.

## Core Product Decision

SesliTab must be developed as a teacher-supervised, semi-automatic learning system.

It must not claim fully automatic or error-free conversion between:

```text
PDF
→ MusicXML
→ Guitar TAB
```

Teacher verification is a core safety layer, not a temporary limitation.

## Main Workflow

```text
PDF
→ OMR
→ MusicXML
→ structural and rhythmic validation
→ canonical note and timing data
→ quality evaluation
→ teacher review and correction
→ teacher approval
→ Turkish speech and playback
→ accessible student practice
```

## Intended Users

- Blind students
- Low-vision students
- Sighted students
- Music and guitar teachers
- Inclusive education groups
- Students with additional learning needs
- Future violin and rhythm-training users

## Reliability Rules

The system must distinguish between:

- Structurally valid data
- Source-verified data
- Source-unverified data
- Data requiring review
- Unreliable data
- Teacher-approved data

Uncertain or critical music data must not be:

- Presented as definitively correct
- Automatically played as trusted content
- Sent directly to Guitar TAB generation
- Completed by inventing missing notes or rhythms
- Shared with a student before teacher approval

## Data Versions

Each work should preserve:

1. Automatic OMR output
2. Teacher-corrected output
3. Teacher-approved output

The original automatic result must remain unchanged. Any change after approval must invalidate the previous approval. Only explicitly approved revisions may be shared with students.

## Shared Music Model

The interface, text-to-speech, playback, validation, Guitar TAB, and future MIDI systems must use the same canonical note and timing data.

The same musical event must not produce different pitches or durations in different parts of the application. A visible measure number must not be treated as a unique measure identifier.

## Guitar TAB Safety

A note may have more than one valid guitar string and fret position.

The Guitar TAB engine must evaluate valid alternatives, preserve octave information, show ambiguity clearly, avoid fake fallback positions, and keep the final choice reviewable by the teacher.

## OMR Research Rules

Audiveris is the current primary OMR engine. OpenCV, homr, and MuPDF may be evaluated only through isolated benchmarks.

- Preserve every original file.
- Keep preprocessing variants separate.
- Never merge notes automatically from different OMR outputs.
- Do not change the production OMR path without measured evidence.
- Do not describe an OMR result as musically correct without teacher verification.

## Development Safety

- Begin with read-only inspection.
- Do not modify files without explicit permission.
- Never work directly on `main`.
- Use a separate branch for each package.
- Work on only one package at a time.
- Do not begin a later package before its prerequisites are complete.
- Preserve existing behaviour.
- Avoid unrelated refactoring.
- Do not add dependencies unless necessary and approved.
- Run focused tests, the full test suite, and the production build when application behaviour changes.
- Never describe untested behaviour as completed.
- Do not merge, deploy, or publish without explicit approval.
- Preserve original PDF, OMR, MusicXML, and teacher-approved data.
- Never present structurally valid data as proof of musical correctness.

## Final Principle

SesliTab must prioritise:

- Inclusive access
- Musical consistency
- Honest communication of uncertainty
- Teacher control
- Student safety
- Independent practice
- Reversible and testable development
