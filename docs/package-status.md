# SesliTab Package Status

Last documentation review: 2026-08-29  
Latest verified protected-main implementation baseline: `f01e67d6488cedf192333d6ba2c528330841d5d8`  
Latest exact-main implementation CI: **#319 / run `33256393182`, job `99110780497` — SUCCESS**

A package/substage is **Completed** only after bounded acceptance criteria, focused tests, full regression suite, production build, protected-main merge and exact-main workflow evidence are satisfied.

## Package table

| Package | Status | Current evidence or limitation |
|---|---|---|
| 0–7 | Completed | Existing verified product foundations remain intact. |
| 8 — Teacher correction and approval | **Completed** | T1–T6 verified, merged and docs closed. |
| 8B — Audiveris training dataset | **Partially implemented** | T1–T6 engineering path completed; 2,714 experimental mappings exist, but exact T4 approvals, admitted samples, T1/T2 trainable samples and real T5 serializer-ready samples remain 0. Research/data work is deferred and no longer blocks the application roadmap. |
| 8B-T1 — Verified dataset contract | **Completed** | PR #104; exact training-evidence contract. |
| 8B-T2 — Verified evidence intake/readiness | **Completed** | PR #106; exact byte/path/hash verification. |
| 8B-T3 — MUSCIMA accidental mapping | **Completed** | PR #113; 2,714 bounded experimental mappings. |
| 8B-T4 — Research-only training admission | **Completed** | PR #115; non-commercial exact per-sample admission gate. |
| 8B-T5 — Isolated native sample staging harness | **Completed** | PR #118; exact approval + mask/interline gate to serializer-ready staging. |
| 8B-T6 — Pinned native serializer + acceptance gate | **Completed** | PR #120; deterministic Audiveris-native ZIP contract and exact pinned `SampleRepository` receipt binding. |
| 9 — Advanced Guitar TAB | **Completed** | PR #122 → protected main `f01e67d…` → exact-main CI #319; quality-gated chords, simultaneous voices, sustained polyphony, tie continuity and bounded deterministic string assignment. |
| 10 — Advanced violin | Not started | Next active application package: generated advanced alternatives/double stops with fail-closed physical and quality gates. |
| 11 — Accessible tuner | Not started | Microphone pitch/accessibility package absent. |
| 12 — Teacher-to-student sharing | Not started | Exact-approved-revision sharing/authorization not implemented. |
| 13 — Simplified rhythm mode | Not started | Separate simplified rhythm-training mode planned. |
| 14 — Mobile productisation | Partially implemented | Responsive web exists; device accessibility/privacy/productisation closure remains. |

## Package 9 verified result

Package 9 extends the exact-array Package 2D `GUITAR_TAB` quality-gated production path beyond the conservative Package 4 projection. It supports one guitar part with chords, independent simultaneous events, multiple voices/staves, sustained polyphony and tie continuity while assigning distinct guitar strings with a bounded deterministic solver.

The policy remains explicitly generated evidence (`seslitab-advanced-guitar-v1`, provenance `generated-advanced`), never source fingering, teacher approval or pedagogical optimum. More than six simultaneous pitched notes, multiple score parts, invalid timing/identity, impossible string assignments, malformed ties and solver-limit exhaustion fail closed with zero partial TAB.

Verified implementation evidence:

- implementation PR **#122** merged to protected `main`;
- protected-main implementation SHA `f01e67d6488cedf192333d6ba2c528330841d5d8`;
- exact-main CI **#319 / run `33256393182`, job `99110780497` — SUCCESS**;
- **1326 / 1326 tests PASS**, 232 suites, 0 failed/skipped/cancelled;
- **0 vulnerabilities**;
- production build **PASS**;
- real Chrome score render + cursor runtime proof **PASS**.

Package 9 did not change Audiveris/provider/runtime, OMR Gateway/worker, backend production OMR path, `Dockerfile`, `render.yaml`, Render wiring, Package 8B training/model code, or production model selection.

## Package 8B deferred research state

Current genuine state remains:

```text
mapped experimental samples:             2,714
T4 exact approvals:                          0
T4 admitted samples:                         0
T1/T2 trainable samples:                     0
T5 serializer-ready real samples:            0
real samples.zip built:                      NO
real pinned-Audiveris acceptance receipt:    NO
Audiveris training executed:                 NO
production model changed:                    NO
```

Do not invent missing glyph/native/approval evidence. Package 8B remains separate research work and may resume when genuine evidence is available; it no longer blocks Packages 10–14 under the user-approved roadmap change.

## Status vocabulary

Use only: **Completed**, **Partially implemented**, **Not started**, **Not verified**.