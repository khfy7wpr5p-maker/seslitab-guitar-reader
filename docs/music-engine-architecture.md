# SesliTab Music Engine — Güncel Mimari

**Belge sürümü:** 3.5.0  
**Güncelleme tarihi:** 2026-08-29  
**Package 8B-T5 verified implementation main:** `5acafbd420cb9e54b4fb5b36f590db882c3300c3`  
**Exact-main CI:** #297 / run `33249268267` — SUCCESS  
**Durum:** Package 0–8 Completed; Package 8B Partially implemented; 8B-T1 through 8B-T5 Completed.

## 1. Değişmez ürün ilkesi

SesliTab öğretmen denetimli, yarı otomatik ve erişilebilir bir müzik eğitimi sistemidir. Yapısal geçerlilik, kaynak doğrulama, kalite `ACCEPT`, öğretmen düzeltmesi, öğretmen onayı, Audiveris-training onayı, research-sample onayı ve öğrenci paylaşım yetkisi ayrı katmanlardır.

## 2. Ana veri akışı

```text
PDF
  -> mevcut Cloud OMR Gateway
  -> mevcut Audiveris provider/runtime
  -> MusicXML
  -> canonical NoteObject[]
  -> structural validation + quality gate
  -> rhythmic text/HTML | TTS/playback | MIDI | Basic Guitar TAB | Basic Violin

Package 8 teacher layer — Completed
  -> immutable revision
  -> bounded correction/audit
  -> exact approval
  -> lossless history/undo
  -> optimistic concurrency
  -> accessible teacher UI

Package 8B experimental Audiveris evidence
  -> T1 strict trainable-candidate contract
  -> T2 exact byte/path/hash readiness
  -> T3 bounded MUSCIMA accidental mapping
  -> T4 research-only exact sample admission
  -> T5 isolated native-sample staging harness
       recompute exact T4 admission
       require exact raw mask/RLE matching T3 mask SHA-256
       require explicit Audiveris interline
       derive location only from exact T3 bbox
       emit deterministic immutable staging manifest
       never serialize samples.zip
       never execute training
```

No T3/T4/T5 record bypasses T1/T2. No Package 8B state in T1–T5 authorizes production model replacement.

## 3. Package 8B-T1 through T4

T1 remains the strict production-oriented evidence contract and keeps exact `.omr` evidence mandatory for a genuine T1 trainable sample. T2 verifies supplied bytes/path/digest. T3 maps only five accidental classes and keeps its evaluation page-disjoint only. T4 adds the distinct research approval scope `audiveris_classifier_research_sample` and admits only non-commercial research intent with complete exact per-sample approval.

Current T3/T4 real population remains 2,714 mapped samples, 0 exact T4 approvals and 0 T4 admitted samples.

## 4. Package 8B-T5 architecture — COMPLETED

### Upstream-native requirement

Fresh Audiveris verification used `master` revision `7a36078e7ba0c006052c1f661b949cf9b729f505`.

The upstream persistence chain establishes:

- global classifier sample repository file `samples.zip`;
- per-sheet JAXB `samples.xml` entries;
- native `Sample` contains shape and `interline`;
- `Sample` inherits glyph location and `RunTable` pixel evidence from `Glyph`.

Therefore label + bbox + mask hash is insufficient to construct a valid native sample.

### T5 staging contract

`scripts/audiverisMuscimaIsolatedNativeSamplesHarness.js`

T5 recomputes T4 admission and accepts native evidence only when it binds the exact mapped sample. It requires:

- exact `sampleId`;
- exact Audiveris accidental shape;
- raw bounded `maskRle` whose decoded pixels match the existing T3 `maskSha256`;
- explicit positive integer `interline`.

T5 derives left/top/width/height only from exact T3 bbox evidence. It rejects unknown, duplicate, sparse, accessor-injected, shape-mismatched and mask-mismatched native evidence.

### T5 states

```text
T4 not admitted
  -> blocked_research_admission

T4 admitted but raw mask/interline incomplete
  -> blocked_native_evidence

T4 admitted + exact matching raw mask + explicit interline
  -> ready_for_audiveris_native_serializer
  -> staging only
```

Every T5 report keeps:

```text
samplesZipBuilt: false
trainingExecuted: false
t1TrainableSampleCount: 0
t1OmrEvidenceSatisfied: false
writerIndependentEvaluation: false
productionAuthorized: false
modelReplacementAuthorized: false
```

The current 2,714 mapped sample population therefore remains blocked: T4 approvals are still 0 and T3 did not retain raw mask/RLE or interline.

### T5 verification

- PR #118 final head `075984105476fbd815a700201ccb5ae2cd0e169b`;
- exact-head CI #296: **1299/1299 PASS**, 232 suites, 0 vulnerabilities, build PASS, real-browser proof PASS;
- unresolved review threads before merge: 0;
- expected-head-locked squash merge `5acafbd420cb9e54b4fb5b36f590db882c3300c3`;
- exact-main CI #297 / run `33249268267`: **1299/1299 PASS**, 232 suites, 0 vulnerabilities, build PASS, real-browser proof PASS.

## 5. Continuing Package 8B boundary

Package 8B remains **Partially implemented**. T5 closes only the native-evidence staging contract. It does not create a native ZIP, validate one through Audiveris, execute training, evaluate a classifier, or adopt a production model.

A future separately authorized step may implement or invoke a pinned Audiveris-native serializer. It must prove archive acceptance by the pinned Audiveris sample repository before any training execution is considered.

## 6. Protected production boundary

Without separate explicit authorization, keep unchanged:

- production Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway and backend production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render deployment connection;
- production model selection/replacement;
- CI workflow/dependencies.

## 7. Security dependency summary

| Feature | Evidence gate | Authorization |
|---|---|---|
| Package 8 teacher revision | Exact revision/history | Exact teacher approval only |
| 8B-T1 candidate | Strict T1 evidence including `.omr` | Exact T1 training approval |
| 8B-T2 readiness | Exact supplied bytes/path/hash | No approval inferred |
| 8B-T3 mapping | Exact annotation/bbox/mask hash | No training authorization |
| 8B-T4 admission | Exact T3 sample + licence/use | Exact T4 research approval |
| 8B-T5 staging | Exact T4 admission + raw mask + interline | Serializer-ready only |
| Future native ZIP | Not implemented | Separate explicit gate required |
| Actual Audiveris training | Not implemented | Separate explicit gate required |
| Production model replacement | Not implemented | Measured comparison + separate explicit authorization required |
