# Score View Runtime Binding

Status: base rendering, canonical measure cursor synchronization, exact rendered-note hit-testing, canonical note resolution, and exact note highlighting implemented behind the ST-owned renderer boundary.

This slice binds SesliTab's existing `Nota Görünümü` presentation shell to the ST Score Rendering Layer runtime without modifying any OMR or Audiveris production boundary.

## Protected boundaries

The following remain unchanged and out of scope:

- `backend/providers/AudiverisProvider.js`
- OMR provider selection and worker/job lifecycle
- PDF upload and OMR download flow
- Cloud OMR Gateway configuration
- `Dockerfile`
- `render.yaml`
- Render service configuration
- teacher revision/approval authority
- quality gate authority
- TTS and playback authority

## Runtime delivery

Production builds prepare the renderer from the exact reviewed renderer revision:

`583b403f43e216f6463d392b19746b032af1c948`

The build script checks out that exact public Git commit, installs the renderer workspace with lifecycle scripts disabled, invokes the renderer-owned runtime export, verifies renderer revision, ST contract `0.2.0`, OSMD provenance `2.1.2`, and the runtime file inventory, then copies the generated runtime to Vite's static `public/st-score-runtime/` boundary.

SesliTab does not import or declare OpenSheetMusicDisplay as a dependency. OSMD remains renderer-owned.

## Browser binding

`Nota Görünümü` loads the generated runtime in a same-origin iframe and accesses only the ST-owned `__ST_SCORE_RENDER_HOST__` runtime contract. MusicXML is passed in-memory through the existing bounded SesliTab consumer adapter. Rendering remains presentation-only and never becomes musical authority.

The runtime exposes bounded `moveCursor`, `hitTestNote`, `highlight`, and `clearHighlights`. SesliTab listens for click coordinates inside its same-origin renderer iframe and passes only `{clientX, clientY}` to `hitTestNote`; it does not scrape renderer geometry or access OSMD objects.

A successful renderer hit returns only `ScoreNoteRef`. SesliTab then resolves that locator against the exact currently published canonical `NoteObject[]`. Resolution requires exact `partId`, `measureIndex`, and explicit `voice`, and reconstructs the renderer traversal only from parser-owned structural evidence: staff order, canonical `startBeat`, and preserved MusicXML source order. Pitch, duration, SVG geometry, visual proximity, and visible labels are never used to choose a canonical note.

Rests remain in traversal ordinal accounting so later note indexes stay aligned, but a rest can never become a selectable rendered-note hit. Missing voice/staff/startBeat, stale arrays, out-of-range locators, malformed refs, or incomplete structural evidence fail closed to no selection.

The reverse path is also bounded: an exact canonical note selection can derive the same `ScoreNoteRef` and request renderer highlight. If that locator cannot be proven, canonical selection remains valid but no visual highlight is produced.

The safe chain is therefore:

```text
rendered note click
→ renderer hitTestNote()
→ ScoreNoteRef
→ SesliTab canonical structural resolver
→ exact canonical NoteObject or abstain
→ Package 3 canonical note selection
→ renderer highlight(same ScoreNoteRef)
```

No renderer result changes musical truth, quality decisions, correction authority, or teacher approval state.
