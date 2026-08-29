# SesliTab Music Engine — Güncel Mimari

**Belge sürümü:** 3.4.0  
**Güncelleme tarihi:** 2026-08-29  
**Package 8B-T4 verified implementation main:** `08bb9a1d909c20445cc0dbcaf1a5514e48470ee8`  
**Exact-main CI:** #290 / run `33247398205` — SUCCESS  
**Durum:** Package 0–8 Completed; Package 8B Partially implemented; 8B-T1, 8B-T2, 8B-T3 ve 8B-T4 Completed.

## 1. Değişmez ürün ilkesi

SesliTab öğretmen denetimli, yarı otomatik ve erişilebilir bir müzik eğitimi sistemidir. Yapısal geçerlilik, kaynak doğrulama, kalite `ACCEPT`, öğretmen düzeltmesi, öğretmen onayı, Audiveris-training onayı, research-sample onayı ve öğrenci paylaşım yetkisi birbirinden ayrı katmanlardır.

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
  -> 8B-T4 separate research-only admission gate
       mapped sample
       -> exact T4 research approval binding
       -> non-commercial-use gate
       -> blocked OR ready only for isolated samples.zip preparation

No T3/T4 record bypasses T1/T2.
No T4 state authorizes training execution or model replacement.

Later, only after separate explicit approval:
  isolated research samples.zip builder/harness
  -> separately gated training experiment
  -> separately gated evaluation
  -> no production model replacement without another explicit decision

Later product feature:
  Package 12 -> exact-approved-revision student sharing with its own authorization/quality rules
```

## 3. Canonical, teacher and training boundaries

All musical consumers derive from the shared canonical note/time model. Missing music must not be invented. Source-unverified or unsafe evidence must not be promoted to definitive student truth.

Quality `ACCEPT` does not create teacher approval. Teacher approval does not bypass quality validation. Golden/reference approval or engineering-stage approval does not automatically create Audiveris-training approval or research-sample approval.

Package 8B evidence remains isolated from the production MusicXML consumer flow. T1–T4 do not train Audiveris or modify production OMR behavior.

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

T1 deliberately remains stricter than the later T4 research-only classifier-preparation boundary. T4 does not remove or reinterpret T1's `.omr` requirement.

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

T3 maps only:

| Source class | Audiveris shape |
|---|---|
| `accidentalSharp` | `SHARP` |
| `accidentalFlat` | `FLAT` |
| `accidentalNatural` | `NATURAL` |
| `accidentalDoubleSharp` | `DOUBLE_SHARP` |
| `accidentalDoubleFlat` | `DOUBLE_FLAT` |

The mapper binds page/annotation hashes, validates exact bbox and binary mask evidence, fingerprints decoded mask pixels, creates deterministic identities, ignores unrelated classes and preserves a page-disjoint-only evaluation claim.

Measured supplied pilot:

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
```

The annotation XML is not represented as `.omr`; engineering approval is not per-sample training approval; writer-independent evaluation is not claimed.

## 8. Package 8B-T4 architecture — COMPLETED

### Research-only admission gate

`scripts/audiverisMuscimaResearchTrainingAdmission.js`

T4 separates three questions that must not be conflated:

1. **Audiveris technical classifier evidence** — glyph + shape samples destined for the global `samples.zip` training repository.
2. **SesliTab T1 production-oriented provenance** — stricter evidence contract that still includes exact `.omr` evidence.
3. **External-corpus research admission** — a separate, non-commercial, exact per-sample approval boundary.

T4 therefore does **not** revise T1. It introduces the separate scope:

```text
audiveris_classifier_research_sample
```

Each approval binds exact:

- `sampleId`;
- `audiverisShape`;
- decoded-mask SHA-256;
- approval identity;
- reviewer identity;
- exact ISO-8601 approval timestamp;
- fixed MUSCIMA research-only licence profile.

### T4 admission state machine

```text
commercial / production intent
  -> blocked_license_use
  -> admitted = 0

non-commercial research + incomplete exact approvals
  -> blocked_missing_sample_approvals
  -> admitted = 0

non-commercial research + complete exact approvals
  -> ready_for_isolated_samples_zip_build
  -> only artifact-preparation readiness
  -> training execution still NOT authorized
```

Every T4 report retains:

```text
t1TrainableSampleCount: 0
t1OmrEvidenceSatisfied: false
t1Blockers: [missing_omr_artifact]
writerIndependentEvaluation: false
productionAuthorized: false
modelReplacementAuthorized: false
```

### Current pilot state after T4

```text
mapped experimental samples:     2,714
T4 exact research approvals:          0
T4 research samples admitted:         0
T1/T2 trainable samples:              0
samples.zip built:                    NO
Audiveris training executed:          NO
production model changed:             NO
```

User approval to implement T4 is an engineering-stage authorization only. It is not expanded into 2,714 sample approvals.

### T4 verification

- implementation PR #115 final head `9142e9b3f81f75e0f0f1e44450c0ee9294e1f640`
- exact-head CI #289: SUCCESS
- review threads: 0 unresolved
- protected-main squash merge `08bb9a1d909c20445cc0dbcaf1a5514e48470ee8`
- exact-main CI #290 / run `33247398205`: **1287/1287 PASS**, 232 suites, 0 failures/skips/cancellations, 0 vulnerabilities, build PASS, real-browser proof PASS

## 9. Package 8B continuing boundary

Package 8B remains **Partially implemented**. T4 solves the research-admission architecture boundary, but it does not create sample approvals, build an Audiveris sample repository, execute training or produce an evaluated classifier.

A later isolated research package may proceed only after separate explicit authorization and the required exact sample approvals. It must keep artifact preparation, training execution, evaluation and production-model adoption as separate gates.

## 10. Protected production boundary

Without separate explicit authorization, keep unchanged:

- `backend/` production Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render deployment connection;
- production model selection/replacement.

## 11. Security dependency summary

| Feature | Canonical/source data | Quality/evidence gate | Approval/authorization |
|---|---:|---:|---:|
| Teacher review UI | Yes | Separate evidence | Exact teacher approval only after explicit action |
| Playback/TTS | Yes | Quality gate | Student sharing later has separate rules |
| MIDI export | Yes | Quality gate | Student sharing later has separate rules |
| Basic Guitar TAB | Yes | Quality gate | Generated result is not teacher truth |
| Basic Violin | Yes | Quality gate | Generated result is not teacher truth |
| Package 8B T1 candidate | Training-specific evidence | T1 completeness | **Exact T1 training approval required** |
| Package 8B T2 readiness | Exact supplied bytes/path/hash | T1 remains authoritative | **No new approval inferred** |
| Package 8B T3 mapped accidental | Exact annotation/hash/bbox/mask evidence | Experimental mapping only | **No training authorization** |
| Package 8B T4 research admission | Exact T3 sample + licence/use evidence | Fail-closed research admission | **Separate exact T4 sample approval required** |
| Later isolated samples.zip builder | Only admitted T4 samples | Not implemented | **Not authorized by T4 completion** |
| Actual Audiveris training | Not implemented | Separate future gate required | **Not authorized** |
| Production model replacement | Not implemented | Measured comparison required | **Separate explicit authorization required** |
| Package 12 student sharing | Yes | Quality gate | **Exact approved revision required** |
