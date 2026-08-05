# SesliTab Current Status

Last documentation review: 2026-08-05  
Implementation baseline reviewed: `e8e11183f2e4773fe1fc9a62c0f26851b84691cd`

This file is a concise orientation document. It is not a substitute for a fresh read-only audit, test run, or production build.

## Verified Foundations

The repository currently contains foundations for:

- An accessible web interface
- PDF upload
- A Cloud OMR Gateway
- Mock and Audiveris provider adapters
- Asynchronous job processing
- Persistent job metadata and restart recovery logic
- MusicXML parsing
- Guitar TAB text parsing
- A shared `NoteObject` model
- Canonical pitch resolution
- Canonical timing and duration resolution
- Turkish rhythmic text
- Turkish text-to-speech
- Web Audio musical playback
- Docker and Render deployment configuration
- Automated tests and a production build command

## Current Inputs

- PDF through the OMR gateway
- Direct MusicXML upload
- Guitar TAB text

## Current Outputs

- Turkish rhythmic text
- Rhythmic HTML
- Note cards
- Raw MusicXML view
- Turkish text-to-speech
- Musical playback
- MusicXML download
- Audiveris `.omr` download when available

The current playback system uses Web Audio. It does not yet represent a completed real MIDI export package.

## Partially Implemented or Not Fully Verified

- End-to-end structural and rhythmic validation
- Quality and reliability reporting
- Canonical consumption policy across every output consumer
- Mandatory quality-gate enforcement for TTS, playback, and Guitar TAB
- Real cancellation of every running Audiveris process
- Retry and duplicate-job safety under all failure conditions
- Multi-part and multi-voice processing
- Unique measure selection throughout the interface
- Safe Guitar TAB position selection
- Mobile accessibility on real iPhone and VoiceOver devices

## Planned Product Areas

- Teacher correction interface
- Automatic, teacher-corrected, and teacher-approved revisions
- Approval invalidation after later edits
- Secure teacher-to-student sharing
- Student practice sessions
- Basic and advanced Guitar TAB engines
- Real MIDI timeline and optional `.mid` export
- Violin support
- MusicXML harmony and chord-name support
- Accessible tuner
- Simplified rhythm-training mode
- Full mobile productisation
- User authentication, roles, and job ownership

## Known Documentation Risks

Some older architecture and API documents describe planned behaviour as if implementation had not started, while the repository now contains a working backend foundation.

Other documents include future endpoints or larger upload limits that do not fully match the current Express server.

Therefore:

- Treat source code and fresh tests as authoritative for current behaviour.
- Treat `docs/project-charter.md` as authoritative for product and safety rules.
- Report every documentation/code mismatch explicitly.

## Verification Status of This Documentation Change

This branch changes Markdown documentation only.

- No application source code was changed.
- No dependency was added or updated.
- No test suite was run for this documentation-only update.
- No production build was run for this documentation-only update.
- No merge or deployment was performed.

## Required Next Step Before Coding

Run a fresh read-only package audit and confirm:

1. Current branch and commit
2. Clean working tree
3. Current test count and results
4. Current production build result
5. Exact status of package prerequisites
6. Only one recommended next implementation package
