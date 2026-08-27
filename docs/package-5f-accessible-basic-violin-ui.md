# Package 5F — Accessible Basic Violin UI

## Scope

Package 5F exposes the Package 5E quality-gated Basic Violin consumer through an accessible result tab without changing the OMR, parser, quality-report, or discovery architecture.

The UI consumes the exact canonical `NoteObject[]` reference already published by the Package 3 measure bridge.

## User-facing result

A native result tab named `Keman` is added alongside the existing result tabs.

The panel contains:

- heading: `Temel Keman — Birinci Pozisyon`
- polite live status region
- keyboard-focusable plain-text output

Only a definitive Package 5E `projected` result is allowed to expose generated tel/parmak text.

## Accessible text contract

The output uses plain text and preserves canonical physical measure identity. Example shape:

`Ölçü 1; fiziksel kimlik P1:0. Sol notası: Dördüncü tel, açık tel.`

This identity text prevents duplicate displayed measure numbers from being collapsed for screen-reader users.

Generated fingering is displayed only when all projection evidence explicitly retains:

- `provenance: generated-basic-first-position-fingering`
- `teacherApproved: false`
- supported violin string number 1–4
- supported basic finger number 0–4

Malformed or contradictory projection evidence fails closed.

## Fail-closed UI states

- no notes → empty state
- Package 5E review → review message, no fingering text
- Package 5E block → blocked message, no fingering text
- advanced/out-of-range → not-available message, no partial fingering text
- malformed consumer/projection data → invalid message, no estimated output

Internal diagnostic reasons are not surfaced as user-facing musical truth.

## Result-tab coexistence

Package 5F is layered after Package 4F and before Discovery in `main.js`.

The Keman result tab:

- hides legacy result panels when activated
- hides the Guitar TAB panel when activated
- yields back cleanly when another result tab is selected
- clears stale output when Package 3 clears or publishes a new empty snapshot

Discovery remains loaded independently and unchanged.

## Safety invariants

- exact `NoteObject[]` reference is preserved to the quality-gated consumer
- no clone/reparse before Package 5E
- no generated fingering is called teacher-approved
- no crossing ambiguity is resolved in the UI
- no partial fingering output for review/block/advanced/out-of-range states
- no `innerHTML` output path
- no Audiveris/provider/runtime/preflight/worker/gateway/E2E change
- no MusicXML parser change
- no dependency addition
- no deployment

## Package 5 closure gate

Package 5 may be marked completed only after this exact Package 5F head passes required CI, is merged through protected main, and the exact merged main SHA passes `test-and-build` again. Status/closure documentation should be reconciled in a separate evidence-only documentation change.
