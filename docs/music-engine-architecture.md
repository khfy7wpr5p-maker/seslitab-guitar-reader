# SesliTab Music Engine — Güncel Mimari

**Belge sürümü:** 2.2.0  
**Güncelleme tarihi:** 2026-08-28  
**Doğrulanan başlangıç main:** `c096f0daa43eb20c79fea46d1d76211b8fcb49dc`  
**T1 ilk kapanış main:** `218c3e18eed3a82861a4a1c24efd5458445ea9ca`  
**T2 kapanış main:** `f6d80b4614654ee63a4fd2d51101e4961476a1ee`  
**T3 final review-hardened main:** `c57966598d2d6fe34418119670bea42a9cdcf369`  
**Durum:** Package 0–7 Completed; Package 8 Partially implemented; T1/T2/T3 Completed; T4 NEXT.

Bu belge ürünün güncel mimarisini açıklar. Paket kapanış kanıtları için `docs/package-status.md` ve ilgili closure belgeleri; güncel repository gerçeği için kaynak kod, testler ve fresh CI kanıtı esas alınır.

## 1. Değişmez ürün ilkesi

SesliTab öğretmen denetimli, yarı otomatik ve erişilebilir bir müzik eğitimi sistemidir.

Yapısal olarak geçerli MusicXML, müzikal doğruluk kanıtı değildir. Kaynakla doğrulanmamış veya kalite kapısında güvenli bulunmamış veri öğrenciye kesin doğru bilgi olarak sunulmamalıdır. Otomatik veri, öğretmen düzeltmesi ve öğretmen onayı birbirinden ayrı ve immutable revision/evidence kayıtları olarak korunmalıdır.

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

Package 8 revision / approval layer:
AutomaticSourceRevision
  schema v2
  contentFingerprint
  lineageFingerprint
        |
        | controlled replace-only correction(s)
        v
TeacherCorrectedRevision
  immutable
  parentRevisionId
  parentLineageFingerprint
  recursive lineageFingerprint
        +----------------------------+
        |                            |
        v                            v
validation / quality        TeacherCorrectionAuditEvent
per exact revision          separate immutable evidence
        |
        | explicit teacher approval
        v
TeacherApprovalRecord
  schema v3
  bound to exact revision metadata
  + contentFingerprint
  + recursive lineageFingerprint
        |
        +--> future T4 lossless history / undo
        +--> later Package 12 exact-approved-revision sharing
```

## 3. Doğrulanmış mimari katmanlar

### 3.1 Girdi ve OMR katmanı — korunacak mevcut bağlantı

Mevcut PDF yolu backend OMR gateway ve provider mimarisi üzerinden çalışır. Audiveris ana OMR motorudur. Package 1A/1B ve Package 2E kapsamında kuyruk, iptal/retry, dosya/XML güvenliği ve benchmark sınırları kapanmıştır.

**Package 8 kapsamında ayrı izin olmadan değiştirilmeyecek alanlar:**

- `backend/` içindeki Audiveris provider/runtime/preflight davranışı;
- OMR worker/provider seçimi;
- Cloud OMR Gateway sözleşmeleri;
- üretim MusicXML OMR yolu;
- `Dockerfile`;
- `render.yaml`;
- mevcut Render servis/deployment bağlantısı.

Öğretmen revision/approval katmanı OMR altyapısının üzerinde çalışır; Audiveris yalnız otomatik kaynak verisini sağlar. T1–T3 bu bağlantıyı değiştirmedi.

### 3.2 Canonical nota ve zaman modeli — Package 2A

Ana canonical sözleşme ortak nota/pitch/time kimliğini korur. TTS, playback, validator, MIDI, TAB ve enstrüman tüketicileri birbirinden bağımsız müzikal gerçek üretmemelidir.

Temel ilkeler:

- fiziksel ölçü kimliği `measureKey` / part + measure index ile korunur;
- görünen ölçü numarası benzersiz kimlik değildir;
- canonical event referansları tüketiciler arasında korunur;
- eksik nota/ritim otomatik olarak icat edilmez;
- kaynak doğrulama durumu müzikal doğrulukla eş anlamlı değildir.

### 3.3 Yapısal doğrulama ve kalite — Package 2B–2D

- `src/services/structuralRhythmValidator.js`: yapısal/ritmik bulgular;
- `src/services/qualityErrorReport.js`: kalite/hata raporu;
- `src/services/appQualityGate.js`: tüketici bazlı fail-closed karar;
- canonical consumer policy/bindings: paylaşılan canonical sınır.

Quality `ACCEPT`, öğretmen onayı değildir. T3 approval kaydı da quality gate'i bypass etmez.

### 3.4 OMR benchmark — Package 2E

Benchmark altyapısı preprocessing/OMR varyantlarını izole olarak ölçer. Üretim OMR hattını otomatik değiştirmez, farklı OMR sonuçlarını nota bazında uydurarak birleştirmez ve universal accuracy iddiası üretmez.

### 3.5 Playback, ölçü seçimi ve MIDI — Package 3

Doğrulanmış davranışlar:

- tam eser playback;
- tek aktif playback oturumu;
- canonical `measureKey` ile ölçü seçimi;
- erişilebilir ölçü kontrolleri;
- seçili ölçü TTS/playback;
- quality-gated deterministic SMF0 MIDI export.

### 3.6 Basic Guitar TAB — Package 4

```text
canonical NoteObject[]
  -> GUITAR_TAB quality gate
  -> physical candidate resolver
  -> basic-position policy
  -> deterministic projection
  -> renderer / accessible UI
