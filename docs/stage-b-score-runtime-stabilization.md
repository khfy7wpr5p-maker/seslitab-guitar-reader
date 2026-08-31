# Stage B — Score Runtime Stabilization

Date: 31 August 2026

Status: **PRODUCTION** — Stage B is merged on protected main as part of the completed Stage A–L chain.

## Scope

Stage B is limited to SesliTab presentation/runtime integration. It does not change MusicXML semantics, canonical note data, quality policy, teacher revision semantics, Package 12 sharing rules, or the ST Score Rendering Layer contract.

## Findings

1. The score view uses the pinned ST Score Rendering Layer revision `583b403f43e216f6463d392b19746b032af1c948`, contract `0.2.0`.
2. The literal text `Invalid note initialization object: {}` is not present in the SesliTab repository or the reviewed renderer source. It must therefore be treated as a runtime/vendor parse failure until a real input reproduces it. Stage B does not fabricate pitch, duration, octave, voice, tie or other note data to suppress that failure.
3. The previous mobile CSS used `transform: scale(0.82)`, a compensating `121.96%` iframe width and negative bottom margin. This is presentation-fragile and is removed.

## Implemented stabilization

- The score surface now uses controlled horizontal scrolling instead of transform-based downscaling.
- Narrow screens keep a bounded minimum renderer width so notation remains readable rather than visually compressed.
- The score surface is keyboard-focusable and carries an explicit horizontal-scroll hint.
- Renderer startup failure removes the failed iframe so the next activation receives a fresh runtime.
- Render or cursor failure disposes the renderer, clears stale state, removes the iframe and requires a clean retry.
- Existing fail-closed stale-score clearing remains intact.
- The real-browser gate now verifies the pinned runtime twice: default desktop viewport and a `390x844` narrow viewport.

## Current interaction boundary

Stage C is now also production. The runtime integration supports bounded measure/note hit-test, stable canonical note identity resolution and highlight/selection behavior. These capabilities expose presentation/interaction affordances only; they do not make the renderer a semantic authority.

## Authority boundary

Renderer output remains presentation-only. No note object, pitch, rhythmic value, accidental, octave, voice, tie, chord identity or source identity is created or repaired by Stage B.

## Verification gate

Stage B is complete only when the pull request passes:

- focused Stage B regressions,
- full `npm test`,
- production `npm run build`,
- pinned runtime preparation/provenance checks,
- real Chrome desktop render + canonical measure cursor proof,
- real Chrome `390x844` narrow-viewport render + canonical measure cursor proof,
- protected-main mergeability.

Any future cross-repository renderer contract extension must still be fresh-read and separately reviewed. No such extension is part of this documentation refresh.
