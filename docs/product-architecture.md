# SesliTab Product Architecture

**Architecture review:** 2026-08-31
**Protected main reference:** `e40e3b3e8d9029673efd780d44c6eefe34ba1e18`
**Current status:** Stage A–L production chain is complete as a bounded teacher workflow. Package 12 provides bounded exact-revision readiness metadata; authenticated student delivery is not implemented.

This is the current product-architecture summary. The canonical detailed stage matrix and boundary rules are in `docs/teacher-score-editor-architecture.md`.

## Product purpose

SesliTab is an accessible, teacher-supervised music learning product for blind, low-vision and sighted learners. It combines score intake, canonical music processing, quality routing, teacher review/correction, accessible presentation, Guitar TAB and violin consumers, discovery presentation, a local tuner, and bounded share-readiness evaluation.

Structural validity is not musical correctness. The product must not present unverified musical inference as fact.

## Current product map

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

The current shell exposes teacher work, discovery and tuning surfaces. A persistent Library, authenticated student account, student portal and network delivery service are not current production capabilities.

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

## Current verification model

The required protected-main check is `test-and-build`, covering `npm test`, production build and the real-browser score-runtime proof. The fresh-read confirmed protected main at the reference SHA; the connector exposed no exact-main workflow run/status for that SHA. Local verification on Node 24 passed 1519/1519 tests across 236 suites and the production build. Local real-browser proof was UNVERIFIED because Chrome/Chromium is not installed.

## CURRENTLY OUT OF SCOPE

The following are separate future security/application work, not missing Stage L UI work:

- authenticated student accounts and persistent student identity;
- backend or cloud student delivery;
- permanent share authorization storage;
- share tokens and share URLs;
- remote delivery service and downloadable delivery payloads;
- student portal access;
- server-side authorization, database or cloud persistence.

See `docs/teacher-score-editor-architecture.md` for the Stage A–L completion matrix and future-development rules.
