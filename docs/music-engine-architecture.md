# SesliTab Music Engine — Güncel Mimari

**Belge sürümü:** 2.1.0  
**Güncelleme tarihi:** 2026-08-28  
**Doğrulanan başlangıç main:** `c096f0daa43eb20c79fea46d1d76211b8fcb49dc`  
**T1 kapanış main:** `218c3e18eed3a82861a4a1c24efd5458445ea9ca`  
**T2 kapanış main:** `f6d80b4614654ee63a4fd2d51101e4961476a1ee`  
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
  -> future T3 TeacherApprovalRecord bound to one exact revision/fingerprint
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

### 4.1 T1 + T2 ile doğrulanmış mevcut sınır

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
        | future T3 explicit approval action
        v
TeacherApprovalRecord
bound to exact source + revisionId + contentFingerprint
```

T1/T2 ile doğrulanmış kurallar:

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

### 4.2 T3 için henüz uygulanmamış approval sınırı

T3 aşağıdaki mimariyi tamamlayacak ilk aşamadır:

```text
TeacherCorrectedRevision R1
   + exact source identity
   + revisionId R1
   + contentFingerprint F1
              |
              | explicit teacher approval
              v
TeacherApprovalRecord A1
   bound to (source, R1, F1)

TeacherCorrectedRevision R2
   revisionId R2 / fingerprint F2
              |
              +--> A1 does NOT apply automatically
```

T3 kuralları:

1. Approval revision içine mutable flag olarak eklenmemelidir.
2. Approval ayrı immutable record olmalıdır.
3. Approval exact source/revision/fingerprint üçlüsüne bağlanmalıdır.
4. Yeni revision oluşunca eski approval record mutasyona uğramamalı; yeni revision için yalnız `not applicable` olmalıdır.
5. Quality-gate `ACCEPT` approval'a otomatik çevrilmemelidir.
6. Approval kritik yapısal/quality güvenlik mekanizmasını bypass etmemelidir.
7. Authentication/authorization ile approval-domain kaydı karıştırılmamalıdır; kimlik caller-supplied evidence olabilir ancak auth henüz ayrı bir ürün katmanıdır.
8. Package 12 öğrenci paylaşımı T3'te aktive edilmemelidir.

### 4.3 Sonraki aşamalar

- **8-T1 — Revision domain contract: COMPLETED.**
- **8-T2 — Controlled correction operations: COMPLETED.**
- **8-T3 — Approval binding/invalidation: NEXT.**
- **8-T4 — Undo/version history:** kayıpsız tarihçe ve geri alma.
- **8-T5 — Optimistic concurrency:** stale base revision conflict.
- **8-T6 — Accessible teacher UI:** önceki domain/history/concurrency katmanları kanıtlandıktan sonra arayüz.

Ayrı **Package 8B — Audiveris training dataset** bu T1–T6 alt aşamalarından farklıdır ve T3 kapsamına alınmamalıdır.

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
- gelecekteki teacher approval record'ları.

Yeni bir düzeltme mevcut veri nesnesinin güvenilirlik/approval alanını sessizce değiştirmek yerine yeni, izlenebilir bir revision üretmelidir.

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
- Teacher revision/correction domain: `src/services/teacherRevisionModel.js`, `src/services/teacherCorrectionOperations.js`
- Backend OMR/API: `backend/`
- Tests: `tests/`
- CI: `.github/workflows/`
- Deployment: `Dockerfile`, `render.yaml`
- Mimari/status belgeleri: `docs/`

Package 8-T2 protected main üzerinde tamamlandı. Sıradaki 8-T3 aşaması yalnız exact-revision approval binding/invalidation domain sınırında kalmalıdır; backend, OMR, Audiveris, deployment veya mevcut Render bağlantısına değişiklik gerektirmemelidir.

## 9. Mevcut durum

- Package 0–7: **Completed**.
- Package 8: **Partially implemented** — **8-T1 Completed, 8-T2 Completed; 8-T3 next**.
- Package 8-T4..T6: Not started.
- Package 8B, 9–13: Not started.
- Package 14: Partially implemented.

T2 kapanış kanıtı: protected main `f6d80b4614654ee63a4fd2d51101e4961476a1ee`; exact-main CI #230 başarılıdır: 1136/1136 test, 231 suite, 0 fail/skipped/cancelled, audit 0 vulnerabilities ve production build PASS.

Bu belge gelecekteki implementasyon için sınırsız izin belgesi değildir. Her yeni aşama fresh-read, ayrı branch, focused test, tam regression, review çözümü ve production build kanıtı ile yürütülmelidir.
