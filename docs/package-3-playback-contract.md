# Package 3 — Playback and measure interaction contract

Status: In progress — 3A, 3B and 3C merged; 3D under verification.

## Safety invariants

1. Package 3 consumes the existing canonical `NoteObject` model; it does not create a competing musical truth model.
2. Package 2D quality-gate decisions remain authoritative for MusicXML-backed TTS/playback consumers.
3. The production Audiveris provider/runtime/preflight, OMR worker/provider, gateway, production MusicXML OMR path and E2E workflow are outside Package 3 scope.
4. A visible measure number is not a unique identity. Package 3C consumes parser-supplied canonical `measureKey`; it never manufactures canonical identity from the visible number.
5. TTS and playback for a measure must select the same canonical note objects.
6. At most one Package 3 playback session may be active. New playback stops the older session before replacement.
7. Pause/resume/stop transitions must be truthful. An unsupported operation must not be represented as successful.
8. Existing proven Web Audio scheduling is not rewritten merely to expose lifecycle state.
9. Real MIDI in 3G must be deterministic, generated from canonical timing/pitch evidence, and must not change source note data.
10. No Package 3 stage performs deployment.

## Stage map

- 3A — `Müziği Dinle` user-facing wording: merged.
- 3B — serialized playback state manager: merged.
- 3C — unique measure identity and selection: merged.
- 3D — accessible Rhythmic HTML measure controls: current stage.
- 3E — speak and play one selected measure from the same canonical objects.
- 3F — playback/measure regression package.
- 3G — deterministic real MIDI timeline and `.mid` export.

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

Accessible measure controls must:

- receive the exact `NoteObject[]` reference already projected to Rhythmic HTML rather than reparsing visible HTML or MusicXML;
- render controls only for groups accepted by the Package 3C canonical `measureKey` policy;
- keep TAB/legacy groups without canonical identity non-selectable;
- use native `button` controls with an accessible name and `aria-pressed` selection state;
- disambiguate duplicate visible measure numbers with physical measure metadata in the accessible label;
- revalidate canonical selection before committing the selected key;
- announce a successful selection through the existing live region;
- keep the pre-existing Rhythmic HTML string unchanged;
- clear Package 3 selection state when the application is reset;
- not trigger TTS or audio playback in this stage.

The handoff bridge stores only references and a selected key. It contains no parser, quality, OMR, TTS or playback logic. Package 3E must revalidate the selected key against the exact current note array before any consumer runs.
