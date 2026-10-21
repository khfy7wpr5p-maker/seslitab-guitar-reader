# SesliTab Product Architecture

**Architecture reality review:** 2026-10-21
**Teacher/API application reference:** `c1139563bb3120a9d4bbc359ba6d72205c8c0942`
**Student application reference:** `a958dc077c822b3b6c31b51f283fad5d5b13439d`

## Current Teacher / Student boundary

The teacher application owns exact-revision approval, immutable SCORE / CHORD_BOARD production, authenticated Secure Delivery, Piece assignment lifecycle and roster authority. ST Student consumes sanitized authorized packages and manifests. Authenticated delivery and the Student application are implemented; the older Stage A–L snapshot below describes the bounded readiness component, not the entire current product.

Current source, UI releases, compatibility evidence and unresolved findings are recorded in [the 21 October cross-project review](student-teacher-ui-compatibility-2026-10-21.md). The current student shell is v40; renderer contract 0.2.0, OSMD 2.1.2 and source a015f904 remain Student presentation dependencies, not teacher musical authority.

Teacher-provided notes, ACTIVE / COMPLETED / REPERTOIRE, exact guitar voicing/string/fret data and selected playback instruments retain their existing authority. Student home/work/pool/request/score presentation, focus, separate score size and green/orange follow do not grant editing, approval, delivery or lifecycle-write permissions.

