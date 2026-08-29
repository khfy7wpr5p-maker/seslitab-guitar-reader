# SesliTab Teacher Score Editor Architecture

Tarih: 29 Ağustos 2026  
Durum: Stage A product/presentation architecture; implementation status is stated per capability.

## Status vocabulary

- **IMPLEMENTED** — current code and tests provide the stated bounded capability.
- **PARTIAL** — a safe subset exists, but the target product flow is incomplete.
- **PLANNED** — not implemented in the current product path.
- **BLOCKED** — implementation requires a separately reviewed boundary or prerequisite.

## 1. Product routing: Auto-Pass / Review / Block

Official product decision: **Teacher approval is not universally mandatory.**

- **PASS — PARTIAL:** existing quality/canonical consumer gates can authorize bounded definitive consumers only when their existing ACCEPT conditions are met. Product copy must say **“Otomatik kontrollerden geçti”**. PASS must never be labelled teacher-approved.
- **REVIEW — IMPLEMENTED at gate / PLANNED as complete product route:** current quality gates can require review. Product copy is **“Kontrol gerekiyor”**. The visual review/editor workflow is not yet complete.
- **BLOCK — IMPLEMENTED at gate / PARTIAL in product UI:** structurally unsafe/unreliable evidence remains blocked from definitive gated consumers. Product copy is **“Bu eserde önce düzeltilmesi gereken yapısal bir sorun bulundu.”**

`Auto-Pass != teacher-approved` is an invariant.

A quality-gate ACCEPT result does not prove that an OMR transcription is visually identical to the original source. No new source-verification claim may be inferred by presentation code.

## 2. Authority chain

**IMPLEMENTED as architectural boundary.**

Authority remains separated as follows:

Original PDF/source evidence
→ OMR output
→ MusicXML source evidence
→ parser/normalization
→ canonical note/time model
→ structural/quality evidence
→ bounded consumer gates
→ teacher correction/approval where required

Rules:

1. The renderer is presentation/interaction only.
2. OMR is not musical truth authority.
3. MusicXML validity is not proof of visual/source correctness.
4. Canonical data is the shared runtime music-data authority for current consumers; it cannot invent missing source facts.
5. Automatic source, corrected revisions and teacher approval remain distinct evidence.
6. A new correction cannot inherit an old approval.

## 3. Visual score editor

**PLANNED.**

Target interaction:

Open score
→ see rendered notation
→ select measure/note
→ edit a bounded supported field
→ save correction
→ revalidate
→ rerender
→ approve when product policy requires or the teacher chooses to approve

Current Stage A does **not** claim note-level visual editing. The existing Package 8 field editor remains the safe correction mechanism while the visual selection contract is developed.

## 4. Quality overlay

**PLANNED.**

Future score overlay may present:

- structural problem,
- review-required/suspect area,
- current selection,
- teacher-reviewed/approved area.

Color cannot be the only carrier of meaning. Every marker requires textual/screen-reader state. Overlay evidence must come from the quality/provenance layer; the renderer cannot create findings.

## 5. Correction lifecycle

**IMPLEMENTED in Package 8 domain; PARTIAL in product UI.**

Current revision
→ bounded teacher correction
→ new immutable corrected revision
→ later revalidation evidence
→ rerender when the visual-editor stage is implemented

The automatic source remains immutable. Stage A only simplifies presentation language and grouping; it does not change correction semantics.

## 6. Revalidation

**PARTIAL.**

- Existing automatic-source quality gating is implemented.
- Package 12-T3 provides bounded corrected-revision revalidation evidence for its supported correction class.
- Package 12-T4 structural/rhythmic corrected-revision revalidation is under separate review in open PR #138 and is not treated as merged here.
- General visual-editor correction revalidation is therefore not yet a completed product route.

Unsupported correction classes must fail closed.

## 7. Exact-revision approval

**IMPLEMENTED.**

The user-facing action is **“Eseri Onayla”** while the existing domain binding remains exact-revision approval. Approval is not a quality-gate override and is not student-sharing authorization.

A later correction makes the previous approval non-applicable.

## 8. Undo

**IMPLEMENTED in immutable history; PARTIAL in product UI.**

Undo creates new lineage and does not rewrite history or resurrect old approval. Stage A moves technical history controls into **Detaylar** and uses the user-facing label **“Geri Al”**. A final single-action previous-revision resolver remains planned for Stage F; ambiguous or unsafe undo must fail closed.

## 9. Preview playback

