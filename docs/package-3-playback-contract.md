# Package 3 — Playback and measure interaction contract

Status: In progress — 3A merged; 3B under verification.

## Safety invariants

1. Package 3 consumes the existing canonical `NoteObject` model; it does not create a competing musical truth model.
2. Package 2D quality-gate decisions remain authoritative for MusicXML-backed TTS/playback consumers.
3. The production Audiveris provider/runtime/preflight, OMR worker/provider, gateway, production MusicXML OMR path and E2E workflow are outside Package 3 scope.
4. A visible measure number is not a unique identity. Package 3C must use canonical `measureKey` when available and fail closed on ambiguous identity.
5. TTS and playback for a measure must select the same canonical note objects.
6. At most one Package 3 playback session may be active. New playback stops the older session before replacement.
7. Pause/resume/stop transitions must be truthful. An unsupported operation must not be represented as successful.
8. Existing proven Web Audio scheduling is not rewritten merely to expose lifecycle state.
9. Real MIDI in 3G must be deterministic, generated from canonical timing/pitch evidence, and must not change source note data.
10. No Package 3 stage performs deployment.

## Stage map

- 3A — `Müziği Dinle` user-facing wording: merged.
- 3B — serialized playback state manager: current stage.
- 3C — unique measure identity and selection.
- 3D — accessible Rhythmic HTML measure controls.
- 3E — speak and play one selected measure from the same canonical objects.
- 3F — playback/measure regression package.
- 3G — deterministic real MIDI timeline and `.mid` export.

## 3B acceptance

The state manager must:

- expose `idle`, `playing`, and `paused` truthfully;
- support play/start, pause, resume and stop through an explicit adapter contract;
- serialize overlapping transitions;
- stop an older active session before starting its replacement;
- ignore invalid lifecycle requests without inventing adapter calls;
- retain the prior truthful state when an adapter operation fails;
- ignore stale natural-completion callbacks from replaced sessions;
- avoid modifying the existing Web Audio scheduler in this slice.

Production UI/audio wiring for per-measure interaction is intentionally deferred to later Package 3 stages so 3B does not introduce an unsafe scheduler rewrite.
