# Score View Runtime Binding

Status: implementation candidate for Issue #109.

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

`717c0c2f32cebf11350104020d9d12ff88c59e94`

The build script checks out that exact public Git commit, installs the renderer workspace with lifecycle scripts disabled, invokes the renderer-owned runtime export, verifies renderer revision, ST contract `0.2.0`, OSMD provenance `2.1.2`, and the runtime file inventory, then copies the generated runtime to Vite's static `public/st-score-runtime/` boundary.

SesliTab does not import or declare OpenSheetMusicDisplay as a dependency. OSMD remains renderer-owned.

## Browser binding

`Nota Görünümü` loads the generated runtime in a same-origin iframe and accesses only the ST-owned `__ST_SCORE_RENDER_HOST__` runtime contract. MusicXML is passed in-memory through the existing bounded SesliTab consumer adapter. Rendering remains presentation-only and never becomes musical authority.

Cursor/highlight synchronization is not part of this slice.