**PLANNED.**

REVIEW playback may later be offered only when structural evidence is safe enough for provisional playback. It must be labelled **“İnceleme İçin Dinle”** and **“Doğrulanmamış önizleme”**. BLOCK must not be bypassed.

## 10. Guitar TAB and violin downstream authority

**IMPLEMENTED as quality-gated consumers; product routing PARTIAL.**

Guitar TAB and violin consume the shared canonical authority and their existing quality gates. They must not become definitive from BLOCK evidence. Teacher approval cannot erase structural failures.

Stage G/I will map PASS/REVIEW/BLOCK product routing to these existing gates without creating a second musical truth.

## 11. Student sharing authority

**PARTIAL / BLOCKED for final delivery.**

Current Package 12 has bounded authorization/quality/revalidation contracts but no claim of complete authentication, persistence, public delivery or student account system.

Existing Package 12 gates must not be bypassed by Stage A. The new product policy allowing a future safe Auto-Pass sharing path requires a separately reviewed Package 12 contract change; it is **not implemented by this stage**.

Stale approval/authorization remains invalid.

## 12. Discovery boundary

**IMPLEMENTED.**

Discovery may find a source and allow safe external opening. It does not verify musical truth.

`FOUND != SOURCE VERIFIED != MUSICALLY VERIFIED != TEACHER APPROVED`

If a source cannot be safely imported/viewed, the product should use **“Kaynak Sitesinde Aç”** rather than force an iframe/embed path.

## 13. Renderer boundary

**PARTIAL.**

Current SesliTab integration provides a pinned ST Score Rendering Layer runtime and canonical measure-cursor synchronization. It remains presentation-only.

Current verified contract does **not** provide the full requested note hit-test/stable note-selection/quality-overlay contract. Stage C may therefore require a separately reviewed renderer contract extension. No cross-repository renderer contract change is authorized by Stage A.

The reported runtime text `Invalid note initialization object: {}` is not present as a literal in the SesliTab repository. Stage B must reproduce and locate the real runtime source rather than masking it by inventing note data.

## 14. Mobile and accessibility requirements

**PARTIAL.**

Stage A adds/retains:

- semantic native controls,
- visible focus,
- approximately 44px minimum teacher control targets,
- mobile-width-safe teacher inputs/fieldsets,
- technical JSON/history inside a bounded Details region,
- Turkish user-facing action labels.

Still required in later stages:

- iPhone Safari + VoiceOver verification,
- Android Chrome + TalkBack verification,
- note-level accessible selection,
- score-specific responsive scaling and controlled horizontal scrolling,
- non-color-only quality overlay announcements.

## Stage map from current repository reality

| Stage | Current status | Bounded next meaning |
|---|---|---|
| A — Teacher UI simplification | **IMPLEMENTED in this branch, pending CI/merge** | Product nav, simpler teacher copy, technical details grouping, basic mobile targets |
| B — Score runtime stabilization | **PLANNED** | Reproduce runtime failure; responsive score scaling; no semantic invention |
| C — Measure/note selection | **PARTIAL/BLOCKED** | Measure cursor exists; note hit-test contract requires fresh renderer review |
| D — Quality overlay | **PLANNED** | Quality/provenance-driven accessible overlay |
| E — Visual bounded note editor | **PLANNED** | pitch/accidental/octave/duration only where domain support is safe |
| F — Undo/revalidation/rerender | **PARTIAL** | Domain undo exists; complete product revalidation/rerender route does not |
| G — PASS/REVIEW/BLOCK routing | **PARTIAL** | Internal gates exist; product mapping/routing remains |
| H — Review playback | **PLANNED** | provisional playback only when safe |
| I — Guitar TAB + violin integration | **PARTIAL** | gated consumers exist; new product routing remains |
| J — Discovery simplification | **PARTIAL** | safe discovery exists; product presentation refinement remains |
| K — Compact tuner | **PLANNED UI change** | keep Package 11 microphone/privacy behavior unchanged |
| L — Student/share UI | **BLOCKED/PARTIAL** | only after Package 12 security contracts permit the exact route |

## Stage A non-goals

Stage A does not:

- change MusicXML parsing or canonical music semantics,
- change quality-gate policy,
- change Package 8 revision/approval/history semantics,
- change Package 12 authorization semantics,
- change renderer contracts,
- add dependencies,
- alter Audiveris/Render/OMR infrastructure,
- implement authentication/persistence,
- claim source-level musical verification.
