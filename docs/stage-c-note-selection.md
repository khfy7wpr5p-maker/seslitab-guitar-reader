# Stage C — Canonical Measure / Note Selection

Tarih: 29 Ağustos 2026

## Implemented bounded scope

Stage C adds a SesliTab-owned canonical note-selection contract without changing the pinned ST Score Rendering Layer contract or repository.

Selection identity is bound to:

- the exact published canonical `NoteObject[]` reference,
- parser-supplied canonical `measureKey`,
- a safe integer index into that exact canonical array,
- the exact `NoteObject` reference at that index.

Changing the selected measure or publishing a new canonical array clears note selection. Cross-measure, stale, out-of-range, malformed, or ambiguous repeated exact-object selections fail closed.

The teacher UI exposes native accessible note-selection buttons only after a canonical measure is selected. The UI intentionally uses neutral labels such as `Nota 1`; it does not infer pitch, duration, correctness, quality, approval, or source truth from presentation state.

## Renderer boundary

The pinned renderer contract version `0.2.0` defines `ScoreNoteRef` and `note-highlight`, but the pinned workstation browser host/export used by SesliTab currently exposes only score render/export plus the separately injected measure cursor bridge. It does not expose note hit-testing or note highlight through the SesliTab runtime host.

SesliTab canonical array order is not assumed to equal the renderer's traversal-based `ScoreNoteRef.noteIndex`. Therefore Stage C keeps `rendererTarget: null` until a separately reviewed runtime bridge can prove an exact mapping.

This stage does not:

- modify `st-score-rendering-layer`,
- update the pinned renderer revision,
- change renderer contract semantics,
- invent a renderer note locator,
- make rendered SVG/OSMD state musical authority,
- implement direct tap/click hit-testing on rendered notation,
- implement quality overlays or editing.

## Status

- Canonical measure selection: implemented before Stage C.
- Canonical exact-note selection: implemented in Stage C.
- Accessible note-selection controls: implemented in Stage C.
- Renderer note hit-test/highlight integration: blocked pending separately reviewed runtime exposure/mapping.
- Quality overlay: Stage D, not implemented here.
- Visual bounded editor: Stage E, not implemented here.
