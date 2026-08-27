# Package 4A — Canonical Guitar Position Candidate Contract

## Status

Implementation branch: `package-4a-guitar-position-candidates`

Package 4A is the first safe slice of Package 4 Basic Guitar TAB. It establishes a pure canonical NoteObject → physical guitar-position candidate boundary. It does **not** yet select a preferred fingering, render TAB, activate the production Guitar TAB consumer, or change the MusicXML/OMR production path.

## Input authority

The input is a canonical NoteObject shape and the position calculation requires written MusicXML pitch (`step`, optional `alter`, `octave`). Legacy/TAB-only shapes are not silently promoted.

The current SesliTab guitar notation regression contract is octave-transposing: written score pitch is mapped to a guitar sounding/position pitch 12 semitones lower. Package 4A preserves that established behavior instead of replacing it with direct written-MIDI → fret mapping.

Example:

- written E4 = MIDI 64
- guitar mapping pitch = MIDI 52
- valid standard-tuning/24-fret candidates: D string fret 2, A string fret 7, low E string fret 12

## Basic instrument contract

- tuning: standard six-string guitar E2–A2–D3–G3–B3–E4
- string numbering: 1 = highest e, 6 = lowest E
- supported basic fret boundary: 0–24
- written-guitar transposition: -12 semitones for position mapping

These are product-level Package 4A limits. They are not claims that every physical guitar has 24 frets or that a candidate is pedagogically optimal.

## Safety behavior

Package 4A:

- enumerates all basic physically representable positions;
- returns immutable deterministic output;
- never selects a preferred position;
- never mutates the canonical note;
- represents rests without invented pitch or fret;
- returns `unplayable` when no basic candidate exists;
- returns `invalid` for malformed or non-canonical input;
- does not fall back to first-string-open when a pitch is outside the supported guitar range;
- does not import or call Audiveris, OMR worker/provider, gateway or frontend OMR service;
- does not modify `musicXmlParser.js` in this slice;
- does not modify Package 2D quality-gate wiring;
- leaves the `GUITAR_TAB` canonical consumer boundary pending until a later Package 4 integration slice.

## Why no fingering choice in 4A

A single pitch can have multiple valid guitar positions. Candidate enumeration is physical evidence; choosing one candidate is a product/fingering policy. Package 4A keeps those concerns separate so later Package 4 work can define and test a deterministic basic policy without misrepresenting it as source truth. Advanced polyphonic/pedagogical fingering remains outside this slice and belongs to the later advanced Guitar TAB package.

## Acceptance tests

The focused tests verify:

1. standard tuning and 24-fret contract;
2. written E4 preserves the existing octave-transposed candidate set;
3. written E5 enumerates alternatives through fret 24;
4. out-of-range pitch never receives an invented e0 fallback;
5. rests produce no position;
6. legacy/non-canonical input fails closed;
7. missing written pitch is not replaced with unrelated MIDI/string fields;
8. malformed written pitch fails closed;
9. output is deterministic/frozen and input is unchanged;
10. the new module has no production OMR/gateway wiring.

## Next safe slice

Package 4B may define the deterministic **basic** position-selection policy over the Package 4A candidate set. Source-provided technical fingering, generated basic fingering, and advanced/pedagogical fingering must remain distinguishable in provenance.
