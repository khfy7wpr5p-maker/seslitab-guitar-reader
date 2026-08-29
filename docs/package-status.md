# SesliTab Package Status

Last documentation review: 2026-08-29  
Latest verified protected-main implementation baseline: `8bb797ac8c8f01697669e875ecc6d7df13ea878f`  
Latest exact-main implementation CI: **#330 / run `33259462116`, job `99118792913` — SUCCESS**

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
| 12 — Teacher-to-student sharing | **Partially implemented** | T1 completed in PR #127 → protected main `8bb797ac…` → exact-main CI #330. Exact revision + exact approval + exact recipient authorization and revocation are implemented; final safety/quality eligibility, authenticated recipient access, persistence and network delivery are not yet implemented. |
| 12-T1 — Exact share authorization | **Completed** | PR #127; immutable exact revision/approval/recipient authorization + revocation, stale/replay/cross-source fail-closed behavior, no payload delivery. |
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

## Package 12-T1 verified result

Package 12-T1 introduces an explicit sharing authorization boundary separate from teacher approval. A share authorization is valid only for one exact immutable Package 8 revision, one exact approval record and one caller-supplied recipient identity. Later correction, identical-content replay with different lineage, cross-source reuse, another approval record or another recipient cannot inherit the authorization.

T1 also adds immutable exact revocation evidence. Exact revocation returns `REVOKED`; mismatched revocation evidence fails closed rather than falling through to an authorized state.

Verified implementation evidence:

- implementation PR **#127** merged to protected `main`;
- final PR head SHA `10c877ade4ced2a80b6dc102afd2285e114e6672`;
- protected-main implementation SHA `8bb797ac8c8f01697669e875ecc6d7df13ea878f`;
- exact-main CI **#330 / run `33259462116`, job `99118792913` — SUCCESS**;
- **1369 / 1369 tests PASS**, 233 suites, 0 failed/skipped/cancelled;
- **0 vulnerabilities**;
- production build **PASS**;
- real Chrome score render + cursor runtime proof **PASS**.

T1 does **not** expose revision content, create public links/tokens/invite codes, authenticate users, persist grants, add backend endpoints, send network requests, bypass quality evidence, or change OMR/Audiveris/Render/Docker/model configuration.

Packages 10, 11 and 12-T1 did not change Audiveris/provider/runtime, OMR Gateway/worker, backend production OMR path, `Dockerfile`, `render.yaml`, Render wiring, Package 8B training/model code, or production model selection.

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

Do not invent missing glyph/native/approval evidence. Package 8B remains separate research work and may resume when genuine evidence is available; it no longer blocks Packages 10–14 under the approved roadmap.

## Next application substage

**Package 12-T2 — Exact-revision safety/quality eligibility** is next.

T2 must decide whether the exact revision already bound by T1 is eligible to leave the teacher boundary. `AUTHORIZED_EXACT_BINDING` alone must never mean `safeToShare`. Missing/stale quality evidence, a different exact revision, non-applicable approval, recipient mismatch or revocation must fail closed with zero student payload bytes.

Authenticated recipient access, persistence and actual network delivery remain later reviewed stages. Domain code must not invent identity or silently widen authorization.

## Status vocabulary

Use only: **Completed**, **Partially implemented**, **Not started**, **Not verified**.
