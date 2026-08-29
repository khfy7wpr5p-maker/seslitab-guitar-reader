# SesliTab Package Status

Last documentation review: 2026-08-29  
Fresh-read protected `main`: `2a6fa9c981b85861895692df99887d46e768822e`  
Latest verified code-equivalent CI evidence: PR #140 head `2c684b7ffb1bdb4cef9e8f5b0de408800cce0534` — `test-and-build` SUCCESS, 1411/1411 tests, production build PASS, real Chrome score-render/cursor proof PASS.

A package/substage is **Completed** only after its bounded acceptance criteria, tests/build and required merge evidence are satisfied. PR #140 CI is not labelled as a separate exact-main run because the current merge commit does not expose one in the fresh-read query.

## Package table

| Package | Status | Current evidence or limitation |
|---|---|---|
| 0–7 | Completed | Existing verified product foundations remain intact. |
| 8 — Teacher correction and approval | **Completed** | Immutable automatic/corrected revisions, exact approval, undo/history and conflict controls remain authoritative. |
| 8B — Audiveris training dataset | **Partially implemented** | Engineering path exists; genuine approved/trainable real dataset evidence remains incomplete and deferred. |
| 8B-T1 — Verified dataset contract | Completed | Verified engineering contract. |
| 8B-T2 — Verified evidence intake/readiness | Completed | Exact evidence intake/readiness contract. |
| 8B-T3 — MUSCIMA accidental mapping | Completed | 2,714 bounded experimental mappings. |
| 8B-T4 — Research-only training admission | Completed | Research-only exact admission gate; genuine admitted real samples remain 0. |
| 8B-T5 — Isolated native sample staging harness | Completed | Serializer-ready staging contract; genuine real serializer-ready samples remain 0. |
| 8B-T6 — Pinned native serializer + acceptance gate | Completed | Deterministic native ZIP/receipt engineering contract; no real acceptance receipt/training claim. |
| 9 — Advanced Guitar TAB | **Completed** | Quality-gated advanced guitar consumer remains merged. |
| 10 — Advanced violin | **Completed** | Quality-gated advanced violin consumer remains merged. |
| 11 — Accessible chromatic tuner | **Completed** | Browser-local tuner remains merged; microphone audio remains local. |
| 12 — Teacher-to-student sharing | **Partially implemented** | T1–T3 merged. T4 is an open separate PR (#138). Auth/persistence/network delivery are not complete product capabilities. |
| 12-T1 — Exact share authorization | Completed | Exact revision/approval/recipient authorization and revocation metadata; no payload delivery. |
| 12-T2 — Exact-revision safety/quality eligibility | Completed | Exact provenance/quality re-check; stale/missing evidence fails closed. |
| 12-T3 — Bounded corrected-revision revalidation | Completed | Bounded corrected pitch/position revalidation; unsupported structural/rhythm classes fail closed. |
| 12-T4 — Structural/rhythmic corrected-revision revalidation | **Not verified / open PR #138** | Separate domain-security PR; not merged and not part of Stage A UI work. |
| 13 — Simplified rhythm mode | Not started | Separate simplified rhythm-training mode planned. |
| 14 — Mobile productisation | **Partially implemented** | Responsive web foundations exist; real iPhone VoiceOver/Android TalkBack/productisation closure remains. |

## Product UI Stage A — separate bounded product work

Stage A is not a replacement for the package security sequence. It is a bounded presentation/UI branch layered over verified domain APIs.

Branch: `stage-a/teacher-ui-simplification`  
Status in this branch: **implemented, pending PR CI/merge**.

Stage A changes only:

- primary shell navigation: **Çalışma Alanı / Nota Ara / Akort**;
- demo-oriented shell copy;
- teacher-facing labels: **Düzeltmeyi Kaydet / Eseri Onayla / Geri Al**;
- grouping raw revision JSON/history under **Detaylar**;
- exact revision/approval IDs removed from primary summaries;
- basic mobile target/focus/width safety for teacher controls;
- architecture/status documentation.

Stage A deliberately does not modify:

- Package 8 correction/revision/approval/history logic;
- Package 12 authorization/revalidation logic;
- quality-gate semantics;
- renderer semantic contract;
- MusicXML/canonical data;
- Audiveris/Render/OMR infrastructure;
- dependencies/framework.

## Official product routing decision

**Teacher approval is not universally mandatory.**

- PASS → bounded automatic consumer routing may proceed where existing gates allow.
- REVIEW → teacher review/correction is required for definitive downstream use.
- BLOCK → definitive downstream output remains prohibited.

`Auto-Pass != teacher-approved`.

This decision does not alter current Package 12 sharing authorization by UI implication. A future Auto-Pass student-sharing route requires separately reviewed Package 12 semantics.

## Package 12 current boundary

### T1

Exact authorization is separate from teacher approval and is bound to one immutable revision/approval/recipient context. Revocation and stale/replay/cross-source cases fail closed.

Detailed contract: `docs/package-12-t1-share-authorization.md`.

### T2

Eligibility re-checks exact source/provenance/quality evidence. Missing, replaced or downgraded evidence fails closed.

Detailed contract: `docs/package-12-t2-share-quality-eligibility.md`.

### T3

Teacher-corrected revalidation is deliberately bounded. It does not register old raw MusicXML as proof of the later corrected value. Unsupported correction classes fail closed.

Detailed contract: `docs/package-12-t3-corrected-revalidation.md`.

### T4

Open PR #138 is the separate current structural/rhythmic corrected-revision work. Stage A neither duplicates nor edits this PR's domain scope. Protected main must continue to treat T4 as incomplete until its own CI/review/merge evidence exists.

## Package 8B deferred research state

Current genuine research state remains bounded and must not be overstated:

```text
mapped experimental samples:             2,714
exact research approvals:                   0
admitted real samples:                      0
trainable real samples:                     0
serializer-ready real samples:              0
real samples.zip built:                      NO
real pinned-Audiveris acceptance receipt:    NO
Audiveris training executed:                 NO
production model changed:                    NO
```

Do not invent missing glyph/native/approval evidence.

## Next safe product stage

After Stage A focused/full tests, production build and required CI are green, the next UI stage is **Stage B — score renderer runtime stabilization and responsive scaling**.

Stage C note hit-test/stable identity work may require a separate fresh-read and contract review of `st-score-rendering-layer`. No cross-repository renderer contract expansion is part of Stage A.

## Status vocabulary

For numbered packages use: **Completed**, **Partially implemented**, **Not started**, **Not verified**.  
For the separate UI stage roadmap, `IMPLEMENTED / PARTIAL / PLANNED / BLOCKED` is documented in `docs/teacher-score-editor-architecture.md`.
