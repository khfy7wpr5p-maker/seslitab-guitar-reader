# Package 4F — Accessible Guitar TAB Result UI

## Scope

Package 4F exposes the already quality-gated Package 4E basic Guitar TAB consumer through an accessible result tab.

Production flow:

```text
exact published canonical NoteObject[]
  -> Package 2D GUITAR_TAB quality gate
  -> Package 4E production Guitar TAB consumer
  -> Package 4F accessible result panel
```

Package 4F does not add musical transformation logic. It does not clone, reorder, reparse, normalize or infer note data.

## Exact-array handoff

The UI subscribes to `package3MeasureBridge.js`, which already retains the exact `NoteObject[]` reference published by the Rhythmic HTML path.

That exact array is passed directly to `buildQualityGatedBasicGuitarTab(notes)`.

No quality evidence transfers to a cloned array. No alternate note array is assembled for Guitar TAB.

## Visible behavior

A native `button[role=tab]` named `Gitar TAB` is added to the existing result tab list.

The panel contains:

- heading: `Temel Gitar TAB`;
- an accessible `role=status` message region;
- a focusable `<pre>` text output for generated ASCII TAB.

Only the Package 4E `rendered` state may show TAB text.

State behavior:

- `rendered` -> generated basic TAB is shown;
- `review-required` -> no TAB text; user is told that the note data needs review;
- `blocked` -> no TAB text; user is told that the quality gate rejected the data;
- `not-available` -> no partial TAB; user is told that the music is outside the conservative basic monophonic scope;
- `invalid` -> no output; no guessed fallback;
- empty/reset -> previous generated TAB is cleared.

Internal diagnostic `reason` strings are not displayed as musical truth.

## Accessibility

Package 4F requires:

- native button semantics for the result tab;
- `role=tabpanel` with `aria-labelledby`;
- `role=status` plus polite live behavior for the state message;
- a labelled, focusable `<pre>` for ASCII TAB so screen-reader and keyboard users can inspect line-by-line text;
- clean switching back to existing result tabs;
- no `innerHTML` assignment for generated TAB.

Generated TAB is written only with `textContent`.

## Safety properties

Package 4F:

- calls only the Package 4E production Guitar TAB consumer;
- passes the exact published array reference;
- never bypasses Package 2D;
- exposes no TAB on REVIEW/BLOCK/unsupported/invalid states;
- never emits partial or guessed advanced TAB;
- does not modify the MusicXML parser;
- does not modify Audiveris, OMR worker/provider, gateway, runtime or E2E integration;
- adds no dependency;
- changes no deployment configuration;
- performs no deployment.

Advanced chord/polyphonic Guitar TAB remains Package 9 work.

## Acceptance evidence

Focused tests require:

1. exact published array identity reaches the gated consumer;
2. only definitive `rendered` output may expose TAB text;
3. REVIEW/BLOCK/not-available states expose zero generated TAB bytes;
4. internal diagnostic reasons do not leak into the user-facing state message;
5. result tab and panel use native accessible semantics;
6. ASCII TAB output is labelled and keyboard focusable;
7. switching away hides the Guitar TAB panel cleanly;
8. reset/bridge clear removes previous TAB output;
9. Package 4F source uses no `innerHTML` for generated TAB;
10. Package 4F source imports no OMR/provider/gateway/runtime boundary;
11. `main.js` loads the Package 4 UI module;
12. full regression, dependency audit and production build pass in required GitHub CI.

## Next boundary

After Package 4F exact-head and exact-main CI pass, Package 4 implementation should receive a documentation/status closure gate.

That closure must reconcile Package 4A–4F evidence without claiming support for advanced/polyphonic fingering, teacher approval, or universal OMR correctness.
