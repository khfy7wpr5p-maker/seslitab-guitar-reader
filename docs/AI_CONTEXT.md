# SesliTab AI Context

**Context review:** 2026-08-29  
**Fresh-read protected main:** `2a6fa9c981b85861895692df99887d46e768822e`  
**Current application state:** Packages 0–11 Completed; Package 12 Partially implemented with T1–T3 merged; T4 is a separate open PR #138.  
**Current UI work:** Stage A teacher/product-shell simplification on a dedicated branch; not yet protected-main truth until its PR is green and merged.

## 1. Official project purpose

SesliTab is an inclusive, teacher-supervised and semi-automatic music-education system for blind, low-vision and sighted students. Unverified musical, source or training evidence must never be presented as definitively correct.

The product goal is not merely PDF → MusicXML conversion. The goal is safe, accessible learning output without presenting uncertain pitch, rhythm, string/fret or provenance as fact.

## 2. Sources of truth

Product/safety truth:

- `docs/project-charter.md`
- `docs/product-architecture.md`
- `docs/teacher-score-editor-architecture.md`
- approved bounded package/stage instructions

Implementation truth:

- fresh repository state;
- source code;
- tests/fresh CI;
- `docs/current-status.md`;
- `docs/package-status.md`;
- package closure documents.

If documentation conflicts with fresh code/repository evidence, report the conflict and update documentation rather than guessing.

## 3. Required development procedure

Before every implementation stage:

1. fresh read-only repository inspection;
2. verify protected-main SHA, protection/rules, open PR/issues and current CI;
3. confirm exact bounded stage/package and prerequisites;
4. check for duplicate/overlapping open PRs;
5. define allowed files and protected boundaries;
6. define focused tests, full regression, production build and browser/accessibility proof where applicable;
7. use a dedicated branch; never direct-commit to main;
8. do not add dependencies/framework changes unless separately approved;
9. resolve CI/review failures before calling a stage complete;
10. do not advance documentation status beyond real merged/tested evidence.

A separate open domain/security PR must not be silently folded into unrelated UI work.

## 4. Current roadmap position

- Packages 0–7: **Completed**
- Package 8 — teacher correction/versioning/approval: **Completed**
- Package 8B — Audiveris research/training evidence: **Partially implemented / deferred research**
- Package 9 — Advanced Guitar TAB: **Completed**
- Package 10 — Advanced Violin: **Completed**
- Package 11 — Accessible Chromatic Tuner: **Completed**
- Package 12 — Teacher-to-student sharing: **Partially implemented**
  - T1 exact share authorization: **Completed**
  - T2 exact-revision quality/provenance eligibility: **Completed**
  - T3 bounded corrected-revision revalidation: **Completed**
  - T4 structural/rhythmic corrected-revision revalidation: **open PR #138; not merged**
  - authentication/persistence/network delivery: **not complete product capabilities**
- Package 13 — Simplified rhythm mode: **Not started**
- Package 14 — Mobile productisation: **Partially implemented**

The old Package 8B-era statement that Packages 9–12 were not started is obsolete and must not be reused.

## 5. Latest verified baseline evidence

Fresh-read current protected main is `2a6fa9c981b85861895692df99887d46e768822e`.

The current merge commit does not expose a separate exact-main workflow run in the Actions query used for the 2026-08-29 review. The latest verified code-equivalent CI is PR #140 head `2c684b7ffb1bdb4cef9e8f5b0de408800cce0534`, whose merge produced the current main.

Verified PR #140 CI:

- 1411 / 1411 tests PASS;
- 235 suites;
- 0 failed/skipped/cancelled/todo;
- npm ci PASS;
- 0 vulnerabilities;
- Vite production build PASS;
- pinned score runtime preparation PASS;
- real Chrome score-render + measure-cursor proof PASS.

Do not call this a distinct exact-main workflow run.

## 6. Product decision — Auto-Pass / Review / Block

Official decision:

**Teacher approval is not universally mandatory.**

### PASS

A bounded consumer may proceed automatically only if its existing quality/provenance gate accepts the exact evidence required by that consumer.

User wording: **Otomatik kontrollerden geçti.**

PASS is not teacher approval and is not proof that OMR/MusicXML is visually identical to the original PDF.

### REVIEW

Teacher review/correction is required before definitive downstream use.

User wording: **Kontrol gerekiyor.**

### BLOCK

Definitive downstream output is prohibited.

User wording: **Bu eserde önce düzeltilmesi gereken yapısal bir sorun bulundu.**

Permanent invariant: `Auto-Pass != teacher-approved`.

This product decision does not silently widen Package 12 sharing authorization. A future Auto-Pass student-sharing route requires separate Package 12 review.

