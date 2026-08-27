# Package 4C — Canonical Basic Guitar TAB Projection

## Scope

Package 4C projects a canonical `NoteObject[]` into a conservative, immutable basic Guitar TAB event model. It uses the Package 4B `lowest-fret-v1` generated-basic position policy and preserves canonical physical measure identity plus exact original NoteObject references.

It does **not** yet render ASCII/visual TAB and does not activate the production `GUITAR_TAB` consumer boundary.

## Basic versus advanced boundary

Package 4 is the basic Guitar TAB package. Package 9 remains the advanced/polyphonic/pedagogical fingering package. Package 4C therefore refuses to flatten structures whose safe fingering requires advanced reasoning.

The entire projection returns `advanced-required` with no partial TAB when it encounters:

- multiple score parts;
- chord continuation structure;
- multiple pitched voices;
- multiple pitched staves;
- independent simultaneous pitched attacks at the same canonical physical onset.

A zero-duration grace note may share the following onset because that does not by itself prove independent polyphony. Its grace metadata is preserved for later rendering rather than converted into ordinary duration.

## Canonical identity

Each input note must retain:

- non-empty `measureKey`;
- non-negative integer `measureIndex`;
- non-empty `partId`;
- non-negative integer `partIndex`;
- finite non-negative `startBeat` and `beats`.

Visible `measureNumber` is display metadata only. It is never used to synthesize identity. Duplicate displayed measure numbers remain distinct when their canonical `measureKey` differs.

Conflicting physical metadata under one `measureKey` fails closed.

## Projection event contract

For every safe basic event, Package 4C preserves:

- exact original `NoteObject` reference;
- canonical measure identity;
- source order;
- `startBeat` and `beats`;
- voice/staff metadata;
- rest state;
- grace state;
- tie-start/tie-stop evidence;
- Package 4B generated-basic position;
- policy/provenance markers.

Generated position provenance remains:

- `policyId: lowest-fret-v1`
- `provenance: generated-basic`
- `sourceFingeringClaimed: false`

## Fail-closed behavior

No partial TAB projection is returned when:

- input is not a canonical note array;
- the array is empty;
- canonical physical identity is missing;
- one note is malformed;
- one pitched note is outside the supported basic guitar range;
- measure identity conflicts;
- advanced/polyphonic structure is encountered.

Rests receive no invented pitch or fret. Unsupported pitch never falls back to first-string-open.

## Safety boundary

Package 4C:

- does not mutate canonical notes;
- freezes its own projection containers;
- does not rewrite `musicXmlParser.js`;
- does not import Audiveris, OMR worker/provider, gateway or frontend OMR service;
- does not modify Package 2D quality-gate integration;
- does not modify `canonicalConsumerBindings.js`;
- does not activate production Guitar TAB;
- adds no dependency;
- performs no deployment.

## Acceptance tests

Focused tests cover:

1. sequential monophonic canonical projection;
2. exact NoteObject-reference preservation;
3. duplicate visible measure numbers with distinct canonical keys;
4. rests with no invented fret;
5. whole-projection abort on unplayable pitch;
6. chord rejection to advanced package;
7. simultaneous independent pitched-event rejection;
8. multiple-voice rejection;
9. multiple-part and multiple-staff rejection;
10. grace-note onset preservation;
11. tie metadata preservation;
12. missing physical identity fail-closed;
13. conflicting measure identity fail-closed;
14. deterministic immutable projection with no input mutation;
15. no production OMR/gate/binding imports.

## Next safe slice

After exact-head and exact-main CI close 4C, Package 4D can define a deterministic basic TAB renderer over this projection. Production `GUITAR_TAB` quality-gate/consumer activation should remain a later explicit integration gate so an unverified OMR result can never become definitive TAB merely because rendering succeeds.
