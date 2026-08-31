# SesliTab Teacher Score Editor Architecture

Tarih: 31 Ağustos 2026  
Durum: **Stage A–L bounded product roadmap protected `main` üzerinde production durumundadır.** Bu kapanış; evrensel müzikal doğruluk, kaynak görüntüyle birebirlik veya authenticated öğrenci teslimatı iddiası değildir.

Bu belge, öğretmen çalışma alanı, score runtime, quality routing ve Package 12 readiness sınırları için canonical production mimari referanstır. SHA, PR ve workflow numaraları yalnız audit kanıtıdır; mimari sözleşmenin kendisi değildir.

## Status vocabulary

- **PRODUCTION** — bounded capability production `main` kodu ve ilgili testlerle mevcuttur.
- **BOUNDED** — yalnız açıkça kanıtlanan veri/sözleşme alanında çalışır; unsupported veya belirsiz durum fail-closed kalır.
- **OUT_OF_SCOPE** — mevcut ürün özelliği değildir; ayrı bir geliştirme ve güvenlik sözleşmesi gerekir.
- **BLOCKED_BY_CONTRACT** — mevcut sözleşme bilinçli olarak ilerlemeye izin vermez.

## 1. Product purpose

SesliTab, görme engelli, az gören ve gören öğrenciler için öğretmen denetimli, erişilebilir ve yarı otomatik bir müzik eğitim uygulamasıdır.

Amaç yalnızca PDF → MusicXML dönüşümü değildir. Sistem; nota, ritim, TTS, playback, Guitar TAB, violin ve tuner çıktılarında belirsizliği gizlemeden öğretmenin inceleme, düzeltme ve exact-revision approval kararını korur.

Temel ilke:

`Structural validity != musical correctness`

Parse edilebilir veya yapısal olarak geçerli MusicXML, kaynak görüntüyle ya da müzikal olarak doğru olduğunu tek başına kanıtlamaz.

## 2. Current production status

Protected `main` üzerinde Stage A–L bounded product zinciri production'dadır. Açık PR/issue fresh-read sırasında yoktur. Package 8B'nin gerçek eğitim verisi/training sonucu yoktur; araştırma sözleşmesi production modeline kanıt sağlamaz.

Mevcut ürün; PDF/OMR, MusicXML, Guitar TAB, canonical note/timing, quality evidence, öğretmen workspace'i, score presentation, TTS/playback, MIDI, Guitar TAB/violin consumer'ları, Discovery, tuner ve bounded student/share readiness yüzeylerini içerir.

`READY_EXACT_REVISION`, yalnız Package 12 readiness sonucudur. Öğrenci hesabı, kalıcı yetki veya teslimat değildir.

## 3. High-level architecture

```text
PDF -> mevcut OMR Gateway/Audiveris sınırı -> MusicXML
MusicXML / TAB -> parser + normalization
  -> canonical NoteObject[] + timing
  -> structural / quality / provenance evidence
  -> PASS / REVIEW / BLOCK consumer routing
  -> TTS / playback / MIDI / Guitar TAB / violin / score presentation

Teacher workspace:
automatic revision -> bounded correction -> corrected revision
  -> canonicalization/materialization -> revalidation -> rerender
  -> exact-revision teacher approval
  -> Package 12 authorization + eligibility/readiness evaluation
```

Canonical note/timing modeli bütün musical consumer'ların ortak authority'sidir. UI, renderer, Discovery veya herhangi bir projection kendi pitch, duration, onset, voice, staff, tie veya measure anlamını icat edemez.

## 4. Teacher workflow

Teacher-facing bounded workflow:

1. Eseri açar ve score/çıktıları görür.
2. Measure veya exact canonical note seçer.
3. Desteklenen alanı düzeltir ve yeni immutable revision oluşturur.
4. Revalidation sonucunu görür; kanıt varsa rerender yapılır.
5. Gerekirse `Geri Al` ile yeni lineage oluşturur.
6. Onayını exact current revision'a bağlar.
7. Quality/share readiness sonucunu ayrı bir kanıt olarak değerlendirir.