## 7. Musical authority invariants

1. UI is not musical semantic authority.
2. Renderer is not musical semantic authority.
3. Discovery is not verification authority.
4. OMR is untrusted automatic evidence.
5. Valid MusicXML is not proof of musical correctness.
6. Do not invent pitch, duration, onset, octave, voice, staff, tie, tuplet, measure or source evidence.
7. Canonical note/time data is shared across TTS, playback, MIDI, Guitar TAB, violin and score presentation.
8. Missing/unsupported semantic evidence fails closed.
9. Teacher approval cannot bypass structural BLOCK.

## 8. Package 8 invariants

1. Automatic source revision is immutable.
2. Correction creates a new immutable revision and never overwrites its parent.
3. Correction audit evidence is separate from approval.
4. Quality acceptance is not teacher approval.
5. Teacher approval binds to one exact current revision.
6. A later correction/undo does not inherit old approval automatically.
7. History is lossless; undo creates new lineage.
8. Stale teacher mutation conflicts with zero partial domain write.
9. Audit actor identity must not be silently invented by UI simplification.
10. Approval is not student-sharing authorization.

## 9. Stage A teacher/product UI boundary

Stage A is presentation-only and must not modify Package 8 domain semantics.

Target changes:

- primary product nav: **Çalışma Alanı / Nota Ara / Akort**;
- remove technical `Öğretmen`/`Sonuçlar` from primary shell navigation without deleting functionality;
- user actions: **Düzeltmeyi Kaydet / Eseri Onayla / Geri Al**;
- move raw revision JSON/history/IDs under **Detaylar**;
- simplify actor wording while preserving the explicit current audit requirement;
- basic mobile width/focus/44px control treatment;
- no framework/dependency/domain change.

`Eserlerim` must not be shown as available until a real library/persistence surface exists.

## 10. Score renderer status

Current verified SesliTab score integration provides:

- pinned ST Score Rendering Layer runtime;
- score rendering;
- canonical measure cursor synchronization;
- real-browser render/cursor proof.

Not yet verified/implemented as a complete contract:

- note hit-test;
- stable canonical/source note identity selection;
- note quality overlays;
- accessible note selection;
- final responsive/mobile score scaling.

Reported runtime errors such as `Invalid note initialization object: {}` must be reproduced and traced in Stage B. Never fabricate note values to hide renderer crashes.

Any cross-repository renderer contract change requires a fresh-read and explicit separate review.

## 11. Package 12 boundary

Current merged sharing contracts are deliberately metadata/gate focused. Do not claim complete authenticated student delivery, persistence or public share links unless fresh code proves them.

T1/T2/T3 must remain fail closed on stale/mismatched evidence. T4 is separate open PR #138 and cannot be treated as protected-main behavior before merge.

Stage A must not edit Package 12 domain code.

## 12. Discovery boundary

Discovery is implemented as a bounded source-finding surface.

```text
FOUND
!= SOURCE VERIFIED
!= MUSICALLY VERIFIED
!= TEACHER APPROVED
```

External sources must re-enter normal validation before musical trust. Prefer **Kaynak Sitesinde Aç** when safe import/viewing is unavailable; do not force external viewers into iframes.

## 13. Tuner boundary

Package 11 tuner uses browser-local microphone/Web Audio processing. Audio must not be uploaded/stored under the existing contract. Stage K may compact presentation but not change microphone privacy semantics.

## 14. Package 8B research invariants

Package 8B remains deferred research. Engineering gates do not prove real training or production-model improvement.

Pinned Audiveris research revision remains:

`7a36078e7ba0c006052c1f661b949cf9b729f505`

Current genuine state must not be overstated:

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

Do not invent glyph/native/approval/licence/training/performance evidence.

## 15. Protected integration boundaries

Unless separately authorized and reviewed, do not change:

- production Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway / backend production OMR path;
- `Dockerfile`;
- `render.yaml`;
- Render service/deployment connection;
- production model selection/replacement;
- framework;
- dependencies;
- database/auth provider;
- public API contracts;
- security policy.

## 16. Current safe UI stage sequence

```text
Stage A — teacher UI/product shell simplification
Stage B — score runtime stabilization + responsive scaling
Stage C — measure/note selection contract
Stage D — quality overlay
Stage E — bounded visual note editor
Stage F — undo + revalidation + rerender
Stage G — PASS/REVIEW/BLOCK product routing
Stage H — provisional REVIEW playback
Stage I — Guitar TAB + violin product integration
Stage J — Discovery presentation simplification
Stage K — compact tuner UI
Stage L — student/share UI only when Package 12 gates permit it
```

After each stage: focused tests, full regression, production build, applicable browser/accessibility checks, PR and CI evidence are required before advancement.
