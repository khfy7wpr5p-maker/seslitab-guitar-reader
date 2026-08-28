# Package 8-T1 — Revision Domain Closure Evidence

Date: 2026-08-28

Status: **Completed as a bounded Package 8 sub-stage. Package 8 itself remains Partially implemented.**

## Scope

Package 8-T1 established only the immutable teacher-revision domain boundary required before correction operations, approval, undo/history, optimistic concurrency, persistence or teacher UI.

Implemented files:

- `src/services/teacherRevisionModel.js`
- `tests/teacherRevisionModel.test.js`
- `docs/package-8-t1-revision-domain.md`

No other production surface was part of the implementation PR.

## Baseline and integration evidence

Verified main before T1 implementation:

`eff2fbdd77cdd47dd811d306cf546a295096a653`

Implementation pull request:

- PR #86 — `Package 8-T1: add immutable teacher revision domain`
- final accepted feature head: `db32b9e24d4033fe308ab9b2fe7cdefb74ec593b`
- exact-head CI #221 / run `33156899271`: SUCCESS
- protected-main squash merge: `218c3e18eed3a82861a4a1c24efd5458445ea9ca`
- exact-main CI #222 / run `33157031392`, job `98802158018`: SUCCESS

Exact-main CI #222 verified:

- **1118 / 1118 tests PASS**
- **230 suites**
- **0 failed**
- **0 skipped**
- **0 cancelled**
- `npm ci`: 119 packages installed; 120 packages audited; **0 vulnerabilities**
- production build: **PASS**
- Vite 8.2.0
- 55 modules transformed

## Review findings and fixes

PR review identified three relevant hardening points before merge. None was waived.

### 1. Original source revision identity reuse

A later corrected revision could otherwise have reused the original automatic revision ID after one intermediate correction.

Fix:

- corrected revision IDs must differ from both the immediate parent revision and the root `sourceRevisionId`;
- validation rejects a corrected record whose `revisionId === sourceRevisionId`;
- regression added for `auto-1 -> teacher-1 -> auto-1`.

### 2. Own `__proto__` data key preservation

Plain assignment of a JSON-derived own `__proto__` key could invoke legacy prototype-setter semantics instead of preserving the key as ordinary data.

Fix:

- plain-object snapshot keys are copied with `Object.defineProperty`;
- regression verifies that an own JSON `__proto__` key is preserved as data;
- the cloned object retains `Object.prototype`;
- global prototype pollution does not occur.

### 3. Hidden/accessor revision-field injection

A strict revision must reject approval or other fields injected as non-enumerable properties or accessors.

Fix:

- revision validation uses `Reflect.ownKeys`;
- exact schema fields are required;
- all revision fields must be frozen enumerable data properties;
- symbol keys, hidden fields, accessor substitution and extra fields are rejected;
- regressions cover visible/hidden approval injection and accessor replacement.

All three review threads were answered and resolved before merge.

## Verified T1 behavior

The T1 domain now provides:

- immutable `automatic` revision snapshots;
- immutable `teacher_corrected` revision snapshots;
- exact parent lineage;
- preservation of the original automatic source revision identity;
- deterministic content fingerprinting;
- deep cloning and deep freezing of accepted snapshot content;
- fail-closed validation for unsupported or non-deterministic content;
- no generated timestamps or IDs;
- no approval field in the revision schema.

The fingerprint is a deterministic drift/version token only. It is not a cryptographic authorization primitive.

## Approval boundary

Package 8-T1 deliberately does **not** implement teacher approval.

A valid T1 revision cannot be made teacher-approved by adding a `teacherApproved` or equivalent field. Future approval must be represented separately and bound to the exact revision identity/fingerprint in Package 8-T3.

Therefore:

- quality-gate `ACCEPT` is not teacher approval;
- a correction is not automatically approved;
- a future changed revision must not inherit a prior approval automatically.

## Explicit protected boundaries

Package 8-T1 did not modify:

- `backend/`;
- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection;
- existing parser/canonical/quality/playback/MIDI/Guitar TAB/violin/chord behavior;
- dependencies;
- workflows.

The full regression suite exercised existing OMR/Audiveris/Render safety tests, but no implementation or configuration in those boundaries was changed.

## Package status after this closure

- Package 0–7: **Completed**.
- Package 8: **Partially implemented**.
- Package 8-T1: **Completed**.
- Package 8-T2 through 8-T6: **Not started**.
- Package 8B — Audiveris training dataset: **Not started and separate from 8-T1..T6**.

## Next safe implementation stage

**Package 8-T2 — controlled teacher correction operations and deterministic corrected-revision creation.**

T2 must remain above the existing canonical/quality layers and must not require any Audiveris, OMR gateway, Docker, Render or deployment change.
