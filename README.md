# SesliTab

SesliTab is an inclusive and accessible music education application for blind, low-vision, and sighted students.

It helps students read, hear, understand, and practise musical notation, rhythm, guitar tablature, violin guidance and tuning in individual, group, and inclusive learning environments.

## Goals

- Accessible Turkish text-to-speech
- Screen-reader and keyboard support
- PDF-to-MusicXML conversion through OMR
- Direct MusicXML and guitar TAB input
- Rhythmic text and musical playback
- One shared note and timing model
- Clear warnings for uncertain or unverified music data
- Teacher review, correction, and exact-revision approval
- Secure teacher-to-student sharing
- Accessible student practice on iOS, Android and desktop browsers
- Progressive PWA productisation
- Future Discovery / score-search and library intake under a separate reviewed package

## Intended Users

- Blind and low-vision students
- Sighted students
- Guitar and music teachers
- Inclusive music education groups
- Students with additional learning needs
- Violin and rhythm-training users

## Product Approach

SesliTab is not intended to claim fully automatic or error-free PDF-to-MusicXML or MusicXML-to-Guitar-TAB conversion.

Its goal is to provide a reliable, teacher-supervised, semi-automatic learning system. Unverified notes, rhythms, string positions, fret positions or other musical claims must not be presented to students as definitively correct.

Discovery / score search is a source-finding concept, not a musical-verification authority. A found external score must re-enter the normal SesliTab intake, provenance, quality, teacher-review and approval pipeline before trusted student use.

## Current Inputs

- PDF files through the existing OMR gateway and Audiveris provider path
- MusicXML files
- Guitar TAB text

## Verified Current Outputs

- Turkish rhythmic text
- Rhythmic HTML
- Note cards
- MusicXML output/download
- Turkish text-to-speech
- Web Audio musical playback
- Accessible selected-measure TTS/playback
- Quality-gated deterministic SMF0 MIDI download
- Quality-gated advanced Guitar TAB path
- Quality-gated advanced violin guidance
- Source-only MusicXML chord display and Turkish chord TTS
- Accessible browser-local chromatic tuner
- Audiveris `.omr` download when available

These outputs are not automatically teacher-approved. Structural validity, quality-gate acceptance, source evidence and teacher approval remain separate concepts.

## Product Surfaces

The target product architecture separates the following surfaces:

- Discovery / Score Search — planned, not yet implemented
- Teacher Studio — intake, review, correction, approval and sharing
- Student Practice — approved work, accessible score/TAB/rhythm, TTS, playback and tuner
- Library — planned application surface for admitted and shared works
- Simplified Rhythm Mode — Package 13, not started
- Mobile / PWA Productisation — Package 14, partially implemented

The production frontend source of truth is this GitHub repository. Bolt may be used only as a disposable prototype/reference environment and is not the authoritative application source.

## Roadmap Position

Verified current state:

- Packages 0–11: **Completed**
- Package 8B — Audiveris training dataset: **Partially implemented** as deferred research
- Package 12 — Teacher-to-student sharing: **Partially implemented**
  - T1 exact share authorization: **Completed**
  - T2 exact-revision safety/quality eligibility: **Completed**
  - T3 post-correction revalidation/provenance: **next**
- Package 13 — Simplified rhythm mode: **Not started**
- Package 14 — Mobile productisation: **Partially implemented**

Authenticated recipient access, persistence/database decisions and actual network delivery remain later Package 12 stages. Discovery / Score Search is now part of the product architecture but is not yet an implemented roadmap package and must be introduced through a separate reviewed package.

## Teacher / Student Safety Boundary

Each work must preserve distinct layers:

1. immutable automatic source/revision;
2. teacher-corrected revision(s);
3. teacher approval bound to one exact revision;
4. sharing authorization bound to the exact approved revision and recipient.

A later change must not inherit an older approval or authorization automatically. Student delivery must not bypass provenance, quality or approval gates.

## Protected OMR / Deployment Boundary

The current Audiveris OMR path and the existing Render connection are established infrastructure boundaries. Routine UI, music-engine, teacher-revision, TAB, violin, MIDI, chord, tuner or sharing-domain work must not rewrite or reconfigure them unless a separate, explicitly approved package requires it.

In particular, current application work does not silently change:

- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- backend production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment configuration.

## Frontend / Mobile Direction

SesliTab remains a browser-first Vite application and should progress toward an accessible PWA before a native rewrite is considered.

Primary device targets:

- iPhone / Safari / VoiceOver
- Android / Chrome / TalkBack
- modern desktop browsers / keyboard and screen reader

Do not migrate to React, Next.js or another framework merely to begin UI architecture. The verified domain/music layers must remain isolated from presentation concerns.

## Development

Requirements:

- Node.js 24
- npm

Install dependencies:

```bash
npm install
```

Run the frontend:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

Create a production build:

```bash
npm run build
```

Run the backend:

```bash
npm run backend:start
```

## Safety Principles

- UI is not a musical semantic authority.
- Discovery is not a verification authority.
- Do not treat valid XML as proof of musical correctness.
- Do not automatically invent missing notes, rhythms, pitch, octave, voice, tie or fingering evidence.
- Preserve original PDF, OMR, MusicXML and teacher revision data.
- Keep automatic, teacher-corrected and teacher-approved data separate.
- Do not share unapproved or stale-approved content with students.
- Develop one limited package at a time.
- Never modify the `main` branch directly.
- Require focused tests, full regression and a production build for development packages.
- Do not bypass quality or approval gates by setting authority flags directly on canonical source data.

## License and Commercial Use

SesliTab-owned source code is made available under the **PolyForm Noncommercial License 1.0.0**.

- Noncommercial use is permitted only within the terms of that license.
- Commercial use is **not granted** and requires a separate written commercial license from the SesliTab rights holder.
- The SesliTab name and branding are not granted for use as a trademark or product identity.
- Third-party components remain under their own licenses, including Audiveris under AGPL-3.0.

See [`LICENSE`](LICENSE), [`COMMERCIAL-LICENSE.md`](COMMERCIAL-LICENSE.md), [`TRADEMARKS.md`](TRADEMARKS.md), and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Public / Proprietary Boundary

The public repository intentionally does not promise publication of product-specific blind/low-vision pedagogy, adaptive music-education logic, proprietary guitar-learning recommendations, commercial pricing/entitlement rules, or private teacher-verified/training datasets. These may be implemented as separate private or separately licensed extensions behind narrow public contracts.

See [`docs/proprietary-extension-boundary.md`](docs/proprietary-extension-boundary.md).

## Status and Architecture

Use the following documents as the current architecture/status references:

- [`docs/product-architecture.md`](docs/product-architecture.md) — top-level product and UI/application architecture
- [`docs/project-charter.md`](docs/project-charter.md) — product purpose and non-negotiable safety principles
- [`docs/current-status.md`](docs/current-status.md) — current verified implementation state
- [`docs/package-status.md`](docs/package-status.md) — authoritative package/substage status
- [`docs/music-engine-architecture.md`](docs/music-engine-architecture.md) — music/OMR domain architecture
