# SesliTab Music Engine — Güncel Mimari

**Belge sürümü:** 3.8.0  
**Güncelleme tarihi:** 2026-08-31
**Fresh-read ürün baseline:** protected `main` `e40e3b3e8d9029673efd780d44c6eefe34ba1e18`
**Ürün durumu:** Stage A–L production bounded chain; Package 12 T1–T4 exact-revision contracts are present, while actual authenticated student delivery is out of scope.
**8B research state:** Research-only; engineering gates exist, genuine admitted/training evidence remains absent.

> Bu belge müzik/OMR domain otoritesini tanımlar. Üst seviye ürün ve UI haritası için `docs/product-architecture.md`, görsel öğretmen editörü için `docs/teacher-score-editor-architecture.md`, gerçek durum için `docs/current-status.md` ve `docs/package-status.md` esas alınır.

## 1. Değişmez müzik otoritesi ilkesi

SesliTab öğretmen denetimli, yarı otomatik ve erişilebilir bir müzik eğitimi sistemidir. Aşağıdaki kanıtlar birbirinden ayrıdır:

- yapısal geçerlilik;
- kaynak/provenance doğrulaması;
- kalite kapısı sonucu;
- öğretmen düzeltmesi;
- exact-revision öğretmen onayı;
- paylaşım yetkisi;
- Audiveris research/training kabulü.

UI, Discovery ve score renderer müzikal semantik otorite değildir.

Valid XML, başarılı render veya OMR'ın hata vermemesi tek başına müzikal doğruluk kanıtı değildir.

## 2. Ana veri akışı

```text
Discovery / direct input
  -> PDF / MusicXML / Guitar TAB intake

PDF
  -> existing Cloud OMR Gateway
  -> existing Audiveris provider/runtime
  -> MusicXML

MusicXML
  -> parser / normalization
  -> canonical NoteObject[] + timing authority
  -> structural/rhythmic validation
  -> quality + provenance evidence
  -> PASS / REVIEW / BLOCK product mapping
  -> bounded consumers
```

Consumers include rhythmic text/HTML, Turkish TTS, Web Audio/MIDI, Guitar TAB, violin and score presentation. They may not build independent pitch/timing truth.

## 3. Canonical music authority boundary

All musical projections must consume shared canonical note/timing authority.

```text
source evidence
  -> parser
  -> canonical event identity/timing
  -> validator
  -> quality/provenance
  -> consumer gate
  -> presentation/output
```

The UI, renderer, TTS, playback, MIDI, Guitar TAB and violin systems must not independently invent:

- pitch;
- octave;
- duration;
- onset;
- voice;
- staff;
- tie;
- tuplet;
- measure identity;
- source verification.

Unsupported or missing semantic evidence must fail closed rather than be repaired by presentation code.

## 4. Auto-Pass / Review / Block relation to the music engine

Official product decision: **Teacher approval is not universally mandatory.**

This is a product-routing decision, not permission to weaken the music engine.

### PASS

A bounded consumer may proceed automatically only when its existing quality/provenance gate accepts the exact canonical evidence required by that consumer.

User-facing meaning: **Otomatik kontrollerden geçti.**

PASS does not mean:

- teacher approved;
- visually identical to the original PDF;
- universally safe for every consumer;
- authorized for student sharing under every current Package 12 contract.

### REVIEW

The evidence requires teacher review/correction before definitive downstream use. Future provisional playback may be allowed only by a separately defined safe preview policy.

### BLOCK

Critical/unsupported evidence remains prohibited from definitive downstream output. Teacher approval cannot convert structural BLOCK into PASS.

Invariant: `Auto-Pass != teacher-approved`.

## 5. Package 8 teacher revision boundary

Package 8 remains Completed at the domain level.

```text
AUTOMATIC SOURCE
  -> BOUNDED TEACHER CORRECTION
  -> NEW IMMUTABLE REVISION
  -> EXACT APPROVAL WHEN APPLICABLE
  -> LOSSLESS HISTORY / UNDO
  -> STALE EDIT / CONCURRENCY PROTECTION
```

Stage A UI simplification does not modify this model. It only changes presentation labels/grouping.

Rules:

- automatic source is immutable;
- correction creates new lineage;
- old approval does not transfer to a later revision;
- undo does not rewrite history;
- audit identity is not silently invented;
- approval is not quality acceptance or sharing authorization.

## 6. Corrected-revision revalidation and Package 12

Package 12's bounded exact-revision contracts are production. Stage L exposes readiness metadata only; it does not implement authentication, persistence, tokens, URLs or network delivery.

```text
T1 exact sharing authorization                 [production]
T2 exact source/provenance/quality eligibility [production]
T3 bounded corrected pitch/position evidence   [production]
T4 structural/rhythmic corrected revalidation  [production / bounded]
auth/persistence/network delivery              [out of scope]
```

T3 must not be interpreted as proof for correction classes it explicitly excludes.

T4 is separate domain-security work. Stage A neither duplicates nor modifies it. Protected main must continue to fail closed for unsupported corrected structural/rhythmic classes until a verified merged boundary exists.

The new product Auto-Pass policy does not automatically authorize student sharing. Existing Package 12 authorization semantics remain in force until separately revised.