```

Bu motor yalnız güvenli temel kapsamı temsil eder. Polifonik/pedagojik gelişmiş çözüm Package 9 kapsamındadır. Otomatik TAB öğretmen onayı değildir.

### 3.7 Basic Violin — Package 5

İlk pozisyon, konservatif ve quality-gated keman yönlendirmesi mevcuttur. Gelişmiş pozisyonlar, alternatifler ve çift sesler Package 10 kapsamındadır.

### 3.8 MusicXML harmony ve akor sunumu — Package 6–7

Package 6/7 yalnız kaynak MusicXML `<harmony>` verisini işler; nota içeriğinden akor tahmini yapmaz.

- source-only harmony parsing/normalization;
- chord presentation;
- source consumer;
- Turkish chord TTS;
- accessible chord UI.

Hazır akor çıktısı kendiliğinden teacher-approved veya definitive değildir.

## 4. Package 8 — öğretmen düzeltme ve onay mimarisi

Package 8 mevcut canonical modeli veya OMR sonucunu yerinde değiştiren mutable bir engine değildir. Güvenli sınır:

```text
immutable revision
+ separate correction audit
+ separate exact-revision approval
+ future lossless history/concurrency/UI
```

### 4.1 T1 — immutable revision domain: COMPLETED

`src/services/teacherRevisionModel.js`

T1'in temel modeli değişmedi: otomatik kaynak ve teacher-corrected revision'lar immutable'dır; her düzeltme yeni revision oluşturur.

T3 review hardening sırasında revision schema güvenlik amacıyla **v2** oldu. Strict revision kaydı artık şunları da taşır:

- `parentLineageFingerprint`;
- `lineageFingerprint`.

Automatic revision için parent lineage `null`'dır. Her corrected revision kendi `lineageFingerprint` değerini şu immutable girdilerden deterministik olarak türetir:

- `revisionId`;
- `revisionKind`;
- `sourceId`;
- `sourceRevisionId`;
- `parentRevisionId`;
- `parentLineageFingerprint`;
- revision `createdAt`;
- `contentFingerprint`.

Bu recursive yapı revision'ın yalnız doğrudan parent ID'sini değil, parent'ın bütün önceki lineage gerçeğini de transitif olarak taşır.

`contentFingerprint` ve `lineageFingerprint` deterministic drift/version tokenlarıdır. **Kriptografik imza, kullanıcı doğrulama veya authorization credential değildir.**

### 4.2 T2 — controlled correction operations: COMPLETED

`src/services/teacherCorrectionOperations.js`

Doğrulanmış kurallar:

1. yalnız `replace_value` desteklenir;
2. yalnız mevcut path değiştirilebilir; insertion/delete yoktur;
3. parent revision overwrite edilmez;
4. accepted correction yeni immutable T1 revision üretir;
5. correction audit event ayrı immutable kayıttır;
6. duplicate operation ID, same/overlapping target, no-op fail closed olur;
7. prototype-sensitive targetlar reddedilir;
8. `-0`/`0` array target aliasing canonicalize edilir;
9. unsafe/non-deterministic replacement/audit verisi reddedilir;
10. correction approval değildir.

T1 schema-v2 lineage hardening T2'nin operation davranışını değiştirmedi; T2 regression'ları CI #239/#240 üzerinde yeşildir.

### 4.3 T3 — exact-revision approval binding/invalidation: COMPLETED

`src/services/teacherApprovalModel.js`

T3 approval schema **v3** kullanır. Approval ayrı immutable evidence kaydıdır ve revision içine `teacherApproved` benzeri mutable flag eklemez.

Approval applicability şu exact boyutların tamamını bağlar:

1. `sourceId`;
2. root `sourceRevisionId`;
3. exact `revisionId`;
4. exact `revisionKind`;
5. exact `parentRevisionId`;
6. exact revision `createdAt`;
7. exact `contentFingerprint`;
8. exact recursive `lineageFingerprint` (`approvedLineageFingerprint`).

Aday revision bu boyutlardan herhangi birinde farklıysa sonuç:

`NOT_APPLICABLE_TO_REVISION`

Tam eşleşmede:

`APPROVED_EXACT_REVISION`

Eski approval kaydı mutasyona uğramaz veya silinmez.

#### Multi-hop replay güvenlik kapanışı

Review şu zincirin schema-v2 approval binding'ini yeniden üretilebildiğini gösterdi:

```text
A0 -> R1 -> R2 (approved)
              |
              v
          replay R1
              |
              v
          replay R2
