# SesliTab Music Engine — Güncel Mimari

**Belge sürümü:** 3.3.0  
**Güncelleme tarihi:** 2026-08-29  
**Package 8B-T3 verified implementation main:** `258ac27262aa4715164aafebe8fce97bb89f9dfb`  
**Exact-main CI:** #286 / run `33246461356` — SUCCESS  
**Durum:** Package 0–8 Completed; Package 8B Partially implemented; 8B-T1, 8B-T2 ve 8B-T3 Completed.

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

Experimental Audiveris evidence (Package 8B):
  repository/supplied evidence
  -> 8B-T1 strict candidate + exact training-approval contract
  -> 8B-T2 exact byte/path/hash readiness verification
  -> 8B-T3 bounded third-party accidental annotation mapping
       source annotation class
       -> exact bbox/mask validation
       -> Audiveris accidental shape evidence
       -> page-disjoint research split
       -> explicit blockers remain

No T3 record bypasses T1/T2.
No training/model replacement is in this flow.

Later:
  Package 12 -> exact-approved-revision student sharing with its own authorization/quality rules
```

## 3. Canonical, teacher and training boundaries

All musical consumers derive from the shared canonical note/time model. Missing music must not be invented. Source-unverified or unsafe evidence must not be promoted to definitive student truth.

Quality `ACCEPT` does not create teacher approval. Teacher approval does not bypass quality validation. Golden/reference approval or engineering-stage approval does not automatically create Audiveris-training approval.

Package 8B training evidence is isolated from the production MusicXML consumer flow. T1–T3 do not train Audiveris or modify production OMR behavior.

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

`scripts/audiverisTrainingDatasetContract.js` defines strict immutable research records for source PDF/page image, `.omr`, optional MusicXML provenance, glyph image, shape label, coordinates, reference evidence, exact Audiveris-training approval, licence, Audiveris version and explicit train/evaluation split.

`trainingApproval` must use scope `audiveris_training_sample` and bind to the exact deterministic candidate fingerprint. A dataset manifest accepts only T1-trainable candidates and rejects train/evaluation provenance/evidence leakage.

`scripts/audiverisTrainingDatasetInventory.js` inventories existing repository evidence without promotion. The Plan 0 golden chain remains incomplete as a training sample because training-specific page/glyph/shape/coordinate/approval/split evidence is absent.

## 6. Package 8B-T2 architecture — COMPLETED

`scripts/audiverisTrainingEvidenceReadiness.js` adds exact raw-byte evidence readiness over T1:

- hashes supplied bytes itself;
- requires exact path and digest agreement;
- reports `eligible`, `incomplete` or `rejected`;
- keeps T1 trainability authoritative;
- retains no raw bytes;
- rejects malformed or forged readiness evidence fail-closed.

`eligible` means manifest-review eligibility only, never training or production authorization.

## 7. Package 8B-T3 architecture — COMPLETED

### Bounded MUSCIMA accidental mapper

`scripts/audiverisMuscimaAccidentalMapping.js`

T3 consumes normalized annotation evidence and maps only:

| Source class | Audiveris shape |
|---|---|
| `accidentalSharp` | `SHARP` |
| `accidentalFlat` | `FLAT` |
| `accidentalNatural` | `NATURAL` |
| `accidentalDoubleSharp` | `DOUBLE_SHARP` |
| `accidentalDoubleFlat` | `DOUBLE_FLAT` |

The mapper:

- binds caller-supplied page image + annotation SHA-256;
- requires positive integer image/glyph dimensions;
- rejects bbox overflow;
- decodes and validates binary RLE against exact glyph area;
- fingerprints decoded mask pixels;
- creates deterministic sample identity;
- rejects duplicate page/object/sample identity;
- ignores unrelated MUSCIMA notation classes;
- supports deterministic caller-bounded page-disjoint train/evaluation assignment;
- never claims writer-independent evaluation;
- imports no production OMR/model/deployment surface.

### Measured supplied pilot

```text
matched pages:                 100 PNG + 100 XML
all annotation objects:        10,109
bounded accidental mappings:   2,714
  SHARP                        1,131
  FLAT                           821
  NATURAL                        350
  DOUBLE_SHARP                   220
  DOUBLE_FLAT                    192
bbox overruns:                    0
local page-disjoint split:      2,247 mapped train / 467 mapped evaluation
T1/T2 admitted trainable:           0
training executed:                   NO
production model changed:            NO
```

The normalized research pilot is kept outside the public repository. Source/derived MUSCIMA images are not committed in T3.

### Why 2,714 mapped is not 2,714 trainable

Every mapped T3 record explicitly retains:

- `missing_omr_artifact`;
- `missing_training_approval`;
- `external_license_review_required`.

The supplied annotation XML is **not** an Audiveris `.omr` project. User approval to proceed with engineering is **not** per-sample `audiveris_training_sample` approval. T3 therefore creates shape-mapping evidence without weakening T1/T2 admission.

### Verification

- PR #113 final head `b3f4b71a9748f2b8281abe5f0d9e6fb925a0fd9a`
- exact-head CI #285 / run `33246314925`: SUCCESS
- review threads: 0 unresolved
- protected-main merge `258ac27262aa4715164aafebe8fce97bb89f9dfb`
- exact-main CI #286 / run `33246461356`: **1275/1275 PASS**, 232 suites, 0 failures/skips/cancellations, 0 vulnerabilities, build PASS, real-browser proof PASS

## 8. Package 8B continuing boundary

Package 8B remains **Partially implemented**. T3 materially improves experimental accidental evidence, but it does not produce a T1/T2-admitted training corpus or a trained model.

Before a later training stage, explicitly review:

1. whether third-party classifier glyph corpora require the same T1 `.omr` evidence or a separately approved contract extension;
2. compatible per-sample training authorization under the external licence boundary;
3. evaluation design beyond page-disjoint-only evidence when writer identity is unavailable.

Do not infer model-training authorization from T3 completion.

## 9. Protected production boundary

Without separate explicit authorization, keep unchanged:

- `backend/` production Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render deployment connection;
- production model selection/replacement.

## 10. Security dependency summary

| Feature | Canonical/source data | Quality/evidence gate | Approval/authorization |
|---|---:|---:|---:|
| Teacher review UI | Yes | Separate evidence | Exact teacher approval only after explicit action |
| Playback/TTS | Yes | Quality gate | Student sharing later has separate rules |
| MIDI export | Yes | Quality gate | Student sharing later has separate rules |
| Basic Guitar TAB | Yes | Quality gate | Generated result is not teacher truth |
| Basic Violin | Yes | Quality gate | Generated result is not teacher truth |
| Package 8B T1 candidate | Training-specific evidence | T1 completeness | **Exact training approval required** |
| Package 8B T2 readiness | Exact supplied bytes/path/hash | T1 remains authoritative | **No new approval inferred** |
| Package 8B T3 mapped accidental | Exact annotation/hash/bbox/mask evidence | Experimental mapping only | **Still blocked; no training authorization** |
| Package 8B dataset manifest | T1-trainable candidates only | T1 admission | **Required per sample** |
| Package 12 student sharing | Yes | Quality gate | **Exact approved revision required** |
