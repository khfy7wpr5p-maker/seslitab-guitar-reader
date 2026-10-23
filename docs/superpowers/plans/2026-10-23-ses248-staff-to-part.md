# SES-248: Teacher-approved MusicXML staff-to-part split

Goal: preview and explicitly apply a reversible two-staff piano to violin/piano split in the existing assignment composer.

Spec: https://app.notion.com/p/4012be2e566481b5871afaba959bee5b and Linear SES-248, approved in the conversation after the source audit.

Constraints: original XML remains immutable; only one-part, two-staff, unambiguous scores are admitted. Musical onset, duration, pitch, voice, chord, ties, tuplets, directions and repeats must survive. No playback, package schema, delivery, API, merge or deployment changes. SES-249/250/251 remain separate.

Execution: native implementation in the isolated feat/ses248-staff-to-part worktree; independent branch review before handoff.

## Tasks

- [x] Add failing semantic-split tests with explicit timing oracles, multi-voice piano, ties/tuplets/repeats, stale/tampered previews and unsupported/cross-staff input.
- [x] Implement a bounded DOM splitter and semantic comparison. P1=Violin/staff1, P2=Piano/staff2; rebuild cursor operations without changing musical events. Reject negative source cursor and polyphonic violin.
- [x] Add failing UI tests; integrate a separate preview/apply/cancel/undo controller with the existing upload preparation. Keep submission unchanged until explicit apply. Invalidate pending work on file replacement, reset, send and destroy.
- [x] Run focused tests, full repository tests, independent review and applicable CI. Record exact remaining input/platform gaps.
- [ ] Accept the full pilot against verified musical source and complete the required physical-device checks.

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

## Approved security follow-up and uploaded pilot

At head 86cd492c8547c4e7b788fbe03c5ed67f00ed973f, main CI run 39893660962 passed the complete build and Teacher/Student Chromium/WebKit checks. Regression Quality, GTAB-04, GTAB-10C, SMENU and SES-227 checks passed. Sonar reported no new issues or hotspots, 92.1% new-code coverage and no duplication. Dependency Security alone failed: the development-only transitive ip-address 10.7.2 was affected by GHSA-rxp7-6hxx-x8q5.

The user approved the follow-up. Targeted npm lock resolution changed only ip-address to 10.7.4 (version, registry URL and integrity); package.json and every other lock entry are unchanged. A clean npm ci succeeded; npm audit against the installed graph reports zero vulnerabilities. A fresh serialized full suite after the clean install passed: 2940 tests, 2909 PASS, 31 SKIP, 0 FAIL (129277 ms). Updated-head CI remains a separate check.

The newly uploaded pilot has SHA-256 0e2f9aa90cbacd3a0cc3d7264d3094a7a585d537afc0866b3e0c1b06ab072f93 and the same measure-5 defect. The original was not modified. A separate review draft changes only the last measure-5 backup from 14336 to 10240 divisions. Every note XML remains identical, and the full 24 measures split into 69 violin and 120 piano pitched notes. This moves the affected lower voice forward by one beat relative to its invalid negative onset; it is not proof of musical intent.

All other measures span 3 beats; measure 5 still spans 2.5 beats in the source's 3/4 meter. No note duration, rest or meter was guessed to fill that gap. The cursor draft is explicitly not a musically corrected or accepted pilot. Its intended measure-5 rhythm must be checked against the original score/teacher before SES-248 can be closed. SES-249/250/251, merge and deployment remain outside this follow-up.