Stage A, teknik revision ayrıntılarını normal öğretmen akışından ayırır; domain authority'yi değiştirmez.

## 5. Revision lifecycle

```text
original/imported revision
        ↓
teacher review
        ↓
bounded correction
        ↓
corrected revision
        ↓
revalidation
        ↓
rerender when evidence permits
        ↓
teacher approval of the exact revision
        ↓
quality/share eligibility evaluation
```

Automatic/imported revision immutable kalır. Correction eski revision'ı overwrite etmez. Undo geçmişi silmez veya pointer'ı sessizce geri taşımaz; yeni immutable lineage üretir. Daha sonraki correction/undo önceki approval'ı otomatik olarak geçerli kılmaz.

## 6. Score runtime

Production score runtime, pinned ST Score Rendering Layer runtime'ını build sırasında hazırlar ve score'u browser'da aynı-origin bounded host üzerinden gösterir. SesliTab, renderer'ın sahip olduğu OSMD ayrıntılarını veya geometrisini semantic kaynak olarak kullanmaz.

Runtime sınırları:

- score render ve lifecycle hata durumları fail-closed temizlenir;
- canonical measure cursor exact part/measure identity ile senkronlanır;
- stale score/iframe state'i temizlenip güvenli retry yapılabilir;
- dar viewport'ta controlled horizontal scrolling kullanılır;
- render/runtime kanıtı yoksa score güvenilir biçimde gösterilmiş sayılmaz.

Primary implementation: `src/scoreViewUi.js`, `src/services/scoreRendererConsumer.js`, `scripts/prepareScoreRuntime.js`, `tests/stageBScoreRuntimeStabilization.test.js`, `tests/scoreRuntimeBinding.test.js`.

## 7. Renderer boundary

Renderer yalnız **presentation / interaction layer**'dır.

Renderer:

- canonical score'un sahibi değildir;
- müzikal semantic authority değildir;
- teacher approval üretmez;
- correction engine değildir;
- quality veya provenance kararı vermez.

Stage C'nin reviewed interaction bridge'i `hitTestNote` ve `highlight` için yalnız bounded `ScoreNoteRef` kullanır. SesliTab, exact canonical `NoteObject[]` içindeki part, measure, voice, staff, onset ve preserved source order kanıtıyla eşleme yapar. Pitch, görünür label, SVG yakınlığı veya tahmini geometry semantic eşleme için kullanılamaz.

Kanıt eksik, stale, ambiguous veya out-of-range ise selection/highlight abstain eder.

## 8. Correction boundary

Stage E öğretmen yüzeyini şu bounded intent alanlarıyla sınırlar:

- `step`
- `alter`
- `octave`
- `durationValue`

String/fret, MIDI, frequency, voice, staff, tie, source identity ve verification evidence doğrudan öğretmen alanı değildir.

Stage F, teacher intent ile system-derived canonicalization/materialization/revalidation'ı ayırır. Pitch için `midi`, `frequency`, `noteName` ve yalnız kanıtlanabilen aynı-string `fret`; duration için `beats`, `duration`, `dotCount` ve timeline coherence üretilebilir. Corrected MusicXML exact source provenance'tan materialize edilmeden eski XML yeni correction uygulanmış gibi render edilmez.

Unsupported correction, eksik materialization, stale lineage veya başarısız structural revalidation **BLOCKED_BY_CONTRACT** / fail-closed kalır.

## 9. Quality routing

Stage G mevcut exact consumer quality gate sonuçlarını product route'a map eder:

- `ACCEPT` + `allowed=true` + `definitive=true` + `automaticAllowed=true` → `PASS` — **Otomatik kontrollerden geçti**
- `REVIEW` → `REVIEW` — **İnceleme gerekiyor**
- `BLOCK`, invalid, unknown veya malformed karar → `BLOCK` — **Kullanım engellendi**

Aggregate route strictest state'i kullanır: `BLOCK > REVIEW > PASS`.

