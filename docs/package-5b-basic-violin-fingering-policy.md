# Package 5B — Basic Violin First-Position Fingering Policy

## Status

Implementation branch: `package-5b-basic-violin-fingering-policy`

Package 5B annotates Package 5A physical first-position string candidates with a deliberately narrow generated finger-zone policy. It does not activate a production violin consumer and it does not represent generated fingering as source or teacher-approved truth.

## Policy identity

`first-position-semitone-zone-v1`

For each physical Package 5A string candidate, semitone distance from the open string maps mechanically to a finger number:

| Semitone offset | Generated basic finger |
|---:|---:|
| 0 | open / 0 |
| 1–2 | 1 |
| 3–4 | 2 |
| 5–6 | 3 |
| 7 | 4 |

This is a mechanical first-position zone contract. It is not a claim that the resulting fingering is pedagogically optimal for a passage, key, hand shape, articulation or student.

## Crossing-string ambiguity

Package 5B never chooses a preferred string when Package 5A exposes multiple physical candidates.

Examples:

- D4: open D (finger 0) or G-string top of the narrow first-position span (finger 4);
- A4: open A or D-string finger 4;
- E5: open E or A-string finger 4.

These return `ambiguous`, retain every candidate, set `requiresTeacherReview: true`, and contain no selected-candidate field.

## Result states

- `generated-basic`: one physical first-position candidate exists and receives a generated finger number;
- `ambiguous`: multiple physical first-position candidates exist and no string is selected;
- `rest`: no fingering is generated;
- `out-of-range`: Package 5A has no supported first-position candidate;
- `invalid`: malformed/non-canonical input or unsupported evidence.

Every result and every generated candidate records `teacherApproved: false`. Generated candidates use provenance `generated-basic-first-position-fingering`.

## Safety properties

Package 5B:

- consumes Package 5A candidate evidence instead of recalculating instrument range independently;
- does not mutate canonical notes or Package 5A results;
- never converts legacy guitar string/fret fields into violin fingering truth;
- never selects a string across an ambiguity;
- never claims teacher approval;
- does not add or change a canonical consumer type;
- does not modify Package 2D quality-gate wiring;
- does not modify `musicXmlParser.js`;
- imports no Audiveris/provider/runtime/preflight/worker/gateway/E2E module;
- adds no dependency and performs no deployment.

## Acceptance tests

Focused tests verify:

1. explicit immutable policy identity and all eight semitone-zone mappings;
2. open string maps to generated finger 0 without approval claim;
3. stopped first-position zones map to fingers 1–4;
4. D4 crossing remains ambiguous;
5. A4/E5 crossings remain ambiguous and have no selected candidate;
6. rests receive no fingering;
7. out-of-range/invalid data fail closed;
8. guitar position fields are never promoted to violin truth;
9. deterministic frozen output and unchanged canonical input;
10. no production violin/OMR/parser/quality-gate activation.

## Next safe slice

Package 5C may build a conservative sequential violin projection over exact canonical NoteObject references plus Package 5B results. Chords/double stops, multiple pitched voices/staves/parts, advanced positions and unresolved string ambiguity must not be flattened into basic violin output.

Production activation after the isolated Package 5 engine remains a separate architecture gate because the current canonical consumer vocabulary does not contain a violin consumer type.
