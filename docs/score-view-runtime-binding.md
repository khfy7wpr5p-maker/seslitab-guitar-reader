# Score View Runtime Binding

Status: base rendering, canonical measure cursor synchronization, current-render exact note hit-testing, canonical note resolution, and exact note highlighting are implemented behind the ST-owned renderer boundary.

This slice binds SesliTab's existing `Nota Görünümü` presentation shell to the ST Score Rendering Layer runtime without modifying any OMR, Audiveris, playback, quality or teacher-authority boundary.

## Protected boundaries

The following remain unchanged and out of scope:

- OMR provider selection and worker/job lifecycle;
- PDF upload and OMR download flow;
- Cloud OMR Gateway configuration;
- teacher revision/approval authority;
- quality gate authority;
- TTS and playback authority;
- canonical note mutation authority.

## Runtime delivery

Production builds prepare the renderer from the exact reviewed renderer revision:

`5092ecf955b22042878b06e2677915cc18eb5f61`

The build script checks out that exact public Git commit, installs the renderer workspace with lifecycle scripts disabled, invokes the renderer-owned runtime export, verifies renderer revision, ST contract `0.2.0`, OSMD provenance `2.1.2`, and the runtime file inventory, then copies the generated runtime to Vite's static `public/st-score-runtime/` boundary.

SesliTab does not import or declare OpenSheetMusicDisplay as an application dependency. OSMD remains renderer-owned. The reviewed renderer revision also contains development/test-only WebKit automation; that tooling is not copied into the browser runtime.

## Browser binding

`Nota Görünümü` loads the generated runtime in a same-origin iframe and accesses only the ST-owned `__ST_SCORE_RENDER_HOST__` runtime contract. MusicXML is passed in-memory through the bounded SesliTab consumer adapter. Rendering remains presentation-only and never becomes musical authority.

The reviewed runtime exposes bounded `moveCursor`, legacy `hitTestNote`, additive `hitTestNoteDetailed`, `highlight`, and `clearHighlights` operations. SesliTab still passes only current browser `{clientX, clientY}` coordinates and never scrapes renderer geometry or accesses OSMD objects.

## Current-render evidence

Every successful `renderScoreView()` now requires a valid renderer `renderEpoch` and stores that opaque epoch only against the active runtime object.

The normal selection helper prefers `hitTestNoteDetailed()` whenever the reviewed runtime exposes it. Detailed evidence is accepted only when:

1. the result is bounded plain data;
2. the result is a known `HIT` or `MISS` shape;
3. the renderer miss reason is in the reviewed finite reason set;
4. the evidence contains a valid render epoch;
5. the evidence epoch exactly equals the epoch stored from the most recent successful render.

If a replacement render has occurred and hit evidence belongs to a different epoch, SesliTab classifies it as stale and returns no `ScoreNoteRef`. Canonical selection is therefore unchanged.

The render epoch is presentation freshness evidence only. It is not a canonical score revision id, note id or teacher-approval revision.

## Canonical note mapping

A successful current-render hit returns only `ScoreNoteRef`. SesliTab then resolves that locator against the exact currently published canonical `NoteObject[]`.

Current canonical resolution intentionally requires explicit voice plus exact `partId`, `measureIndex` and `noteIndex`. The renderer contract permits voice omission in cases where it cannot establish a usable voice id, but SesliTab has no separately proven canonical ordering for that weaker case; such evidence therefore fails closed to no canonical selection rather than guessing.

For explicit-voice refs, SesliTab reconstructs traversal only from parser-owned structural evidence: staff order, canonical `startBeat`, and preserved MusicXML source order. Pitch, duration, SVG geometry, visual proximity, nearest-note distance and visible labels are never used to choose a canonical note.

Rests remain in traversal ordinal accounting so later note indexes stay aligned, but a rest can never become a selectable canonical hit. Missing voice/staff/startBeat, stale evidence, out-of-range locators, malformed refs, or incomplete structural evidence fail closed.

The reverse path remains bounded: an exact canonical note selection can derive the same `ScoreNoteRef` and request renderer highlight. If that locator cannot be proven, canonical selection remains valid but no visual highlight is produced.

The safe chain is:

```text
renderer render succeeds
→ SesliTab stores current renderEpoch for that runtime
→ pointer/touch/click supplies current clientX/clientY
→ renderer hitTestNoteDetailed()
→ require hit.renderEpoch == stored current renderEpoch
→ HIT: ScoreNoteRef / MISS or STALE: abstain
→ SesliTab canonical structural resolver
→ exact canonical NoteObject or abstain
→ Package 3 canonical note selection
→ renderer highlight(same ScoreNoteRef)
```

## Browser proof

`tests/fixtures/score-runtime-browser-proof.html` exercises the prepared reviewed runtime and proves:

- MusicXML→SVG rendering;
- a non-empty current render epoch;
- exact current-render hit evidence;
- replacement render advances the epoch;
- old expected-epoch evidence is rejected as `STALE`;
- fresh replacement-render evidence resolves to the canonical note;
- exact highlight applies only to the resolved current note.

No renderer result changes musical truth, OMR quality decisions, playback authorization, correction authority, or teacher approval state.
