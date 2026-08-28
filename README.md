# SesliTab

SesliTab is an inclusive and accessible music education application for blind, low-vision, and sighted students.

It helps students read, hear, understand, and practise musical notation, rhythm, and guitar tablature in individual, group, and inclusive learning environments.

## Goals

- Accessible Turkish text-to-speech
- Screen-reader and keyboard support
- PDF-to-MusicXML conversion through OMR
- Direct MusicXML and guitar TAB input
- Rhythmic text and musical playback
- One shared note and timing model
- Clear warnings for uncertain or unverified music data
- Teacher review, correction, and approval
- Accessible student practice on mobile devices

## Intended Users

- Blind and low-vision students
- Sighted students
- Guitar and music teachers
- Inclusive music education groups
- Students with additional learning needs
- Violin and rhythm-training users as those product areas mature

## Project Approach

SesliTab is not intended to claim fully automatic or error-free PDF-to-MusicXML or MusicXML-to-Guitar-TAB conversion.

Its goal is to provide a reliable, teacher-supervised, semi-automatic learning system. Unverified notes, rhythms, string positions, or fret positions must not be presented to students as definitively correct.

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
- Quality-gated Basic Guitar TAB output
- Quality-gated Basic Violin first-position guidance
- Source-only MusicXML chord display and Turkish chord TTS
- Audiveris `.omr` download when available

These outputs are not automatically teacher-approved. Structural validity, quality-gate acceptance, source evidence and teacher approval remain separate concepts.

## Roadmap Position

Packages 0–7 are recorded as completed in the repository status/closure documents. The next strict roadmap package is **Package 8 — Teacher correction, revision history and approval**.

Package 8 must preserve three distinct layers:

1. immutable automatic source/revision;
2. teacher-corrected revision(s);
3. teacher approval bound to one exact revision.

A later change must not inherit an older approval automatically. Secure teacher-to-student sharing remains a later Package 12 concern and must only consume explicitly approved revisions.

## Protected OMR / Deployment Boundary

The current Audiveris OMR path and the existing Render connection are established infrastructure boundaries. Routine music-engine, teacher-revision, TAB, violin, MIDI or chord work must not rewrite or reconfigure them unless a separate, explicitly approved package requires it.

In particular, Package 8 architecture work does not require changes to:

- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- `Dockerfile`;
- `render.yaml`;
- Render deployment/service configuration.

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

- Do not treat valid XML as proof of musical correctness.
- Do not automatically invent missing notes or rhythms.
- Preserve original PDF, OMR, and MusicXML data.
- Keep automatic, teacher-corrected, and teacher-approved data separate.
- Do not share unapproved content with students.
- Develop one limited package at a time.
- Never modify the `main` branch directly.
- Require focused tests, full regression and a production build for development packages.
- Do not bypass the quality gate by setting teacher approval flags directly on canonical source data.

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

SesliTab is under active development. The repository has verified foundations for OMR processing, canonical note/time handling, quality gating, accessible playback, MIDI export, Basic Guitar TAB, Basic Violin and source-only chord presentation/TTS. Teacher correction/approval, secure student sharing, advanced Guitar TAB, advanced violin, tuner functionality, simplified rhythm mode and full mobile productisation remain later roadmap work.

See:

- [`docs/project-charter.md`](docs/project-charter.md)
- [`docs/current-status.md`](docs/current-status.md)
- [`docs/package-status.md`](docs/package-status.md)
- [`docs/music-engine-architecture.md`](docs/music-engine-architecture.md)
