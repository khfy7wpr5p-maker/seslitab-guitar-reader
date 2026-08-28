# Package 8-T6 — Accessible Teacher Correction / Approval UI

Status: **implementation candidate / not closed until PR + exact-head CI + review + exact-main CI**

## Purpose

Package 8-T6 exposes the already-verified T1–T5 teacher revision domain through a bounded, keyboard-native and screen-reader-readable teacher workspace.

T6 is a UI/orchestration layer. It does not become a new musical truth engine and does not bypass revision, correction, approval, history/undo, concurrency, or quality boundaries.

## Product rule

The teacher workspace must keep these states visibly and semantically separate:

1. automatic source revision;
2. teacher-corrected revision;
3. exact teacher approval evidence;
4. quality/safety evidence;
5. later student-sharing authorization.

Teacher approval is **not** quality-gate acceptance and is **not** student-sharing permission.

## Domain adapter

`src/services/teacherWorkspaceModel.js` provides the UI-facing immutable workspace contract over T1–T5.

The workspace contains:

- one immutable T4 history;
- one T5 expectation;
- the caller-supplied teacher audit label;
- explicit `active` or `conflict` UI-domain state;
- an explicit conflict reason when stale history is detected.

The model generates no actor, revision, history, event, approval, operation, or timestamp identity. Browser/UI integration supplies those values.

The teacher audit label is audit metadata only. It is **not authentication or authorization**.

## Session source

The current bounded browser integration seeds a teacher workspace only after the existing application publishes an exact `NoteObject[]` through `package3MeasureBridge.js`.

The automatic revision deep-snapshots that source. The published source array is never edited in place.

If the application publishes a different exact `NoteObject[]` reference, the previous in-memory teacher workspace is discarded instead of silently carrying corrections to a different source.

T6 does not persist the workspace. Persistence and authenticated teacher identity remain outside this bounded stage.

## Bounded correction UI

T6 is deliberately **not** a raw JSON or MusicXML editor.

The UI exposes only existing direct primitive fields from a bounded allow-list. It does not expose or permit direct path editing of:

- `measureKey`, part identity, measure identity, or source ordering identity;
- confidence or verification evidence;
- raw/nested source evidence;
- content or lineage fingerprints;
- arbitrary object paths;
- revision/history schema fields.

Every accepted edit becomes one existing T2 `replace_value` operation and is applied through the T5 guarded correction function.

### Important semantic limit

T6 does **not** infer or automatically recalculate dependent musical fields when one primitive value is corrected. A teacher correction is therefore a new teacher revision, not automatic proof that every related canonical/derived field is internally verified.

The UI states this explicitly. Any later definitive consumer or Package 12 sharing flow must still use the required validation/quality evidence for that exact revision. T6 does not promote a correction directly into definitive student truth.

## Approval

Approval uses the existing T3 exact-revision approval record and T5 guarded history append.

Rules:

- only the exact current revision is approved;
- duplicate approval of the already-approved exact current revision is disabled/rejected in the bounded UI;
- a later correction or undo receives a different lineage and does not inherit the old approval;
- historical approval evidence remains in history;
- approval does not override the quality gate;
- approval does not grant student sharing.

## Undo / version history

The UI lists preserved revision history and offers only earlier revisions whose content differs from the current revision as undo targets.

Undo uses the existing T4/T5 guarded lossless undo operation:

- no old revision is deleted;
- no mutable pointer is moved backward;
- the historical content is restored as a **new corrected revision**;
- recursive lineage changes;
- historical approval is not resurrected automatically.

## Concurrency and conflict UX

T6 never silently retries or rebases a stale teacher action.

When the authoritative history differs from the stored T5 expectation:

1. the attempted guarded mutation returns explicit conflict;
2. no partial new revision/audit/approval/undo evidence is created;
3. correction, approval, and undo controls are disabled;
4. an assertive, focusable conflict message is exposed using non-colour text semantics;
5. the teacher must explicitly choose **“Güncel durumu yükle ve düzenlemeye devam et”**;
6. refresh captures a new expectation;
7. the previously conflicting action is **not automatically re-applied**.

This UI contract does not claim database transactions or distributed locking. A future persistence layer must preserve T5 compare-and-apply atomically at its own commit boundary.

## Accessibility contract

The T6 workspace uses native controls where possible:

- native buttons;
- native labels bound with `for`/`id`;
- native select/input controls;
- a result tab with `role=tab` and `aria-selected`;
- a panel with `role=tabpanel` and `aria-labelledby`;
- polite status updates for ordinary actions;
- assertive `role=alert` conflict/error state;
- focusable read-only current revision view;
- deterministic focus transfer to conflict/error status when needed;
- visible `:focus-visible` outline;
- reduced-motion-safe styling;
- approval/conflict/safety meaning expressed in text, not colour alone.

No mouse-only gesture is required for the bounded T6 workflow.

## UI surface

`src/package8TeacherUi.js` adds the dynamic **Öğretmen** result tab after the existing result UIs.

It provides:

- explicit teacher audit-label entry;
- workspace start action;
- current revision and exact approval summary;
- read-only current snapshot view;
- bounded correction field/value controls;
- exact-current-revision approval action;
- preserved revision history;
- lossless undo target/action;
- conflict alert and explicit refresh action.

`src/package8TeacherUi.css` provides bounded layout and visible keyboard focus styling.

`main.js` loads the T6 CSS and UI module after existing result/discovery controllers so current product features remain intact.

## Explicitly deferred

T6 does **not** implement:

- persistent teacher history storage/database;
- authenticated teacher accounts or authorization;
- atomic database compare-and-swap wiring;
- distributed locks;
- automatic conflict merge/rebase;
- automatic correction of dependent musical fields;
- student sharing — Package 12;
- Audiveris training data — Package 8B;
- advanced Guitar TAB — Package 9;
- advanced violin — Package 10;
- OMR/Audiveris/provider/gateway changes;
- `Dockerfile`, `render.yaml`, or Render service/deployment changes.

## Protected boundaries

T6 must not modify without separate authorization:

- `backend/` Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway or production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection.

## Focused acceptance tests

T6 tests cover:

- immutable source snapshot and no source overwrite;
- bounded editable-field allow-list and forbidden identity/evidence fields;
- primitive type parsing and fail-closed invalid input;
- correction creates new revision and audit;
- no-op/unsupported correction refusal;
- exact approval and later invalidation;
- duplicate current approval refusal;
- lossless undo and no approval resurrection;
- stale authoritative history conflict with zero partial mutation;
- explicit refresh required before another mutation;
- caller-supplied domain identity/time only;
- native accessible tab/panel/labels/live status;
- audit-label-not-authentication disclosure;
- deterministic correction/approval/undo UI state;
- assertive conflict alert + disabled mutation controls;
- refresh without silent operation replay;
- exact source-array replacement resets session workspace;
- visible focus styling and source isolation;
- full repository regression and production build.

## Completion rule

T6 may be marked **Completed** only after:

1. dedicated branch implementation;
2. exact-head required CI passes;
3. all valid review findings are resolved;
4. protected-main merge uses the expected exact head SHA;
5. exact-main CI passes on the resulting main SHA;
6. a separate docs closure PR synchronizes status/architecture and records final evidence.

If T1–T6 are all verified after that closure, **Package 8** may be marked Completed. Package **8B remains separate and Not started**.
