# SesliTab Product Architecture

**Architecture review:** 2026-08-29  
**Verified repository baseline for this review:** protected `main` at `2a6fa9c981b85861895692df99887d46e768822e`  
**Latest verified code-equivalent CI evidence:** PR #140 `test-and-build` — 1411/1411 tests, production build PASS, score render + cursor real-browser proof PASS.  
**Roadmap position:** Packages 0–11 Completed; Package 12 Partially implemented with T1–T3 merged; T4 remains a separate open PR (#138).

## 1. Product definition

SesliTab is an inclusive, accessible and teacher-supervised music learning platform for blind, low-vision and sighted students. It is not a fully automatic score-conversion product and it must not present unverified musical inference as fact.

The product combines:

- score discovery and source intake;
- PDF / MusicXML / Guitar TAB input;
- OMR and MusicXML processing;
- one canonical note/timing model;
- quality and provenance gates;
- teacher review, correction and exact-revision approval;
- Guitar TAB and violin guidance;
- Turkish rhythmic text, TTS, Web Audio playback and MIDI;
- accessible tuner;
- bounded teacher-to-student sharing contracts;
- future simplified rhythm training;
- mobile-first accessible web delivery for iOS, Android and desktop browsers.

## 2. Official product decision — approval is conditional

**Teacher approval is not universally mandatory.**

The product route is:

```text
validated canonical evidence
        |
        +-- PASS   -> bounded automatic consumer routing may proceed
        |             only where the existing consumer gate authorizes it
        |
        +-- REVIEW -> teacher review/correction is required before
        |             definitive downstream use
        |
        +-- BLOCK  -> definitive downstream output remains prohibited
```

User-facing language:

- PASS: **Otomatik kontrollerden geçti**
- REVIEW: **Kontrol gerekiyor**
- BLOCK: **Bu eserde önce düzeltilmesi gereken yapısal bir sorun bulundu.**

`Auto-Pass != teacher-approved` is a permanent product rule.

PASS is not a claim that OMR/MusicXML is visually identical to the original PDF. Presentation code must never create a stronger verification claim than the quality/provenance evidence supports.

## 3. Top-level product map

```text
SesliTab
├── Çalışma Alanı                  [implemented primary shell entry]
├── Nota Ara / Discovery           [implemented bounded source-finding UI]
├── Teacher correction workspace  [implemented domain + partial product UI]
├── Score view                     [measure cursor implemented; note editor planned]
├── Guitar Engine                  [Package 9 Completed]
├── Violin Engine                  [Package 10 Completed]
├── Accessible Tuner               [Package 11 Completed]
├── Secure Sharing                 [Package 12 Partially implemented]
├── Simplified Rhythm Mode         [Package 13 Not started]
└── Mobile productisation          [partial responsive work; device closure pending]
```

A persistent **Eserlerim/Library** surface is still planned. Stage A must not show it as available until a real persistence/library contract exists.

## 4. Discovery / score search boundary

Discovery is implemented as a bounded source-finding surface. It does not verify musical truth.

```text
FOUND
  != SOURCE VERIFIED
  != MUSICALLY VERIFIED
  != TEACHER APPROVED
```

External intake must re-enter the normal SesliTab validation pipeline.

```text
Discovery
  -> source selection / external open
  -> future safe intake when supported
  -> OMR / MusicXML processing
  -> structural + quality validation
  -> PASS / REVIEW / BLOCK
```

Discovery must not silently download, redistribute, republish or treat third-party copyrighted scores as SesliTab-owned content. If a source cannot be safely imported/viewed, use **Kaynak Sitesinde Aç** instead of forcing an iframe/embed path.

## 5. Input and OMR boundary

Current supported inputs:

```text
PDF ---------> Cloud OMR Gateway -> Audiveris -> MusicXML
MusicXML ---------------------------------------> MusicXML
Guitar TAB text -------------------------------> bounded TAB input
```

The existing Audiveris provider/runtime, OMR worker/provider selection, Cloud OMR Gateway, backend OMR path, Docker and Render deployment connection remain protected infrastructure boundaries unless a separately reviewed package explicitly changes them.

OMR output is untrusted evidence. Valid XML is not proof of musical correctness.

## 6. Canonical music core

All musical projections must consume the same canonical note and timing data.

```text
MusicXML
  -> parser
  -> structural/rhythmic validation
  -> canonical NoteObject[] / timing model
  -> provenance + quality gates
  -> bounded projections
```

The UI, renderer, TTS, playback, MIDI, Guitar TAB and violin systems must not independently invent pitch, duration, octave, voice, tie or measure semantics.

## 7. Teacher workspace and score-editor target

Current Package 8 provides immutable automatic/corrected revisions, bounded correction operations, exact-revision approval, history/undo and stale-edit conflict protection.

Stage A simplifies the product presentation while preserving those contracts:

- primary actions use **Düzeltmeyi Kaydet**, **Eseri Onayla**, **Geri Al**;
- revision IDs, raw revision JSON and detailed history are not primary user tasks and are grouped under **Detaylar**;
- audit actor input remains required by the current Package 8 contract and is not silently invented;
- Stage A does not claim a visual note editor.

Target score workflow:

```text
ESERİ AÇ
  -> GÖRSEL NOTAYI GÖR
  -> PROBLEMİ / ŞÜPHEYİ GÖR
  -> ÖLÇÜ / NOTA SEÇ
  -> BOUNDED DÜZELTME
  -> KAYDET
  -> REVALIDATE
  -> RERENDER
  -> GEREKİRSE ONAYLA
```

Detailed status and boundary decisions are recorded in `docs/teacher-score-editor-architecture.md`.

## 8. Renderer boundary

The current SesliTab score-view integration uses a pinned ST Score Rendering Layer runtime. Current verified behavior includes score rendering and canonical measure-cursor synchronization.

Renderer authority is presentation-only.

Current contract status:

- measure cursor: implemented;
- responsive product scaling: incomplete;
- note hit-test / stable note selection identity: not yet established in SesliTab's verified contract;
- quality overlay: not implemented;
- note-level accessible selection: not implemented.

If Stage C requires an ST Score Rendering Layer contract extension, that work must be fresh-read and separately reviewed before any cross-repository change. Stage A does not expand renderer semantics.

## 9. Correction, revalidation and approval

```text
AUTOMATIC SOURCE
      -> TEACHER-CORRECTED REVISION
      -> POST-CORRECTION REVALIDATION
      -> OPTIONAL/REQUIRED APPROVAL ACCORDING TO PRODUCT ROUTE
```

Rules:

- the automatic source is immutable;
- correction creates a new immutable revision;
- a later correction cannot inherit an earlier approval;
- teacher approval does not bypass structural quality failures;
- exact approval and sharing authorization remain separate evidence.

Corrected-revision revalidation is currently partial. T3 covers a bounded correction class. T4 structural/rhythmic revalidation is under separate review in open PR #138 and must not be treated as merged.

## 10. Guitar TAB and violin authority

### Guitar

Package 9 is Completed. The advanced path supports quality-gated chords, simultaneous voices, sustained polyphony, tie continuity and bounded deterministic string assignment. Generated fingering remains evidence, not automatic teacher approval.

### Violin

Package 10 is Completed. The advanced path supports bounded positions, string crossings, two-note double stops, simultaneous voices/staves, sustain locking and tie continuity. Generated positions remain explicit non-teacher evidence.

Both consumers remain subordinate to canonical evidence and their quality gates. BLOCK must produce no definitive output.

## 11. Review playback

Definitive normal playback already follows the canonical/quality model. A distinct **İnceleme İçin Dinle** product route for REVIEW is not yet implemented.

Future provisional playback must:

- be permitted only when the underlying structure is safe enough to render/play;
- be labelled **Doğrulanmamış önizleme**;
- never bypass BLOCK;
- reuse canonical timing/pitch authority rather than creating a separate musical truth.

## 12. Secure teacher-to-student sharing

Package 12 remains partial.

```text
exact teacher/revision evidence
  -> exact authorization binding            [T1 Completed]
  -> exact-revision safety/quality gate      [T2 Completed]
  -> bounded corrected revalidation          [T3 Completed]
  -> structural/rhythmic corrected gate      [T4 open PR #138; not merged]
  -> authentication/persistence/delivery     [not implemented here]
```

No UI may claim that student payload delivery, authentication or persistence already exists.

The new product policy allows a future safe Auto-Pass sharing route only if Package 12 is explicitly revised to authorize it. Existing approval-based sharing contracts must not be bypassed by UI code.

## 13. Student Practice

Target student surface:

```text
Student Practice
├── approved/authorized work where applicable
├── safe Auto-Pass work only if future sharing policy authorizes it
├── accessible score/note representation
├── Guitar TAB where eligible
├── Turkish rhythmic text
├── TTS
├── playback / selected-measure practice
├── tempo / repetition controls
├── MIDI where eligible
└── tuner
```

Current repository does not yet provide a complete account/persistence/delivery product.

## 14. Accessible tuner

Package 11 is Completed.

```text
device microphone
  -> browser-local Web Audio
  -> bounded pitch detector
  -> note + octave / Hz / cents
  -> Pes / Çok yakın / Akortta / Tiz
```

Microphone audio remains local and must not be uploaded, persisted or recorded by SesliTab. Stage K may compact the UI without changing this privacy boundary.

## 15. Rhythm mode

Package 13 remains Not started. Simplified rhythm training must remain a bounded learning mode rather than a second music-semantic authority.

## 16. Frontend architecture

The production frontend source of truth is this GitHub repository. Current framework direction remains Vite + browser technologies. Do not migrate to React, Next.js or another framework merely for UI work.

Stage A deliberately uses a presentation-only layer over existing verified Package 8 behavior. Broader file/folder refactors remain out of scope unless separately reviewed.

## 17. Primary navigation policy

Primary navigation should expose product tasks rather than implementation internals.

Current Stage A shell exposes only implemented primary surfaces:

- **Çalışma Alanı**
- **Nota Ara**
- **Akort**

Teacher correction remains reachable in the results/product workflow but is no longer a top-level technical shell item. `Eserlerim` is withheld until a real library/persistence surface exists.

Technical output such as raw MusicXML, revision details and diagnostics may remain under **Detaylar** while backwards compatibility is preserved.

## 18. Accessibility and mobile target

Primary compatibility target:

```text
iPhone / Safari / VoiceOver
Android / Chrome / TalkBack
Desktop modern browsers / keyboard + screen reader
```

Requirements include:

- semantic HTML and native controls;
- full keyboard operability;
- visible focus;
- approximately 44px touch targets;
- responsive low-vision layouts;
- bounded live-region announcements;
- Turkish TTS;
- no color-only state;
- score-specific controlled overflow rather than page-level horizontal overflow.

Stage A adds basic teacher-form mobile bounds and 44px targets. Real iPhone/VoiceOver and Android/TalkBack closure remains pending device/browser verification.

## 19. Deployment target

Near-term deployment remains:

```text
GitHub
  -> Vite frontend
  -> existing Express/Docker API
  -> existing Render/Audiveris boundary
```

Stage A does not change deployment, Audiveris, Render, authentication or database infrastructure.

## 20. Non-negotiable safety rules

- UI is not a musical semantic authority.
- Renderer is not a musical semantic authority.
- Discovery is not a verification authority.
- Valid XML is not proof of musical correctness.
- Never invent missing pitch, duration, octave, voice, tie or source evidence.
- Preserve automatic, corrected and approved revisions separately.
- A stale approval cannot transfer to a new revision.
- Teacher approval cannot override structural BLOCK evidence.
- Do not make Package 12 metadata claim payload delivery that is not implemented.
- Do not silently change Audiveris/Render production boundaries.
- Do not add external dependencies or identity semantics without explicit review.
- Keep development bounded, reversible, tested and branch-based.

## 21. Current implementation sequence

```text
CURRENT UI WORK: Stage A — teacher UI/product shell simplification
NEXT AFTER GREEN CI: Stage B — reproduce/stabilize score runtime + responsive scaling
THEN: Stage C — measure/note selection contract (renderer fresh-read if required)
THEN: Stage D–K in bounded PRs
SHARING UI: only after existing Package 12 gates permit the exact route
PACKAGE 12 T4: remains separate open PR #138 and is not folded into Stage A
```

This document is the top-level product-architecture reference. Package-specific status remains authoritative in `docs/current-status.md`, `docs/package-status.md`, `docs/music-engine-architecture.md`, `docs/AI_CONTEXT.md` and `docs/teacher-score-editor-architecture.md`.
