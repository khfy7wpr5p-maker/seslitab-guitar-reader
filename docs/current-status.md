# SesliTab Current Status

Last documentation review: 2026-08-29  
Latest verified protected `main` implementation baseline: `f01e67d6488cedf192333d6ba2c528330841d5d8`  
Latest exact-main implementation CI: **#319 / run `33256393182`, job `99110780497` — SUCCESS**  
Current package state: **Package 0–9 Completed. Package 8B remains Partially implemented as deferred research; Package 10 is next.**

## Verified baseline

Exact-main CI #319 checked out protected-main SHA `f01e67d6488cedf192333d6ba2c528330841d5d8` and verified:

- **1326 / 1326 tests PASS**;
- **232 suites**;
- **0 failed / skipped / cancelled**;
- **0 vulnerabilities**;
- Vite production build **PASS**;
- real-browser score render + cursor runtime proof **PASS** using Google Chrome.

`main` remains protected and requires `test-and-build`.

## Package 9 — Advanced Guitar TAB

Status: **Completed.**

Package 9 extends the existing quality-gated Guitar TAB flow for one guitar part. It supports MusicXML chord continuations, simultaneous independent pitched events, multiple voices/staves, sustained polyphony and tie continuity. A bounded deterministic solver assigns distinct available guitar strings, preserving still-sounding strings and exact tie positions.

The output remains generated evidence only:

```text
policyId: seslitab-advanced-guitar-v1
provenance: generated-advanced
sourceFingeringClaimed: false
```

The solver does not claim teacher approval or pedagogical optimum. More than six simultaneous pitched notes, multiple score parts, invalid physical identity/timing, dangling/mismatched ties, impossible assignments or search-limit exhaustion fail closed with zero partial TAB.

### Package 9 evidence

- implementation PR **#122** merged;
- protected-main implementation SHA `f01e67d6488cedf192333d6ba2c528330841d5d8`;
- exact-main CI **#319 / run `33256393182`, job `99110780497` — SUCCESS**;
- **1326/1326 tests**, 232 suites, 0 vulnerabilities, production build PASS, Chrome browser proof PASS.

Detailed contract: `docs/package-9-advanced-guitar-tab.md`.

## Package 8B — deferred research state

Package 8B remains **Partially implemented**, but the user explicitly changed the roadmap so missing research evidence no longer blocks application packages.

Current genuine research state:

- T1/T2 admitted real trainable samples: **0**;
- T3 bounded accidental mappings: **2,714** from 100 matched pages;
- T4 exact research approvals / admitted samples: **0 / 0**;
- T5 real native serializer-ready samples: **0**;
- real-data `samples.zip` built: **NO**;
- real-data pinned-Audiveris acceptance receipt: **NO**;
- Audiveris training executed: **NO**;
- production model changed: **NO**.

T1–T6 engineering gates remain intact. Do not fabricate sample approval, native mask/interline evidence, acceptance receipts or training results. Research may resume when genuine evidence exists.

## Next application boundary

**Package 10 — Advanced violin** is the next active package.

The safe scope is to extend the existing exact-array Package 2D `VIOLIN` quality-gated path with bounded generated advanced physical/fingering alternatives and double-stop/simultaneous-note handling. It must preserve exact canonical note references, fail closed for unsupported/impossible structures, and must not represent generated choices as source or teacher-approved fingering.

## Protected OMR and deployment boundary

Package 10 and later application work must not silently change production Audiveris provider/runtime/preflight, OMR worker/provider selection, Cloud OMR Gateway, backend production OMR path, `Dockerfile`, `render.yaml`, current Render service/deployment connection, or production model selection/replacement.