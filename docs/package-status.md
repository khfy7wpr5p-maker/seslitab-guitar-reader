# SesliTab Package Status

**Documentation review:** 2026-09-01
**Protected main reference:** `d480758032f56572dbaf92cd832b0001b9089987`
**Required check:** `test-and-build`

This page describes the current production package boundaries. Historical closure documents retain the evidence and status that were true when they were written; they are not substitutes for this current status page.

## Package table

| Package | Status | Current production boundary |
|---|---|---|
| 0–7 | PRODUCTION | Core intake, canonical music, validation and bounded consumers remain in production. |
| 8 — Teacher correction and approval | PRODUCTION | Immutable automatic/corrected/approved revision lineage, history/undo, exact approval and stale-edit protections. |
| 8B — Audiveris research/training | PRODUCTION / RESEARCH-ONLY | Engineering gates exist; no real admitted/trainable corpus, training run or production-model replacement is claimed. |
| 9 — Advanced Guitar TAB | PRODUCTION | Quality-gated canonical Guitar TAB consumer; unsupported input fails closed. |
| 10 — Advanced violin | PRODUCTION | Quality-gated canonical violin consumer; unsupported input fails closed. |
| 11 — Accessible chromatic tuner | PRODUCTION | Compact browser-local tuner with explicit microphone Start/Stop. |
| 12 — Teacher-to-student sharing | PRODUCTION / BOUNDED READINESS | T1–T4 exact-revision authorization, eligibility and corrected revalidation contracts are present; Stage L exposes readiness only. |
| 13 — Simplified rhythm mode | OUT_OF_SCOPE | No current production implementation. |
| 14 — Native/mobile productisation | OUT_OF_SCOPE | Narrow responsive web foundations exist; native/device-level productisation is not claimed. |

## Stage A–L UI/product chain

| Stage | Current status | Boundary |
|---|---|---|
| A | PRODUCTION | Teacher-centered shell and accessible presentation simplification. |
| B | PRODUCTION | Score runtime lifecycle, loading/error boundaries and browser proof contract. |
| C | PRODUCTION | Measure/note selection, hit-test and highlight; renderer remains presentation-only. |
| D | PRODUCTION | Quality evidence overlay; source score is not silently mutated. |
| E | PRODUCTION | Bounded teacher correction surface; unsupported edits fail closed. |
| F | PRODUCTION | Undo, canonical revalidation, corrected revision and rerender coherence. |
| G | PRODUCTION | Consumer-specific PASS/REVIEW/BLOCK routing with fail-closed defaults. |
| H | PRODUCTION / BOUNDED | Explicit non-definitive REVIEW playback/preview routes. |
| I | PRODUCTION | Quality-gated Guitar TAB and violin product integration. |
| J | PRODUCTION | Presentation-only discovery and direct source actions. |
| K | PRODUCTION | Compact local tuner presentation with explicit user action. |
| L | PRODUCTION / BOUNDED READINESS | Exact revision, recipient metadata and readiness result; no delivery. |

## S12 real-mobile acceptance boundary

S12 is production evidence for the responsive score-workspace interaction bridge:
touch/pointer/click events use the renderer's exact hit-test result and preserve
the S06 canonical-selection and S07 verified-revision gates. It adds no musical
guessing or alternative identity path.

The exact-main CI for `d480758` passed. A physical iPhone/Safari acceptance run,
including tap selection, visible highlight, edit-save-rerender and undo, is still
**PENDING**; browser automation and narrow viewport proof do not replace it.

## Package 12 boundary

Package 12 deliberately separates:

- teacher approval;
- exact revision identity;
- post-correction revalidation;
- share eligibility;
- share authorization/readiness;
- actual student delivery.

```text
teacherApproved does not imply studentDelivered
shareEligible does not imply authenticated access
READY_EXACT_REVISION does not imply network delivery
```

Stage L uses T1/T2/T3/T4 contracts and returns bounded readiness. It does not create accounts, persistent identity, server-side authorization, tokens, URLs, payloads, portal access or network delivery.

## Package 8B research boundary

Package 8B remains research-only. Current production must not claim that engineering fixtures are genuine training data. The current evidence population is 2,714 mapped experimental samples, 0 exact research approvals, 0 admitted real samples, 0 trainable real samples, 0 serializer-ready real samples, no real samples.zip acceptance receipt, no training run and no production model change.

## Status vocabulary

Use `PRODUCTION`, `BOUNDED`, `OUT_OF_SCOPE` and `BLOCKED_BY_CONTRACT` for current documentation. Use historical closure documents only as dated evidence of prior work; do not copy their earlier “partial”, “pending merge” or “open PR” status into current architecture claims.

## Verification reference

The required CI workflow runs dependency installation, the full test suite, production build and `scripts/verifyScoreRuntimeBrowser.js`. The fresh-read local baseline passed the focused S12 test (9/9) and the production build. Local browser proof was UNVERIFIED because Chrome/Chromium was unavailable. Exact-main CI run #494 for `d480758` was successful.

See `docs/teacher-score-editor-architecture.md` for the canonical architecture and complete Stage A–L matrix.
