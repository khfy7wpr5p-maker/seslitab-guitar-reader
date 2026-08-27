# Package 3 — Playback and measure interaction contract

Status: **Implementation complete — 3A through 3G merged; Package 3 documentation closure under verification.**

Authoritative closure evidence: `docs/package-3-closure.md` once its protected-main closure gate and exact post-merge CI have passed.

## Safety invariants

1. Package 3 consumes the existing canonical `NoteObject` model; it does not create a competing musical truth model.
2. Package 2D quality-gate decisions remain authoritative for MusicXML-backed TTS/playback/MIDI consumers.
3. The production Audiveris provider/runtime/preflight, OMR worker/provider, gateway, production MusicXML OMR path and E2E workflow are outside Package 3 scope.
4. A visible measure number is not a unique identity. Package 3C consumes parser-supplied canonical `measureKey`; it never manufactures canonical identity from the visible number.
5. TTS and playback for a measure must select the same canonical note objects.
6. Selected-measure actions are mutually exclusive with each other. Existing full-score controls may preempt a Package 3-owned selected operation, but a selected action must not silently terminate an active full-score lifecycle it does not own; it fails closed until that full-score operation is stopped.
7. Pause/resume/stop transitions must be truthful. An unsupported operation must not be represented as successful.
8. Existing proven Web Audio scheduling is not rewritten merely to expose lifecycle state.
9. Real MIDI in 3G is deterministic, generated from canonical timing/pitch evidence, does not change source note data, and does not invent missing timing, pitch, measure identity, part identity, instrumentation or verification.
10. No Package 3 stage performs deployment.

## Stage map

- 3A — `Müziği Dinle` user-facing wording: merged via PR #51.
- 3B — serialized playback state manager: merged via PR #52.
- 3C — unique measure identity and selection: merged via PR #53.
- 3D — accessible Rhythmic HTML measure controls: merged via PR #54.
- 3E — speak and play one selected measure from the same canonical objects: merged via PR #55.
- 3F — playback/measure regression package: merged via PR #56.
- 3G — deterministic real MIDI timeline and `.mid` export: merged via PR #57.

## 3B acceptance

The state manager:

- exposes `idle`, `playing`, and `paused` truthfully;
- supports play/start, pause, resume and stop through an explicit adapter contract;
- serializes overlapping transitions;
- stops an older active session before starting its replacement;
- ignores invalid lifecycle requests without inventing adapter calls;
- retains the prior truthful state when an adapter operation fails;
- ignores stale natural-completion callbacks from replaced sessions;
- leaves the existing Web Audio scheduler unchanged.

## 3C acceptance

Measure identity must:

- use the existing parser-supplied `measureKey` as the canonical selection key;
- preserve `partId`, `partIndex`, `measureIndex`, and visible measure number as metadata;
- keep duplicate visible measure numbers distinct when their canonical keys differ;
- return the exact original `NoteObject` references for a selected measure;
- mark notes without `measureKey` as display-only/non-selectable rather than inventing identity;
- keep non-contiguous legacy runs separate without assigning fake canonical keys;
- fail closed when one canonical key is associated with conflicting physical metadata;
- remain deterministic and never mutate or freeze caller-owned note objects.

## 3D acceptance

Accessible measure controls:

- receive the exact `NoteObject[]` reference already projected to Rhythmic HTML rather than reparsing visible HTML or MusicXML;
- render controls only for groups accepted by the Package 3C canonical `measureKey` policy;
- keep TAB/legacy groups without canonical identity non-selectable;
- use native `button` controls with an accessible name and `aria-pressed` selection state;
- disambiguate duplicate visible measure numbers with physical measure metadata in the accessible label;
- revalidate canonical selection before committing the selected key;
- announce a successful selection through the existing live region;
- keep the pre-existing Rhythmic HTML string unchanged;
- clear Package 3 selection state when the application is reset.

## 3E acceptance

Selected-measure TTS/playback must:

