# Package 8-T6 — Accessible Teacher Correction / Approval UI

Status: **Completed**

## Purpose

Package 8-T6 exposes the verified T1–T5 teacher revision domain through a bounded, keyboard-native and screen-reader-readable teacher workspace. It is a UI/orchestration layer, not a new musical truth engine.

## Product separation

The UI keeps separate:

1. automatic source revision;
2. teacher-corrected revision;
3. exact teacher approval evidence;
4. quality/safety evidence;
5. later student-sharing authorization.

Teacher approval is **not** quality-gate acceptance and is **not** student-sharing permission.

## Implemented domain adapter

`src/services/teacherWorkspaceModel.js` provides an immutable UI-facing workspace over T1–T5.

It carries one T4 history, one T5 expectation, caller-supplied audit actor label, explicit `active`/`conflict` state and conflict reason. The domain adapter invents no actor/revision/history/event/approval/operation/timestamp identity.

The actor label is audit metadata only; it is not authentication or authorization.

## Source and correction safety

The workspace begins from the exact published `NoteObject[]` and deep-snapshots it into an automatic revision. Source notes are never edited in place. Publishing a different exact array reference resets the in-memory teacher workspace.

T6 is not a raw JSON/MusicXML editor. It exposes only existing direct primitive fields from a bounded allow-list and excludes arbitrary editing of source/physical identity, `measureKey`, confidence/verification, nested evidence and schema/fingerprint fields.

Every accepted edit becomes a T2 `replace_value` operation guarded by T5 and therefore creates a new immutable teacher revision plus audit evidence.

T6 intentionally does not infer/recalculate all dependent musical fields after one primitive correction; later definitive use still requires the appropriate exact-revision validation/quality evidence.

Blank or whitespace-only numeric input fails closed instead of becoming numeric zero.

## Approval

Approval uses T3 exact-revision evidence plus T5 guarded append:

- only exact current revision is approved;
- duplicate exact-current approval is rejected in the bounded UI;
- later correction/undo receives new lineage and does not inherit old approval;
- historical approval remains immutable;
- approval does not bypass quality or authorize sharing.

## History and undo

UI exposes preserved history and earlier different-content undo targets. Undo delegates to T4/T5 and creates a new corrected revision. No old revision/evidence is deleted and no pointer is silently rewound.

## Conflict UX

Stale authoritative history produces explicit conflict with zero partial mutation. Correction/approval/undo controls are disabled, the conflict is exposed as focusable/assertive text, and the teacher must explicitly refresh. The previously failing operation is never automatically retried.

Review hardening additionally guarantees that `history_mismatch` or `source_mismatch` cannot be refreshed into an unrelated active workspace; a new workspace is required.

## Accessibility

The UI provides native buttons, labels/select/input, `role=tab`/`tabpanel`, polite live status, assertive `role=alert` conflict/error state, focusable read-only revision view, deterministic focus behavior, visible `:focus-visible`, reduced-motion-safe styling, and text semantics that do not rely on colour alone.

No mouse-only gesture is required.

## Deferred by design

T6 does not implement persistence/database, authenticated accounts/authorization, database CAS/distributed locks, automatic conflict merge, student sharing (Package 12), Audiveris training data (Package 8B), advanced Guitar TAB (Package 9), advanced violin (Package 10), or production OMR/deployment changes.

## Final verification evidence

Implementation PR: **#102**  
Final PR head: `5efb91ac14dec87353e013b21f32fd5baf0271b2`

Exact-head CI #261 / run `33194159944`, job `98926913424`:

- **1213/1213 tests PASS**
- **232 suites**
- 0 failed/skipped/cancelled
- **0 vulnerabilities**
- production build PASS

Review findings fixed before merge:

1. isolation regression narrowed to executable wiring rather than comment text;
2. blank/whitespace numeric input no longer coerces to zero;
3. history/source mismatch cannot be activated via refresh.

All review threads were resolved.

Protected-main squash merge:
`6f7e58fbbee2655c7bdc296ee673cfb3981f1438`

Exact-main CI #262 / run `33194360060`, job `98927588160`:

- **1213/1213 tests PASS**
- **232 suites**
- 0 failed/skipped/cancelled
- **0 vulnerabilities**
- Vite production build PASS
- existing OMR/Audiveris, Render Blueprint and Dockerfile security regressions PASS

## Completion conclusion

T6 satisfies its completion rule at the implementation level. With this separate documentation closure synchronized and merged through its own CI gate, Package 8 T1–T6 is the completed teacher correction/versioning/approval package. Package **8B remains separate** and is the next source-approved stage.
