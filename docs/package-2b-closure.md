# Package 2B Closure — Structural and Rhythmic Validator

Closure date: 2026-08-27

## Status

**Completed**

Package 2B closes the structural and rhythmic validation contract. It does not claim musical correctness, teacher approval, quality-report integration, runtime consumer blocking, or OMR benchmark quality.

## Verified scope

Package 2B now provides a read-only validation path from MusicXML structural data to location-rich findings. The verified scope includes:

- measure duration validation against active meter;
- underfilled, overfilled and empty-measure detection;
- timed-event measure-boundary overrun detection;
- independent multi-voice timing through MusicXML backup/forward semantics;
- same-voice/same-staff overlap detection without false overlap across independent staves or voices;
- chord continuation/onset structural checks;
- tie-chain start/stop consistency checks;
- grace-note zero-time behavior;
- rest and dotted-rhythm duration preservation;
- tuplet/time-modification evidence and ratio validation;
- beam-group evidence and structural consistency checks;
- explicit invalid divisions detection without silently accepting inherited production timing for validation purposes;
- multi-part identity preservation;
- duplicate displayed measure-number safety through unique `measureKey` identity;
- immutable validation behavior: the production parser result is not repaired, rewritten, promoted or mutated;
- separate `structural_error` and `suspected_omr_error` finding classes;
- finding location/context including `partId`, `measureKey`, `measureNumber`, `voice`, `staff`, `expected`, and `actual` where applicable.

## Implementation and evidence PRs

### PR #31 — Structural finding validator

- Branch: `architecture/package-2b-structural-validator`
- Base main: `99f2bba4f60f057b7b3c53276a71820cb2dd6f9f`
- Exact PR head: `1cb6fea021ab663bb24bc6b2c3c09a0a87f1db78`
- Merge commit: `c5ee728c4db7c359cca9c4b498a3846ea6c5d288`
- Added `src/services/structuralRhythmValidator.js`
- Added `tests/structuralRhythmValidator.test.js`
- Existing production OMR/Audiveris/E2E files were not modified.
- Exact-head CI passed with 709/709 tests, 212 suites, 0 vulnerabilities and production build PASS.
- Post-merge main CI passed.

### PR #32 — Validation-only MusicXML structural evidence

- Branch: `architecture/package-2b-xml-structural-evidence`
- Base main: `c5ee728c4db7c359cca9c4b498a3846ea6c5d288`
- Exact PR head: `5668f4f3479a364295d1612c93e34482d6972091`
- Merge commit: `097f58e403758e7a82764af3d6190a64748e7af8`
- Added `src/services/musicXmlStructuralEvidence.js`
- Added `src/services/musicXmlStructuralValidation.js`
- Added `tests/musicXmlStructuralEvidence.test.js`
- `musicXmlParser.js` was not modified.
- Raw MusicXML evidence is attached only to a validation clone.
- Exact-head CI passed with 717/717 tests, 213 suites, 0 vulnerabilities and production build PASS.
- Post-merge main CI passed.

### PR #33 — Package 2B acceptance matrix

- Branch: `architecture/package-2b-acceptance-matrix`
- Base main: `097f58e403758e7a82764af3d6190a64748e7af8`
- Exact PR head: `49ab0af1b7897b945c956524bbea13d6a5363d17`
- Merge commit: `e2fa6f6947334388d6a08299220d31f6d8462ab1`
- Added only `tests/package2bAcceptance.test.js`.
- Production/runtime files were not changed by the acceptance PR.

The acceptance matrix A–Q passed:

- A — valid single voice measure;
- B — valid independent multiple voices;
- C — chord continuation shares onset and does not inflate measure duration;
- D — tie chain across measures is structurally matched;
- E — grace note consumes zero measure time;
- F — valid triplet/time-modification and beam group;
- G — rests and dotted rhythms preserve measure totals;
- H — same voice on separate staves does not create false overlap;
- I — underfilled measure emits exact class/location/expected/actual;
- J — overfill and boundary overrun are separately located;
- K — duplicate displayed measure numbers retain distinct `measureKey` identity;
- L — explicit invalid divisions fails structurally and cannot inherit silently in validation;
- M — same-voice/same-staff overlap is detected;
- N — multi-part finding retains exact part identity;
- O — malformed tuplet and orphan beam remain distinct finding types;
- P — validation never mutates production parsed musical data;
- Q — structural validity is not promoted to musical correctness or runtime gate state.

## Final merged-main evidence

Verified protected `main` after PR #33:

- Main SHA: `e2fa6f6947334388d6a08299220d31f6d8462ab1`
- Required workflow: CI run `33073348226`
- Required job: `98521026794` / `test-and-build`
- Job conclusion: success
- Node.js: v24.19.0
- npm: 11.17.0
- `npm ci`: passed
- Packages audited: 120
- Vulnerabilities: 0
- Full regression: 734 passed, 0 failed, 0 skipped, 0 cancelled; 216 suites
- Production build: PASS with Vite 8.2.0
- Package 2B acceptance A–Q: PASS
- Package 2B MusicXML structural evidence tests: PASS
- Package 2B structural finding contract tests: PASS
- MusicXML security/XXE regression: PASS
- Audiveris preflight/provider/timeout/temp/output regression shields: PASS
- E2E workflow regression: PASS
- Approved Plan 0 Turkish TTS golden output: unchanged/PASS
- Approved Plan 0 Guitar TAB golden output: unchanged/PASS
- Real OMR measure-identity regressions: PASS
- Real OMR playback fingerprints: PASS
- Reviewed pitch/frequency consistency: PASS
- Fug/Gesi chord-onset regression shields: PASS

## Deliberate boundaries

Package 2B does **not**:

- repair or rewrite OMR output;
- modify the Audiveris provider/runtime/preflight path;
- modify the OMR worker/provider/gateway;
- change the connected E2E OMR workflow;
- declare structurally valid music to be musically correct;
- make unverified OMR definitive;
- integrate the complete quality/error report — that remains Package 2C;
- enforce ACCEPT/REVIEW/BLOCK on TTS, playback or Guitar TAB — that remains Package 2D;
- implement or benchmark OMR quality — that remains Package 2E;
- deploy any service.

## Closure decision

All Package 2B acceptance criteria are now backed by focused tests, the complete A–Q acceptance matrix, full regression, production build and successful required GitHub workflow evidence on the merged protected `main` SHA.

**Remaining Package 2B closure gate: none.**

The next package in sequence is Package 2C — Quality and Error Report.