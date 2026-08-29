# Package 10 — Advanced Violin

Date: 2026-08-29

Status: implementation candidate; completion requires protected-main merge and exact-main CI.

## Goal

Extend the existing Package 5 quality-gated violin path without pretending that generated fingering is source truth or teacher-approved pedagogy.

Package 10 adds a bounded generated advanced layer for one violin part:

- first-, second- and third-position chromatic alternatives under an explicit mechanical zone policy;
- string-crossing alternatives that Package 5 intentionally leaves for review;
- two-note double stops;
- independent simultaneous notes from multiple voices/staves in one violin part;
- sustained-string locking so a sounding string cannot be silently reused;
- exact tie continuity on the established generated string/position/finger;
- deterministic accessible plain-text output in the existing Keman panel.

## Quality gate

The exact canonical `NoteObject[]` must pass the existing Package 2D `VIOLIN` quality gate before Package 10 runs.

`REVIEW` or `BLOCK` terminates before any advanced suggestion is created.

The conservative Package 5 projection is always attempted first. Package 10 runs only when Package 5 reports a generated string-choice ambiguity, advanced-required structure, or out-of-range condition that is inside the bounded Package 10 position model.

## Generated position policy

Policy identity:

```text
policyId: violin-position-zones-v1
provenance: generated-advanced
teacherApproved: false
sourceFingeringClaimed: false
```

Standard tuning remains E5 / A4 / D4 / G3.

The mechanical policy keeps chromatic low/high variants as explicit alternatives rather than calling one pedagogically correct. It supports only first through third position and never claims that the deterministic display choice is the best musical fingering.

The bounded position zones are:

- first position: finger 1 = +1/+2 semitones, finger 2 = +3/+4, finger 3 = +5/+6, finger 4 = +7;
- second position: finger 1 = +3/+4, finger 2 = +5/+6, finger 3 = +7/+8, finger 4 = +9;
- third position: finger 1 = +5/+6, finger 2 = +7/+8, finger 3 = +9/+10, finger 4 = +11/+12;
- open strings remain finger 0.

These are generated physical teaching candidates, not reconstructed editorial fingering.

## Polyphonic solver

Package 10 accepts at most two simultaneous pitched events. The deterministic bounded solver:

1. preserves any exact tie-locked position;
2. excludes strings still sounding from earlier sustained notes;
3. requires the two simultaneous notes to occupy distinct strings;
4. enumerates all bounded candidate combinations;
5. selects deterministically by lower hand position, then lower finger number and stable string order;
6. keeps all per-note candidate alternatives in the projection for transparent downstream review.

A solver-node limit prevents unbounded search.

## Fail-closed boundaries

No partial violin suggestion is emitted for:

- more than two simultaneous pitched notes;
- multiple score parts;
- malformed physical measure/timing identity;
- pitch outside the bounded standard-tuning first-through-third-position model;
- a tie stop without an established position;
- a dangling tie start;
- two fixed tie continuations requiring one string;
- no distinct-string solution;
- solver-limit exhaustion.

Package 10 therefore supports double stops, not inferred triple/quadruple-stop technique.

## Accessible presentation

The existing Keman result panel is reused. Advanced output announces that it is an automatic suggestion and includes:

- physical measure identity;
- simultaneous-event wording (`aynı anda`);
- string;
- generated position;
- generated finger.

No visual-only representation is required to understand the result.

## Protected boundaries

Package 10 does not modify or depend on:

- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- backend production OMR path;
- Package 8B research/training/model path;
- `Dockerfile`;
- `render.yaml`;
- Render deployment/service wiring.

No external dependency is added.