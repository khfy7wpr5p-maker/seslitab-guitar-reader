# SesliTab Music Engine — Güncel Mimari

**Belge sürümü:** 3.6.0  
**Güncelleme tarihi:** 2026-08-29  
**Package 8B-T6 verified implementation main:** `eb711fa0483b87d841b4381e242b4d19ae95d189`  
**Exact-main CI:** #308 / run `33251255425` — SUCCESS  
**Durum:** Package 0–8 Completed; Package 8B Partially implemented; 8B-T1 through 8B-T6 Completed.

## 1. Değişmez ürün ilkesi

SesliTab öğretmen denetimli, yarı otomatik ve erişilebilir bir müzik eğitimi sistemidir. Yapısal geçerlilik, kaynak doğrulama, kalite `ACCEPT`, öğretmen düzeltmesi, öğretmen onayı, Audiveris-training onayı, research-sample onayı, native-archive kabulü ve öğrenci paylaşım yetkisi ayrı katmanlardır.

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
  -> T6 pinned native serializer + acceptance gate
       accept only exact T5 serializer-ready evidence
       deterministically emit Audiveris-native samples.zip bytes
       bind archive SHA-256 + T5 manifest fingerprint
       require clean exact pinned Audiveris checkout for acceptance
       load via SampleRepository.getInstance(Path, true)
       require exact loaded sample count
       never execute classifier training
       never authorize production-model replacement
```

No T3/T4/T5/T6 record bypasses T1/T2. No Package 8B state through T6 authorizes production model replacement.

## 3. Package 8B-T1 through T5

T1 remains the strict production-oriented evidence contract and keeps exact `.omr` evidence mandatory for a genuine T1 trainable sample. T2 verifies supplied bytes/path/digest. T3 maps only five accidental classes and keeps its evaluation page-disjoint only. T4 adds the distinct research approval scope `audiveris_classifier_research_sample` and admits only non-commercial research intent with complete exact per-sample approval. T5 requires exact admitted-sample identity, raw mask evidence matching the T3 SHA-256 and explicit Audiveris `interline` before producing a serializer-ready staging manifest.

Current real population remains 2,714 mapped samples, 0 exact T4 approvals, 0 T4 admitted samples and 0 T5 serializer-ready real samples.

## 4. Package 8B-T6 architecture — COMPLETED

### Pinned upstream requirement

T6 remains pinned to Audiveris revision `7a36078e7ba0c006052c1f661b949cf9b729f505`.

The verified native persistence/acceptance chain establishes:

- global classifier sample repository file `samples.zip`;
- `META-INF/container.xml` points to deterministic sample sheets;
- each sample sheet persists `samples.xml`;
- native `Sample` contains shape and `interline`;
- glyph persistence contains location and `RunTable` pixel evidence;
- ordered `RunTable` sequences preserve row identity, including empty rows;
- real repository acceptance can be tested through `SampleRepository.getInstance(Path, true)` and `getAllSamples()`.

### T6 serializer contract

`scripts/audiverisMuscimaPinnedNativeSerializer.js`

T6 accepts only a strict immutable T5 report in `ready_for_audiveris_native_serializer`. It:

- re-decodes exact T5 mask evidence and rechecks SHA-256;
- supports only the five bounded accidental shapes;
- derives deterministic path-safe sheet names from source page identity;
- assigns deterministic positive sample IDs within generated sheets;
- emits horizontal Audiveris `RunTable` RLE with one sequence for every bbox row;
- preserves all-background rows as explicit empty `<runs/>` sequences;
- emits stable ZIP entry ordering and fixed metadata;
- computes archive byte length and SHA-256;
- binds the archive to the exact T5 staging-manifest fingerprint.

A successful serializer output is only:

```text
archive_built_pending_pinned_acceptance
```

It is not repository acceptance, training authorization, evaluation evidence or production authorization.

### T6 pinned acceptance contract

`scripts/runPinnedAudiverisSampleRepositoryAcceptance.js`

Acceptance requires an isolated checkout whose `git rev-parse HEAD` equals the exact pinned Audiveris revision and whose worktree is clean. The runner invokes the real repository API:

```text
SampleRepository.getInstance(archive, true)
repo.getAllSamples().size()
```

The resulting receipt must bind:

- exact pinned revision;
- exact archive SHA-256;
- exact T5 staging-manifest fingerprint;
- exact expected/loaded sample count;
- required probe API identity.

Revision drift, a dirty checkout, archive mutation, failed load, count mismatch, wrong API identity or malformed receipt fails closed.

Even `accepted_by_pinned_audiveris` retains:

```text
trainingExecuted: false
productionAuthorized: false
modelReplacementAuthorized: false
```

### Current real-data result

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

The executable serializer and acceptance gate are verified with bounded evidence fixtures only. They do not convert the current 2,714 mapped records into approved training data.

### T6 verification

- PR #120 final head `9f7806c6eb6079dfc5ee929d270dfb39b063e8a4`;
- exact-head CI #307 / run `33251176354`: **SUCCESS**;
- final merge gate: 0 behind, mergeable, 0 unresolved review threads;
- expected-head-locked squash merge `eb711fa0483b87d841b4381e242b4d19ae95d189`;
- exact-main CI #308 / run `33251255425`: **1315/1315 PASS**, 232 suites, 0 vulnerabilities, build PASS, real-browser score render + cursor proof PASS.

## 5. Continuing Package 8B boundary

Package 8B remains **Partially implemented**. T6 closes the serializer/acceptance engineering contract but no real Package 8B record currently reaches T5 serializer-ready state because exact T4 approvals remain 0.

The next evidence-supported boundary is real teacher/research evidence acquisition and exact T4/T5 admission. Only after genuine real samples pass T4/T5 may T6 create a real archive and bind a real pinned-Audiveris acceptance receipt.

Classifier training, evaluation and production-model adoption remain separate later gates. Do not invent a new substage to bypass missing evidence. Package 9 remains sequentially blocked while Package 8B is incomplete unless the roadmap is explicitly changed.

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
| 8B-T6 native ZIP | Exact T5 staging manifest | Archive built pending pinned acceptance only |
| 8B-T6 pinned acceptance | Exact SHA/revision/count/API receipt | Repository acceptance only; no training authorization |
| Actual Audiveris training | Not executed | Separate explicit gate required |
| Production model replacement | Not implemented | Measured comparison + separate explicit authorization required |
