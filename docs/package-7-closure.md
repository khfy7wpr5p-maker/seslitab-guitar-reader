# Package 7 — Chord Display and Turkish TTS Closure

Status: **closure pending**.

This document records the Package 7 implementation evidence already verified on protected `main`. Package 7 must not be marked **Completed** until this documentation closure PR is itself merged through the required `test-and-build` gate and its exact protected-main push workflow succeeds.

## Implemented chain

```text
Package 6 MusicXML <harmony> evidence
        ↓
7A — deterministic accessible chord presentation
        ↓
7B — Turkish chord pronunciation text
        ↓
7C — exact NoteObject[] ↔ raw MusicXML source handoff
        ↓
7D — accessible Akorlar result tab
        ↓
7E — shared-audio lifecycle ownership and preemption
        ↓
7F — existing voiceService Turkish TTS
        ↓
7G — documentation / regression closure (this gate)
```

## 7A–7B evidence

PR #78 — `Package 7A/B: add fail-closed chord presentation and Turkish pronunciation`

- accepted final head: `7256806e06ccfa184a77f859e5c8de1714656281`
- merge on protected main: `ee9a95a02a75c357e74647a09b1c2b27dafdcc6c`
- exact-main CI #197 / `33144443876`: SUCCESS

Verified behavior includes:

- source-only chord display and Turkish pronunciation from Package 6 structured harmony evidence;
- deterministic examples such as C → `Do majör akoru`, Am → `La minör akoru`, G7 → `Sol dominant yedi akoru`;
- explicit slash-bass pronunciation without inventing bass from inversion;
- hidden `print-object="no"` degrees are not spoken;
- physical `measureKey` and source-relative timing remain preserved;
- `REVIEW_REQUIRED` / `INVALID` emit zero display or speech bytes;
- all presentation remains `teacherApproved=false`;
- no note-content chord inference.

Two valid P2 review findings were fixed before merge:

1. redundant Package 6 timing evidence (`startBeat`, `startDivisions`, `divisions`) is now consistency-checked;
2. malformed `N.C.` events carrying inversion/degree metadata fail closed instead of silently discarding source evidence.

## 7C evidence

PR #79 — `Package 7C: add exact MusicXML chord source handoff`

- accepted head: `7e98787e881adb06e776b9e8b464d0eb81f39d27`
- merge on protected main: `56ba563d47f3eec45ea0de88435706c121316a0d`
- exact-main CI #199 / `33145040418`: SUCCESS

Verified behavior includes:

- raw MusicXML is registered against the exact `NoteObject[]` identity through a `WeakMap` registry;
- equivalent cloned arrays do not inherit MusicXML source evidence;
- registered raw XML is parsed only by Package 6 and presented only through Package 7A/B;
- a ready result remains `sourceOnly=true`, `definitive=false`, `teacherApproved=false`;
- missing source, invalid evidence and review-required evidence expose zero finalized chord presentation bytes;
- no chord is derived from NoteObject pitch content.

## 7D–7F evidence

PR #80 — `Package 7D-F: add accessible source chord UI and Turkish TTS`

- accepted head: `8b3d793f66b4c1ab98244ffd73cfadaa5ed934e7`
- merge on protected main: `fae1b102eae24926ac48f429124c96f8c58899fe`
- exact-head CI #200 / `33145271095`: SUCCESS
- exact-main CI #201 / `33145385541`, job `98765125632`: SUCCESS
- full regression: **1103 / 1103 PASS**
- suites: **229**
- failed / skipped / cancelled: **0 / 0 / 0**
- dependency audit: **120 packages, 0 vulnerabilities**
- Vite 8.2.0 production build: **PASS**
- transformed modules: **55**

Verified behavior includes:

- native accessible `Akorlar` result tab and `tabpanel`;
- `aria-selected`, `aria-labelledby`, polite live status and focusable text-only output;
- only source-ready evidence renders chord text or enables speech;
- `REVIEW`, `INVALID`, `EMPTY` and `NO_SOURCE` expose zero chord-output bytes and disable TTS;
- chord output is inserted with `textContent`, not chord HTML injection;
- existing `voiceService` is reused rather than creating a second speech engine;
- full-score and selected-measure audio ownership blocks chord TTS while those consumers are active;
- Package 7 stops shared speech only when it proves ownership of the active chord utterance;
- Package 7-owned TTS is capture-phase preempted before another existing audio consumer starts;
- source-only truth remains `definitive=false` and `teacherApproved=false`.

## Safety boundary preserved

Package 7 did **not** change:

- Audiveris provider/runtime/preflight;
- OMR worker/provider;
- gateway;
- production OMR execution path;
- real OMR E2E workflow;
- external dependencies;
- deployment configuration.

No deployment was performed.

Package 7 does not prove that a source chord is musically correct, does not infer chords from notes, and does not convert source harmony into teacher-approved truth. Teacher correction and approval remain Package 8.

## Closure gate

Implementation on `fae1b102eae24926ac48f429124c96f8c58899fe` is verified by exact-main CI #201.

This document and the status reconciliation remain **closure pending** until the present docs-only PR passes exact-head CI, review/freshness, merges through protected `main`, and its exact-main `test-and-build` succeeds. Only after that evidence exists may a final documentation reconciliation mark Package 7 **Completed**.
