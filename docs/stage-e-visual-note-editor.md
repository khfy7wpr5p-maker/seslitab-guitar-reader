# Stage E — Bounded Visual Note Editor

## Scope

Stage E adds a teacher-facing edit surface for the exact canonical note selected through the Stage C note-selection contract.

The visual editor exposes only:

- pitch step (`step`)
- accidental (`alter`)
- octave (`octave`)
- duration value (`durationValue`)

It does not expose string/fret, MIDI, frequency, voice, staff, tie, tuplet, source identity, measure identity, verification, approval, or provenance fields.

## Authority boundary

Stage E does not create a second revision engine. It delegates every mutation to the existing Package 8-T6 immutable teacher correction/history/concurrency boundary. The automatic source remains unchanged and each accepted correction creates a new revision.

The selected note must still be the exact Stage C canonical selection in the same canonical measure. Stale, missing, out-of-range, or cross-measure selection fails closed.

For rests, pitch/accidental/octave are withheld and only duration can be offered when the canonical field exists.

## Value bounds

- pitch step: A-G only
- accidental: integer -2 through +2
- octave: integer 0 through 9
- duration value: positive safe integer, maximum 1,000,000

A no-op value creates no new revision.

## Dependent fields

Stage E intentionally does not recompute dependent pitch/rhythm representations. A teacher correction is explicit revision evidence, not automatic musical truth. Revalidation and rerender belong to Stage F.

Therefore Stage E never claims that a saved revision is quality-valid, teacher-approved, shareable, or safe for downstream definitive consumers.

## Renderer boundary

The renderer remains presentation/interaction-only. Stage E consumes the canonical note selection already resolved by Stage C and does not call OSMD, hit-test, or renderer highlight APIs directly.

## Safety invariants

- no direct main commit
- no new dependency
- no OMR/backend/provider change
- no renderer contract/revision change
- no Package 12 change
- no source-note mutation
- no automatic approval
- no quality-gate bypass
- no inferred note identity
- no pitch/proximity/SVG guessing

## Verification gate

Merge requires focused Stage E regressions, full repository tests, production build, existing real-browser score runtime proof, green protected `test-and-build`, and exact-main CI after merge.