PASS yalnız ilgili bounded consumer için permission verir. Teacher approval, share authorization, share eligibility veya student delivery vermez. REVIEW definitive output yerine bounded review davranışına gider. BLOCK hiçbir definitive downstream consumer'a ilerleyemez.

## 10. Review playback

Stage H, mevcut playback gate kararını değiştirmeden dört açık route kullanır:

- `DEFINITIVE` — exact playback gate açıkça definitive ve automatic izin veriyorsa;
- `REVIEW_PREVIEW` — REVIEW kararında structural/reliable kanıt yeterliyse explicit non-definitive preview;
- `REVIEW_WITHHELD` — REVIEW kalır fakat preview kanıtı yetersizse playback kapalı;
- `BLOCKED` — BLOCK veya malformed/invalid karar.

Review preview yalnız **İnceleme İçin Dinle** ve **Doğrulanmamış önizleme** diliyle sunulur. REVIEW hiçbir zaman PASS/ACCEPT'e yükseltilmez ve BLOCK bypass edilmez.

## 11. Guitar TAB / Violin consumers

Stage I, mevcut Package 9 Guitar TAB ve Package 10 Violin consumer'larını Stage G routing'ine bağlar.

- PASS + ilgili consumer'ın açık definitive permission'ı varsa bounded action açılır.
- REVIEW/BLOCK durumunda solver/builder çağrısı yapılmaz veya definitive output withheld kalır.
- Desteklenmeyen, ambiguous veya unplayable yapı partial/tahmini TAB veya fingering olarak gösterilmez.
- Generated string/fret/position evidence teacher approval veya source truth değildir.
- Stage I `teacherApproved`, `shareAuthorized` veya `studentDeliveryAuthorized` üretmez.

Primary implementation: `src/services/guitarTabConsumer.js`, `src/services/violinConsumer.js`, `src/services/stageIInstrumentProduct.js`, `src/stageIInstrumentProductUi.js`.

## 12. Discovery

Stage J Discovery yalnız source-finding presentation'ıdır:

`FOUND != SOURCE VERIFIED != MUSICALLY VERIFIED != TEACHER APPROVED`

Arama seçenekleri, trust notice ve **Kaynak Sitesinde Aç** eylemi mevcuttur. `sourcePageUrl`, rights/licence alanları ve gateway/provider semantiği presentation tarafından değiştirilmez. Güvenli import/view mümkün değilse external source action kullanılır; bulunan PDF/MusicXML normal intake, provenance, quality ve teacher-review akışına geri girer.

Discovery verification authority kazanmaz; müzikal doğruluk, teacher approval veya student sharing izni üretemez.

## 13. Tuner

Stage K, Package 11 chromatic tuner'ı compact presentation'a taşır; tuner motorunu değiştirmez.

```text
device microphone
  -> browser-local Web Audio / bounded pitch detector
  -> note, Hz, cents guidance
  -> local display
```

`Mikrofonu Başlat` ve `Durdur` explicit user action'tır. Mikrofon sessizce başlamaz; ses upload, persistence veya recording'e gitmez. La4 calibration, Hz/cent readout ve threshold açıklamaları secondary details altında kalabilir. Covered controls için minimum 44px hedef ve keyboard-visible focus korunur.

## 14. Package 12 share readiness

Package 12'nin production bounded zinciri ayrı kanıt türleridir:

1. **T1 share authorization** — exact revision + exact approval + recipient label binding; in-memory metadata.
2. **T2 share eligibility** — automatic root için live exact source/provenance/quality eligibility.
3. **T3 corrected revalidation** — bounded pitch/position corrected revision evidence.
4. **T4 structural revalidation** — bounded duration/timeline, voice/staff, tie/chord ve permitted undo-history evidence.

Stage L, current workspace revision'ını bu mevcut evaluator'larla kontrol eder. Sadece applicable evaluator `eligible` döndürürse `ready_exact_revision` sonucu verilir. Teacher approval, authorization, revalidation ve eligibility birbirinin yerine geçmez.

## 15. Student delivery boundary

`READY_EXACT_REVISION != DELIVERED_TO_STUDENT`

Stage L bounded readiness UI şunları üretmez:

