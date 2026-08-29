# SesliTab Package Status

Last documentation review: 2026-08-29  
Latest verified protected-main implementation baseline: `fe940cd0b633055845e06504eeeb4287aed3f4d1`  
Latest exact-main implementation CI: **#343 / run `33262154615`, job `99125825785` — SUCCESS**

A package/substage is **Completed** only after bounded acceptance criteria, focused tests, full regression suite, production build, protected-main merge and exact-main workflow evidence are satisfied.

## Package table

| Package | Status | Current evidence or limitation |
|---|---|---|
| 0–7 | Completed | Existing verified product foundations remain intact. |
| 8 — Teacher correction and approval | **Completed** | T1–T6 verified, merged and docs closed. |
| 8B — Audiveris training dataset | **Partially implemented** | T1–T6 engineering path completed; 2,714 experimental mappings exist, but exact T4 approvals, admitted samples, T1/T2 trainable samples and real T5 serializer-ready samples remain 0. Research/data work is deferred and does not block the application roadmap. |
| 8B-T1 — Verified dataset contract | **Completed** | PR #104; exact training-evidence contract. |
| 8B-T2 — Verified evidence intake/readiness | **Completed** | PR #106; exact byte/path/hash verification. |
| 8B-T3 — MUSCIMA accidental mapping | **Completed** | PR #113; 2,714 bounded experimental mappings. |
| 8B-T4 — Research-only training admission | **Completed** | PR #115; non-commercial exact per-sample admission gate. |
| 8B-T5 — Isolated native sample staging harness | **Completed** | PR #118; exact approval + mask/interline gate to serializer-ready staging. |
| 8B-T6 — Pinned native serializer + acceptance gate | **Completed** | PR #120; deterministic Audiveris-native ZIP contract and exact pinned `SampleRepository` receipt binding. |
| 9 — Advanced Guitar TAB | **Completed** | PR #122 → protected main `f01e67d…` → exact-main CI #319; quality-gated chords, simultaneous voices, sustained polyphony, tie continuity and bounded deterministic string assignment. |
| 10 — Advanced violin | **Completed** | PR #124 → protected main `590abcaa…` → exact-main CI #324; bounded first/second/third-position alternatives, double stops, simultaneous voices/staves, sustain locks and tie continuity. |
| 11 — Accessible chromatic tuner | **Completed** | PR #125 → protected main `160c3bca…` → exact-main CI #326; browser-local 12-note chromatic tuner with A4 calibration, Hz/cents guidance, accessible live status and local-only microphone processing. |
| 12 — Teacher-to-student sharing | **Partially implemented** | T1–T3 are Completed. Exact authorization, automatic-source safety/quality eligibility and bounded teacher-corrected pitch/position revalidation exist. Broader structural/rhythmic revalidation, authenticated recipient access, persistence and network delivery remain later stages. |
| 12-T1 — Exact share authorization | **Completed** | PR #127; immutable exact revision/approval/recipient authorization + revocation, stale/replay/cross-source fail-closed behavior, no payload delivery. |
| 12-T2 — Exact-revision safety/quality eligibility | **Completed** | PR #129; exact source-array → immutable revision fingerprint/lineage binding, Package 7C/2C/2D evidence re-check, stale source/report/revocation fail-closed behavior, no payload delivery. |
| 12-T3 — Bounded corrected-revision revalidation | **Completed** | PR #133 → protected main `fe940cd…` → exact-main CI #343; live root T2 replay + exact correction-history provenance + bounded pitch/fret mechanical revalidation. Rhythm/voice/tie/string/undo edits remain fail-closed. |
| 12-T4 — Structural/rhythmic corrected-revision revalidation | Not started | Next safe stage; must cover duration/rhythm, voice/staff, tie/string identity and undo histories without inheriting stale automatic-source evidence. |
| 13 — Simplified rhythm mode | Not started | Separate simplified rhythm-training mode planned. |
| 14 — Mobile productisation | Partially implemented | Responsive web exists; device accessibility/privacy/productisation closure remains. |

## Package 12-T1 verified result

Package 12-T1 introduces an explicit sharing authorization boundary separate from teacher approval. A share authorization is valid only for one exact immutable Package 8 revision, one exact approval record and one caller-supplied recipient identity. Later correction, identical-content replay with different lineage, cross-source reuse, another approval record or another recipient cannot inherit authorization. Exact revocation fails closed.

