# SesliTab Music Engine — Güncel Mimari

**Belge sürümü:** 3.1.0  
**Güncelleme tarihi:** 2026-08-28  
**Package 8B-T1 verified implementation main:** `278b69ed1f7f0cede6a3dc00e8265e887811c88b`  
**Exact-main CI:** #266 / run `33196791822` — SUCCESS  
**Durum:** Package 0–8 Completed; Package 8B Partially implemented; 8B-T1 Completed.

## 1. Değişmez ürün ilkesi

SesliTab öğretmen denetimli, yarı otomatik ve erişilebilir bir müzik eğitimi sistemidir. Yapısal geçerlilik, kaynak doğrulama, kalite `ACCEPT`, öğretmen düzeltmesi, öğretmen onayı, Audiveris-training onayı ve öğrenci paylaşım yetkisi birbirinden ayrı katmanlardır.

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

Teacher layer (Package 8 — Completed):
  AutomaticRevision
  -> bounded correction + audit
  -> exact TeacherApprovalRecord
  -> immutable history / lossless undo
  -> optimistic stale-history guard
  -> accessible teacher workspace/UI

Experimental training evidence (Package 8B):
  supplied/repository evidence
  -> 8B-T1 strict candidate contract
  -> explicit training approval bound to exact candidate fingerprint
  -> train/evaluation isolation
  -> deterministic immutable dataset manifest
  -> later bounded evidence intake / experiments only

Later:
  Package 12 -> exact-approved-revision student sharing with its own authorization/quality rules
```

## 3. Canonical, teacher and training boundaries

All musical consumers derive from the shared canonical note/time model. Missing music must not be invented. Source-unverified or unsafe evidence must not be promoted to definitive student truth.

Quality `ACCEPT` does not create teacher approval. Teacher approval does not bypass quality validation. Golden/reference approval does not automatically create Audiveris-training approval.

Package 8B training evidence is isolated from the production MusicXML consumer flow. T1 does not call Audiveris and does not modify production OMR behavior.

## 4. Package 8 architecture — COMPLETED

- `src/services/teacherRevisionModel.js` — immutable automatic/corrected revisions
- `src/services/teacherCorrectionOperations.js` — bounded corrections and audit evidence
- `src/services/teacherApprovalModel.js` — exact-revision teacher approval
- `src/services/teacherRevisionHistory.js` — immutable history and lossless undo
- `src/services/teacherRevisionConcurrency.js` — optimistic stale-history guard
- `src/services/teacherWorkspaceModel.js` — UI-facing teacher workspace adapter
- `src/package8TeacherUi.js` / `.css` — accessible native teacher controls

Package 8 remains Completed. Teacher approval is exact-revision evidence; it is neither quality acceptance nor student-sharing authorization.

## 5. Package 8B-T1 architecture — COMPLETED

### Dataset candidate/manifest contract

`scripts/audiverisTrainingDatasetContract.js`

T1 defines strict immutable research-only records for:

- source PDF;
- source page image;
- `.omr` artifact;
- optional MusicXML provenance;
- glyph image;
- shape label;
- symbol coordinates;
- reference approval evidence;
- exact Audiveris-training approval;
- licence evidence;
- Audiveris version;
- explicit train/evaluation split.

Every artifact is represented by a safe repository-relative path plus SHA-256 digest. Candidate evidence receives a deterministic SHA-256 fingerprint.

`trainingApproval` must use scope `audiveris_training_sample` and must bind to that exact candidate fingerprint. If candidate evidence changes, the old approval cannot be replayed.

A dataset manifest accepts only trainable candidates, rejects duplicate IDs, sorts deterministically, records split counts and has its own deterministic SHA-256 fingerprint.

Train/evaluation leakage is rejected when the same provenance or PDF/page/.omr/MusicXML/glyph hash crosses the split boundary.

### Repository evidence inventory

`scripts/audiverisTrainingDatasetInventory.js`

The current real owner/teacher-approved Plan 0 evidence chain is inventoried read-only. It is not silently promoted to training data.

Current state:

```text
Plan 0 golden chain
  source.pdf              present
  project.omr             present
  expected.musicxml       present
  golden approval         present
  SHA-256 integrity       present
  licence evidence        present (CC0-1.0)
  Audiveris version       present (5.11.0)
  separate page image     MISSING
  glyph image             MISSING
  real shape label        MISSING
  symbol coordinates      MISSING
  explicit training approval MISSING
  train/evaluation split  MISSING

=> INCOMPLETE
=> admitted real trainable samples: 0
```

No missing training evidence is synthesized.

### Verification

- PR #104 final head `4005192f55afead7d22e7a32db596569faa7aff9`
- exact-head CI #265: 1228/1228 PASS, 232 suites, 0 vulnerabilities, build PASS
- protected-main merge `278b69ed1f7f0cede6a3dc00e8265e887811c88b`
- exact-main CI #266: 1228/1228 PASS, 232 suites, 0 failures/skips/cancellations, 0 vulnerabilities, build PASS

## 6. Package 8B-T2 next architecture boundary

The next safe stage may add a bounded **evidence intake/readiness** layer over T1. It may classify genuinely supplied evidence, verify declared references/hashes at an isolated boundary and report missing requirements deterministically.

It must not:

- fabricate page images, glyphs, labels, coordinates, approvals, licences or provenance;
- treat MusicXML or golden-reference approval as training truth;
- run training merely because a candidate exists;
- claim recognition improvement without measured evaluation;
- automatically replace/tune the production Audiveris model;
- alter the current gateway/provider/runtime connection.

If no new verified training artifacts are available, the system must truthfully remain at zero admitted real training samples.

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

| Feature | Canonical/source data | Quality gate | Teacher/training approval |
|---|---:|---:|---:|
| Teacher review UI | Yes | Separate evidence | Exact teacher approval only after explicit action |
| Playback/TTS | Yes | Yes | Student sharing later has separate rules |
| MIDI export | Yes | Yes | Student sharing later has separate rules |
| Basic Guitar TAB | Yes | Yes | Generated result is not teacher truth |
| Basic Violin | Yes | Yes | Generated result is not teacher truth |
| Package 8B training candidate | Training-specific evidence | T1 completeness validation | **Exact training approval required** |
| Package 8B dataset manifest | Trainable candidates only | T1 admission contract | **Required per sample** |
| Package 12 student sharing | Yes | **Yes** | **Exact approved revision required** |
