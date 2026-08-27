# Package 2A — Canonical note and time model closure

Package 2A defines and verifies the shared canonical NoteObject and timing contract. It does not enable mandatory quality-gate enforcement; that remains Package 2D.

## Acceptance evidence

| Criterion | Evidence | Result |
| --- | --- | --- |
| Versioned canonical note schema exists | `noteTheory.js`, `canonicalNoteModel.js` | PASS |
| Pitch and timing representations are validated without silent invention | `resolveCanonicalPitch`, `resolveCanonicalTime` and focused tests | PASS |
| MusicXML parser output is bridged into the shared NoteObject shape with source verification metadata | `src/services/musicEngine.js`, `tests/canonicalMusicEngineBridge.test.js` | PASS |
| Canonical-only metadata survives trusted lossless preservation while edits invalidate stale verification | `canonicalNoteModel.js`, `tests/canonicalNotePreservation.test.js` | PASS |
| One common consumption decision vocabulary exists for current output classes | `canonicalConsumerPolicy.js`, `tests/canonicalConsumerPolicy.test.js` | PASS |
| Current production consumer boundaries are explicitly inventoried | `canonicalConsumerBindings.js`, `tests/canonicalConsumerBindings.test.js`, `docs/package-2a-consumer-boundaries.md` | PASS |
| The same canonical MusicXML NoteObject set feeds rhythmic text, rhythmic HTML, note cards, Turkish TTS text, and rhythm playback without consumer mutation | `tests/canonicalConsumerFlow.test.js` | PASS pending required CI confirmation |
| Original source evidence remains reviewable | canonical `_raw` source clone and `sourceVerificationState` tests | PASS |

## Scope boundary

Package 2A closes the shared data-model contract only.

The following are intentionally not Package 2A completion blockers:

- Mandatory ACCEPT/REVIEW/BLOCK enforcement at TTS, playback, and Guitar TAB runtime boundaries. This belongs to Package 2D.
- Production canonical NoteObject → Guitar TAB generation. The README describes teacher-approved Guitar TAB as a future output and the package map assigns Guitar TAB generation to Package 4 and later advanced work.
- Structural/rhythmic score validation completeness. This belongs to Package 2B.
- Complete quality/error reporting. This belongs to Package 2C.

The absence of a production canonical Guitar TAB output consumer must remain explicit and must not be represented as an implemented feature.

## Safety result

- No OMR or Audiveris production path change is required for Package 2A closure.
- No runtime output behavior change is required for Package 2A closure.
- No quality-gate bypass is introduced.
- Missing or conflicting canonical data remains marked rather than invented.
- Existing source-verification metadata remains separate from later teacher approval.

## Closure gate

Package 2A may be marked `Completed` only after the closure branch passes the required `test-and-build` workflow, full regression suite, dependency audit, and production build on the exact PR head, followed by successful post-merge `main` CI.
