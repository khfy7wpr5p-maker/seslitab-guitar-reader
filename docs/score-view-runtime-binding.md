# Score View Runtime Binding

Status: base rendering and canonical measure cursor synchronization implemented behind the ST-owned renderer boundary.

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
- TTS, keyboard accessibility, measure selection and playback authority

## Runtime delivery

Production builds prepare the renderer from the exact reviewed renderer revision:

`8b469b7f40a4dbea9c097cda49a79dff132071cb`

The build script checks out that exact public Git commit, installs the renderer workspace with lifecycle scripts disabled, invokes the renderer-owned runtime export, verifies renderer revision, ST contract `0.2.0`, OSMD provenance `2.1.2`, and the runtime file inventory, then copies the generated runtime to Vite's static `public/st-score-runtime/` boundary.

SesliTab does not import or declare OpenSheetMusicDisplay as a dependency. OSMD remains renderer-owned.

## Browser binding

`Nota Görünümü` loads the generated runtime in a same-origin iframe and accesses only the ST-owned `__ST_SCORE_RENDER_HOST__` runtime contract. MusicXML is passed in-memory through the existing bounded SesliTab consumer adapter. Rendering remains presentation-only and never becomes musical authority.

The reviewed runtime now exposes bounded `moveCursor({ partId, measureIndex })`. SesliTab derives that locator only from its existing canonical `measureKey` identity (`partId` + zero-based `measureIndex`) and never from visible measure labels or renderer SVG/OSMD internals. Invalid, stale, conflicting, or incomplete identities fail closed. A cursor movement failure clears the stale visual presentation rather than leaving a potentially misleading cursor on screen.

Note-level highlight, renderer geometry scraping, direct OSMD access, and renderer-owned musical semantics remain out of scope.
