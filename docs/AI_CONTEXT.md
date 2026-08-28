# SesliTab AI Context

## Official project and purpose

SesliTab is an inclusive, teacher-supervised and semi-automatic music-education system for blind, low-vision and sighted students. Unverified musical data must never be presented as definitively correct.

## Sources of truth

Product/safety truth: `docs/project-charter.md`, this file, and approved package instructions.  
Implementation truth: source code, tests/fresh CI, `docs/current-status.md`, `docs/package-status.md`, architecture and closure documents.

If documentation conflicts with code or fresh repository state, report the conflict rather than guessing.

## Required development procedure

Before each implementation stage:

1. fresh read-only repository inspection;
2. verify protected-main SHA, open PR/issues and current CI;
3. confirm exact package and prerequisites;
4. define allowed files and protected boundaries;
5. define focused tests, full regression and production build;
6. confirm write/merge authority;
7. use a dedicated branch and never direct-commit to main;
8. resolve review findings and require exact-head CI before merge;
9. merge with exact expected head;
10. require exact-main CI before status advancement.

Only one implementation package may be active at a time.

## Current roadmap position

As of the verified Package 8-T6 implementation closure on 2026-08-28:

- Package 0–7: **Completed**
- Package 8: **Completed**
- Package 8-T1 through 8-T6: **Completed**
- Package 8B — verified Audiveris sample/training dataset: **NEXT / Not started**
- Package 9 — Advanced Guitar TAB: Not started
- Package 10 — Advanced Violin: Not started
- Package 11 — Accessible Tuner: Not started
- Package 12 — Teacher-to-student sharing: Not started
- Package 13 — Simplified rhythm mode: Not started
- Package 14 — Mobile productisation: Partially implemented

Verified Package 8 implementation main:
`6f7e58fbbee2655c7bdc296ee673cfb3981f1438`

Exact-main CI #262 / run `33194360060`, job `98927588160`:

- **1213/1213 tests PASS**
- **232 suites**
- 0 failed/skipped/cancelled
- **0 vulnerabilities**
- production build PASS
- Package 8-T6 domain/UI/review regressions PASS
- existing OMR/Audiveris, Render Blueprint and Dockerfile security regressions PASS

## Package 8 invariants

1. Automatic source revision is immutable.
2. Correction creates a new immutable revision and never overwrites its parent.
3. Root source identity and recursive lineage identity are preserved.
4. Correction audit evidence is separate from approval.
5. Quality-gate `ACCEPT` is not teacher approval.
6. Approval is a separate immutable exact-revision record, not a mutable revision flag.
7. Later/replayed/undo revisions do not inherit an old approval automatically.
8. History preserves old revisions and transition evidence.
9. Undo creates a new corrected revision from exact historical content; it never rewinds a mutable pointer.
10. Stale teacher mutation returns explicit conflict before creating new evidence.
11. Approval-only history changes are concurrency-visible.
12. T5 conflict produces zero partial revision/audit/approval/undo evidence.
13. T5 is not a database transaction/distributed lock; future persistence must atomically preserve compare-and-apply.
14. T6 is a UI/orchestration layer over T1–T5 and is not a parallel musical truth engine.
15. T6 correction exposes only bounded existing primitive note fields; raw JSON/MusicXML, source identity and verification evidence are not arbitrary edit surfaces.
16. T6 blank numeric input fails closed rather than coercing to zero.
17. T6 stale-history conflict requires explicit refresh and never silently retries the conflicting action.
18. T6 history/source identity mismatch cannot be refreshed into an unrelated workspace.
19. T6 approval remains separate from quality and student-sharing permission.
20. Package 12 may later share only an exact approved revision together with the required quality/safety evidence and its own authorization contract.

## Package 8 implementation map

- `src/services/teacherRevisionModel.js` — T1 immutable revisions
- `src/services/teacherCorrectionOperations.js` — T2 bounded correction + audit
- `src/services/teacherApprovalModel.js` — T3 exact-revision approval
- `src/services/teacherRevisionHistory.js` — T4 immutable history + undo
- `src/services/teacherRevisionConcurrency.js` — T5 optimistic concurrency
- `src/services/teacherWorkspaceModel.js` — T6 immutable UI-facing workspace adapter
- `src/package8TeacherUi.js` — accessible teacher UI orchestration
- `src/package8TeacherUi.css` — bounded layout/focus/status styling

## Package 8 final evidence

- PR #102 final head: `5efb91ac14dec87353e013b21f32fd5baf0271b2`
- exact-head CI #261 / run `33194159944`, job `98926913424`: SUCCESS
- 1213/1213 tests, 232 suites, 0 vulnerabilities, build PASS
- review hardening: executable isolation check, blank numeric coercion refusal, history/source mismatch refresh refusal
- all review threads resolved before merge
- protected-main merge: `6f7e58fbbee2655c7bdc296ee673cfb3981f1438`
- exact-main CI #262 / run `33194360060`, job `98927588160`: SUCCESS
- 1213/1213 tests, 232 suites, 0 fail/skipped/cancelled, 0 vulnerabilities, build PASS

## Next stage: Package 8B

Source-defined objective: create a reliable **experimental** Audiveris sample/training dataset from teacher-verified images, OMR data and symbol labels. Package 8 is its prerequisite and is now satisfied.

8B may include:

- source page image;
- original PDF reference/provenance;
- corrected Audiveris `.omr` evidence;
- glyph image;
- shape label;
- symbol coordinates;
- teacher approval;
- source/version/licensing metadata.

8B critical rules:

- MusicXML alone is not an Audiveris training sample;
- unapproved samples must not enter the training dataset;
- training and evaluation datasets remain separate;
- dataset versions are deterministic/reproducible;
- source/licensing metadata is preserved;
- no automatic production-model replacement;
- existing production OMR flow remains unchanged.

Before 8B implementation, fresh-read actual repository samples, `.omr` artifacts, teacher-approved evidence and licensing/provenance. If required training evidence is absent, build only a fail-closed dataset contract/validator/manifest layer; never fabricate labels or approval.

## Protected integration boundaries

Unless separately and explicitly authorized, do not change:

- production Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway or production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection.

Do not add dependencies unless necessary and approved. Do not treat revision/history fingerprints as cryptographic authentication. Do not invent notes, rhythms, symbols, training labels, coordinates or approval evidence.
