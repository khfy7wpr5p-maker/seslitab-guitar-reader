# Package 9 — Advanced Guitar TAB

Date: 2026-08-29

Status: **Completed.**

## Roadmap decision

Package 8B remains a separate partially implemented Audiveris-training research package because real per-sample approval/native-evidence gates are still unsatisfied. The user explicitly authorized continuing application development instead of blocking the product roadmap on that research data.

This does not mark Package 8B completed and does not authorize Audiveris training or production-model replacement.

## Scope

Package 9 extends the existing Package 4 quality-gated Guitar TAB path for one guitar part. It supports:

- MusicXML chord continuations;
- independent simultaneous pitched events;
- multiple voices within one guitar part;
- multiple staves within one guitar part;
- sustained polyphony where a still-sounding string cannot be reused;
- deterministic distinct-string assignment for each simultaneous onset group;
- deterministic six-line ASCII TAB where simultaneous notes share one display column;
- existing exact-array Package 2D `GUITAR_TAB` quality gating;
- the existing accessible Gitar TAB result panel.

## Deliberate fail-closed boundaries

Package 9 does not guess or flatten:

- more than six simultaneous pitched notes;
- pitches with no valid standard-tuning / 24-fret candidate;
- multiple score parts into one guitar;
- malformed canonical physical identity/timing;
- a tie stop without an established prior guitar position;
- a dangling tie start;
- a fingering search that exceeds the fixed solver-node limit.

In those cases no partial TAB text is emitted.

## Fingering semantics

The advanced policy is `seslitab-advanced-guitar-v1` with provenance `generated-advanced`.

It is a deterministic generated fingering, not recovered source technical fingering and not teacher-approved or pedagogically optimal fingering. Candidate positions continue to use the established Package 4A written-guitar octave-transposition and standard six-string / 24-fret contract.

The bounded solver chooses a valid distinct-string combination by deterministic cost ordering and backtracks across onset groups when sustained notes lock strings.

## Display semantics

ASCII TAB uses one fixed-width cell per canonical onset group. Chord/polyphonic notes therefore appear vertically in the same column.

ASCII spacing is not a rhythm model. Canonical `startBeat`, `beats`, voice, staff, grace and tie evidence remain authoritative. The renderer does not claim lossless round-trip notation.

## Production flow

```text
exact canonical NoteObject[]
  -> Package 2D GUITAR_TAB quality gate
  -> Package 4 basic projection/render first
  -> if Package 4 reports advanced-required:
       Package 9 advanced projection
       -> bounded string-assignment solver
       -> advanced ASCII renderer
  -> existing accessible Gitar TAB panel
```

`REVIEW` and `BLOCK` quality decisions terminate before Package 9 executes.

## Verification evidence

- implementation PR **#122** merged to protected `main`;
- protected-main implementation SHA `f01e67d6488cedf192333d6ba2c528330841d5d8`;
- exact-main CI **#319 / run `33256393182`, job `99110780497` — SUCCESS**;
- **1326 / 1326 tests PASS**;
- **232 suites**;
- **0 failed / skipped / cancelled**;
- **0 vulnerabilities**;
- Vite production build **PASS**;
- real Chrome score render + cursor runtime proof **PASS**.

Focused Package 9 regression evidence covers quality-gated three-note chords, simultaneous independent voices, sustained-string locking, tie continuation, dangling-tie failure, more-than-six-note failure, REVIEW gate enforcement, multiple-part rejection, deterministic immutable projection, simultaneous-onset rendering, and isolation from OMR/backend/network/deployment boundaries.

## Protected boundaries

Package 9 does not modify or import:

- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- backend production OMR path;
- `Dockerfile`;
- `render.yaml`;
- Render deployment/service wiring;
- Package 8B training/model code.

No new external dependency is introduced.