## 7. Score renderer boundary

Score rendering is presentation-only.

Current verified SesliTab integration supports:

- pinned ST Score Rendering Layer runtime;
- rendered score display;
- canonical measure cursor synchronization;
- real-browser render/cursor proof in the latest verified PR #140 CI.

The verified Stage B–D contract includes bounded note hit-test/highlight and stable canonical note selection identity, quality evidence overlay, accessible interaction/status handling and narrow-layout bounds. These remain presentation/interaction capabilities only.

Renderer code may not create pitch/duration/voice/tie/octave values to avoid a crash. The reported `Invalid note initialization object: {}` symptom must be reproduced in Stage B and fixed at its true source.

Any `st-score-rendering-layer` contract expansion requires fresh-read and separate review before cross-repository changes.

## 8. Guitar and violin consumers

Package 9 Guitar TAB and Package 10 violin remain bounded quality-gated consumers of canonical data.

Generated fingering/position evidence:

- is not teacher approval;
- cannot bypass structural BLOCK;
- cannot repair missing canonical musical semantics;
- must remain deterministic/fail-closed under unsupported input.

Stage I connects PASS/REVIEW/BLOCK routing to these existing consumer gates without changing their musical authority. Stage I does not generate teacher approval, share authorization or student delivery authorization.

## 9. Playback / TTS / MIDI

TTS, Web Audio, selected-measure playback and MIDI must remain consumers of the same canonical timing/pitch model.

Normal definitive playback belongs to PASS or otherwise safely revalidated/authorized content under the applicable gate.

The Stage H **İnceleme İçin Dinle** route is bounded and explicitly non-definitive. It must not allow unsafe BLOCK material to play or bypass quality gates.

## 10. Discovery boundary

Discovery is implemented as a product source-finding surface but remains outside musical verification authority.

```text
FOUND
!= SOURCE VERIFIED
!= MUSICALLY VERIFIED
!= TEACHER APPROVED
```

A discovered source must re-enter normal intake/validation before downstream musical trust is granted.

## 11. Package 11 tuner boundary

The chromatic tuner remains browser-local and separate from canonical score authority.

```text
microphone
 -> local Web Audio analysis
 -> bounded pitch estimate
 -> note / Hz / cents guidance
```

Microphone audio is not uploaded or persisted by the tuner contract. Stage K may change presentation size only; it must not weaken this privacy boundary.

## 12. Package 8B research/training boundary

Package 8B is deferred research and must never be used to fabricate production-model confidence.

Pinned Audiveris research serializer/acceptance engineering remains bound to revision:

`7a36078e7ba0c006052c1f661b949cf9b729f505`

The engineering chain retains separate gates for:

- trainable-candidate evidence;
- exact byte/path/hash readiness;
- bounded accidental mapping;
- research-only sample admission;
- native sample staging;
- deterministic native serializer;
- pinned `SampleRepository` acceptance.

Current genuine population must not be overstated:

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

A successful engineering fixture is not evidence that real training occurred and never authorizes production model replacement.

## 13. Protected production boundary

Without separate explicit authorization, keep unchanged:

- production Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway and backend production OMR path;
- `Dockerfile`;
- `render.yaml`;
- Render deployment connection;
- production model selection/replacement;
- framework/dependency set;
- authentication/database infrastructure.

## 14. Security dependency summary

| Feature | Evidence gate | Authority granted |
|---|---|---|
| Canonical music | parser + structural evidence | shared music-event authority only |
| Quality gate | exact quality/provenance evidence | bounded consumer eligibility |
| PASS product mapping | accepted consumer-specific evidence | automatic route for that bounded consumer only |
| Package 8 correction | exact immutable revision/history | new corrected revision only |
| Package 8 approval | exact current revision | teacher approval only |
| Package 12-T1 | exact revision + approval + recipient | share authorization metadata only |
| Package 12-T2 | exact source/provenance/quality | eligibility metadata only |
| Package 12-T3 | bounded corrected revalidation | corrected evidence metadata only |
| Package 12-T4 | not merged | no new protected-main authority yet |
| Discovery | source/licence metadata | no musical verification |
| Renderer | canonical presentation contract | presentation/interaction only |
| Tuner | local microphone estimate | tuning guidance only |
| 8B research | staged exact research evidence | research/acceptance state only |

## 15. Current safe development sequence

For the UI/product architecture requested on 2026-08-29:

```text
Stage A  teacher UI + product shell simplification
  -> Stage B score runtime stabilization/responsive scaling
  -> Stage C note/measure selection contract
  -> Stage D quality overlay
  -> Stage E bounded visual editor
  -> Stage F undo + revalidation + rerender
  -> Stage G PASS/REVIEW/BLOCK product routing
  -> Stage H provisional REVIEW playback
  -> Stage I Guitar TAB + violin product integration
  -> Stage J Discovery presentation
  -> Stage K compact tuner
  -> Stage L sharing UI only when Package 12 gates allow it
```

Stage A–L and Package 12 T1–T4 are merged production boundaries. Any future expansion of corrected fields, authentication, persistence or delivery requires a separate security-reviewed contract and must not be inferred from this document.
