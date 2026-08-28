# SesliTab Music Engine — Güncel Mimari

**Belge sürümü:** 2.2.0  
**Güncelleme tarihi:** 2026-08-28  
**Doğrulanan başlangıç main:** `c096f0daa43eb20c79fea46d1d76211b8fcb49dc`  
**T1 kapanış main:** `218c3e18eed3a82861a4a1c24efd5458445ea9ca`  
**T2 kapanış main:** `f6d80b4614654ee63a4fd2d51101e4961476a1ee`  
**T3 kapanış main:** `70a02589206eeea9c3defec4d5f544e9222cbe3a`  
**Durum:** Mevcut kod ve kapanmış paketlerle uzlaştırılmış mimari yönlendirme belgesi.

Bu belge ürünün güncel mimarisini açıklar. Paket kapanış kanıtları için `docs/package-status.md` ve ilgili `docs/package-*-closure.md` belgeleri; güncel repository gerçeği için kaynak kod, testler ve fresh CI kanıtı esas alınır.

## 1. Değişmez ürün ilkesi

SesliTab öğretmen denetimli, yarı otomatik ve erişilebilir bir müzik eğitimi sistemidir.

Yapısal olarak geçerli MusicXML, müzikal doğruluk kanıtı değildir. Kaynakla doğrulanmamış veya kalite kapısında güvenli bulunmamış veri öğrenciye kesin doğru bilgi olarak sunulmamalıdır. Otomatik OMR verisi, öğretmen düzeltmesi ve öğretmen onayı birbirinden ayrı sürüm/kayıtlar olarak korunmalıdır.

## 2. Güncel ana veri akışı

```text
PDF
  -> mevcut Cloud OMR Gateway
  -> mevcut Audiveris provider/runtime
  -> MusicXML

Doğrudan MusicXML -------------------------┐
Guitar TAB metni ----------------------┐   │
                                       │   │
                                       v   v
                              parse / normalize
                                      |
                                      v
                         canonical NoteObject[]
                    canonical pitch + timing identity
                                      |
                  +-------------------+-------------------+
                  |                                       |
                  v                                       v
     structuralRhythmValidator                 qualityErrorReport
                  |                                       |
                  +-------------------+-------------------+
                                      v
                               appQualityGate
                         ACCEPT / REVIEW / BLOCK
                                      |
       +----------------+-------------+-------------+----------------+
       |                |             |             |                |
       v                v             v             v                v
 rhythmic text/HTML   TTS/playback   MIDI       Basic Guitar TAB  Basic Violin
                                      |
                                      +-----------------------------+
                                                                    |
MusicXML <harmony> -> source-only chord parser/presentation/TTS <---+

Package 8 revision layer:
AutomaticSourceRevision (immutable)
  -> controlled replace-only correction operation(s)
  -> TeacherCorrectedRevision (new immutable revision)
  +-> TeacherCorrectionAuditEvent (separate immutable audit evidence)
  -> validation/quality per revision
  -> TeacherApprovalRecord (separate immutable exact-revision approval)
       -> exact sourceId + sourceRevisionId + revisionId + contentFingerprint
       -> later/new revision: NOT_APPLICABLE_TO_REVISION unless explicitly approved
  -> future T4 lossless history/undo view
  -> later Package 12 student sharing of approved exact revision only
```

## 3. Doğrulanmış mimari katmanlar

### 3.1 Girdi ve OMR katmanı — korunacak mevcut bağlantı

Mevcut PDF yolu backend OMR gateway ve provider mimarisi üzerinden çalışır. Audiveris ana OMR motorudur. Package 1A/1B ve Package 2E kapsamında kuyruk, iptal/retry, dosya/XML güvenliği ve benchmark sınırları kapanmıştır.

**Package 8 kapsamında ayrı izin olmadan değiştirilmeyecek alanlar:**

- `backend/` içindeki Audiveris provider/runtime/preflight davranışı
- OMR worker/provider seçimi
- Cloud OMR Gateway sözleşmeleri
- üretim MusicXML OMR yolu
- `Dockerfile`
- `render.yaml`
- mevcut Render servis bağlantısı ve deployment ayarları

