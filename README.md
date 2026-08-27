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
- Future violin and rhythm-training users

## Project Approach

SesliTab is not intended to claim fully automatic or error-free PDF-to-MusicXML or MusicXML-to-Guitar-TAB conversion.

Its goal is to provide a reliable, teacher-supervised, semi-automatic learning system. Unverified notes, rhythms, string positions, or fret positions must not be presented to students as definitively correct.

## Current Inputs

- PDF files through the OMR gateway
- MusicXML files
- Guitar TAB text

## Current and Developing Outputs

- Turkish rhythmic text
- Rhythmic HTML
- Note cards
- MusicXML output
- Turkish text-to-speech
- Musical playback
- Future teacher-approved Guitar TAB
- Future accessible student practice sessions

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
- Require tests and a production build for every development package.

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

## Status

SesliTab is under active development.

Foundations such as PDF upload, OMR processing, MusicXML parsing, Turkish speech, playback, and canonical note/time handling already exist. Teacher correction, approval, secure student sharing, advanced Guitar TAB, MIDI export, violin support, tuner functionality, and mobile productisation remain planned or partially implemented.

See [`docs/project-charter.md`](docs/project-charter.md) for the project purpose and safety rules.