```

Replay edilen R2; source, root source, revision ID, kind, parent revision ID, timestamp ve content fingerprint değerlerini eski R2 ile aynı yapabiliyordu.

Recursive lineage ile replay R1 artık original R1 lineage'ını taşıyamaz; parent'ı R2'dir. Replay R2 de replay-R1 lineage'ını devralır. Böylece `lineageFingerprint` original R2'den farklı kalır ve eski approval uygulanmaz.

Final regression:

`multi-hop revisionId replay cannot reconstruct an approved revision` — PASS on CI #239 and #240.

### 4.4 T3 review-hardening tarihi

T3 iki gerçek P1 review bulgusu çözülmeden Completed sayılmadı:

- PR #91: ilk approval implementation;
- PR #92: one-hop ancestor ID replay P1 bulundu; docs PR merge edilmedi;
- PR #93: schema-v2 approval hardening;
- PR #94: multi-hop ID replay P1 bulundu; docs PR merge edilmedi;
- PR #95: recursive lineage + approval schema-v3 final hardening.

Final code evidence:

- PR #95 head: `77f5035a85dfd6895490198d2160107b28479320`;
- exact-head CI #239: 1154/1154 tests, 232 suites, 0 vulnerabilities, build PASS;
- protected-main merge: `c57966598d2d6fe34418119670bea42a9cdcf369`;
- exact-main CI #240: 1154/1154 tests, 232 suites, 0 vulnerabilities, build PASS.

### 4.5 Sonraki Package 8 aşamaları

- **8-T1 — Completed**
- **8-T2 — Completed**
- **8-T3 — Completed**
- **8-T4 — NEXT / Not started:** kayıpsız revision/version history ve undo
- **8-T5 — Not started:** optimistic concurrency / stale-base conflict
- **8-T6 — Not started:** accessible teacher UI

**Package 8B — Audiveris training dataset** ayrı ve daha sonraki pakettir; T4 kapsamına dahil değildir.

## 5. Güvenlik bağımlılıkları

| Tüketici / özellik | Canonical | Quality gate | Teacher approval |
|---|---:|---:|---:|
| Öğretmen inceleme görüntüsü | Evet | Uyarı/engelleme semantiği | Hayır |
| Tam eser playback/TTS | Evet | Evet | Mevcut ürün akışında zorunlu değil |
| MIDI export | Evet | Evet | Öğrenci paylaşımı için ayrıca gerekir |
| Basic Guitar TAB | Evet | Evet | Otomatik öneri için hayır; öğrenci paylaşımı için evet |
| Basic Violin | Evet | Evet | Otomatik öneri için hayır; öğrenci paylaşımı için evet |
| Chord source display/TTS | Kaynak/canonical bağ | Fail-closed source state | Öğrenci paylaşımı için evet |
| Package 12 student sharing | Evet | Evet | **Evet, exact approved revision** |

Teacher approval quality veya sharing authorization yerine geçmez.

## 6. Veri sahipliği ve mutasyon sınırı

Yerinde overwrite edilmemelidir:

- orijinal PDF;
- orijinal OMR sonucu / `.omr`;
- otomatik MusicXML;
- otomatik canonical/source revision;
- teacher-corrected revision'lar;
- correction audit event'leri;
- teacher approval record'ları;
- gelecekte T4 history/undo evidence kayıtları.

Yeni düzeltme yeni revision üretir. Yeni approval exact revision'a bağlanır. Undo gelecekte eski kaydı değiştirmek yerine history içinden güvenli bir state seçmeli/üretmelidir.

## 7. Erişilebilirlik sınırı

Teacher UI T6'ya kadar genişletilmemelidir. T6 geldiğinde:

- klavye ile tam kullanılabilir;
- native control öncelikli;
- revision/change/approval durumları ekran okuyucu ile açık;
- görsel ve spoken durum aynı state kaynağından;
- kritik/onaysız durum yalnız renk ile ifade edilmemiş olmalıdır.

## 8. Repository sınırları

- Frontend orchestration/UI: `src/`, `main.js`, `index.html`
- Canonical/parser/theory: root-level music modules + `src/services/`
- Teacher revision domain: `src/services/teacherRevisionModel.js`
- Teacher correction domain: `src/services/teacherCorrectionOperations.js`
- Teacher approval domain: `src/services/teacherApprovalModel.js`
- Backend OMR/API: `backend/`
- Tests: `tests/`
- CI: `.github/workflows/`
- Deployment: `Dockerfile`, `render.yaml`
- Architecture/status docs: `docs/`

## 9. Mevcut durum

- Package 0–7: **Completed**.
- Package 8: **Partially implemented** — T1/T2/T3 Completed; T4 next.
- Package 8-T4..T6: Not started.
- Package 8B, 9–13: Not started.
- Package 14: Partially implemented.

T3 final code baseline: `c57966598d2d6fe34418119670bea42a9cdcf369`; exact-main CI #240: **1154/1154 tests**, 232 suites, 0 fail/skipped/cancelled, audit 0 vulnerabilities ve production build PASS.

Bu belge gelecekteki implementasyon için sınırsız izin değildir. T4 ve sonraki her aşama fresh-read, ayrı branch, focused test, full regression, review çözümü ve exact-head/exact-main CI kanıtı ile yürütülmelidir.
