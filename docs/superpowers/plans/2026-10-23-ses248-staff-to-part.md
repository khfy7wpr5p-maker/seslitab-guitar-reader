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

## PDF-backed pilot and Codex review follow-up

The teacher subsequently supplied the original PDF (SHA-256 6ca6550330f8bbc138db52897cbba0960e8d611871c246c47a0f6f5c78c3458d). It establishes four eighth notes E5/D5/C5/B4 plus quarter A4 in measure 5, with piano A3 and two C4/E4 quarter chords at beats 0/1/2. A separate corrected source changes only that measure; the original remains unchanged. All 24 melody rhythm sequences, piano quarter onsets and 189 pitches match PDF evidence. The corrected source produces P1=69 and P2=120 notes, 24 measures each, all 48 part-measures exactly 3 beats. Actual-pilot Chromium upload/preview/apply/undo passed at 390x680 and 844x390. Source SHA-256 13eb00cd10cee8a1f216c194b2fb605e1b0beecbb4880be0d92affeded747975; derived SHA-256 06a6ccc6d79e9279bf1507a348c1dadaa934c7c0eb0a1268c8a0d9d0ddaf5a02. These files supersede the earlier cursor-only draft; no score content was published in this follow-up.

At head 7f8d467, all 12 checks eventually passed, including the retried Playwright baseline. Marking PR372 ready for review triggered Codex review, which raised two P1 findings: reversed document-order note-span endpoints could bypass cross-staff validation, and notated tied elements were not inspected. Both were reproduced by failing public-API regressions before implementation. Unmatched endpoints are now rejected; both endpoint orientations are paired before validating musical time and staff. W3C number-level rules allow number reuse across spans that overlap in score time but not document order, so a global sort by number/time alone is not used.

Visual tied markers are checked separately from sounding tie markers; standalone let-ring remains supported. Independent review reproduced three false rejections in the first fix: late XML continuations, same-pitch sounding ties in independent piano voices, and enharmonic visual ties. Each received a failing regression before its correction. Sounding tie identity includes voice; visual ties compare chromatic pitch while retaining written spelling and cross-voice notation. A further regression prevents reassignment of a cross-staff continuation to an overlapping local span: XML-grouped continuations retain their object, while deferred markers require one unambiguous score-time candidate across all staves. No relationship is inferred from the destination staff.

Fresh focused semantic/UI/Sonar-scope checks: 55/55 PASS. Final full serialized Node 24 suite with Chromium: 2956 total, 2925 PASS, 31 SKIP, 0 FAIL (130421 ms). Final independent public-API reruns confirmed all four follow-up findings resolved; independent semantic suite 39/39 PASS, no remaining Important/Critical finding in the follow-up scope. Fresh Chromium preview/apply/undo PASS at 390x680 and 844x390; Vite bundle PASS (existing large-chunk advisory remains). The PDF-backed pilot still produces byte-identical derived XML with 69/120 notes. No package schema, API, Student audio, dependency, branch protection, merge or deployment changes are included. The two review threads are resolved only after the tested fix is published; new-head CI remains a separate gate.

Primary specification references:
- https://www.w3.org/2021/06/musicxml40/musicxml-reference/data-types/start-stop-continue/
- https://www.w3.org/2021/06/musicxml40/musicxml-reference/data-types/number-level/
- https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/tied/

## Second review: boundary ordering and metadata scope

The second Codex review found early right/default barlines when one derived staff needs trailing silence, and staffless direction/harmony records being assumed global. The public-API barline regression failed before the fix; six ambiguous-scope regressions independently failed before admission changed. A standalone sound bypass found in independent review also received a failing regression before its correction.

Right/default barlines are now deferred until the derived measure reaches its extent. Source boundary metadata is compared at its declared boundary, while the derived score is checked at its actual emitted cursor; a serialization mutation moving the barline ahead of padding is rejected. Left/middle semantics, repeat XML, note timing and the original source bytes are preserved. Source right boundaries are canonicalized after other metadata for comparison, including the pilot's unlocated repeat boundaries in staff/voice XML order. This intentionally changes output serialization; the earlier byte-identical derived-pilot hash claim predates this fix.

Staffless harmony and ambiguous local directions now fail closed. Known pure metronome/tempo instructions and supported explicit system-only text remain admitted; explicit staff-specific words, dynamics and harmony remain on their target part. Mixed tempo/local effects and standalone local sound effects (including dynamics and damper pedal) cannot bypass scope admission. No target staff is inferred from text or placement.

Fresh focused semantic/UI/composer/Sonar-scope suite: 66/66 PASS; independent final semantic suite: 50/50 PASS, no remaining Critical/Important finding. The real-DOM CI fixture now additionally exercises padded right barlines, ambiguous metadata rejection and global tempo before the existing preview/apply/send/undo checks. Vite production bundle and fixture syntax PASS; the existing large-chunk advisory remains. Local Chromium download was unavailable, so real browser acceptance is pending the new-head CI run. The complete serialized local suite has 2967 tests: 2930 PASS, 36 SKIP, one environment failure, ceBridgeFixtureSerialization.test.js (Chromium required); it is not a passing full suite. No API, package, Student audio, dependency lock, workflow, merge or deployment changes are included in this follow-up.

## Third review: ornament relationships and reused wedge numbers

The user authorized the two findings independently reproduced against 9918b9f: double-note tremolo/arpeggio relationships could be split across parts, while valid independent same-number wedges were rejected after a premature score-time sort. Five public-API regressions failed before implementation. Tremolo endpoints now use the existing document-order pairing and staff/time validation, including voice identity; single/default/unmeasured tremolos and independent piano voices remain supported. Arpeggios are grouped by measure, musical onset and number; cross-staff groups and explicit unbroken hints fail closed. Independent same-staff/different-number/different-onset ornaments remain unchanged.

Wedges now share the note-span pairing mechanism: match objects in XML document order, then validate musical time, staff and continuations. Reversed endpoint document order and reused numbers are supported. Attached continuations keep their original object; deferred continuations require exactly one unambiguous score-time owner across all staves. A destination staff never determines the match.

Independent review found valid lexical arpeggio values (01, +1, whitespace-padded numbers and unbroken hints) could bypass the initial grouping. Two public-API regressions reproduced the failure before the correction. Arpeggio number-level values are now canonicalized with lexical/range validation; token hints are trimmed while the original XML is retained. Independent final review reran 64/64 semantic tests and a 24-case wedge matrix, verified the lexical fixes, and found no remaining Critical/Important issue in these two fixes.

Fresh verification: semantic suite 64/64 PASS; combined semantic/UI/composer/upload/Sonar-scope suite 79/79 PASS. All original 13 reproduction/control scenarios now have the intended result; independent lxml checks preserve note pitches/onsets/durations in all eight admitted outputs and keep the two independent hairpins on their respective parts. The complete local npm test run has 2981 tests: 2944 PASS, 36 SKIP, one environment failure in ceBridgeFixtureSerialization.test.js because Chromium is unavailable; this is not a passing full suite. Vite bundling and native fixture syntax PASS. The native-DOM CI fixture includes the new ornament and reused-number regressions; actual browser acceptance remains pending new-head CI. Untouched notation families and pre-existing number normalization for other spans were outside the independent review scope. No API, package, dependency, workflow, Student audio, merge or deployment changes are included.
