# SesliTab Music Engine — Güncel Mimari

**Belge sürümü:** 3.2.0  
**Güncelleme tarihi:** 2026-08-29  
**Package 8B-T2 verified implementation main:** `ce5210476c5957595a9159abff6fd3b64afd10bd`  
**Exact-main CI:** #273 / run `33207881028` — SUCCESS  
**Durum:** Package 0–8 Completed; Package 8B Partially implemented; 8B-T1 ve 8B-T2 Completed.

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
  -> deterministic immutable dataset manifest contract
  -> 8B-T2 exact evidence-byte readiness verification
  -> ELIGIBLE / INCOMPLETE / REJECTED readiness for manifest review only

Later:
  Package 12 -> exact-approved-revision student sharing with its own authorization/quality rules
```

## 3. Canonical, teacher and training boundaries

All musical consumers derive from the shared canonical note/time model. Missing music must not be invented. Source-unverified or unsafe evidence must not be promoted to definitive student truth.

Quality `ACCEPT` does not create teacher approval. Teacher approval does not bypass quality validation. Golden/reference approval does not automatically create Audiveris-training approval.

Package 8B training evidence is isolated from the production MusicXML consumer flow. T1 and T2 do not call Audiveris, train a model or modify production OMR behavior.

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
  source.pdf                  present
  project.omr                 present
  expected.musicxml           present
  golden approval             present
  SHA-256 integrity           present
  licence evidence            present (CC0-1.0)
  Audiveris version           present (5.11.0)
  separate page image         MISSING
  glyph image                 MISSING
  real shape label            MISSING
  symbol coordinates          MISSING
  explicit training approval  MISSING
  train/evaluation split      MISSING

=> INCOMPLETE
=> admitted real trainable samples: 0
```

No missing training evidence is synthesized.

### Verification

- PR #104 final head `4005192f55afead7d22e7a32db596569faa7aff9`
- exact-head CI #265: 1228/1228 PASS, 232 suites, 0 vulnerabilities, build PASS
- protected-main merge `278b69ed1f7f0cede6a3dc00e8265e887811c88b`
- exact-main CI #266: 1228/1228 PASS, 232 suites, 0 failures/skips/cancellations, 0 vulnerabilities, build PASS

## 6. Package 8B-T2 architecture — COMPLETED

### Verified evidence intake/readiness boundary

`scripts/audiverisTrainingEvidenceReadiness.js`

T2 adds a bounded, fail-closed evidence-intake/readiness layer over T1. It accepts only a strict immutable T1 candidate plus explicit evidence records containing exact field, exact path and non-empty raw `Uint8Array` bytes.

T2:

- computes SHA-256 from supplied raw bytes itself;
- compares the raw path exactly without whitespace normalization;
- verifies only T1-declared evidence fields;
- reports `eligible`, `incomplete` or `rejected` deterministically;
- treats `eligible` as **eligible for dataset-manifest review only**;
- keeps T1 trainability authoritative;
- retains no raw evidence bytes in the readiness report;
- rejects malformed, sparse, accessor/injected, duplicate, undeclared, path-mismatched or hash-mismatched evidence fail-closed;
- validates report semantics, not only record shape.

T2 does not infer the musical truth of a glyph/shape label from pixels. Shape labels and coordinates remain explicit T1 evidence and still require the exact training-approval binding defined by T1.

### Current real readiness result

The current Plan 0 repository evidence verifies the artifact references that actually exist, but it remains `incomplete` because the training-specific page/glyph/shape/coordinate/approval/split evidence is absent.

```text
current real eligible sample count: 0
current real trainable sample count: 0
training executed: NO
production model changed: NO
```

No missing evidence is generated, inferred or fabricated.

### Verification

- PR #106 final head `8d333a4bc3de2b58731b6c0360e5d0923b9728fb`
- exact-head CI #272: 1244/1244 PASS, 232 suites, 0 vulnerabilities, build PASS
- review P2 exact-path whitespace normalization issue fixed and regression-tested
- protected-main squash merge `ce5210476c5957595a9159abff6fd3b64afd10bd`
- exact-main CI #273 / run `33207881028`: 1244/1244 PASS, 232 suites, 0 failures/skips/cancellations, 0 vulnerabilities, build PASS

## 7. Package 8B continuing boundary

Package 8B remains **Partially implemented** because there is still no genuinely supplied, complete, teacher/training-approved real sample that can cross the T1+T2 admission boundary.

Until such evidence exists, do not invent a new training stage merely to advance status. The safe state is to preserve the completed T1/T2 contracts and truthfully report zero eligible/trainable real samples.

A later training/experiment stage requires separate scope and evidence. It must not be inferred from T2 `eligible` status alone.

## 8. Protected production boundary

Without separate explicit authorization, keep unchanged:

- `backend/` production Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render deployment connection.

## 9. Security dependency summary

| Feature | Canonical/source data | Quality gate | Teacher/training approval |
|---|---:|---:|---:|
| Teacher review UI | Yes | Separate evidence | Exact teacher approval only after explicit action |
| Playback/TTS | Yes | Yes | Student sharing later has separate rules |
| MIDI export | Yes | Yes | Student sharing later has separate rules |
| Basic Guitar TAB | Yes | Yes | Generated result is not teacher truth |
| Basic Violin | Yes | Yes | Generated result is not teacher truth |
| Package 8B training candidate | Training-specific evidence | T1 completeness validation | **Exact training approval required** |
| Package 8B readiness report | Exact supplied bytes/path/hash | T1 trainability remains authoritative | **No new approval inferred** |
| Package 8B dataset manifest | Trainable candidates only | T1 admission contract | **Required per sample** |
| Package 12 student sharing | Yes | **Yes** | **Exact approved revision required** |
