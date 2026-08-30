# Stage C — Canonical Measure / Note Selection

Tarih: 30 Ağustos 2026

## Implemented bounded scope

Stage C now includes SesliTab-owned canonical note selection plus the reviewed ST Score Rendering Layer note-interaction bridge.

Selection identity remains bound to:

- the exact published canonical `NoteObject[]` reference,
- parser-supplied canonical `measureKey`,
- a safe integer index into that exact canonical array,
- the exact `NoteObject` reference at that index.

Changing the selected measure or publishing a new canonical array clears note selection. Cross-measure, stale, out-of-range, malformed, or ambiguously repeated exact-object selections fail closed.

The teacher UI exposes native accessible note-selection buttons after a canonical measure is selected. The UI uses neutral labels such as `Nota 1`; it does not infer pitch, duration, correctness, quality, approval, or source truth from presentation state.

## Renderer boundary

SesliTab pins ST Score Rendering Layer revision `583b403f43e216f6463d392b19746b032af1c948`, contract `0.2.0`, with OSMD provenance `2.1.2`.

The reviewed runtime exposes bounded note hit-test/highlight methods. Renderer hits return only `ScoreNoteRef`; SesliTab remains responsible for proving the canonical mapping.

The canonical resolver requires exact `partId`, `measureIndex`, explicit `voice`, parser-owned `staff`, canonical `startBeat`, and preserved MusicXML source order. It reconstructs the renderer's structural traversal without using pitch, duration, visual proximity, SVG geometry, visible note labels, or OSMD internals.

Within a selected part/measure/voice, canonical traversal is ordered by:

```text
staff
→ startBeat
→ preserved canonical MusicXML source order
```

Rests remain in traversal ordinal accounting but are not selectable hit targets. If the renderer omits voice identity, canonical staff/onset evidence is incomplete, the locator is stale/out of range, or any required identity cannot be proven, mapping abstains.

## Two-way interaction

The safe forward path is:

```text
rendered note click
→ renderer hitTestNote()
→ ScoreNoteRef
→ SesliTab canonical structural resolver
→ exact canonical NoteObject or abstain
→ Package 3 canonical note selection
→ renderer highlight(same ScoreNoteRef)
```

The reverse path is:

```text
canonical note button
→ exact canonical NoteObject
→ SesliTab derives structurally proven ScoreNoteRef
→ renderer highlight(same ScoreNoteRef)
```

Canonical selection remains valid even if a renderer target cannot be proven; in that case no highlight is shown.

## Authority invariants

This integration does not:

- make rendered SVG/OSMD state musical authority,
- use renderer pitch or proximity to select a canonical note,
- change OMR/Audiveris/provider/model behavior,
- change quality-gate or teacher approval authority,
- mutate source MusicXML,
- add a new dependency,
- change the ST renderer base contract version.

## Status

- Canonical measure selection: implemented.
- Canonical exact-note selection: implemented.
- Accessible note-selection controls: implemented.
- Renderer exact note hit-test/highlight integration: implemented.
- Renderer → canonical fail-closed structural resolver: implemented.
- Canonical → renderer exact highlight mapping: implemented.
- Quality overlay: separate later stage.
- Visual bounded correction editor: separate later stage.
