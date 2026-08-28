# SesliTab Package Status

Last documentation review: 2026-08-28  
Latest verified protected-main implementation baseline: `6f7e58fbbee2655c7bdc296ee673cfb3981f1438`  
Latest exact-main implementation CI: **#262 / run `33194360060`, job `98927588160` — SUCCESS**

A package is **Completed** only after its bounded acceptance criteria, focused tests, full regression suite, production build, protected-main merge and exact-main workflow evidence are satisfied.

## Package table

| Package | Status | Current evidence or limitation |
|---|---|---|
| 0R-A — Verified CI baseline | Completed | Protected-main `test-and-build` gate established. |
| 0R-B — Main branch protection | Completed | `main` protected; PR routing and required check enforced. |
| 0 — Safe baseline | Completed | Golden/reference and recovery foundations preserved. |
| 1A — Queue, retry, restart, cancellation | Completed | Real retry/cancellation/recovery safety verified. |
| 1B — File, XML and API security | Completed | PDF/XML/multipart/CORS/rate-limit boundaries verified. |
| 2A — Canonical note/time model | Completed | Shared pitch/time/source-verification contract verified. |
| 2B — Structural/rhythmic validator | Completed | Structural validity remains distinct from musical correctness. |
| 2C — Quality/error report | Completed | Deterministic quality findings verified. |
| 2D — Quality gate integration | Completed | Fail-closed ACCEPT/REVIEW/BLOCK consumer policy verified. |
| 2E — OMR benchmark | Completed | Isolated evidence framework; no universal accuracy claim. |
| 3 — Accessible playback and MIDI | Completed | Measure identity, TTS/playback and MIDI verified. |
| 4 — Basic Guitar TAB | Completed | Conservative quality-gated basic TAB verified. |
| 5 — Basic violin | Completed | Conservative first-position violin pipeline verified. |
| 6 — Chord-symbol parser | Completed | Source-only MusicXML harmony parser verified. |
| 7 — Chord display and Turkish TTS | Completed | Accessible source-only chord presentation/TTS verified. |
| 8 — Teacher correction and approval | **Completed** | T1–T6 verified and merged; exact-main CI #262 SUCCESS. |
| 8-T1 — Revision domain | Completed | Immutable automatic/corrected revisions and recursive lineage. |
| 8-T2 — Correction operations | Completed | Bounded `replace_value`; new revision + audit; no overwrite. |
| 8-T3 — Approval binding | Completed | Exact immutable approval; later revision does not inherit. |
| 8-T4 — Undo/version history | Completed | Lossless immutable history; undo creates new lineage. |
| 8-T5 — Optimistic concurrency | Completed | Stale state conflicts with zero partial domain write. |
| 8-T6 — Accessible teacher UI | **Completed** | PR #102 → merge `6f7e58fb…` → exact-main CI #262, 1213/1213 PASS. |
| 8B — Audiveris training dataset | **Not started / NEXT** | Package 8 prerequisite satisfied; must remain experimental/reproducible and must not change production OMR model automatically. |
| 9 — Advanced Guitar TAB | Not started | Polyphonic/pedagogical fingering remains future work. |
| 10 — Advanced violin | Not started | Advanced positions/alternatives/double stops remain planned. |
| 11 — Accessible tuner | Not started | Microphone pitch/accessibility package absent. |
| 12 — Teacher-to-student sharing | Not started | Exact-approved-revision sharing/authorization not implemented. |
| 13 — Simplified rhythm mode | Not started | Separate simplified rhythm-training mode planned. |
| 14 — Mobile productisation | Partially implemented | Responsive web exists; device VoiceOver/privacy/productisation closure remains. |

## Package 8 final evidence

Package 8 now satisfies the source-defined teacher correction/versioning/approval requirements:

1. automatic source is immutable;
2. teacher corrections are separate revisions;
3. every correction has audit evidence;
4. approval binds to the exact revision and becomes non-applicable after later change;
5. undo/version history is lossless;
6. concurrent stale teacher edits fail explicitly with zero partial domain write;
7. accessible teacher UI exposes correction, approval, history and conflict states through native controls;
8. UI does not expose raw source identity/verification evidence as arbitrary editable paths;
9. teacher approval remains separate from quality acceptance and student-sharing authorization;
10. full regression and production build pass on the exact merged main.

T6 implementation evidence:

- PR #102 final head `5efb91ac14dec87353e013b21f32fd5baf0271b2`
- exact-head CI #261 / run `33194159944`, job `98926913424`: SUCCESS
- 1213/1213 tests, 232 suites, 0 vulnerabilities, build PASS
- all review findings resolved
- merge `6f7e58fbbee2655c7bdc296ee673cfb3981f1438`
- exact-main CI #262 / run `33194360060`, job `98927588160`: SUCCESS
- 1213/1213 tests, 232 suites, 0 fail/skipped/cancelled, 0 vulnerabilities, build PASS

## Package 8B next-boundary rules

Package 8B is separate from Package 8 and begins only after Package 8 completion. Its approved objective is a verified experimental Audiveris sample/training dataset.

Required safeguards:

- MusicXML alone is not a training sample;
- unapproved samples are rejected;
- source image/.omr/glyph/shape-label consistency is preserved;
- source/version/licensing metadata is preserved;
- training and evaluation sets remain separate;
- dataset versions are reproducible;
- no automatic production-model replacement;
- existing OMR flow must remain unchanged.

## Protected integration boundary

No Package 8B work may silently change production Audiveris/provider/runtime, gateway/worker, `Dockerfile`, `render.yaml`, or the Render deployment connection. Any production-model/runtime change needs a separate explicit authorization and measured evidence.

## Status vocabulary

Use only: **Completed**, **Partially implemented**, **Not started**, **Not verified**.
