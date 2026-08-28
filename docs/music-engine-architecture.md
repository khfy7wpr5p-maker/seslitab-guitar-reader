# SesliTab Music Engine — Güncel Mimari

**Belge sürümü:** 2.0.0  
**Güncelleme tarihi:** 2026-08-28  
**Doğrulanan başlangıç main:** `c096f0daa43eb20c79fea46d1d76211b8fcb49dc`  
**Durum:** Mevcut kod ve kapanmış paketlerle uzlaştırılmış mimari yönlendirme belgesi.

Bu belge ürünün güncel mimarisini açıklar. Paket kapanış kanıtları için `docs/package-status.md` ve ilgili `docs/package-*-closure.md` belgeleri; güncel repository gerçeği için kaynak kod, testler ve fresh CI kanıtı esas alınır.

## 1. Değişmez ürün ilkesi

SesliTab öğretmen denetimli, yarı otomatik ve erişilebilir bir müzik eğitimi sistemidir.

Yapısal olarak geçerli MusicXML, müzikal doğruluk kanıtı değildir. Kaynakla doğrulanmamış veya kalite kapısında güvenli bulunmamış veri öğrenciye kesin doğru bilgi olarak sunulmamalıdır. Otomatik OMR verisi, öğretmen düzeltmesi ve öğretmen onayı birbirinden ayrı sürümler olarak korunmalıdır.

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

Next safe layer:
canonical/source revision
  -> teacher correction revision(s)
  -> validation/quality per revision
  -> approval bound to one exact revision
  -> later Package 12 student sharing of approved revision only
```

## 3. Doğrulanmış mimari katmanlar

### 3.1 Girdi ve OMR katmanı — korunacak mevcut bağlantı

Mevcut PDF yolu backend OMR gateway ve provider mimarisi üzerinden çalışır. Audiveris ana OMR motorudur. Package 1A/1B ve Package 2E kapsamında kuyruk, iptal/retry, dosya/XML güvenliği ve benchmark sınırları kapanmıştır.

**Bu güncelleme kapsamında değiştirilmeyecek alanlar:**

- `backend/` içindeki Audiveris provider/runtime/preflight davranışı
- OMR worker/provider seçimi
- Cloud OMR Gateway sözleşmeleri
- üretim MusicXML OMR yolu
- `Dockerfile`
- `render.yaml`
- mevcut Render servis bağlantısı ve deployment ayarları

Yeni öğretmen çalışma katmanı OMR altyapısını yeniden yazmamalı veya Audiveris'e bağımlı yeni bir veri modeli oluşturmamalıdır. OMR yalnız bir otomatik kaynak sürümü üretir.

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

Benchmark altyapısı farklı giriş/preprocessing varyantlarını ölçmek için izole edilmiştir. Üretim OMR hattını otomatik olarak değiştirmez ve farklı OMR sonuçlarından nota birleştirmez.

### 3.5 Playback, ölçü seçimi ve MIDI — Package 3

Doğrulanmış davranışlar:

- tam eser için `Müziği Dinle`;
- tek aktif playback oturumu;
- canonical `measureKey` ile ölçü seçimi;
- Ritimli HTML içinde erişilebilir ölçü kontrolleri;
- seçili ölçüde TTS sonra playback;
- quality-gated deterministic SMF0 MIDI export.

İlgili uygulama katmanları arasında `src/package3Ui.js`, `src/services/measureIdentity.js`, `src/services/musicEngine.js` ve `src/services/midiExport.js` bulunur.

### 3.6 Basic Guitar TAB — Package 4

Güncel yol:

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

İlk pozisyon, konservatif ve quality-gated keman yönlendirmesi mevcuttur. İlgili çekirdekler `violinPositionResolver.js`, `violinFingeringPolicy.js`, `violinBasicProjection.js`, `src/services/violinConsumer.js` ve `src/package5Ui.js` çevresindedir.

Gelişmiş pozisyonlar, alternatifler ve çift sesler Package 10 kapsamındadır.

### 3.8 MusicXML harmony ve akor sunumu — Package 6–7

Package 6/7 yalnız kaynak MusicXML `<harmony>` verisini işler. Nota içeriğinden akor tahmini yapmaz.

- source-only harmony parsing/normalization
- `src/services/chordPresentation.js`
- `src/services/chordSourceConsumer.js`
- `src/services/chordTtsConsumer.js`
- `src/package7Ui.js`

Hazır akor çıktısı öğretmen onaylı veya definitive değildir. Source handoff exact canonical array ile atomik tutulur; eski kaynak kanıtı yeni başarısız hazırlama girişiminden sonra kullanılamaz.

## 4. Package 8 — öğretmen düzeltme ve onay katmanının mimari yeri

Package 8 mevcut canonical modeli veya OMR sonucunu yerinde değiştiren bir `Teacher Correction Engine` olmamalıdır. Önceki belgedeki bu yaklaşım güvenli sürümleme ilkesiyle uyumsuzdu.

Doğru sınır:

```text
AutomaticSourceRevision (immutable)
        |
        +--> TeacherCorrectedRevision #1
        |        |
        |        +--> validator + quality report
        |
        +--> TeacherCorrectedRevision #2
                 |
                 +--> validator + quality report
                          |
                          v
                  TeacherApprovalRecord
                  bound to exact revision
