# SES-43 SesliTab Teacher Production Composition Stabilization Design

**Status:** Approved design direction — 2026-09-27

**Reference source revision:** `c38fe59b78c93b3ddf982265119c6a06328fe344`

## Goal

Make the existing SesliTab teacher production surface prove which reviewed GitHub revision it serves, prove that the reviewed Smoosic/Nota Ara/TAB/tuner composition is present in the served build, and close the remaining physical iPhone Safari acceptance gap without opening a new Render service or changing the protected OMR boundary.

## Confirmed Baseline

- `main.js` mounts `initSmoosicEditorTab(document)`.
- The Smoosic host exposes `Düzenlemeyi SesliTab'a Uygula` and uses the versioned, same-origin request/result bridge.
- The S15 focused suite passes and the exact-main `test-and-build` workflow includes the real-browser write-back proof.
- The Bolt URL does not serve the current reviewed composition and is not a production authority.
- At audit time, `seslitab-app.onrender.com` and `seslitab-omr.onrender.com` were suspended, so deployed-behavior verification was unavailable.
- A physical iPhone Safari write-back result has not yet been recorded.

## Production Authority

- Source authority: `khfy7wpr5p-maker/seslitab-guitar-reader`, protected `main`.
- Existing frontend service only: Render static service `srv-da9gqapf2nfc73fh6o1g` (`seslitab-app`).
- Existing OMR service only: Render web service `srv-d9jmd26gekts7381pk1g` (`seslitab-omr`).
- No new Render service, domain, deployment target, or parallel shell may be created.
- `https://seslitab-guitar-tab-bg2n.bolt.host` is a disposable historical prototype/reference and must not be treated as the current teacher application.

## Architecture

The production build emits a machine-readable composition manifest after Vite has completed. The manifest records the exact 40-character source revision, repository, build time, schema version, and the required teacher-surface contract. A read-only deployed-composition probe first requires an exact manifest match, then opens the configured production URL in a real browser and checks the actual mounted DOM rather than trusting documentation or source strings.

The existing S14/S15 browser proofs remain the behavioral authority for the local production bundle. The new checks add deployment identity and served-composition evidence; they do not reimplement Smoosic write-back or create another editor path.

Deployment remains a human-gated operation against the existing `seslitab-app` service. Resuming or deploying that service and resuming the OMR service are separate approvals. After deployment, automated desktop proof is followed by a physical iPhone Safari acceptance run for one supported pitch edit.

## Required Production Composition

The served teacher application must expose and keep working:

- PDF/OMR intake through the existing protected OMR connection;
- MusicXML intake;
- Nota Ara discovery/search;
- Smoosic score editor;
- `Düzenlemeyi SesliTab'a Uygula` for the currently supported write-back class;
- playback and review outputs;
- Guitar TAB;
- chromatic tuner and existing MIDI/playback behavior.

Chord Board assignment and authenticated student delivery remain separate, explicit-mount programs. They are not mounted by this package.

## Safety Boundaries

- Do not modify `Dockerfile`, `render.yaml`, Audiveris, provider selection, OMR worker, OMR API contracts, OMR persistence, or OMR service settings.
- Do not create a Render service or change domains.
- Do not deploy automatically from CI.
- Do not merge or deploy without a separate human approval after exact-head evidence is available.
- Do not delete violin, rhythmic text/HTML, note-card, raw MusicXML, or technical implementations in this package.
- Do not perform the later UI-only hide cleanup until deployed composition and physical iPhone evidence pass.
- Do not broaden S15 write-back. Insert/delete, voice/staff relocation, and other unsupported structural edits continue to fail closed and remain exportable as MusicXML.
- Do not claim persistence, authenticated delivery, or student receipt from a successful in-memory write-back.

## Acceptance Criteria

1. A clean production build writes `dist/seslitab-build.json` with the exact checked-out revision and `teacher-smoosic-v1` composition identifier.
2. Missing, malformed, ambiguous, or non-40-character revision evidence fails the build closed.
3. Required CI `test-and-build` passes at the exact candidate head, including the existing S14/S15 browser checks and the new manifest check.
4. The deployed probe rejects a wrong origin, redirect to Bolt, missing manifest, revision mismatch, composition mismatch, missing Smoosic/Apply/search/tuner surface, or browser runtime error.
5. Deployment targets only the existing `seslitab-app` service after an explicit deployment approval.
6. The existing OMR service is resumed or changed only after a separate explicit OMR approval.
7. Physical iPhone Safari opens the exact verified Render URL, loads a MusicXML fixture, opens Smoosic, performs one supported pitch edit, applies it, and shows the verified success state with refreshed SesliTab outputs.
8. A no-change Apply and an unsupported structural edit show bounded, truthful outcomes and do not corrupt the accepted revision.
9. Evidence records exact URL, exact source revision, CI run, device/browser, tested edit, terminal status, and result.

## Failure Policy

- Revision or composition mismatch: stop; do not test or promote the served build.
- Required CI failure: stop; do not merge or deploy.
- Deployed probe failure: stop; diagnose the existing service/build linkage without opening another service.
- iPhone Safari failure with desktop proof passing: classify as a platform-specific defect and create a bounded follow-up; do not hide UI or broaden the deployment.
- OMR suspension: record `ENVIRONMENT_LIMITATION`; do not silently change the OMR service.

## Deferred Follow-up

After this design passes every acceptance gate, prepare a separate presentation-only plan for hiding approved non-teacher surfaces. That later package may hide but must not delete protected domain code, evidence paths, or raw diagnostic data needed for recovery.
