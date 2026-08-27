# Package 5 Closure — Basic Violin

Date: 2026-08-28

Package 5 implements conservative Basic Violin first-position guidance over the shared canonical `NoteObject[]` model. The package is intentionally narrower than advanced violin pedagogy and does not convert generated fingering into teacher truth.

## Closure baseline

Final verified implementation main before this documentation closure:

`0465dba0c40e66ad0d8c77ea47b62fbd421209de`

Required exact-main CI:

- run #177
- run ID `33119971061`
- exact `head_sha`: `0465dba0c40e66ad0d8c77ea47b62fbd421209de`
- required job: `98684129984` / `test-and-build`
- Node 24.19.0
- npm 11.17.0
- 120 packages audited
- vulnerabilities: 0
- tests: 1031 / 1031 passed
- suites: 229
- failed/skipped/cancelled: 0 / 0 / 0
- Vite 8.2.0 production build: PASS
- transformed modules: 49

## Stage evidence

### 5A — First-position physical candidates

- PR #66
- accepted head `9227551c76aeea1c61299f3bfa556333e4b9e932`
- merge `1f500cfba2c0a44b8d5ca5fd388f769e8d4cb5da`
- standard tuning G3–D4–A4–E5
- concert-pitch mapping
- supported first-position candidate span: 0..7 semitones above each open string
- overlapping physical string candidates are preserved, not ranked pedagogically

### 5B — Conservative generated finger-zone policy

- PR #67
- accepted head `26ea8092c1a622929aa2bc1a2e0f7b92f0abc76b`
- merge `a68121c027fdfb2f96da449179d28cce5e002a20`
- policy: `first-position-semitone-zone-v1`
- 0 → open; 1–2 → finger 1; 3–4 → finger 2; 5–6 → finger 3; 7 → finger 4
- generated evidence remains `teacherApproved=false`
- multiple physical strings remain ambiguous

### 5C — Conservative Basic Violin projection

- PR #68
- accepted head `3c83e785d1d1a62288c6056051cc935c64bfcbc8`
- merge `9678494c29af6405397670228985e177f19f4ebc`
- exact source `NoteObject` references are preserved
- physical identity uses `measureKey`, `measureIndex`, `partId`, `partIndex`
- unresolved string crossing → review-required with zero partial finalized measures
- out-of-range → zero partial finalized measures
- double stops/chords, independent simultaneous attacks, multiple pitched voices/staves/parts → advanced-required

### 5D — Fail-closed VIOLIN gate boundary

- PR #71
- accepted head `6e16a5c7c40a59da164a9b1d0de1de5a58c703de`
- merge `a01793e4d0f00ff83fd8e71979da6ef7eb6a1051`
- exact-head CI #169: 1010/1010 PASS, audit 0, build PASS
- exact-main CI #170: 1010/1010 PASS, audit 0, build PASS
- VIOLIN consumer identity added without authorizing output until a mapped production consumer existed
- fail-closed boundary preserved

### 5E — Quality-gated production consumer

- PR #72
- accepted head `3643b5a18f86e53e64b95ae685ae2116a050c7bd`
- merge `e1116b1e1139fb701ee8c5c09a12ec6d9cc4d1b1`
- exact-head CI #171: 1017/1017 PASS, audit 0, build PASS
- exact-main CI #172: 1017/1017 PASS, audit 0, build PASS
- exact canonical array is gated before projection
- REVIEW/BLOCK cannot produce definitive fingering
- 5C ambiguity remains REVIEW_REQUIRED
- advanced/out-of-range material returns NOT_AVAILABLE with no partial output
- definitive output requires gate ACCEPT + complete 5C PROJECTED result

### 5F — Accessible Basic Violin result UI

- PR #73
- initial exact-head CI #173: 1025/1025 PASS
- two unresolved P2 review findings correctly blocked merge
- review fixes added exact `noteIndex` completeness/uniqueness checks and internally consistent string/finger evidence validation
- final accepted head `1ffb3bf2e5d78f90ac37ea27b4f3e322fe4e833f`
- review-fix exact-head CI #176: 1031/1031 PASS, audit 0, build PASS
- both P2 threads resolved
- branch confirmed 0-behind before merge
- merge performed with expected-head lock
- merge `0465dba0c40e66ad0d8c77ea47b62fbd421209de`
- exact-main CI #177: 1031/1031 PASS, audit 0, build PASS

Accessible UI properties:

- exact Package 3-published `NoteObject[]` reference reaches the quality-gated violin consumer;
- native result tab / tabpanel semantics;
- polite status region;
- focusable plain-text output;
- no `innerHTML` rendering of generated guidance;
- duplicate visible measure numbers remain distinct through canonical physical `measureKey`;
- review/block/not-available states expose no generated tel/parmak guidance;
- stale output is cleared when the canonical source array is reset.

## Verified production flow

```text
exact canonical NoteObject[]
  -> Package 2D VIOLIN gate
  -> Package 5A physical candidates
  -> Package 5B generated finger-zone evidence
  -> Package 5C conservative projection
  -> Package 5E production consumer
  -> Package 5F accessible result UI
```

## Fail-closed musical policy

Package 5 must not invent a teacher or pedagogical decision.

Examples such as D4, A4 and E5 can be physically valid on more than one supported first-position string. When more than one candidate remains, Basic Violin does not choose a preferred string. The result remains review-required and no finalized fingering is exposed.

Structural validity and physical playability are not musical ground truth. Source-unverified OMR remains non-definitive even if the score is structurally valid.

## Explicitly outside Package 5

Package 5 does not claim:

- teacher-approved fingering;
- pedagogically optimal fingering;
- automatic cross-string choice resolution;
- shifting or advanced positions;
- double stops or advanced chordal violin technique;
- polyphonic/multi-voice/multi-staff/multi-part Basic Violin projection;
- universal OMR correctness;
- recovery of missing musical truth.

Advanced violin remains Package 10.

## Protected boundaries unchanged

Package 5 did not intentionally change:

- Audiveris provider;
- Audiveris runtime/preflight;
- OMR worker/provider;
- gateway;
- production MusicXML OMR path;
- real OMR integration;
- E2E workflow.

No external violin dependency was added. No deployment was performed.

## Closure decision

The Package 5 implementation satisfies its conservative Basic Violin scope at protected-main implementation baseline `0465dba0c40e66ad0d8c77ea47b62fbd421209de`, supported by exact-main CI #177. This documentation closure changes status/evidence only and must itself pass the repository's normal protected-main PR and `test-and-build` gate before the repository status documents are treated as reconciled.