- authenticated student account veya identity verification;
- persistent authorization/grant;
- share token, invite code veya share URL;
- downloadable payload/content bytes;
- student portal access;
- backend/network/email/message delivery.

Production sonucu `deliveryState = not_implemented` ve `deliveryAllowed = false` olarak fail-closed'dur. Gerçek öğrenci teslimatı A–L'nin tamamlanmamış bir alt görevi değil, ayrı bir security/application architecture programıdır.

## 16. Security invariants

- Original/imported MusicXML ve automatic revision sessizce overwrite edilmez.
- Structural validity musical correctness değildir.
- Her approval exact current revision'a bağlıdır.
- Correction/undo eski approval veya authorization'ı miras almaz.
- T1/T2/T3/T4 kanıtı exact source, revision, lineage ve applicable scope'a bağlıdır.
- `PASS`, teacher approval değildir; teacher approval, share eligibility değildir.
- `shareEligible`, authenticated access değildir.
- `teacherApproved`, `studentDelivered` anlamına gelmez.
- Renderer, Discovery ve UI semantic authority değildir.
- Unsupported, malformed, stale veya ambiguous evidence tahminle tamamlanmaz.
- Package 12 readiness, network delivery veya student access grant değildir.

## 17. Accessibility invariants

Mevcut production kanıtının kapsadığı davranışlar:

- native button/input/select/details ve label semantiği;
- keyboard interaction ve `:focus-visible` görünür focus;
- gerekli dinamik durumlarda `role=status`, `role=alert` ve `aria-live` metni;
- quality/readiness anlamının yalnız renge bırakılmaması;
- covered mobile/narrow-browser akışlarında minimum 44px interactive target;
- Stage C canonical note-selection controls;
- narrow viewport'ta controlled layout/scroll.

Bu belge, ayrı operational QA kanıtı yoksa iPhone Safari + VoiceOver veya Android Chrome + TalkBack için tamamlanmış manuel sertifikasyon iddia etmez.

## 18. Fail-closed rules

- Missing veya malformed quality evidence → REVIEW/BLOCK; PASS varsayılanı yoktur.
- Exact identity/revision/source eşleşmesi kanıtlanamıyorsa selection, approval veya eligibility ilerlemez.
- REVIEW definitive consumer'a veya approved output'a dönüştürülmez.
- BLOCK playback preview, TAB, violin veya delivery ile bypass edilmez.
- Corrected MusicXML/materialization/revalidation kanıtı yoksa eski source XML corrected output gibi render edilmez.
- Unsupported correction scope, stale authorization/evidence ve recipient mismatch reddedilir.
- Browser/runtime proof veya SVG/interaction kanıtı yoksa score capability'si doğrulanmış sayılmaz.

## 19. Stage A–L completion matrix

