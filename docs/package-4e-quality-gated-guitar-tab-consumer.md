# Package 4E — Quality-Gated Production Guitar TAB Consumer

## Scope

Package 4E opens the production canonical `GUITAR_TAB` consumer boundary at the service layer only.

The production path is:

```text
exact canonical NoteObject[]
  -> Package 2D GUITAR_TAB quality gate
  -> Package 4C conservative basic projection
  -> Package 4D deterministic ASCII renderer
  -> immutable consumer result
```

No UI output is activated in this package. UI wiring remains a separate reversible slice.

## Mandatory gate order

The exact canonical NoteObject array must receive Package 2D `ACCEPT` before Package 4C projection or Package 4D rendering executes.

- `REVIEW` -> no projection, no render, empty TAB text.
- `BLOCK` -> no projection, no render, empty TAB text.
- `ACCEPT` -> basic projection may run.

The quality report may be provided explicitly or retrieved from the existing exact-array WeakMap registration. Quality evidence never transfers to a cloned/reordered array.

## Consumer boundary

`canonicalConsumerBindings.js` maps `GUITAR_TAB` to:

- module: `src/services/guitarTabConsumer.js`
- export: `buildQualityGatedBasicGuitarTab`
- input: `note-array`
- status: `mapped`
- enforcementReady: `true`

This mapping is valid because the exported production adapter itself enforces Package 2D before downstream Guitar TAB generation.

## Basic-only behavior

After `ACCEPT`, Package 4E delegates musical transformation to the already-verified Package 4C and 4D contracts.

The consumer does not flatten or guess unsupported structures. Projection states such as:

- chord structure;
- independent simultaneous pitched events;
- multiple pitched voices;
- multiple pitched staves;
- multiple parts;
- unplayable basic pitch;

return `not-available` with empty TAB text. Advanced/polyphonic Guitar TAB remains Package 9 work.

## Safety properties

Package 4E:

- uses the exact canonical array for the quality gate and projection;
- never promotes source-unverified OMR to definitive Guitar TAB;
- emits no partial TAB on `REVIEW`, `BLOCK`, invalid render or unsupported basic structure;
- does not modify Package 4C/4D musical semantics;
- does not mutate notes or quality evidence;
- does not import Audiveris, OMR worker/provider, gateway or runtime integration;
- adds no dependency;
- changes no MusicXML parser behavior;
- changes no deployment configuration;
- performs no deployment.

## Consumer result states

- `rendered`: Package 2D accepted and 4C/4D completed successfully.
- `review-required`: Package 2D returned `REVIEW`; no TAB text exists.
- `blocked`: Package 2D returned `BLOCK`; no TAB text exists.
- `not-available`: gate accepted, but the score is outside the conservative basic TAB contract.
- `invalid`: malformed input or downstream contract failure; no TAB text exists.

Only `rendered` has `allowed: true`, `definitive: true`, and non-empty TAB text.

## Acceptance evidence

Focused tests require:

1. verified canonical data plus source-verified report reaches `rendered`;
2. exact-array registered report does not transfer to a clone;
3. source-unverified evidence returns `review-required` before projection;
4. unreliable/structurally invalid evidence returns `blocked` before projection;
5. chord/polyphonic structures remain delegated without partial TAB;
6. malformed input fails closed;
7. result/input evidence remain immutable/read-only;
8. production consumer has no OMR/provider/gateway/runtime import;
9. canonical consumer inventory maps the real service export;
10. Package 2D resolves `GUITAR_TAB` with the same `ACCEPT/REVIEW/BLOCK` policy as other mapped consumers.

## Next boundary

The next safe slice may wire this service to an accessible result panel in `src/app.js` / `index.html`.

That UI slice must call only `buildQualityGatedBasicGuitarTab(notes)` using the exact currently published canonical array. It must display no generated TAB when the consumer state is anything other than `rendered` and must communicate review/block/advanced-required states accessibly without exposing internal diagnostics as musical truth.
