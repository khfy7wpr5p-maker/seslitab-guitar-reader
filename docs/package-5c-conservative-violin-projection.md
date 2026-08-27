# Package 5C — Conservative Basic Violin Projection

## Status

Implementation branch: `package-5c-conservative-violin-projection`

Package 5C projects an exact canonical NoteObject array into a conservative basic first-position violin event model. It preserves canonical physical measure identity and exact original NoteObject references while consuming only Package 5B generated fingering evidence.

It does **not** activate a production violin consumer, modify the canonical consumer vocabulary, change Package 2D quality-gate wiring, modify MusicXML parsing, or alter the production OMR path.

## Finalized projection rule

A `projected` result is produced only when all of the following are true:

- input is a non-empty canonical NoteObject array;
- every note has valid canonical physical identity;
- the material is a single part, single pitched voice and single pitched staff;
- there is no chord/double-stop structure;
- there are no independent simultaneous pitched attacks;
- every pitched note lies within the narrow Package 5A first-position range;
- every pitched note has exactly one Package 5B generated basic fingering candidate;
- no string-crossing ambiguity remains unresolved.

No measure is published until every note has passed these checks, so a late failure cannot leave a partial basic violin projection.

## Result states

- `projected`: every event satisfies the conservative basic contract;
- `review-required`: Package 5B exposes multiple valid first-position string candidates and no string is chosen;
- `advanced-required`: double stops/chords, multiple parts, multiple pitched voices/staves, or independent simultaneous pitched attacks require the later Advanced Violin package;
- `out-of-range`: at least one note has no candidate inside the Package 5A first-position range;
- `invalid`: canonical shape, written pitch, timing or physical identity is malformed/incomplete.

All non-`projected` states return zero finalized measures and zero projected-note count.

## Exact identity and provenance

Projected measure identity uses:

- `measureKey` as the authoritative physical measure key;
- `measureIndex`;
- `partId`;
- `partIndex`.

Visible `measureNumber` is display metadata only and is never promoted to unique identity.

Each projected event preserves the exact original NoteObject reference and records:

- source `noteIndex`;
- physical measure identity;
- canonical onset/beats;
- voice/staff;
- rest/grace/tie flags;
- Package 5B policy ID;
- generated-basic provenance;
- `teacherApproved: false`;
- one immutable fingering candidate, or `null` for a rest.

## Ambiguity policy

String-crossing notes such as D4, A4 and E5 can have two valid Package 5A physical strings. Package 5C does not select between them. The whole projection returns `review-required`, identifies the blocking note index, and publishes no partial measures.

This is intentional: physical possibility is not teacher-approved fingering and a local string choice can depend on passage context.

## Advanced boundary

The following are deliberately delegated to Package 10 Advanced Violin:

- double stops and chord structures;
- independent simultaneous pitched events;
- multiple pitched voices;
- multiple pitched staves;
- multiple parts;
- advanced positions;
- contextual/pedagogical fingering optimization.

A canonical grace note may share the next attack onset because it consumes zero canonical measure time; this alone is not classified as a double stop.

## Safety behavior

Package 5C:

- never mutates canonical notes;
- never clones notes and treats the clone as equivalent quality evidence;
- never guesses a missing measure identity;
- rejects coercible string/boolean/non-finite timing/index values;
- never emits a partial projection after ambiguity, out-of-range, advanced, or invalid evidence;
- never converts source guitar string/fret fields into violin truth;
- never claims teacher approval;
- adds no dependency;
- imports no Audiveris/provider/runtime/preflight/worker/gateway/E2E module;
- does not modify `musicXmlParser.js`;
- does not modify canonical consumer vocabulary or Package 2D quality-gate wiring;
- performs no deployment.

## Acceptance tests

Focused tests verify:

1. sequential unique first-position notes preserve exact NoteObject references;
2. duplicate visible measure numbers remain distinct by `measureKey`;
3. rests remain rests with no invented fingering;
4. unresolved crossing ambiguity returns `review-required` and no partial projection;
5. out-of-range pitch returns no fallback projection;
6. chord/double-stop structure is delegated to Advanced Violin;
7. simultaneous pitched attacks are not flattened;
8. multiple pitched voices/staves/parts require advanced handling;
9. grace notes may share the next onset without false double-stop classification;
10. tie metadata and generated fingering remain evidence, not teacher truth;
11. missing physical identity fails closed;
12. coercible/non-finite identity and timing values fail closed;
13. conflicting metadata for one `measureKey` fails closed;
14. output is deterministic/frozen and input notes remain unchanged;
15. source has no production OMR/parser/quality-gate/canonical-consumer activation.

## Architecture gate after 5C

The repository's current canonical consumer vocabulary contains rhythmic text, rhythmic HTML, TTS, playback and Guitar TAB, but no violin consumer. Therefore production activation of Basic Violin would require an explicit architecture change across the canonical consumer/quality-gate boundary.

Package 5C intentionally stops before that change. After 5C is merged and exact-main CI succeeds, further production wiring must be treated as an architecture-boundary decision rather than a routine isolated implementation slice.
