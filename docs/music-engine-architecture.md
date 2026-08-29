# SesliTab Music Engine — Güncel Mimari

**Belge sürümü:** 3.7.1  
**Güncelleme tarihi:** 2026-08-29  
**Güncel ürün baseline:** protected `main` `fe940cd0b633055845e06504eeeb4287aed3f4d1`  
**Güncel ürün durumu:** Packages 0–11 Completed; Package 12 Partially implemented with T1–T3 Completed.  
**8B research state:** Partially implemented; T1–T6 engineering gates Completed, genuine admitted/training evidence still absent.

> Bu belge müzik/OMR domain mimarisini tanımlar. Üst seviye ürün, Discovery, Teacher Studio, Student Practice, PWA ve deployment haritası için `docs/product-architecture.md` esas alınır. Güncel uygulama durumu için `docs/current-status.md` ve `docs/package-status.md` yetkilidir.

## 1. Değişmez ürün ilkesi

SesliTab öğretmen denetimli, yarı otomatik ve erişilebilir bir müzik eğitimi sistemidir. Yapısal geçerlilik, kaynak doğrulama, kalite `ACCEPT`, öğretmen düzeltmesi, öğretmen onayı, Audiveris-training onayı, research-sample onayı, native-archive kabulü ve öğrenci paylaşım yetkisi ayrı katmanlardır.

UI, Discovery veya renderer müzikal semantik otorite değildir. Dışarıdan bulunan bir kaynak, yalnızca bulunmuş olması nedeniyle doğrulanmış ya da öğretmen-onaylı sayılamaz.

## 2. Ana veri akışı

```text
Discovery / direct input
  -> PDF / MusicXML / Guitar TAB intake

PDF
  -> mevcut Cloud OMR Gateway
  -> mevcut Audiveris provider/runtime
  -> MusicXML
  -> canonical NoteObject[]
  -> structural validation + quality gate
  -> rhythmic text/HTML | TTS/playback | MIDI | Guitar TAB | Violin

Package 8 teacher layer — Completed
  -> immutable revision
  -> bounded correction/audit
  -> exact approval
  -> lossless history/undo
  -> optimistic concurrency
  -> accessible teacher UI

Package 12 sharing layer — Partially implemented
  -> T1 exact share authorization — Completed
  -> T2 exact-revision safety/quality eligibility — Completed
  -> T3 bounded post-correction revalidation/provenance — Completed
  -> authenticated recipient access — later
  -> persistence / network delivery — later

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

No Package 8B T3/T4/T5/T6 record bypasses T1/T2. No Package 8B state through T6 authorizes production model replacement.

## 3. Canonical music authority boundary

All student-facing musical projections must consume the same canonical note/timing authority. UI, TTS, playback, MIDI, Guitar TAB, violin guidance and future rhythm projections must not independently invent pitch, duration, octave, voice, tie or measure identity.

```text
MusicXML
  -> parser
  -> structural/rhythmic validation
  -> canonical NoteObject[] / timing model
  -> provenance + quality gates
  -> bounded projections
```

Valid XML remains structural evidence only and is not proof of musical correctness.

## 4. Teacher revision and sharing boundary

Automatic source, teacher-corrected revision and teacher-approved exact revision remain distinct states.

```text
AUTOMATIC SOURCE
  -> TEACHER-CORRECTED REVISION
  -> POST-CORRECTION REVALIDATION
  -> TEACHER-APPROVED EXACT REVISION
  -> SHARE AUTHORIZATION
  -> QUALITY/PROVENANCE ELIGIBILITY
  -> STUDENT DELIVERY (later)
