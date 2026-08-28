# Package 7 — Chord Display and Turkish TTS Closure

Status: **closure pending**.

Package 7 implementation stages are technically complete, including the late Package 7C stale-source security hotfix. Package-level closure remains pending until this documentation closure PR (#83) merges through protected `main` and its exact-main `test-and-build` succeeds.

## Verified implementation chain

```text
Package 6 MusicXML <harmony> evidence
        ↓
7A — deterministic accessible chord presentation ✅
        ↓
7B — Turkish chord pronunciation text ✅
        ↓
7C — exact NoteObject[] ↔ raw MusicXML source handoff ✅
        ↓
7D — accessible Akorlar result tab ✅
        ↓
7E — shared-audio lifecycle ownership and preemption ✅
        ↓
7F — existing voiceService Turkish TTS ✅
        ↓
7G — package documentation closure 🟡
```

## 7A–7B evidence

PR #78 — `Package 7A/B: add fail-closed chord presentation and Turkish pronunciation`

- accepted final head: `7256806e06ccfa184a77f859e5c8de1714656281`
- merge on protected main: `ee9a95a02a75c357e74647a09b1c2b27dafdcc6c`
- exact-main CI #197 / `33144443876`: SUCCESS

Verified behavior includes source-only presentation, deterministic Turkish pronunciation, slash bass, hidden-degree parity, physical measure identity/timing, zero bytes on review/invalid evidence, `teacherApproved=false`, and no chord inference from notes.

Two P2 findings were fixed before merge: redundant timing evidence consistency and malformed `N.C.` metadata handling.

## 7C evidence

Original implementation PR #79:

- accepted head: `7e98787e881adb06e776b9e8b464d0eb81f39d27`
- merge: `56ba563d47f3eec45ea0de88435706c121316a0d`
- exact-main CI #199 / `33145040418`: SUCCESS

The implementation binds raw MusicXML to the exact `NoteObject[]` identity through a `WeakMap`; equivalent clones never inherit source evidence. Package 6 remains the only harmony parser and Package 7A/B remains the presentation layer. Ready output remains `sourceOnly=true`, `definitive=false`, `teacherApproved=false`.

### Late 7C P2 security hotfix

A valid late review found that a previous successful MusicXML association could survive a later failed preparation for the same exact note array. Package 7 was not considered finally closed while this remained possible.

PR #82 — `Package 7C: invalidate stale MusicXML source evidence`

- accepted head: `0968a439a8e5b2a8712d216277f7466c8ba84daa`
- merge on protected main: `7c37057713aa8a975edafdb0928d64f575d7cd5f`
- exact-head CI #204 / `33145943788`: SUCCESS
- exact-main CI #205 / `33146058408`, job `98767251803`: SUCCESS
- final technical regression: **1105 / 1105 tests PASS**
- suites: **229**
- failed / skipped / cancelled: **0 / 0 / 0**
- dependency audit: **120 packages, 0 vulnerabilities**
- Vite 8.2.0 production build: **PASS**
- transformed modules: **55**

The source registry is atomic with each preparation attempt: old exact-array source evidence is invalidated first, and the current source is registered only after current structural validation and quality-report construction succeed.

## 7D–7F evidence

PR #80 — `Package 7D-F: add accessible source chord UI and Turkish TTS`

- accepted head: `8b3d793f66b4c1ab98244ffd73cfadaa5ed934e7`
- merge: `fae1b102eae24926ac48f429124c96f8c58899fe`
- exact-head CI #200 / `33145271095`: SUCCESS
- exact-main CI #201 / `33145385541`, job `98765125632`: SUCCESS
- implementation regression at that point: 1103 / 1103 PASS, 229 suites, audit 0, build PASS

Verified behavior includes:

- native accessible `Akorlar` result tab and `tabpanel`;
- `aria-selected`, `aria-labelledby`, polite live status and focusable text-only output;
- only source-ready evidence renders chord text or enables speech;
- `REVIEW`, `INVALID`, `EMPTY` and `NO_SOURCE` expose zero chord-output bytes and disable TTS;
- chord output uses `textContent`;
- existing `voiceService` is reused rather than creating a second speech engine;
- full-score and selected-measure audio ownership blocks chord TTS while those consumers are active;
- Package 7 stops shared speech only when it owns the active chord utterance;
- Package 7-owned TTS is capture-phase preempted before another existing audio consumer starts.

## 7G closure evidence so far

Closure-pending documentation PR #81 merged as:

- merge `fef1464c882878fd1dd9921959887b9080f30927`
- exact-main CI #203: SUCCESS

The late P2 was then corrected by PR #82 and exact-main CI #205.

Current package-level closure gate:

- PR #83 — documentation reconciliation
- current exact head after review corrections: determined by PR metadata
- exact-head CI #206 on the earlier PR #83 head passed 1105/1105 tests, audit 0 and production build; because review corrections changed the head, a fresh exact-head run is required before merge.

## Safety boundary

Package 7 did **not** change:

- Audiveris provider/runtime/preflight;
- OMR worker/provider;
- gateway;
- production OMR execution path;
- real OMR E2E workflow;
- external dependencies;
- deployment configuration.

No deployment was performed.

Package 7 does not prove that a source chord is musically correct, does not infer chords from notes, and does not convert source harmony into teacher-approved truth. Teacher correction and approval remain Package 8 and are **not started**.

## Closure rule

Technical Package 7 baseline before PR #83:
`7c37057713aa8a975edafdb0928d64f575d7cd5f`

Exact-main CI #205 / `33146058408`, job `98767251803`: SUCCESS with **1105/1105 tests**, **229 suites**, **0 vulnerabilities**, and production build PASS.

Package 7 may be changed from **closure pending** to **Completed** only after PR #83 itself:

1. passes fresh exact-head `test-and-build` on its final reviewed head;
2. has no unresolved review threads and remains current with protected `main`;
3. merges through protected `main` with an expected-head lock;
4. passes exact-main `test-and-build` on that merge SHA.

A subsequent documentation evidence reconciliation may record that already-completed closure event; that recording does not redefine or extend the closure gate.