Known integration failure: Student calls GET `/student/work-requests/pending`, while `studentWorkRequestRouter.js` exposes only the create POST. The cohort-scoped domain method exists, but its GET adapter is missing; production returns 404. This is [SES-243](https://linear.app/seslitab/issue/SES-243), not a completed request-list round trip. The existing teacher conversion/revocation flow is not changed by this documentation work.

The permanent Student frontend and API origins remain `https://st-student-app.onrender.com` and `https://st-student-api.onrender.com`. No service, schema/rules, production account or application code is changed here. Real-device and authenticated teacher/student acceptance remain separate from automated tests.

This is the current product-architecture summary. The canonical detailed stage matrix and boundary rules are in `docs/teacher-score-editor-architecture.md`.

## Product purpose

SesliTab is an accessible, teacher-supervised music learning product for blind, low-vision and sighted learners. It combines score intake, canonical music processing, quality routing, teacher review/correction, accessible presentation, Guitar TAB and violin consumers, discovery presentation, a local tuner, and bounded share-readiness evaluation.

Structural validity is not musical correctness. The product must not present unverified musical inference as fact.

## Historical Stage A–L component map

```text
Teacher workspace
  -> score runtime and bounded correction
  -> quality routing: PASS / REVIEW / BLOCK
  -> review playback where explicitly safe
  -> Guitar TAB / Violin consumers when their gates allow
  -> Discovery source-finding presentation
  -> local compact tuner
  -> Package 12 exact-revision share readiness
```

The Stage A–L shell exposes teacher work, discovery and tuning surfaces. Its in-memory Package 12 readiness output is distinct from the later authenticated Secure Delivery, roster, Piece and Student application surfaces described above.

## Teacher workflow

```text
open score
  -> inspect rendered score and quality evidence
  -> select measure/note where supported
  -> make bounded teacher correction
  -> save a new corrected revision
  -> revalidate and rerender
  -> optionally undo through immutable history
  -> approve the exact revision when applicable
  -> evaluate consumer/share-readiness gates
```

Technical revision identifiers and raw diagnostic data remain secondary detail surfaces. Teacher approval, quality routing and share readiness are separate decisions.

## Canonical music flow

```text
PDF / MusicXML / bounded TAB input
  -> existing intake and OMR path where required
  -> parser and normalization
  -> canonical note/timing model
  -> structural, rhythmic, provenance and quality evidence
  -> consumer-specific PASS / REVIEW / BLOCK routing
  -> presentation/output
```

Renderer, UI, TTS, playback, MIDI, Guitar TAB and violin code consume canonical authority; they do not independently invent pitch, duration, octave, voice, tie or measure identity.

## Renderer and correction boundaries

The pinned ST Score Rendering Layer is a presentation/interaction layer. It renders, hit-tests and highlights canonical score objects where the current contract supports those interactions. It is not a semantic authority, canonical score owner, teacher-approval source or correction engine.

Correction is bounded and teacher-controlled. Unsupported or ambiguous correction classes fail closed. Original/imported revisions are not silently overwritten; corrected revisions have separate lineage, revalidation and approval evidence.

## Quality routing and review playback

- `PASS` opens only the consumer routes whose exact production gates accept the evidence.
- `REVIEW` uses bounded review behavior and is not definitive approved output.
- `BLOCK` cannot proceed to a definitive downstream consumer.

Teacher approval is not universally required for every PASS consumer, but approval never overrides a structural BLOCK. REVIEW playback, when permitted, is explicitly provisional and cannot bypass quality gates.

## Discovery, instruments and tuner

Discovery finds sources and provides direct source actions. It does not verify musical truth, change source URLs or bypass intake and quality gates:

```text
FOUND != SOURCE VERIFIED != MUSICALLY VERIFIED != TEACHER APPROVED
```

Guitar TAB and violin are authoritative production consumers only within their canonical, quality-gated bounded contracts. Generated fingering/position evidence is not teacher approval.

The tuner preserves the Package 11 local microphone/Web Audio boundary. Stage K is compact presentation with explicit Start/Stop; it does not silently start the microphone or upload audio. A minimum 44px interaction target is part of the verified presentation contract.

## Package 12 share-readiness boundary

Package 12 T1–T4 are present on protected main. They keep teacher approval, exact revision identity, revalidation, share eligibility, share authorization/readiness and actual delivery separate.

```text
READY_EXACT_REVISION != DELIVERED_TO_STUDENT
```

Stage L returns bounded in-memory readiness metadata and recipient presentation. It does not create an authenticated student account, persistent authorization, share token, share URL, downloadable payload, student access grant or network delivery.

## Accessibility and safety invariants

Current verified UI contracts cover semantic controls, keyboard interaction, visible focus, accessible labels/status messaging, non-color-only state communication, narrow/mobile layout bounds and touch-target constraints where the relevant stage specifies them. Device-level VoiceOver/TalkBack certification is not claimed without fresh device evidence.

Security invariants:

- automatic/imported, teacher-corrected and teacher-approved revisions remain distinct;
- approval is bound to the exact revision and does not transfer to later revisions;
- revalidation does not itself authorize sharing or delivery;
- discovery and renderer cannot promote evidence to musical truth;
- malformed, stale, unsupported or missing evidence fails closed;
- no current Package 12 UI may imply student delivery.

## Historical Stage A–L verification evidence

Historical evidence baseline: protected `main` `e40e3b3e8d9029673efd780d44c6eefe34ba1e18` (2026-08-31). The 1519-test/build results below belong only to this historical revision, not the current Teacher/API baseline.

The required protected-main check is `test-and-build`, covering `npm test`, production build and the real-browser score-runtime proof. The fresh-read confirmed protected main at the reference SHA; the connector exposed no exact-main workflow run/status for that SHA. Local verification on Node 24 passed 1519/1519 tests across 236 suites and the production build. Local real-browser proof was UNVERIFIED because Chrome/Chromium is not installed.

## Historical Stage L scope exclusions

The following exclusions describe Stage L alone. Later Secure Delivery and Student work implemented authenticated identity, delivery and persistence; they must not be read as a current product-wide absence. Consult the current cross-project review for verified boundaries and unresolved acceptance.

The following are separate future security/application work, not missing Stage L UI work:

- authenticated student accounts and persistent student identity;
- backend or cloud student delivery;
- permanent share authorization storage;
- share tokens and share URLs;
- remote delivery service and downloadable delivery payloads;
- student portal access;
- server-side authorization, database or cloud persistence.

See `docs/teacher-score-editor-architecture.md` for the Stage A–L completion matrix and future-development rules.
