# Package 4D — Deterministic Basic ASCII Guitar TAB Renderer

## Scope

Package 4D renders only a successful Package 4C basic Guitar TAB projection into deterministic six-line ASCII TAB blocks.

The renderer is intentionally presentation-only. It does not parse MusicXML, choose guitar positions, infer rhythm, modify canonical notes, activate the production `GUITAR_TAB` consumer, or change any OMR/runtime path.

## Input boundary

The only accepted input is a Package 4C result with:

- `state: projected`;
- `policyId: lowest-fret-v1`;
- `provenance: generated-basic`;
- `sourceFingeringClaimed: false`;
- complete canonical physical measure identity;
- unique and complete source `noteIndex` coverage;
- increasing source `noteIndex` order inside each physical measure;
- valid Package 4B string/fret positions for pitched events;
- `position: null` for rests.

Package 4C groups events by canonical physical `measureKey`. If source order later revisits an already-seen physical measure, Package 4D therefore accepts the genuine grouped projection as long as every original `noteIndex` is present exactly once and order inside each measure is preserved. It does not require the measure-group iteration itself to be globally contiguous.

A non-projected, incomplete, contradictory or malformed projection returns no partial TAB text.

## Output format

Format ID:

`seslitab-basic-ascii-tab-v1`

String order is always high to low:

1. `e`
2. `B`
3. `G`
4. `D`
5. `A`
6. `E`

Each source event consumes exactly one fixed-width four-character display cell. A selected fret is rendered inside its selected-string cell; every other string receives an empty dash cell.

Example for two sequential notes selected as fourth-string frets 2 and 3:

```text
e|--------|
B|--------|
G|--------|
D|-2---3--|
A|--------|
E|--------|
```

Two-digit frets remain within the same fixed-width cell, for example:

```text
e|-10-|
```

## Measure identity

Every rendered measure remains a separate immutable object carrying:

- `measureKey`;
- `measureIndex`;
- display-only `measureNumber`;
- `partId`;
- `partIndex`;
- event count;
- six rendered string lines.

Duplicate visible measure numbers therefore remain distinct when their canonical `measureKey` values differ.

The top-level text joins physical measure blocks with one blank line. It does not use visible measure numbers as identity.

## Semantic limits

ASCII cell spacing represents source event order only.

Package 4D explicitly reports:

- `rhythmEncoded: false`;
- `graceEncoded: false`;
- `tieEncoded: false`;
- `roundTripLossless: false`.

This prevents the visual renderer from being mistaken for a rhythmic notation engine or a lossless canonical serialization.

Rests consume an empty fixed-width cell without receiving an invented fret or pitch. Grace and tie evidence remain authoritative in Package 4C/canonical data and are not replaced by guessed ASCII symbols.

## Fail-closed behavior

No TAB text is returned when:

- the input is not an object;
- Package 4C did not return `projected`;
- policy/provenance claims conflict;
- note or measure counts conflict;
- measure identity is missing or duplicated;
- a source `noteIndex` is invalid, duplicated or missing;
- source order decreases inside one physical measure;
- event timing is malformed;
- rest/position state conflicts;
- string number and string letter conflict;
- fret is outside the established 0–24 basic boundary.

## Safety boundary

Package 4D:

- does not mutate the Package 4C projection or original NoteObjects;
- deeply freezes renderer-owned public containers;
- does not import production OMR, gateway or MusicXML parser paths;
- does not alter the Package 2D quality gate;
- does not modify canonical consumer bindings;
- does not activate production Guitar TAB output;
- adds no dependency;
- performs no deployment.

A successful render proves only that a valid Package 4C basic projection can be displayed deterministically. It does not prove OMR correctness, source fingering, teacher approval, rhythmic fidelity, or advanced Guitar TAB suitability.

## Acceptance tests

Focused tests cover:

1. deterministic six-line rendering from a real Package 4C projection;
2. fixed-width two-digit fret alignment;
3. duplicate visible measure numbers with distinct canonical `measureKey` values;
4. rest slots with no invented fret or pitch;
5. explicit non-encoding of grace, tie and rhythm semantics;
6. whole-render abort for non-projected Package 4C results;
7. invalid string/fret evidence fail-closed behavior;
8. count, identity and policy contradiction rejection;
9. determinism, immutability and no input mutation;
10. source isolation from production OMR/gateway/gate/parser/UI boundaries;
11. a genuine Package 4C projection whose source order revisits a physical measure;
12. duplicate/out-of-range source `noteIndex` evidence rejection.

## Next integration boundary

Production `GUITAR_TAB` activation remains a separate explicit integration gate. Before any rendered TAB becomes a production consumer output, the existing Package 2D quality-gate policy must be applied to the exact canonical NoteObject array so source-unverified OMR can never become definitive Guitar TAB merely because Package 4D rendered successfully.