Yeni öğretmen çalışma katmanı OMR altyapısını yeniden yazmamalı veya Audiveris'e bağımlı yeni bir revision modeli oluşturmamalıdır. OMR yalnız otomatik kaynak verisini sağlar; Package 8 bunun üzerinde sürümleme/audit/onay sözleşmeleri kurar.

### 3.2 Canonical nota ve zaman modeli — Package 2A

Ana sözleşme `canonicalNoteModel.js` ve canonical consumer katmanları etrafında kuruludur. TTS, playback, validator, MIDI, TAB ve enstrüman tüketicileri birbirinden bağımsız pitch/timing hesabı üretmemelidir.

Temel kimlik ilkeleri:

- fiziksel ölçü kimliği `measureKey` / part + measure index ile korunur;
- görünen ölçü numarası benzersiz kimlik değildir;
- canonical event referansları tüketiciler arasında korunur;
- eksik nota/ritim otomatik olarak icat edilmez;
- kaynak doğrulama durumu müzikal doğrulukla eş anlamlı değildir.

### 3.3 Yapısal doğrulama ve kalite — Package 2B–2D

- `src/services/structuralRhythmValidator.js`: yapısal ve ritmik bulgular
- `src/services/qualityErrorReport.js`: hata/kalite raporu
- `src/services/appQualityGate.js`: tüketici bazlı fail-closed karar
- `canonicalConsumerPolicy.js` / `canonicalConsumerBindings.js`: canonical tüketici sınırları

Kalite kapısı öğretmen onayının yerine geçmez. `ACCEPT`, yalnız mevcut otomatik tüketim sözleşmesi açısından gerekli yapısal/kaynak koşullarının karşılandığını gösterir; öğretmen tarafından onaylanmış anlamına gelmez.

### 3.4 OMR benchmark — Package 2E

Benchmark altyapısı farklı giriş/preprocessing varyantlarını ölçmek için izole edilmiştir. Üretim OMR hattını otomatik olarak değiştirmez, farklı OMR sonuçlarından nota birleştirmez ve universal accuracy iddiası üretmez.

### 3.5 Playback, ölçü seçimi ve MIDI — Package 3

Doğrulanmış davranışlar:

- tam eser için `Müziği Dinle`;
- tek aktif playback oturumu;
- canonical `measureKey` ile ölçü seçimi;
- Ritimli HTML içinde erişilebilir ölçü kontrolleri;
- seçili ölçüde TTS/playback;
- quality-gated deterministic SMF0 MIDI export.

### 3.6 Basic Guitar TAB — Package 4

```text
canonical NoteObject[]
  -> GUITAR_TAB quality gate
  -> guitarPositionResolver.js
  -> guitarBasicPositionPolicy.js
  -> guitarBasicTabProjection.js
  -> deterministic renderer/consumer
  -> src/package4Ui.js
```

Bu motor yalnız güvenli temel kapsamı temsil eder. Çok sesli/pedagojik gelişmiş çözüm Package 9 kapsamındadır. Otomatik sonuç öğretmen onayı değildir.

### 3.7 Basic Violin — Package 5

İlk pozisyon, konservatif ve quality-gated keman yönlendirmesi mevcuttur. Gelişmiş pozisyonlar, alternatifler ve çift sesler Package 10 kapsamındadır.

### 3.8 MusicXML harmony ve akor sunumu — Package 6–7

Package 6/7 yalnız kaynak MusicXML `<harmony>` verisini işler. Nota içeriğinden akor tahmini yapmaz.

- source-only harmony parsing/normalization
- `src/services/chordPresentation.js`
- `src/services/chordSourceConsumer.js`
- `src/services/chordTtsConsumer.js`
- `src/package7Ui.js`

Hazır akor çıktısı öğretmen onaylı veya definitive değildir.

## 4. Package 8 — öğretmen düzeltme ve onay katmanının mimari yeri

