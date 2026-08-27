# Package 5E — Quality-gated Basic Violin production consumer

## Scope

Package 5E activates the Basic Violin production consumer boundary without changing MusicXML parsing or OMR infrastructure.

The only production entry point for generated basic first-position violin fingering is:

`buildQualityGatedBasicViolin(notes, options)`

## Mandatory order

1. Receive the exact canonical `NoteObject[]`.
2. Resolve Package 2D through `resolveViolinQualityGate`.
3. If the gate is not `ACCEPT`, produce no violin projection.
4. Only after `ACCEPT`, call Package 5C conservative projection.
5. Publish a definitive basic projection only when Package 5C returns `PROJECTED`.

## Fail-closed outcomes

- quality gate `REVIEW` → `review-required`, no projection
- quality gate `BLOCK` → `blocked`, no projection
- unresolved first-position string crossing → `review-required`, zero finalized measures
- double stop/chord/polyphony/multiple voice/staff/part → `not-available`, zero partial measures
- basic range failure → `not-available`, zero partial measures
- malformed data → `invalid`

A quality-gate ACCEPT proves the canonical/quality evidence required for consumption. It does **not** prove that a generated pedagogical string choice is unique. Package 5C ambiguity therefore remains review-required.

## Provenance

Generated fingering remains:

- `provenance: generated-basic-first-position-fingering`
- `teacherApproved: false`

No generated basic fingering is represented as teacher ground truth.

## Production boundary

The canonical `violin` consumer is now mapped to:

- module: `src/services/violinConsumer.js`
- export: `buildQualityGatedBasicViolin`
- input: exact `NoteObject[]`
- status: `mapped`
- enforcement ready: `true`

## Safety invariants

- Exact-array Package 2C report identity does not transfer to clones.
- No partial finalized output is emitted after ambiguity or unsupported structure.
- No MusicXML parser changes.
- No Audiveris/provider/runtime/preflight/worker/gateway/E2E changes.
- No new dependency.
- No deployment.

## Next package

Package 5F may expose this consumer through an accessible Basic Violin UI. The UI must display definitive fingering only for consumer state `projected` and must preserve review/block/not-available states without inventing a string choice.
