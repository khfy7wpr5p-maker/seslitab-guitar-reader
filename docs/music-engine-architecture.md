# SesliTab Music Engine — Güncel Mimari

**Belge sürümü:** 3.0.0  
**Güncelleme tarihi:** 2026-08-28  
**Package 8 final implementation main:** `6f7e58fbbee2655c7bdc296ee673cfb3981f1438`  
**Exact-main CI:** #262 / run `33194360060` — SUCCESS  
**Durum:** Package 0–8 Completed; Package 8B NEXT / Not started.

## 1. Değişmez ürün ilkesi

SesliTab öğretmen denetimli, yarı otomatik ve erişilebilir bir müzik eğitimi sistemidir. Yapısal geçerlilik, kaynak doğrulama, kalite `ACCEPT`, öğretmen düzeltmesi, öğretmen onayı ve öğrenci paylaşım yetkisi birbirinden ayrı katmanlardır.

## 2. Ana veri akışı

```text
PDF
  -> mevcut Cloud OMR Gateway
  -> mevcut Audiveris provider/runtime
  -> MusicXML

MusicXML / supported source
  -> parse + normalize
  -> canonical NoteObject[]
  -> structural validation + quality report
  -> app quality gate: ACCEPT / REVIEW / BLOCK
  -> rhythmic text/HTML | TTS/playback | MIDI | Basic Guitar TAB | Basic Violin

MusicXML <harmony>
  -> source-only chord parser
  -> accessible chord display / Turkish TTS

Teacher layer (Package 8):

AutomaticRevision (T1)
  -> bounded correction + audit (T2)
  -> Exact TeacherApprovalRecord (T3)
  -> immutable revision history / lossless undo (T4)
  -> optimistic stale-history guard (T5)
  -> accessible teacher workspace/UI (T6)

Later:
  Package 8B -> experimental verified Audiveris dataset only
  Package 12 -> exact-approved-revision student sharing with its own authorization/quality rules
```

## 3. Canonical and quality boundary

All musical consumers should derive from the shared canonical note/time model. Visible measure number is not unique identity. Missing music must not be invented. Source-unverified or unsafe evidence must not be promoted to definitive student truth.

Quality `ACCEPT` does not create teacher approval. Teacher approval does not bypass quality validation.

## 4. Package 8 architecture — COMPLETED

### T1 — immutable revision domain

`src/services/teacherRevisionModel.js`

Automatic and teacher-corrected revisions are immutable. Content and recursive-lineage fingerprints provide deterministic drift/version identity; they are not authentication or signatures.

### T2 — correction operations

`src/services/teacherCorrectionOperations.js`

Only bounded existing-path `replace_value` operations are supported. Accepted correction creates a new revision plus separate immutable audit evidence. No parent/source overwrite.

### T3 — exact approval

`src/services/teacherApprovalModel.js`

Teacher approval is a separate immutable record bound to exact revision metadata/content/recursive lineage. Later correction or undo does not inherit approval.

### T4 — lossless history and undo

`src/services/teacherRevisionHistory.js`

History preserves the automatic root, corrected revisions, correction audits, approval records and undo events. Undo creates a new revision from historical content rather than rewinding/deleting history.

### T5 — optimistic concurrency

`src/services/teacherRevisionConcurrency.js`

An immutable history expectation guards correction/approval/undo. Stale state returns explicit conflict and zero partial domain write. The primitive is not a database transaction or distributed lock.

### T6 — accessible teacher workspace/UI

`src/services/teacherWorkspaceModel.js`  
`src/package8TeacherUi.js`  
`src/package8TeacherUi.css`

T6 consumes T1–T5; it does not create a parallel musical truth model.

Safety/accessibility behavior:

- source note array is snapshotted; original source is not edited;
- correction UI exposes only an allow-listed set of existing direct primitive musical fields;
- raw JSON/MusicXML, source identity, physical measure identity, confidence/verification and nested evidence are not direct arbitrary edit paths;
- accepted correction creates a new revision via T2/T5;
- exact approval via T3/T5; duplicate current approval rejected;
- revision history and lossless undo via T4/T5;
- stale conflict is visible/assistive-technology readable and disables mutation;
- explicit refresh is required and the failed action is not silently replayed;
- source/history identity mismatch cannot be refreshed into unrelated history;
- native controls, labels, tab/tabpanel semantics, live status, assertive conflict alert and visible focus styling are provided;
- approval text explicitly states it is neither quality-gate acceptance nor sharing permission.

## 5. Package 8 verification

PR #102 final head: `5efb91ac14dec87353e013b21f32fd5baf0271b2`  
Exact-head CI #261: 1213/1213 PASS, 232 suites, 0 vulnerabilities, build PASS.  
Protected-main merge: `6f7e58fbbee2655c7bdc296ee673cfb3981f1438`.  
Exact-main CI #262: 1213/1213 PASS, 232 suites, 0 failed/skipped/cancelled, 0 vulnerabilities, build PASS.

Review hardening covered false-positive isolation scanning, blank numeric input coercion, and history/source mismatch refresh safety.

## 6. Package 8B next architecture boundary

Package 8B is separate and experimental. It may establish a reproducible verified Audiveris dataset contract/inventory/validator using teacher-verified image/.omr/glyph/label evidence.

It must not:

- treat MusicXML alone as a training sample;
- admit unapproved samples;
- mix training/evaluation membership;
- fabricate glyph labels, coordinates, approval or provenance;
- automatically replace or tune the production Audiveris model;
- alter the current OMR gateway/provider/runtime connection.

If real verified training artifacts are incomplete, 8B should fail closed and report missing evidence rather than synthesize it.

## 7. Protected production boundary

Without separate explicit authorization, keep unchanged:

- `backend/` production Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render deployment connection.

## 8. Security dependency summary

| Feature | Canonical data | Quality gate | Teacher approval |
|---|---:|---:|---:|
| Teacher review UI | Yes | Separate evidence | Optional until explicit approval action |
| Playback/TTS | Yes | Yes | Product flow dependent; sharing requires later approval rules |
| MIDI export | Yes | Yes | Sharing requires later approval rules |
| Basic Guitar TAB | Yes | Yes | Automatic result remains reviewable; sharing later requires approval |
| Basic Violin | Yes | Yes | Automatic result remains reviewable; sharing later requires approval |
| Package 8B training sample | Training-specific source evidence | Separate validation | **Yes** |
| Package 12 student sharing | Yes | **Yes** | **Exact approved revision required** |