```

Kurallar:

1. Otomatik kaynak sürümü immutable kalır.
2. Düzeltme yeni bir revision üretir; otomatik sürümün üstüne yazılmaz.
3. Her revision benzersiz kimlik ve parent revision bilgisi taşır.
4. Onay, yalnız exact revision kimliğine/fingerprint'ine bağlanır.
5. Onaydan sonra yeni revision oluşursa eski onay yeni revision için geçerli değildir.
6. Undo, eski sürümü silmek yerine yeni bir revision veya deterministik geri dönüş işlemi üretmelidir.
7. Eşzamanlı düzenleme sessizce overwrite edilmemelidir; base revision uyuşmazlığı conflict üretmelidir.
8. Approval kalite kapısını bypass etmemelidir; kritik yapısal hata bulunan revision otomatik olarak trusted hale gelmez.
9. Package 12 öğrenci paylaşımı yalnız açıkça onaylı exact revision üzerinden çalışmalıdır.
10. OMR/Audiveris ve Render bağlantıları Package 8'in veri sürümleme katmanından bağımsız kalmalıdır.

### Önerilen küçük aşamalar

Package 8 tek seferde geniş bir UI/backend refactor olarak uygulanmamalıdır. Güvenli sıra:

- **8-T1 — Revision domain contract:** immutable automatic snapshot, revision id, parent id, status ve fingerprint.
- **8-T2 — Correction operations:** kontrollü düzeltme işlemleri ve deterministic revision creation.
- **8-T3 — Approval binding/invalidation:** exact revision approval ve değişiklik sonrası invalidation.
- **8-T4 — Undo/version history:** kayıpsız tarihçe ve geri alma.
- **8-T5 — Optimistic concurrency:** stale base revision conflict.
- **8-T6 — Accessible teacher UI:** önceki katmanlar kanıtlandıktan sonra arayüz.

Not: Yol haritasındaki ayrı **Package 8B — Audiveris training dataset** bu T1–T6 alt aşamalarından farklıdır ve Package 8 tamamlanmadan başlamamalıdır.

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
- otomatik canonical revision;
- teacher-corrected revision history;
- teacher approval record.

Yeni bir düzeltme mevcut veri nesnesinin güvenilirlik/approval alanını sessizce değiştirmek yerine yeni, izlenebilir bir revision üretmelidir.

## 7. Erişilebilirlik sınırı

Yeni öğretmen arayüzü eklenmeden önce domain kuralları testlerle kapanmalıdır. Arayüz geldiğinde:

- klavye ile tam kullanılabilir olmalı;
- native controls tercih edilmeli;
- değişiklik/onay/iptal durumları erişilebilir live-region ile bildirilmelidir;
- ekranda görülen revision/onay durumu ile ekran okuyucunun söylediği durum aynı kaynaktan üretilmelidir;
- kritik veya onaysız içerik görsel renge tek başına bağımlı şekilde ifade edilmemelidir.

## 8. Repository sınırları

- Frontend orchestration/UI: `src/`, `main.js`, `index.html`
- Canonical/parser/theory çekirdekleri: root-level music modules + `src/services/`
- Backend OMR/API: `backend/`
- Tests: `tests/`
- CI: `.github/workflows/`
- Deployment: `Dockerfile`, `render.yaml`
- Mimari/status belgeleri: `docs/`

Package 8-T1 için başlangıçta backend, OMR, deployment veya Render değişikliği gerekmemelidir. İlk güvenli hedef saf, deterministic ve dependency-free revision domain modelidir.

## 9. Mevcut durum

- Package 0–7: kapanış/statü belgelerine göre tamamlanmış.
- Package 8: henüz uygulanmamış; sıradaki güvenli ürün paketi.
- Package 8B, 9–13: başlamamış.
- Package 14: kısmi web/mobile temeli var; cihaz seviyesinde ürünleştirme tamamlanmış kabul edilmez.

Bu belge gelecekteki implementasyon için izin belgesi değildir. Her yeni aşama fresh-read, ayrı branch, focused test, tam regression ve production build kanıtı ile yürütülmelidir.
