# Package 2A — Canonical consumer boundary inventory

This document records the current NoteObject consumer boundaries without changing runtime behavior.

| Consumer | Current production boundary | Status | Enforcement ready |
| --- | --- | --- | --- |
| Rhythmic text | `rhythmicTextGenerator.js` → `formatNoteAsText` | mapped | no |
| Rhythmic HTML | `rhythmicTextGenerator.js` → `formatNoteAsHtmlText` | mapped | no |
| Turkish TTS text | `rhythmicTextGenerator.js` → `generateTurkishRhythmicSpokenText` | mapped | no |
| Rhythm playback | `src/services/voiceService.js` → `buildRhythmSchedule` | mapped | no |
| Guitar TAB | no production canonical NoteObject → Guitar TAB consumer exists yet | pending | no |

## Safety interpretation

- Mapping is inventory only; it does not enable canonical quality-gate enforcement.
- No consumer is allowed to claim `enforcementReady` from this mapping alone.
- Missing Guitar TAB production behavior is recorded as pending rather than inferred from test-only field projection.
- OMR, Audiveris, MusicXML parsing, gateway, worker and E2E paths are outside this slice and remain unchanged.
- Mandatory blocking/review enforcement belongs to the later quality-gate integration stage.
