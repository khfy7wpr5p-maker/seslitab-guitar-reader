# SES-248: Teacher-approved MusicXML staff-to-part split

Goal: preview and explicitly apply a reversible two-staff piano to violin/piano split in the existing assignment composer.

Spec: https://app.notion.com/p/4012be2e566481b5871afaba959bee5b and Linear SES-248, approved in the conversation after the source audit.

Constraints: original XML remains immutable; only one-part, two-staff, unambiguous scores are admitted. Musical onset, duration, pitch, voice, chord, ties, tuplets, directions and repeats must survive. No playback, package schema, delivery, API, merge or deployment changes. SES-249/250/251 remain separate.

Execution: native implementation in the isolated feat/ses248-staff-to-part worktree; independent branch review before handoff.

## Tasks

- [x] Add failing semantic-split tests with explicit timing oracles, multi-voice piano, ties/tuplets/repeats, stale/tampered previews and unsupported/cross-staff input.
- [x] Implement a bounded DOM splitter and semantic comparison. P1=Violin/staff1, P2=Piano/staff2; rebuild cursor operations without changing musical events. Reject negative source cursor and polyphonic violin.
- [x] Add failing UI tests; integrate a separate preview/apply/cancel/undo controller with the existing upload preparation. Keep submission unchanged until explicit apply. Invalidate pending work on file replacement, reset, send and destroy.
- [ ] Run focused tests, full repository tests, independent review and applicable CI. Record exact remaining input/platform gaps.

## Review focus

1. Unknown MusicXML semantics are rejected, never silently dropped.
2. Staff-specific clefs/key/time and direction offsets retain their intended staff and musical position.
3. Cross-staff chords/beams/slurs and overlapping violin notes fail closed.
4. A stale preview cannot replace a newer upload or modify a sending assignment.
5. No source file is repaired from guessed musical intent.

## Ledger

Baseline df8033058f45c39ca1b31983251895a497648ebc; focused existing suite 21/21 PASS.
Pilot: original XML has one P0, 24 measures, 69 upper and 120 lower pitched notes. Measure 5 has a 3.5-beat backup after 2.5 consumed beats in a lower voice. First four measures compile; including measure 5 fails. Source PDF was not found by exact filename. Ruling: retain the malformed input as a rejection fixture; do not invent a rhythmic correction. A corrected teacher source is needed for full pilot acceptance.

Progress: 19 semantic and 5 UI controller tests pass; mounted composer integration passes. Initial full npm test: 2897 pass, 1 failure (Chromium unavailable), 36 skipped; this is an environment gap, not a passing suite. A real-DOM portrait/landscape preview/apply/undo fixture is added to CI.

## Independent review and fix pass

The independent reviewer reproduced two material issues: orphan cross-staff glissando/crescendo endpoints and misplaced middle barlines. Regression tests first reproduced both failures, then passed after the fixes. Unsupported note spans now fail closed; crescendo endpoints are checked in musical order and must stay on the same staff. Middle barlines retain their onset. Direction/sound/harmony/barline XML and onset are included in semantic verification in addition to notes.

Focused final check: 39/39 PASS, including Sonar source-scope classification. The CI-only browser proof is classified explicitly as test code; application code stays analyzed. Chromium 153 real-DOM preview/apply/undo PASS at 390x680 and 844x390. This is Chromium viewport evidence, not physical iPhone or WebKit acceptance.

Local full build reached renderer export but failed during generated temporary-directory cleanup with ENOTEMPTY. No build-script change was made. Full build/CI and the malformed 24-measure pilot remain explicit acceptance gates; SES-248 must not be marked Done from the focused tests alone.

Final local suite (Node 24, Chromium 153, serialized CI test command): 2940 tests, 2909 PASS, 31 SKIP, 0 FAIL; exit 0. Vite production bundling: PASS (173 modules). The complete runtime-preparation/build pipeline still needs CI confirmation because the local cleanup failure is separate from Vite bundling. Independent review findings are fixed by RED-to-GREEN regression tests; no minor findings were deferred. Full pilot acceptance remains blocked by the unchanged measure-5 input.
