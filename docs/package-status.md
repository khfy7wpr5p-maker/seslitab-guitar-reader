# SesliTab Package Status

**Documentation review:** 2026-09-02
**Protected main reference:** `a21c1533b919554dd00d0f9852ab865b52e8f475`
**Required check:** `test-and-build`
**Editor/renderer integration:** STI-00–16 complete, **17/19** total; STI-17 physical iPhone Safari pending.

This page describes the current production package boundaries. Historical closure documents retain the evidence and status that were true when they were written; they are not substitutes for this current status page.

## Package table

| Package | Status | Current production boundary |
|---|---|---|
| 0–7 | PRODUCTION | Core intake, canonical music, validation and bounded consumers remain in production. |
| 8 — Teacher correction and approval | PRODUCTION | Immutable product revision lineage, exact approval/stale-edit protections, Editor Core-backed SMuFL keypad commits, revalidation, rerender and immutable undo/redo. |
| 8B — Audiveris research/training | PRODUCTION / RESEARCH-ONLY | Engineering gates exist; no real admitted/trainable corpus, training run or production-model replacement is claimed. |
| 9 — Advanced Guitar TAB | PRODUCTION | Current-revision quality-gated canonical Guitar TAB consumer; unsupported input fails closed. |
| 10 — Advanced violin | PRODUCTION | Current-revision quality-gated canonical violin consumer; unsupported input fails closed. |
| 11 — Accessible chromatic tuner | PRODUCTION | Compact browser-local tuner with explicit microphone Start/Stop. |
| 12 — Teacher-to-student sharing | PRODUCTION / BOUNDED READINESS | T1–T4 exact-revision authorization, eligibility and corrected revalidation contracts are present; Stage L exposes readiness only. |
| 13 — Simplified rhythm mode | OUT_OF_SCOPE | No current production implementation. |
| 14 — Native/mobile productisation | OUT_OF_SCOPE | Responsive mobile-web foundations exist; native/device-level productisation is not claimed. |

## Editor / renderer integration status

Program `SESLITAB-EDITOR-INTEGRATION-01` is integrated through STI-16 on production `main`.

| Range | Status | Production boundary |
|---|---|---|
| STI-00–03 | COMPLETE | Exact runtime/authority baseline and dependency admission. |
| STI-04–07 | COMPLETE | Exact renderer hit → canonical/Editor selection bridge with stale evidence rejection. |
| STI-08–09 | COMPLETE | Pinned SMuFL keypad assets and basic Editor Core actions. |
| STI-10–12 | COMPLETE | Explicit advanced targets, atomic Editor→product pipeline and immutable undo/redo reconciliation. |
| STI-13–15 | COMPLETE | Quality/direct-tap coexistence, current-revision routing and current-edited-score renderer recovery. |
| STI-16 | COMPLETE | Accessibility/mobile hardening plus exact Chrome device-metrics stress gate. |
| STI-17 | PENDING_HUMAN_DEVICE_GATE | Physical iPhone Safari production validation; issue #191. |
| STI-18 | PREPARED / PENDING FINAL CLOSURE | Documentation/runtime manifest sync may proceed, but final acceptance wording waits for STI-17. |

Machine-readable snapshot: `docs/sti-18-runtime-integration-manifest.json`.

## Runtime pins and authority

Production build consumes:

- ST Score Rendering Layer `a8961e0e68a950cbe980162e23c09f23f0ce5d0a`, contract `0.2.0`, OSMD `2.1.2`;
- ST Score Editor Core `2e6b975b4b6b8b558593ca43132309848dc3ccab`, browser/runtime `1.0.0`.

Authority remains separated:

- ST Score Editor Core: new keypad score/notation mutation authority;
- SesliTab Package 8: immutable product revision/audit authority;
- Rendering Layer: presentation/lifecycle/exact hit-test only;
- no dual-write;
- no nearest-note, pitch, DOM/SVG or geometry fallback for semantic identity.

Advanced tie/slur targets require explicit note pairs. Triplet requires an explicit three-event range with canonical timing evidence. Canonical retiming-dependent triplet removal/transformation remains unsupported and fail-closed.

## Stage A–L UI/product chain

| Stage | Current status | Boundary |
|---|---|---|
| A | PRODUCTION | Teacher-centered shell and accessible presentation simplification. |
| B | PRODUCTION | Score runtime lifecycle, loading/error boundaries and browser proof contract. |
| C | PRODUCTION | Exact current note selection, hit-test and highlight; renderer remains presentation-only. |
| D | PRODUCTION | Quality evidence overlay using the shared exact selection model. |
| E | PRODUCTION / BOUNDED | Editor Core SMuFL keypad for exact current selection; unsupported or ambiguous edits fail closed. |
| F | PRODUCTION / BOUNDED | One Editor commit → MusicXML materialization → revalidation → immutable Package 8 revision → rerender/rebind; immutable undo/redo. |
| G | PRODUCTION | Current-revision PASS/REVIEW/BLOCK routing with fail-closed defaults. |
| H | PRODUCTION / BOUNDED | Playback follows its own bounded policy and is independent of renderer/editor readiness. |
| I | PRODUCTION | Current-revision quality-gated Guitar TAB and violin product integration. |
| J | PRODUCTION | Presentation-only discovery and direct source actions. |
| K | PRODUCTION | Compact local tuner presentation with explicit user action. |
| L | PRODUCTION / BOUNDED READINESS | Exact revision, recipient metadata and readiness result; no delivery. |

## Physical mobile acceptance boundary

Automated supporting evidence now covers exact Chrome device-metrics viewports `320x568`, `568x320` and `1280x900`, minimum 44px covered keypad targets, focus retention and eight repeated exact selection/edit/revalidation/rerender/undo cycles.

That evidence does **not** replace the physical iPhone/Safari gate. STI-17 remains **PENDING** until the production flow is exercised on a real iPhone in Safari, including PDF and MusicXML intake, direct note selection, keypad edit, rerender/rebind, undo, routing/playback/recovery and mobile/accessibility sanity. The authoritative tracking record is issue #191.

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

Package 8B remains research-only. Current production must not claim that engineering fixtures are genuine training data. No admitted real training corpus, executed production training run or production model replacement is claimed by this status page.

## Status vocabulary

Use `PRODUCTION`, `BOUNDED`, `OUT_OF_SCOPE` and `BLOCKED_BY_CONTRACT` for current documentation. For the integration acceptance program also use `PENDING_HUMAN_DEVICE_GATE` when the physical-device gate has not been executed. Historical closure documents are dated evidence and must not override current production status.

## Verification reference

Protected production `main` `a21c1533b919554dd00d0f9852ab865b52e8f475` passed post-merge CI run #527. Required `test-and-build` covered the full Node test suite, production build, score runtime browser proof, PR-C keypad proof, PR-D Editor→product pipeline proof, PR-E quality/routing/recovery proof and PR-F accessibility/mobile regression proof.

Live Render production was observed on exact commit `a21c1533b919554dd00d0f9852ab865b52e8f475` at `https://seslitab-app.onrender.com`.

See `docs/current-status.md`, `docs/teacher-score-editor-architecture.md` and `docs/sti-18-runtime-integration-manifest.json` for current architecture and integration evidence.