Package 8 mevcut canonical modeli veya OMR sonucunu yerinde değiştiren mutable bir `Teacher Correction Engine` olmamalıdır. Güvenli sınır immutable revision + ayrı audit + ayrı approval modelidir.

### 4.1 T1 + T2 + T3 ile doğrulanmış mevcut sınır

```text
AutomaticSourceRevision (immutable)
        |
        |  applyTeacherCorrectionBatch
        |  replace_value / existing path only
        v
TeacherCorrectedRevision #1 (immutable)
        +------------------------------+
        |                              |
        v                              v
validator / quality           TeacherCorrectionAuditEvent
per exact revision             (separate, immutable)
        |
        | explicit teacher approval
        v
TeacherApprovalRecord
bound to exact sourceId + sourceRevisionId + revisionId + contentFingerprint
        |
        +--> exact bound revision: APPROVED_EXACT_REVISION
        +--> any later/other revision: NOT_APPLICABLE_TO_REVISION
```

T1/T2/T3 ile doğrulanmış kurallar:

1. Otomatik kaynak sürümü immutable kalır.
2. Düzeltme yeni revision üretir; parent/otomatik sürümün üstüne yazılmaz.
3. Her revision exact parent ve root source lineage taşır.
4. T2 yalnız var olan path üzerinde `replace_value` uygular; insertion/delete yapmaz.
5. Aynı batch içinde duplicate ID, overlapping/same-target path ve no-op fail closed olur.
6. `__proto__`, `constructor`, `prototype` correction target olarak reddedilir.
7. `-0` ve `0` aynı array target olarak canonicalize edilir.
8. Correction audit event revision'dan ayrıdır ve before/after + exact parent/result fingerprint kaydeder.
9. Correction audit event approval değildir.
10. Unsafe/non-deterministic data correction ve audit validation sınırında reddedilir.
11. T3 approval revision içine mutable flag olarak eklenmez; ayrı immutable record'dur.
12. Approval exact source/root-source/revision/fingerprint kimliğine bağlanır.
13. Yeni revision eski approval'ı otomatik devralmaz; içerik fingerprint'i aynı olsa bile exact revision ID eşleşmesi gerekir.
14. Eski approval record yeni revision oluştuğunda mutasyona uğramaz veya silinmez.
15. Quality-gate `ACCEPT` teacher approval'a otomatik çevrilmez ve teacher approval quality güvenliğini bypass etmez.
16. T3 actor identity audit evidence'dır; authentication/authorization T3 kapsamında uygulanmaz.
17. Package 12 öğrenci paylaşımı T3'te aktive edilmez.

### 4.2 Doğrulanmış T3 approval sınırı

```text
TeacherCorrectedRevision R1
   + sourceId S1
   + sourceRevisionId A0
   + revisionId R1
   + contentFingerprint F1
              |
              | explicit teacher approval
              v
TeacherApprovalRecord A1
   bound to (S1, A0, R1, F1)
              |
              +--> R1 = APPROVED_EXACT_REVISION

TeacherCorrectedRevision R2
   revisionId R2 / fingerprint F2
              |
              +--> A1 = NOT_APPLICABLE_TO_REVISION
```

T3 ayrıca aynı fingerprint'e sahip yeni revision'ın da eski approval'ı devralmadığını, farklı source üzerinde benzer kimliklerin approval'ı yeniden kullanamadığını ve malformed/mutable/injected approval kayıtlarının fail closed olduğunu doğrular.

### 4.3 Sonraki aşamalar

- **8-T1 — Revision domain contract: COMPLETED.**
- **8-T2 — Controlled correction operations: COMPLETED.**
- **8-T3 — Approval binding/invalidation: COMPLETED.**
- **8-T4 — Undo/version history: NEXT.** Kayıpsız tarihçe ve geri alma; historical revision/audit/approval evidence overwrite edilmemeli veya silinmemelidir.
- **8-T5 — Optimistic concurrency:** stale base revision conflict.
- **8-T6 — Accessible teacher UI:** önceki domain/history/concurrency katmanları kanıtlandıktan sonra arayüz.

