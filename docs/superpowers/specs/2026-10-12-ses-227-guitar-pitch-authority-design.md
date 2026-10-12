# SES-227 Guitar Pitch / String-Fret Authority Design

## Goal

Make Guitar TAB authoring resolve a deterministic guitar physical pitch without corrupting the source score, while preserving existing trusted Guitar TAB assignments and supporting notation from violin, piano, vocal, and notation-only guitar sources.

## User-facing contract

The Guitar TAB workspace is a teacher-controlled guitar target. A source note, the source score's sounding semantics, the guitar target's physical pitch, and the teacher's final string/fret choice are separate facts.

For the uploaded `duman-senden-daha-guzel(2).musicxml` reproduction, source P1 begins with written A4 in ordinary treble clef and no `<transpose>`. Under **Standard guitar notation** target mode, the guitar physical pitch is A3, so string 3 / fret 2 is valid and string 1 / fret 5 is not physically equivalent and must be disabled/rejected.

This behavior is not implemented as a universal `writtenMidi - 12` rule. It is a declared guitar-target policy.

## Authority model

1. **Source written pitch** is immutable MusicXML `<pitch>` evidence.
2. **Source sounding pitch** is derived from explicit source transposition semantics used by the current source reader. A real MusicXML `<transpose>` must never be applied twice.
3. **Guitar target physical pitch** is the pitch that string/fret validation uses. It is resolved by an explicit Guitar TAB target mode, not by filename, vendor name, SVG position, pitch proximity, or an unconditional octave heuristic.
4. **Teacher string/fret** is authoritative once it passes physical validation. No automatic fingering replacement is allowed.
5. **Existing trusted Guitar TAB technical evidence** (`<technical><string>/<fret>`) must be preserved as existing guitar authority and must not be silently recomputed.

## Target modes

The editor/runtime contract exposes one explicit guitar target pitch policy:

- `source-sounding`: validate positions against the source event's resolved sounding pitch. This preserves the existing SES-219 semantics and explicit `<transpose>` behavior.
- `standard-guitar-written`: interpret the source written notation as standard guitar notation for the TAB target, where the guitar physical pitch is one octave below written pitch. This is a target conversion policy and does not rewrite the source MusicXML.
- `technical-authority`: when supported source Guitar TAB technical evidence is already present and structurally trustworthy, preserve the exact existing string/fret identity rather than recomputing it.

The runtime must reject an unknown or contradictory policy. It must not infer a target mode from instrument name, filename, or renderer output.

## Defaulting and ambiguity

The SesliTab Guitar TAB workspace may default new notation-only authoring to `standard-guitar-written` because the destination is explicitly Guitar TAB, but it must make the active target policy explicit in state/UI and must not hide a contradictory source condition.

When a supported source already carries trustworthy Guitar TAB technical evidence, that evidence takes precedence for preservation. When source semantics and requested target policy cannot be reconciled deterministically, authoring/export fails closed and the teacher must choose a compatible target mode.

## Editor data model

Each pitched source event keeps the existing immutable source facts and adds a distinct resolved guitar-target fact. The exact property name is `guitarPhysicalPitchMidi`.

- `event.pitch.midi`: written pitch
- `event.soundingPitchMidi`: source sounding pitch
- `event.guitarPhysicalPitchMidi`: resolved guitar target physical pitch for this session policy

`createSourceSession(xmlText, options)` accepts `guitarPitchPolicy` alongside existing `targetSelection`. The policy becomes part of session identity so assignments cannot leak between pitch policies.

## Physical validation

`validatePositionForEvent()` validates `positionToMidi({ string, fret, tuning, capo })` against `event.guitarPhysicalPitchMidi` when present. It must not fall back to a contradictory written/source pitch once the guitar target has been resolved.

All physically equivalent guitar positions remain valid. Wrong-octave positions are rejected with `PITCH_MISMATCH` including expected and actual MIDI values.

## SesliTab integration

SesliTab must consume the editor/runtime's resolved `guitarPhysicalPitchMidi` as the single fretboard authority. The Teacher Workspace must not maintain a second `-12` implementation.

The UI enables only cells where `openStringMidi + fret == guitarPhysicalPitchMidi`, subject to existing occupied-string constraints. Keyboard and pointer authoring remain equivalent.

## Export

- Original source XML remains byte-identical and is never overwritten.
- The teacher's validated string/fret is serialized exactly into `<technical>` on the TAB staff.
- Existing source pitch, rhythm, onset, duration, part/staff/voice identity, and explicit source transpose are preserved according to the existing writer contract.
- No duplicate or invented source transpose is added merely to implement Guitar TAB target policy.
- Export remains blocked until the assignment document is complete and the existing SesliTab export validator passes.
- A disabled export button must surface the bounded reason: incomplete assignment, physical mismatch, semantic/identity validation failure, or runtime validation failure.

## Regression matrix

The implementation must prove all of the following on exact heads:

1. Uploaded violin fixture `duman-senden-daha-guzel(2).musicxml`: A4 under `standard-guitar-written` resolves to A3; string 3 / fret 2 accepted; string 1 / fret 5 rejected.
2. Same written pitch under `source-sounding`: source physical pitch remains unchanged.
3. Explicit MusicXML `<transpose>` under `source-sounding`: applied exactly once.
4. Notation-only guitar source: standard guitar target octave behavior is deterministic.
5. Existing trusted technical TAB: exact string/fret preserved; no automatic re-fingering.
6. Paramparça regression: previously qualified teacher string/fret behavior remains correct under its declared target policy.
7. Multi-voice/chord groups: no duplicate physical string and no dropped chord tones.
8. Source XML immutability: byte-identical source before/after authoring and export.
9. Incomplete or contradictory assignment: export stays disabled with a bounded reason.

## Quality and release gates

- ST Guitar TAB Editor focused RED → GREEN tests.
- Full Editor unit suite, forbidden dependency check, browser build, browser tests, exact runtime provenance.
- SesliTab focused pitch/fretboard/export tests, GTAB-04 exact-SHA, GTAB-10C semantic parity, validator browser proof, full test/build.
- Chromium and WebKit teacher-workspace regression on representative fixtures.
- SonarQube Quality Gate and dependency/security gates GREEN on exact heads.
- No merge or deploy without separate explicit human approval.

## Non-goals

- No automatic fingering recommendation engine.
- No mutation of source pitch to make Guitar TAB fit.
- No renderer-based pitch inference.
- No Student renderer changes in SES-227 unless a separate Student-only defect is freshly proven.
- No SES-228 voice-namespace/render-fidelity changes in this slice.