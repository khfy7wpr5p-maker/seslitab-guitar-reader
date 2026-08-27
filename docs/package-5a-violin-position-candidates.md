# Package 5A — Canonical Basic Violin First-Position Candidate Contract

## Status

Implementation branch: `package-5a-violin-position-candidates`

Package 5A is the first isolated slice of Package 5 Basic Violin. It establishes a pure canonical NoteObject → physical first-position violin string-candidate boundary. It does **not** select a finger number, activate a production violin consumer, modify MusicXML parsing, or change the OMR path.

## Musical contract

The basic instrument contract is deliberately narrow:

- standard violin tuning: G3–D4–A4–E5;
- string numbering: 1=E, 2=A, 3=D, 4=G;
- concert-pitch mapping: written pitch is not octave-transposed;
- first-position candidate span: open string through 7 semitones above the open string;
- candidate generation only; fingering choice belongs to Package 5B;
- advanced positions and double stops are outside Package 5.

Public factual references used to verify the basic tuning/first-position model:

- Yamaha Musical Instrument Guide — violin fingering / first position;
- Violinspiration — standard strings G3, D4, A4, E5 and first-position overview.

No third-party code, dataset, model, or dependency is imported from these references.

## Input authority

The input must be a canonical NoteObject shape. Position calculation requires written score pitch (`step`, optional `alter`, `octave`). Legacy guitar/TAB fields, MIDI-only fields, or string/fret fields are never used as substitutes for missing written violin pitch.

## Output semantics

Package 5A returns one immutable state:

- `candidates`: one or more physical first-position strings can represent the written pitch;
- `rest`: the input is a rest and has no position candidate;
- `out-of-range`: the pitch has no candidate within the narrow first-position contract;
- `invalid`: the canonical input or written pitch is malformed/incomplete.

Each candidate records:

- string number/name;
- open-string MIDI;
- semitone offset from the open string;
- exact written MIDI;
- `position: first`;
- generated physical-candidate provenance.

Candidate ordering is deterministic serialization only. It is **not** a pedagogical recommendation.

## Ambiguity safety

At string crossings, one pitch may have multiple physical candidates. For example, D4 may be represented as:

- open D string; or
- the top of the supported first-position span on the G string.

Package 5A preserves both candidates and does not silently choose one. Package 5B must define any basic fingering policy separately and keep generated policy distinct from source/teacher truth.

## Safety behavior

Package 5A:

- does not mutate the canonical note;
- never invents a pitch, string, or finger number;
- does not use guitar transposition or guitar fret fields;
- preserves rests without invented position data;
- returns `out-of-range` instead of shifting to another violin position;
- returns `invalid` for malformed or non-canonical data;
- imports no Audiveris, OMR worker/provider, gateway, or frontend OMR module;
- does not modify `musicXmlParser.js`;
- does not modify Package 2D quality-gate wiring;
- does not add a canonical violin consumer type in this slice.

## Acceptance tests

Focused tests verify:

1. immutable G3–D4–A4–E5 standard tuning contract;
2. no violin octave transposition;
3. open G3 candidate behavior;
4. D4/A4/E5 string-crossing ambiguity is preserved;
5. B5 is the upper edge of the narrow E-string first-position span;
6. pitches above the supported range fail closed;
7. chromatic pitches remain physical candidates without finger-number invention;
8. rests create no position candidate;
9. legacy/non-canonical inputs fail closed;
10. missing written pitch is not replaced with unrelated guitar fields;
11. malformed pitch fails closed;
12. output is deterministic/frozen and input is unchanged;
13. source has no production OMR, quality-gate, or consumer activation.

## Next safe slice

Package 5B may define a deterministic **basic first-position fingering policy** over these candidates. It must preserve ambiguity when a single generated choice would imply unsupported pedagogical certainty. Production activation remains a later architecture gate.