Ayrı **Package 8B — Audiveris training dataset** bu T1–T6 alt aşamalarından farklıdır ve T4 kapsamına alınmamalıdır.

## 5. Güvenlik bağımlılıkları

| Tüketici / özellik | Canonical | Quality gate | Teacher approval |
|---|---:|---:|---:|
| Öğretmen tarafı inceleme görüntüsü | Evet | Uyarı/engelleme semantiği | Hayır |
| Tam eser playback/TTS | Evet | Evet | Mevcut ürün akışında zorunlu değil |
| MIDI export | Evet | Evet | Öğrenci paylaşımı için ayrıca gerekir |
| Basic Guitar TAB | Evet | Evet | Otomatik öneri için hayır; öğrenci paylaşımı için evet |
| Basic Violin | Evet | Evet | Otomatik öneri için hayır; öğrenci paylaşımı için evet |
| Chord source display/TTS | Kaynak + canonical bağ | Fail-closed source state | Öğrenci paylaşımı için evet |
| Package 12 student sharing | Evet | Evet | **Evet, exact revision** |

## 6. Veri sahipliği ve mutasyon sınırı

Aşağıdaki veriler yerinde overwrite edilmemelidir:

- orijinal PDF;
- orijinal OMR sonucu / `.omr`;
- otomatik MusicXML;
- otomatik canonical/source revision;
- teacher-corrected revision'lar;
- teacher correction audit event'leri;
- teacher approval record'ları.

Yeni bir düzeltme mevcut veri nesnesinin güvenilirlik/approval alanını sessizce değiştirmek yerine yeni, izlenebilir bir revision üretmelidir. Gelecekte T4 undo/history de historical kayıtları silmek veya yeniden yazmak yerine lossless history üzerinde çalışmalıdır.

## 7. Erişilebilirlik sınırı

Yeni öğretmen arayüzü eklenmeden önce domain kuralları testlerle kapanmalıdır. Arayüz geldiğinde:

- klavye ile tam kullanılabilir olmalı;
- native controls tercih edilmeli;
- değişiklik/onay/iptal durumları erişilebilir live-region ile bildirilmelidir;
- ekranda görülen revision/onay durumu ile ekran okuyucunun söylediği durum aynı kaynaktan üretilmelidir;
- kritik veya onaysız içerik yalnız renkle ifade edilmemelidir.

## 8. Repository sınırları

- Frontend orchestration/UI: `src/`, `main.js`, `index.html`
- Canonical/parser/theory çekirdekleri: root-level music modules + `src/services/`
- Teacher revision/correction/approval domain: `src/services/teacherRevisionModel.js`, `src/services/teacherCorrectionOperations.js`, `src/services/teacherApprovalModel.js`
- Backend OMR/API: `backend/`
- Tests: `tests/`
- CI: `.github/workflows/`
- Deployment: `Dockerfile`, `render.yaml`
- Mimari/status belgeleri: `docs/`

Package 8-T3 protected main üzerinde tamamlandı. Sıradaki 8-T4 aşaması yalnız lossless undo/version-history domain sınırında kalmalıdır; backend, OMR, Audiveris, deployment veya mevcut Render bağlantısına değişiklik gerektirmemelidir.

## 9. Mevcut durum

- Package 0–7: **Completed**.
- Package 8: **Partially implemented** — **8-T1 Completed, 8-T2 Completed, 8-T3 Completed; 8-T4 next**.
- Package 8-T5..T6: Not started.
- Package 8B, 9–13: Not started.
- Package 14: Partially implemented.

T3 kapanış implementation kanıtı: protected main `70a02589206eeea9c3defec4d5f544e9222cbe3a`; exact-main CI #234 başarılıdır: 1150/1150 test, 232 suite, 0 fail/skipped/cancelled, audit 0 vulnerabilities ve production build PASS.

Bu belge gelecekteki implementasyon için sınırsız izin belgesi değildir. Her yeni aşama fresh-read, ayrı branch, focused test, tam regression, review çözümü ve production build kanıtı ile yürütülmelidir.
