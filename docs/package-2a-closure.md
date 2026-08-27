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
| The same canonical MusicXML NoteObject set feeds rhythmic text, rhythmic HTML, note cards, Turkish TTS text, and rhythm playback without consumer mutation | `tests/canonicalConsumerFlow.test.js`; exact-head CI run `33068251258` | PASS |
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

- No OMR or Audiveris production path change was required for Package 2A closure.
- No runtime output behavior change was required for Package 2A closure.
- No quality-gate bypass was introduced.
- Missing or conflicting canonical data remains marked rather than invented.
- Existing source-verification metadata remains separate from later teacher approval.

## Exact-head closure evidence

Closure candidate head `4fccc520f05988dc8218a45e488bb93e625b3862` passed required GitHub Actions run `33068251258` / `test-and-build`:

- `npm ci`: PASS; 120 packages audited; 0 vulnerabilities
- full regression: 697/697 tests PASS; 211 suites; 0 failed/skipped/cancelled
- Package 2A canonical consumer flow: 2/2 PASS
- production Vite build: PASS
- Audiveris provider/preflight/error/cancellation/preservation regressions: PASS
- E2E workflow regression: PASS
- approved Turkish TTS golden output unchanged: PASS
- approved Guitar TAB position golden output unchanged: PASS
- real OMR measure-identity regressions: PASS
- real OMR playback fingerprints and chord-onset shields: PASS

The first closure-candidate CI run failed only because the new Node test omitted the existing DOMParser test-harness bootstrap import. Production code was not changed to correct that harness error; the test was aligned with the existing canonical MusicXML bridge test and the new exact head passed.

## Final closure result

PR #29 merged to protected `main` as `47b3ad374fdd49fdd1898c5e0c1b085fde7b9959`.

Post-merge GitHub Actions run `33068597173`, required job `98504784644` / `test-and-build`, passed on that exact merged SHA:

- `npm ci`: PASS; 120 packages audited; 0 vulnerabilities
- full regression: 697/697 tests PASS; 211 suites; 0 failed/skipped/cancelled
- Package 2A canonical consumer flow: 2/2 PASS
- production Vite build: PASS
- Audiveris and OMR regression shields: PASS
- E2E regression: PASS
- approved Turkish TTS golden output unchanged: PASS
- approved Guitar TAB position golden output unchanged: PASS

Package 2A closure gate is complete. Remaining work is separately tracked under Package 2B, 2C, 2D, Package 4, and later packages; those items do not reopen Package 2A.
