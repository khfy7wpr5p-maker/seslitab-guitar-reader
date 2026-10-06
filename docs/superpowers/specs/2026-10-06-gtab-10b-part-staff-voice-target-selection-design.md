# GTAB-10B — Part / Staff / Voice Target Selection for Guitar TAB

Date: 2026-10-06
Status: Design approved; implementation not started
Parent: GTAB-10 — MusicXML Compatibility Expansion + Semantic Engine Qualification
Depends on: GTAB-10A secure MusicXML/MXL intake

## Problem

GTAB-10A established safe `.xml`, `.musicxml`, and `.mxl` intake while preserving the accepted MusicXML as the authoritative SCORE source. The next gap is target selection for Guitar TAB derivation.

A MusicXML document may contain:

- one or many parts,
- one or many staves inside a part,
- one or many voices inside a staff,
- non-guitar source parts such as piano, violin, voice, or bass.

The current teacher flow does not expose a bounded target-selection authority. It must not guess that the first part is guitar, that piano staff 1 means right hand, or that voice 1 is always the intended melody.

The user requirement is broader than guitar-part conversion: a teacher may select any suitable musical line, including a monophonic piano staff/voice, and derive Guitar TAB from it while preserving the original score.

## Approved Decision

Use a hybrid immutable-source design.

Canonical flow:

```text
secure MusicXML/MXL intake
  -> immutable accepted MusicXML
  -> exact score inventory
  -> teacher target selection
       part -> staff -> voice
  -> selection authority revalidated against the same source
  -> selected canonical notes only
  -> existing Guitar TAB projection / fingering path
  -> derived TAB MusicXML
```

The original accepted MusicXML remains unchanged. TAB is a derived artifact, not an in-place rewrite of the source SCORE.

## Selection Authority

The canonical selection contract is:

```text
targetSelection
  partId
  partIndex
  staff
  voice
```

Rules:

1. `partId` is the primary physical MusicXML part identity.
2. `partIndex` is preserved as exact source-order evidence and must agree with `partId`.
3. `staff` is the explicit MusicXML staff ordinal used by the selected notes.
4. `voice` is the explicit MusicXML voice identity used by the selected notes.
5. Display names are presentation only; they are not authority.
6. No selection may be reconstructed from label text, DOM order alone, pitch similarity, or heuristics.

## Automatic Selection Rules

Selection is hierarchical:

```text
Part -> Staff -> Voice
```

At each level:

- exactly one valid candidate -> select automatically;
- more than one valid candidate -> require explicit teacher selection;
- zero valid candidates -> fail closed;
- stale or contradictory identity -> fail closed.

A multi-part file must not silently choose the first part. A multi-staff part must not silently choose staff 1. A multi-voice staff must not silently choose voice 1.

## Piano and Other Non-Guitar Sources

Any source part may be selected if it yields notes that the Guitar TAB pipeline can represent safely.

Examples:

- Piano -> Staff 1 -> Voice 1 -> monophonic melody -> Guitar TAB
- Piano -> Staff 2 -> Voice 1 -> bass line -> Guitar TAB
- Violin -> Staff 1 -> Voice 1 -> Guitar TAB
- Vocal -> Staff 1 -> Voice 1 -> Guitar TAB

The UI must display exact MusicXML evidence, for example:

```text
Piano (P1)
  Staff 1
    Voice 1
    Voice 2
  Staff 2
    Voice 1
```

The UI must not relabel `Staff 1` as "right hand" or `Staff 2` as "left hand" unless such semantics are explicitly encoded by a trustworthy source field. Hand assignment must never be inferred from staff ordinal.

## Score Inventory

Introduce one reusable inventory extractor over the already accepted MusicXML.

The inventory must expose only source-derived structure needed for selection:

```text
ScoreInventory
  parts[]
    partId
    partIndex
    name
    staves[]
      staff
      voices[]
        voice
        pitchedEventCount
```

The extractor must:

- operate only after existing MusicXML security validation;
- support the MusicXML layouts already accepted by the parser path;
- reject duplicate or contradictory part identities;
- derive staff and voice candidates from actual note evidence;
- preserve stable source order;
- never synthesize a fake part/staff/voice when evidence is absent.

`part-name` is presentation metadata. Exact part identity remains `partId` plus validated `partIndex` evidence.

## Source Immutability

GTAB-10B must not prune, rewrite, or destructively normalize the authoritative source MusicXML merely to select a target.

The accepted source stays available for:

- normal SCORE viewing,
- student delivery,
- future editor use,
- reproducibility and fingerprint checks.

Target filtering occurs at the canonical-note boundary before Guitar TAB projection.

## Revalidation Before TAB Derivation

A previously selected target may become stale if a different score is loaded or an editor revision changes part/staff/voice evidence.

Before TAB generation, the system must re-extract or revalidate inventory against the exact current source and prove:

- selected `partId` exists exactly once;
- selected `partIndex` agrees with that part;
- selected `staff` exists within that part;
- selected `voice` exists within that staff;
- selected canonical notes all belong to that exact tuple.

If any condition fails, TAB derivation stops. The system must not migrate the selection to a "closest" part, staff, or voice.

## Canonical Note Filtering

The preferred implementation boundary is after parsing/canonicalization and before Guitar TAB projection.

Conceptually:

```text
allCanonicalNotes
  -> notes where
       note.partId    == selection.partId
       note.partIndex == selection.partIndex
       note.staff     == selection.staff
       note.voice     == selection.voice
  -> exact selected note stream
  -> Guitar TAB projection
```

This uses identities already present in the repository instead of mutating raw XML.

## Polyphony and Chords

GTAB-10B establishes selection authority; it does not silently broaden the fingering engine's representational guarantees.

If the selected voice contains structures that the current Guitar TAB projection cannot represent safely, such as unsupported simultaneous-note or timing cases, the conversion must fail closed or abstain with a bounded diagnostic.

No note may be dropped merely to force a monophonic result.

Expansion of complex polyphonic fingering behavior belongs in a later GTAB package unless the current projection already supports the exact case with existing tests.

## Teacher UI

After a score is accepted:

1. Show the part selector only when more than one valid part exists.
2. After part selection, show staff selector only when more than one valid staff exists.
3. After staff selection, show voice selector only when more than one valid voice exists.
4. For single candidates, auto-select and keep the flow compact.
5. Disable TAB conversion until the full target tuple is resolved.
6. If the source changes, invalidate the previous target selection before conversion can continue.

The target chooser must be keyboard accessible and screen-reader understandable. Existing accessibility behavior must not regress.

## SCORE Delivery Contract

The selected TAB target does not alter the normal SCORE authority.

The teacher may still deliver the complete accepted SCORE. The target selection controls only the derived Guitar TAB path.

A package may therefore contain:

```text
full original SCORE
+ derived Guitar TAB for one selected target
```

This prevents piano/bass/other parts from being lost simply because one line was selected for TAB practice.

## Existing Seams to Reuse

The design should reuse rather than replace existing identity and projection seams, including:

- secure MusicXML/MXL intake from GTAB-10A;
- `extractEditorPartNameEvidence(...)` style exact part evidence;
- canonical note fields `partId`, `partIndex`, `staff`, `voice`;
- existing Guitar TAB projection/fingering services;
- current teacher assignment SCORE preparation and Guitar TAB handoff.

Likely implementation areas include:

- a new bounded score-inventory service;
- teacher target-selection UI state;
- Guitar TAB teacher workspace/composer handoff;
- tests covering inventory, selection, stale-source invalidation, and downstream projection.

Exact file changes will be finalized in the implementation plan after this design is reviewed.

## Fail-Closed Cases

Conversion must stop without guessing when:

- MusicXML part-list evidence is malformed;
- duplicate `partId` values exist;
- `partId` and `partIndex` disagree;
- selected staff no longer exists;
- selected voice no longer exists;
- source fingerprint/revision changed after selection;
- no pitched events exist for the selected tuple;
- parser evidence is ambiguous;
- selected notes contain unsupported projection structures;
- target selection was derived from display labels instead of exact identity.

## TDD Acceptance Matrix

1. Single-part / single-staff / single-voice score resolves automatically.
2. Two-part score requires explicit part selection.
3. One part with two staves requires explicit staff selection.
4. One staff with two voices requires explicit voice selection.
5. Piano Staff 1 Voice 1 monophonic notes can be selected for Guitar TAB without changing the original SCORE.
6. Piano Staff 2 may be selected independently.
7. Non-guitar part names do not block target selection.
8. Duplicate part IDs fail closed.
9. Stale selection after source replacement fails closed.
10. Wrong `partIndex` for an otherwise valid `partId` fails closed.
11. Empty selected target fails closed.
12. Filtering preserves only the exact selected `partId + partIndex + staff + voice` notes.
13. Full SCORE remains byte/accepted-source authoritative while TAB is derived separately.
14. Unsupported polyphonic target does not silently discard notes.
15. Existing GTAB-10A XML/MXL intake tests remain green.
16. Existing Guitar TAB projection tests remain green.
17. Existing Assignment Composer and Student delivery tests remain green.
18. Accessibility / keyboard behavior for the new chooser is covered.
19. Full CI, Regression Quality, Dependency Security, Playwright protected baseline, and Sonar quality gate pass before completion.

## Non-Goals

GTAB-10B does not:

- infer musical instrument from pitch range;
- infer piano hand from staff number;
- rewrite the source MusicXML to remove unselected parts;
- automatically merge multiple voices into one melody;
- silently drop chord tones to force monophony;
- redesign the Guitar TAB fingering algorithm;
- change Student App SCORE rendering behavior;
- change OMR or Correction Engine behavior.

## Implementation Order

After written-spec approval:

1. Write the implementation plan using TDD boundaries.
2. Add RED inventory/selection contract tests.
3. Implement exact score inventory extraction.
4. Add hierarchical auto/explicit selection state.
5. Bind selection to the existing teacher TAB derivation path.
6. Add stale-source and identity revalidation.
7. Qualify piano/non-guitar monophonic examples.
8. Run the complete regression/security/browser/Sonar gate set.
9. Open a separate implementation PR.
10. Merge and deploy only with separate user approvals.

## Completion Gate

GTAB-10B is complete only when fresh evidence proves:

- exact Part -> Staff -> Voice authority;
- no heuristic target guessing;
- immutable original SCORE preservation;
- correct piano/non-guitar monophonic target derivation;
- stale/mismatched selections fail closed;
- existing Guitar TAB and teacher/student flows do not regress;
- all required CI and quality gates are green.

Merge and deploy remain separate approvals.
