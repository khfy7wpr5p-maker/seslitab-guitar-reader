# Stage D — Quality Overlay

## Scope

Stage D adds a read-only teacher-facing quality overlay over the exact Package 2C quality report already registered for the exact canonical `NoteObject[]` identity.

It does not add a new quality engine, OMR inference, correction policy, teacher approval, or renderer semantic authority.

## Product language

The overlay uses only these bounded product states:

- PASS → **Otomatik kontrollerden geçti**
- REVIEW → **İnceleme gerekiyor**
- BLOCK → **Kullanım engellendi**

PASS is not represented as teacher approval.

## Evidence source

`src/services/qualityOverlay.js` reads `getRegisteredQualityReport(notes)` from the existing Package 2D integration registry. The exact canonical array identity is therefore preserved by the existing `WeakMap` boundary.

The overlay does not recompute structural rhythm, source verification, pitch verification, or consumer gates.

## Localization boundary

Current Package 2C findings expose:

- `partId`
- `measureKey`
- visible measure number
- `measureIndex`
- `voice`
- `staff`

They do not expose an exact canonical note identity such as a canonical array index or a proven renderer `ScoreNoteRef`.

Therefore Stage D safely localizes findings to measures only. It explicitly sets `exactNoteTarget: null` and does not guess a note from pitch, voice/staff proximity, SVG geometry, renderer traversal order, or labels.

This keeps the Stage C renderer interaction contract intact: exact note highlight remains available only for an independently proven canonical ↔ renderer locator.

## UI behavior

`src/stageDQualityOverlayUi.js`:

- subscribes to the existing Package 3 canonical measure snapshot;
- decorates only measure controls whose `measureKey` has report-backed findings;
- exposes finding count/state through accessible button metadata;
- shows selected-measure findings in a live, readable panel;
- shows findings without a measure key as score-wide findings;
- does not mutate notes or quality reports;
- does not invoke renderer hit-test/highlight APIs.

The overlay is re-rendered after the Package 3 and Stage C selection listeners, so measure buttons have already been rebuilt before quality decoration is applied.

## Package 12 isolation

Open Package 12-T4 work remains separate. Stage D does not change sharing eligibility, teacher revision replay, correction revalidation, tokens, authentication, persistence, or delivery.

## Safety invariants

- no direct main commit;
- no new dependency;
- no musical-field invention;
- no automatic correction;
- no teacher-approval inference;
- no Package 12 gate bypass;
- no renderer contract/revision change;
- no OMR/provider/backend change;
- ambiguous or absent exact-note identity remains unhighlighted.

## Verification gate

Stage D must pass:

- focused quality-overlay regressions;
- full repository tests;
- production build;
- existing real-browser score-runtime proof;
- protected `test-and-build` PR CI.

Merge requires separate approval.