- resolve Package 2D quality policy against the exact full canonical `NoteObject[]` identity before any selected sub-array is consumed;
- require `QUALITY_GATE_DECISION.ACCEPT`; REVIEW/BLOCK produces no TTS/audio operation;
- re-resolve the selected `measureKey` against the exact current array after gate acceptance;
- pass only the selected group's exact original `NoteObject` references to TTS or playback;
- generate TTS text from that same selected group and play that same selected group;
- fail closed for stale/missing keys without guessing from visible measure number;
- keep selected TTS/playback mutually exclusive by preempting only another Package 3-owned selected operation;
- never stop shared full-score speech/rhythm merely because a measure was selected;
- fail closed if a selected action is requested while an existing full-score speech/rhythm operation is active, instead of resolving an app.js lifecycle promise it does not own;
- provide native selected-measure speak, listen and stop controls;
- keep selected-measure actions disabled until a canonical measure is selected;
- preempt a selected-measure operation before an existing full-score voice/rhythm button starts, using capture-phase UI coordination rather than rewriting the audio scheduler;
- suppress stale selected-operation completion announcements after that selected operation was preempted;
- leave the proven Web Audio scheduling implementation unchanged;
- leave Audiveris/OMR/provider/worker/gateway/E2E and deployment configuration unchanged.

The Package 3 handoff bridge stores only exact references and a selected key; it never receives or manufactures Package 2D verification state. This prevents a detached selected-measure array from silently inheriting the full score's quality report.

## 3F acceptance

The regression package is test/documentation only and proves that:

- reviewed real-OMR duplicate visible measure numbers remain separate canonical `measureKey` identities;
- accessible controls keep those duplicate visible numbers disambiguated by physical identity;
- selected real-OMR measures retain exact original `NoteObject` references;
- source-unverified real OMR cannot start selected playback without Package 2D ACCEPT evidence;
- stale canonical keys fail closed and start no audio;
- publishing a new canonical note array invalidates any prior selected measure key;
- selected-measure schedule generation is deterministic and never mutates source timing data, including grace-note evidence;
- existing real-OMR measure-identity and playback-fingerprint shields continue to pass unchanged;
- no production parser, audio scheduler, Audiveris, OMR provider/worker/gateway/E2E, dependency or deployment code was changed by 3F.

Passing these tests is regression evidence only. It does not convert reviewed real-OMR fixtures into teacher-verified musical ground truth or create an OMR accuracy claim.

## 3G acceptance

The MIDI export package:

- generates a real Standard MIDI File byte stream in deterministic SMF Format 0 without a third-party MIDI dependency;
- consumes the exact canonical full `NoteObject[]` reference already owned by the application;
- requires the existing Package 2D playback quality gate to return `ACCEPT` before the production-facing export wrapper creates bytes;
- derives pitch only from canonical integer MIDI values in the valid 0–127 range;
- derives event timing only from canonical `measureIndex`, `measureKey`, `startBeat` and duration evidence;
- keeps physical measures contiguous by canonical `measureIndex` and fails closed rather than compressing an unknown/missing measure out of the timeline;
- supports exactly one canonical part at a time and fails closed on mixed-part input instead of merging parts;
- preserves simultaneous chord starts and produces one attack for a valid tie chain with the canonical summed duration;
- preserves rests as timing evidence without emitting note attacks;
- reuses the existing short audible grace-note playback approximation rather than silently creating a second grace timing policy;
- emits a fixed PPQ and explicit tempo meta event, deterministic note ordering, note-off ordering, end-of-track marker and path-safe `.mid` filename;
- validates MIDI/VLQ/tempo/PPQ/velocity bounds and fails closed on unencodable values;
- never mutates, repairs, clones into a new musical truth, or elevates verification state on source notes;
- exposes a native accessible `MIDI indir` control that operates on the full canonical array, not the selected-measure sub-array;
- never begins a browser download when the quality gate refuses export;
- creates and revokes browser object URLs safely for successful downloads;
- leaves the Web Audio scheduler, parser, Audiveris, OMR provider/runtime/worker/gateway, production MusicXML path, E2E workflow, dependencies and deployment configuration unchanged.

A deterministic `.mid` artifact proves only that accepted canonical data can be encoded reproducibly. It is not a new OMR accuracy claim, teacher approval, orchestration inference or instrument-performance interpretation.