| Stage | Purpose | Production status | Primary files/modules | Safety boundary | Verification evidence |
|---|---|---|---|---|---|
| A | Teacher UI simplification | **PRODUCTION** | `src/appShell.js`, `src/stageATeacherPresentation.js` | Presentation-only; Package 8 semantics unchanged | `tests/stageATeacherPresentation.test.js` |
| B | Score runtime stabilization | **PRODUCTION** | `src/scoreViewUi.js`, `scripts/prepareScoreRuntime.js` | Runtime failure cleanup; no semantic invention | `tests/stageBScoreRuntimeStabilization.test.js`, CI browser script |
| C | Measure/note selection | **PRODUCTION / BOUNDED** | `src/stageCNoteSelectionUi.js`, `src/services/canonicalNoteSelection.js`, `scoreNoteIdentity.js` | Exact canonical identity; renderer remains presentation-only | `tests/stageCNoteSelection.test.js`, score runtime proof |
| D | Quality overlay | **PRODUCTION / BOUNDED** | `src/stageDQualityOverlayUi.js`, `src/services/qualityOverlay.js` | Report-backed, read-only, non-color-only evidence | `tests/stageDQualityOverlay.test.js` |
| E | Visual bounded note editor | **PRODUCTION / BOUNDED** | `src/stageEVisualNoteEditorUi.js`, `src/services/stageEVisualNoteEdit.js` | Only bounded teacher intent fields | `tests/stageEVisualNoteEditor.test.js` |
| F | Undo/revalidation/rerender | **PRODUCTION / BOUNDED** | `src/services/stageF*.js`, `src/stageFRevisionLifecycleUi.js` | Immutable lineage, materialization and product-local revalidation | `tests/stageF*.test.js`, corrected MusicXML/browser fixtures |
| G | PASS/REVIEW/BLOCK routing | **PRODUCTION / BOUNDED** | `src/services/stageGProductRouting.js` | Existing consumer gate only; no new truth authority | `tests/stageGProductRouting.test.js` |
| H | Review playback | **PRODUCTION / BOUNDED** | `src/services/stageHReviewPlayback.js`, `src/app.js` | Explicit non-definitive preview; BLOCK hard stop | `tests/stageHReviewPlayback.test.js` |
| I | Guitar TAB/Violin integration | **PRODUCTION / BOUNDED** | `src/services/stageIInstrumentProduct.js`, UI adapter | PASS permission required; REVIEW/BLOCK withheld | `tests/stageIInstrumentProduct.test.js`, browser fixture |
| J | Discovery presentation | **PRODUCTION / BOUNDED** | `src/stageJDiscoveryPresentation.js`, `src/services/discoveryService.js` | Source-finding only; no verification authority | `tests/stageJDiscoveryPresentation.test.js`, browser fixture |
| K | Compact tuner | **PRODUCTION / BOUNDED** | `src/stageKTunerPresentation.js`, Package 11 tuner UI | Explicit mic action; local audio only | `tests/stageKTunerPresentation.test.js`, Package 11 tests, browser fixture |
| L | Student/share readiness UI | **PRODUCTION / BOUNDED** | `src/stageLShareUi.js`, `src/services/stageLShareReadiness.js` | Readiness only; actual delivery **BLOCKED_BY_CONTRACT** | `tests/stageLShareReadiness.test.js`, browser fixture |

## 20. Out-of-scope capabilities

### CURRENTLY OUT OF SCOPE

The following are not missing Stage L details; they require a separate security/application program:

- authenticated student accounts;
- persistent student identity;
- backend student delivery;
- permanent share authorization;
- share token or invite code;
- share URL/link service;
- remote delivery service;
- student portal;
- cloud persistence;
- server-side authorization.

Also outside this docs refresh are new OMR/recognizer behavior, universal musical verification, renderer semantic expansion, new dependencies, unrelated refactors, and Package 8B model training/replacement.

## 21. CI / production verification model

Production verification is evaluated as:

```text
protected main
  + required CI: test-and-build
  + full regression suite
  + production build
  + real-browser/runtime proof when the workflow can run it
```

The CI workflow installs Node 24 dependencies, runs `npm test`, runs `npm run build`, and executes `scripts/verifyScoreRuntimeBrowser.js`. The browser script covers desktop/narrow score runtime and the bounded Stage F/I/J/K/L proofs when Chrome/Chromium is available.

Fresh-read on 31 Ağustos 2026: current protected `main` is `e40e3b3…`; the connector exposed no separate workflow run/status for that exact docs-only merge commit. This is recorded as an evidence limitation, not converted into a false exact-main pass. The fresh local baseline independently produced 1519/1519 tests and a successful production build; local browser proof was **UNVERIFIED** because Chrome/Chromium was not installed.

## 22. Future development rules

- Begin every change with fresh-read of protected `main`, rules/checks, open PR/issues, code, tests and runtime evidence.
- Keep documentation-only changes separate from behavior changes.
- Do not make production code fit stale documentation; classify code/document conflicts as blockers and open a separate issue/PR.
- Preserve exact revision, source, lineage, approval, quality and share evidence boundaries.
- Add no authentication, persistence, token, URL or network delivery by implication.
- Do not make renderer, Discovery, UI or generated instrument output a semantic authority.
- Require focused tests, full regression, build and applicable browser proof before calling a bounded capability production.
