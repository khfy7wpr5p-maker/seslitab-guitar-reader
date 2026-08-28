# Package 7D–7F — Accessible Chord UI + Turkish TTS

Status: **Completed**.

Verified implementation evidence:

- PR #80
- accepted head `8b3d793f66b4c1ab98244ffd73cfadaa5ed934e7`
- protected-main merge `fae1b102eae24926ac48f429124c96f8c58899fe`
- exact-head CI #200 / `33145271095`: SUCCESS
- exact-main CI #201 / `33145385541`, job `98765125632`: SUCCESS
- implementation regression at merge: 1103/1103 tests PASS, 229 suites, audit 0, production build PASS

## Scope

Package 7D–7F exposes Package 7C source-only MusicXML harmony evidence in an accessible result tab and reuses the existing Turkish browser speech lifecycle.

```text
exact current NoteObject[]
        ↓
Package 7C registered source consumer
        ↓
source-only chord presentation
        ↓
Akorlar result tab
        ├─ text-only accessible display
        └─ existing voiceService Turkish TTS
```

## 7D — Accessible chord display

The UI creates a native `Akorlar` result tab with:

- `role="tab"` / `role="tabpanel"`
- `aria-selected` / `aria-labelledby`
- `role="status"` + `aria-live="polite"`
- focusable plain-text chord output
- text insertion through `textContent`, never chord HTML injection

Only `source-ready` evidence is rendered. The status explicitly states that the chord information comes from MusicXML source data and is **not teacher approval**.

`review-required`, `invalid`, `empty`, and `no-source` states expose zero chord-output bytes and disable the speech action.

## 7E — Shared audio lifecycle

Package 7 owns only its own chord utterance.

Before chord TTS starts, it refuses to start while:

- full-score speech is active,
- full-score rhythm playback is active,
- a selected-measure speech/playback action is active.

When Package 7 itself owns an active chord utterance and another full-score or selected-measure audio action begins, capture-phase preemption stops the Package 7 utterance first.

Package 7 never calls the shared stop service merely because another consumer exists. Source replacement and reset stop speech only if Package 7 proves ownership of the active utterance.

## 7F — Turkish TTS

The `chordTtsConsumer`:

- accepts only Package 7C `source-ready` evidence,
- requires `sourceOnly=true`, `definitive=false`, `teacherApproved=false`,
- passes the exact `spokenText` to the existing `voiceService.speakRhythmicText`,
- reuses the existing rate/voice/onstart/onend/onerror/timeout behavior,
- never parses chord symbols or derives harmony from notes.

## Safety boundaries

No change was made to:

- Audiveris provider/runtime/preflight,
- OMR worker/provider,
- gateway,
- production MusicXML parser,
- real OMR E2E workflow,
- dependencies,
- deployment configuration.

Package 7 remains source presentation only. Teacher correction/approval belongs to Package 8.
