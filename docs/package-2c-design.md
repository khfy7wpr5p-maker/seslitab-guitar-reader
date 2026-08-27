# Package 2C — Safe Quality and Error Report

## Purpose

Package 2C converts Package 2B structural findings and Package 2A source-verification metadata into a deterministic, read-only report for users and downstream modules.

It does not repair MusicXML, change OMR output, enforce TTS/playback/TAB behavior, or deploy anything.

## Required error codes

- `MEASURE_DURATION_MISMATCH`
- `INVALID_DIVISIONS`
- `TUPLET_INCOMPLETE`
- `TIE_ORPHAN`
- `VOICE_OVERLAP`
- `SOURCE_NOT_VERIFIED`
- `OMR_NOTE_MISSING_SUSPECTED`
- `PITCH_OUTPUT_MISMATCH`

The list is required, not necessarily exclusive. Unmapped Package 2B structural finding codes remain visible through the report instead of being silently discarded.

## Quality states

- `structurally_valid`
- `source_verified`
- `source_unverified`
- `review_required`
- `unreliable`

Structural validity and source verification are separate dimensions. A score can therefore be structurally valid while remaining source-unverified and review-required.

## Finding contract

Every report finding exposes:

- `errorCode`
- `severity`
- `partId`
- `measureKey`
- `visibleMeasureNumber`
- `voice`
- `staff`
- `expected`
- `actual`
- `explanation`
- `automaticPlaybackAllowed`

Additional provenance fields (`classification`, `sourceCode`, `verificationState`) preserve the origin of the finding.

## Safety rules

- Confidence values never establish source verification.
- `structurally_valid` never means `source_verified`.
- Missing verification metadata is reported as `SOURCE_NOT_VERIFIED`.
- Explicit invalid canonical pitch verification can produce `PITCH_OUTPUT_MISMATCH`; the report does not recompute or choose a replacement pitch.
- Underfilled/empty suspected OMR measures can additionally produce `OMR_NOTE_MISSING_SUSPECTED`; this is explicitly worded as a suspicion rather than proof of a missing note.
- The report is read-only and deterministic.
- No consumer is blocked or changed by this package. Runtime enforcement remains Package 2D.

## Package boundary

Package 2C computes and exposes policy metadata only. Package 2D is responsible for wiring quality state into UI warnings, TTS, playback, and Guitar TAB behavior.