Verified implementation evidence:

- implementation PR **#127** merged to protected `main`;
- protected-main implementation SHA `8bb797ac8c8f01697669e875ecc6d7df13ea878f`;
- exact-main CI **#330 / run `33259462116`, job `99118792913` — SUCCESS**;
- **1369 / 1369 tests PASS**, 233 suites, 0 vulnerabilities, build PASS, Chrome proof PASS.

## Package 12-T2 verified result

Package 12-T2 adds safety/quality eligibility after T1 authorization. Package 8 revision snapshots remain immutable clones while Package 7C and Package 2D retain exact `NoteObject[]` identity semantics. T2 therefore requires the exact source array and deterministically verifies that it reproduces the automatic revision content and lineage fingerprints before consuming source or quality evidence.

Eligibility requires current Package 7C provenance, a strict frozen accepted Package 2C report and Package 2D TTS/playback acceptance. Source-array mutation, missing/replaced source, removed/downgraded reports, stale authorization, recipient mismatch and revocation fail closed. Teacher-corrected revisions remain outside T2.

Verified implementation evidence:

- implementation PR **#129** merged to protected `main`;
- protected-main implementation SHA `a5c2c2b9bd1a59898a74312270dc09766c6bad2e`;
- implementation-branch CI **#337 — SUCCESS**;
- exact-main CI **#338 / run `33260876272`, job `99122486469` — SUCCESS**;
- **1390 / 1390 tests PASS**, 234 suites, 0 vulnerabilities, build PASS, Chrome proof PASS.

## Package 12-T3 verified result

Package 12-T3 introduces separate `teacher_corrected_revalidated` provenance for a deliberately bounded class of teacher edits. It does not register old raw MusicXML against corrected notes and does not accept inherited `sourceVerificationState` as proof of the new edited value.

The T3 evidence is bound to the exact Package 8 history, automatic root fingerprints, target corrected revision, live automatic-root T2 quality evidence, correction event/operation counts, corrected target set and deterministic correction-chain/revalidation fingerprints.

T3 v1 permits only `step`, `alter`, `octave`, `noteName`, `midi`, `frequency` and `fret` corrections. The final written pitch/MIDI/frequency/note-name state must pass the canonical pitch resolver. When existing guitar position evidence is present, the final string/fret must remain a genuine Package 4A candidate. Pitch-identity edits also receive conservative tie-topology validation.

Duration/rhythm, voice/staff, tie-state, string-identity and undo correction chains fail closed and remain for T4. T3 exposes eligibility metadata only; it creates no student payload/link/token and adds no authentication, persistence or network behavior.

Verified implementation evidence:

- issue **#131** defined the bounded T3 scope;
- implementation PR **#133** merged to protected `main`;
- final implementation PR head SHA `762deb461ae2284efbeec148a2872f3866bfcdaa`;
- protected-main implementation SHA `fe940cd0b633055845e06504eeeb4287aed3f4d1`;
- implementation-branch CI **#342 / run `33262049864`, job `99125548995` — SUCCESS**;
- exact-main CI **#343 / run `33262154615`, job `99125825785` — SUCCESS**;
- **1406 / 1406 tests PASS**, **235 suites**, 0 failed/skipped/cancelled;
- **0 vulnerabilities**;
- production build **PASS**;
- real Chrome score render + cursor runtime proof **PASS**.

Packages 10, 11 and Package 12 T1–T3 did not change Audiveris/provider/runtime, OMR Gateway/worker, backend production OMR path, `Dockerfile`, `render.yaml`, Render wiring, Package 8B training/model code, or production model selection.

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

Do not invent missing glyph/native/approval evidence. Package 8B remains separate research work and may resume when genuine evidence is available.

## Next application substage

**Package 12-T4 — Structural/Rhythmic Post-Correction Revalidation** is next.

T4 must safely revalidate correction classes excluded from T3: duration/rhythm fields, `durationValue`, `beats`, dots, voice/staff identity, tie semantics, string-identity changes and undo-created histories. It must recompute or explicitly establish corrected structural/timing truth instead of copying automatic-source verification.

Authenticated recipient access, persistence and actual network delivery remain later reviewed stages. Domain code must not invent identity or silently widen authorization.

## Status vocabulary

Use only: **Completed**, **Partially implemented**, **Not started**, **Not verified**.