```

A later correction must not inherit an older approval, authorization or stale automatic-source quality evidence.

Package 12-T1 and T2 do not expose revision payload content, create public links/tokens, authenticate recipients, persist sharing grants or perform actual network delivery. Package 12-T3 adds bounded corrected-revision revalidation/provenance; it does not itself implement recipient authentication, persistence or delivery.

## 5. Package 8B-T1 through T5

T1 remains the strict production-oriented evidence contract and keeps exact `.omr` evidence mandatory for a genuine T1 trainable sample. T2 verifies supplied bytes/path/digest. T3 maps only five accidental classes and keeps its evaluation page-disjoint only. T4 adds the distinct research approval scope `audiveris_classifier_research_sample` and admits only non-commercial research intent with complete exact per-sample approval. T5 requires exact admitted-sample identity, raw mask evidence matching the T3 SHA-256 and explicit Audiveris `interline` before producing a serializer-ready staging manifest.

Current real population remains 2,714 mapped samples, 0 exact T4 approvals, 0 T4 admitted samples and 0 T5 serializer-ready real samples.

## 6. Package 8B-T6 architecture — COMPLETED

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

The external probe receipt must bind exact pinned revision, exact archive SHA-256, exact expected/loaded sample count and required probe API identity. Revision drift, a dirty checkout, archive mutation, failed load, count mismatch, wrong API identity or malformed receipt fails closed.

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

## 7. Package 8B continuing boundary

Package 8B remains **Partially implemented**. T6 closes the serializer/acceptance engineering contract but no real Package 8B record currently reaches T5 serializer-ready state because exact T4 approvals remain 0.

The next evidence-supported 8B boundary is real teacher/research evidence acquisition and exact T4/T5 admission. Only after genuine real samples pass T4/T5 may T6 create a real archive and bind a real pinned-Audiveris acceptance receipt.

Classifier training, evaluation and production-model adoption remain separate later gates. Do not invent a new substage to bypass missing evidence. Package 8B is deferred research and does not currently block the approved application roadmap.

## 8. Discovery boundary

Discovery / Score Search is a product-architecture module, not part of the canonical music engine and not currently an implemented package.

It may locate candidate PDF/MusicXML sources, but any external source must re-enter normal intake and verification. Discovery may not:

- mark a source as musically verified;
- generate teacher approval;
- bypass OMR/provenance/quality gates;
- silently redistribute copyrighted material;
- become a second canonical music authority.

## 9. Mobile / PWA boundary

The music engine remains platform-independent domain logic. Mobile productisation should expose it through the browser/PWA application without moving musical authority into device-specific UI code.

Primary target environments are:

- iPhone / Safari / VoiceOver;
- Android / Chrome / TalkBack;
- modern desktop browsers.

Device-level microphone, TTS and audio lifecycle behavior belongs to the application/accessibility layer; the Package 11 tuner keeps microphone audio local-only.

## 10. Protected production boundary

Without separate explicit authorization, keep unchanged:

- production Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway and backend production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render deployment connection;
- production model selection/replacement;
- CI workflow/dependencies.

## 11. Security dependency summary

| Feature | Evidence gate | Authorization |
|---|---|---|
| Package 8 teacher revision | Exact revision/history | Exact teacher approval only |
| Package 12-T1 sharing | Exact revision + approval + recipient binding | Exact share authorization only; no payload |
| Package 12-T2 eligibility | Exact source-array + provenance + 2C/2D evidence | Eligibility metadata only; no delivery |
| Package 12-T3 | Fresh bounded post-correction provenance/quality | Completed revalidation boundary; no delivery |
| Discovery | Source/licence metadata only | No musical or student-delivery authority |
| 8B-T1 candidate | Strict T1 evidence including `.omr` | Exact T1 training approval |
| 8B-T2 readiness | Exact supplied bytes/path/hash | No approval inferred |
| 8B-T3 mapping | Exact annotation/bbox/mask hash | No training authorization |
| 8B-T4 admission | Exact T3 sample + licence/use | Exact T4 research approval |
| 8B-T5 staging | Exact T4 admission + raw mask + interline | Serializer-ready only |
| 8B-T6 native ZIP | Exact T5 staging manifest | Archive built pending pinned acceptance only |
| 8B-T6 pinned acceptance | Validated build + exact revision/archive/count/API receipt | Repository acceptance only; no training authorization |
| Actual Audiveris training | Not executed | Separate explicit gate required |
| Production model replacement | Not implemented | Measured comparison + separate explicit authorization required |

## 12. Current next step

The application sequence now continues with the remaining reviewed Package 12 stages:

```text
Package 12 authenticated recipient access
  -> Package 12 persistence / delivery stages
  -> Package 13 simplified rhythm mode
  -> Package 14 iOS + Android + desktop accessibility/PWA closure
```

Discovery / Score Search requires a separate reviewed package and must not bypass the active sequence unless the roadmap is explicitly changed.
