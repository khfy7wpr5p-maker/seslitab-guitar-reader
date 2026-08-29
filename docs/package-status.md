# SesliTab Package Status

Last documentation review: 2026-08-29  
Latest verified protected-main implementation baseline: `160c3bcadfc634f7b1300627993e89ebda764576`  
Latest exact-main implementation CI: **#326 / run `33258600115`, job `99116529789` — SUCCESS**

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
| 10 — Advanced violin | **Completed** | PR #124 → protected main `590abcaa…` → exact-main CI #324; bounded first/second/third-position alternatives, double stops, simultaneous voices/staves, sustain locks and tie continuity. |
| 11 — Accessible chromatic tuner | **Completed** | PR #125 → protected main `160c3bca…` → exact-main CI #326; browser-local 12-note chromatic tuner with A4 calibration, Hz/cents guidance, accessible live status and local-only microphone processing. |
| 12 — Teacher-to-student sharing | Not started | Exact-approved-revision sharing/authorization remains the next application package. |
| 13 — Simplified rhythm mode | Not started | Separate simplified rhythm-training mode planned. |
| 14 — Mobile productisation | Partially implemented | Responsive web exists; device accessibility/privacy/productisation closure remains. |

## Package 10 verified result

Package 10 extends the exact-array Package 2D `VIOLIN` quality-gated production path beyond the conservative Package 5 projection. It supports one violin part with generated first/second/third-position alternatives, string crossings, two-note double stops, simultaneous voices/staves, sustained-string occupancy and exact tie continuity.

Generated output remains explicit evidence only (`generated-advanced`, `teacherApproved: false`, `sourceFingeringClaimed: false`). More than two simultaneous pitched notes, multiple score parts, malformed physical timing/identity, impossible string assignments, unsupported pitch range, malformed ties or solver-limit exhaustion fail closed with zero partial violin output.

Verified implementation evidence:

- implementation PR **#124** merged to protected `main`;
- protected-main implementation SHA `590abcaa523c9fc83dbf0f0483586a9fdf0d984c`;
- exact-main CI **#324 — SUCCESS**;
- **1340 / 1340 tests PASS**, 232 suites, 0 failed/skipped/cancelled;
- **0 vulnerabilities**;
- production build **PASS**;
- real Chrome score render + cursor runtime proof **PASS**.

## Package 11 verified result

Package 11 adds an instrument-agnostic, browser-local chromatic tuner independent of PDF/OMR processing. It detects all 12 equal-tempered pitch classes from microphone time-domain samples with a bounded YIN-style detector, RMS noise gate, confidence gate, parabolic lag interpolation and stable same-note smoothing.

Current verified tuner behavior:

- all 12 chromatic note classes with Turkish enharmonic naming;
- live note + octave, frequency and signed cent deviation;
- explicit `Pes / Çok yakın / Akortta / Tiz` correction guidance;
- ±2 cent in-tune and ±5 cent near thresholds;
- A4 calibration from **415.0 through 466.2 Hz**, default 440 Hz;
- bounded live range **40–2000 Hz**;
- responsive low-vision UI, native controls, visible keyboard focus and throttled screen-reader announcements;
- microphone audio remains local and is never uploaded, persisted or recorded by SesliTab;
- microphone tracks close on Stop, page exit and setup failure.

Verified implementation evidence:

- implementation PR **#125** merged to protected `main`;
- protected-main implementation SHA `160c3bcadfc634f7b1300627993e89ebda764576`;
- exact-head CI **#325 — SUCCESS**;
- exact-main CI **#326 / run `33258600115`, job `99116529789` — SUCCESS**;
- **1352 / 1352 tests PASS**, 232 suites, 0 failed/skipped/cancelled;
- **0 vulnerabilities**;
- production build **PASS**;
- real Chrome score render + cursor runtime proof **PASS**.

Packages 10 and 11 did not change Audiveris/provider/runtime, OMR Gateway/worker, backend production OMR path, `Dockerfile`, `render.yaml`, Render wiring, Package 8B training/model code, or production model selection.

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

## Next application package

**Package 12 — Teacher-to-student sharing** is next.

The sharing layer must bind to an exact Package 8 approved revision and must not treat teacher approval itself as share authorization. Stale revisions, later corrections, revoked/invalid evidence or missing explicit share eligibility must fail closed. Recipient/authentication identity must not be invented by domain code.

## Status vocabulary

Use only: **Completed**, **Partially implemented**, **Not started**, **Not verified**.
