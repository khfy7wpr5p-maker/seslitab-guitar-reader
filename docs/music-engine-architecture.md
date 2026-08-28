# SesliTab Music Engine — Güncel Mimari

**Belge sürümü:** 2.3.0  
**Güncelleme tarihi:** 2026-08-28  
**T1 ilk kapanış main:** `218c3e18eed3a82861a4a1c24efd5458445ea9ca`  
**T2 kapanış main:** `f6d80b4614654ee63a4fd2d51101e4961476a1ee`  
**T3 final review-hardened main:** `c57966598d2d6fe34418119670bea42a9cdcf369`  
**T4 final implementation main:** `eaf967174d1cc0f2552cc97e7e0a6bf0a1715c64`  
**T4 exact-main CI:** #248 / run `33177550356` — SUCCESS  
**Durum:** Package 0–7 Completed; Package 8 Partially implemented; T1/T2/T3/T4 Completed; **T5 NEXT**.

Bu belge ürünün güncel mimarisini açıklar. Paket kapanış kanıtları için `docs/package-status.md` ve ilgili closure belgeleri; repository gerçeği için kaynak kod, testler ve fresh GitHub Actions kanıtı esas alınır.

## 1. Değişmez ürün ilkesi

SesliTab öğretmen denetimli, yarı otomatik ve erişilebilir bir müzik eğitimi sistemidir.

Yapısal olarak geçerli MusicXML, müzikal doğruluk kanıtı değildir. Kaynakla doğrulanmamış veya kalite kapısında güvenli bulunmamış veri öğrenciye kesin doğru bilgi olarak sunulmamalıdır. Otomatik veri, öğretmen düzeltmesi ve öğretmen onayı birbirinden ayrı immutable revision/evidence kayıtları olarak korunmalıdır.

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

Package 8 teacher revision layer:

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
        +-----------------------------+
        |                             |
        v                             v
TeacherCorrectionAuditEvent     validation / quality
separate immutable evidence     per exact revision
        |
        +-----------------------------+
                                      |
                           TeacherRevisionHistory
                           schema v1, immutable
                           exact revisions + audits
                           + approvals + undo events
                                      |
                         +------------+-------------+
                         |                          |
                         v                          v
                TeacherApprovalRecord       TeacherUndoAuditEvent
                schema v3                   schema v1
                exact revision binding      exact parent/target/result
                + recursive lineage         binding
                         |                          |
                         +-------------+------------+
                                       |
                                  future T5
                         optimistic concurrency
                                       |
                                  future T6
                         accessible teacher UI
                                       |
                              later Package 12
                         approved revision sharing
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

Teacher revision/history/concurrency katmanı OMR altyapısının üzerinde çalışır; Audiveris yalnız otomatik kaynak verisini sağlar. T1–T4 bu bağlantıyı değiştirmedi.

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

Quality `ACCEPT`, öğretmen onayı değildir. Teacher approval da quality gate'i bypass etmez.

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

## 4. Package 8 — öğretmen düzeltme, onay ve history mimarisi

Package 8 mevcut canonical modeli veya OMR sonucunu yerinde değiştiren mutable bir engine değildir. Güvenli sınır:

```text
immutable revision
+ separate correction audit
+ separate exact-revision approval
+ immutable lossless history/undo
+ next optimistic concurrency
+ later accessible teacher UI
```

### 4.1 T1 — immutable revision domain: COMPLETED

`src/services/teacherRevisionModel.js`

- automatic ve `teacher_corrected` revision kayıtları immutable'dır;
- her düzeltme yeni revision üretir;
- schema v2 `contentFingerprint`, `parentLineageFingerprint` ve recursive `lineageFingerprint` taşır;
- root source identity korunur;
- revision içine approval flag eklenmez;
- identifiers/timestamps caller-supplied'dır;
- malformed, injected, mutable veya non-deterministic shapes fail closed olur.

`contentFingerprint` ve `lineageFingerprint` deterministic drift/version tokenlarıdır; kriptografik imza veya authorization credential değildir.

### 4.2 T2 — controlled correction operations: COMPLETED

`src/services/teacherCorrectionOperations.js`

- yalnız bounded `replace_value` operation desteklenir;
- yalnız mevcut path değiştirilebilir; insertion/delete yoktur;
- parent revision overwrite edilmez;
- accepted correction yeni immutable T1 revision üretir;
- correction audit event ayrı immutable kayıttır;
- duplicate operation ID, same/overlapping target, no-op fail closed olur;
- prototype-sensitive targetlar reddedilir;
- unsafe/non-deterministic replacement/audit verisi reddedilir;
- correction approval değildir.

### 4.3 T3 — exact-revision approval binding/invalidation: COMPLETED

`src/services/teacherApprovalModel.js`

Approval schema v3 ayrı immutable evidence kaydıdır ve şu exact boyutları bağlar:

1. source/root-source identity;
2. revision ID/kind;
3. parent revision ID;
4. revision timestamp;
5. content fingerprint;
6. recursive lineage fingerprint.

Bir later/replayed revision bu exact binding'i taşımıyorsa eski approval uygulanmaz. Historical approval evidence mutasyona uğramaz.

T3 review hardening sırasında one-hop ve multi-hop revision-ID replay yolları kapanmış; recursive lineage binding exact-main CI ile doğrulanmıştır.

### 4.4 T4 — lossless revision history and undo: COMPLETED

`src/services/teacherRevisionHistory.js`

T4, T1/T2/T3 kanıtlarını immutable bir lineer history snapshot içinde korur.

Doğrulanmış temel kurallar:

1. automatic source revision history'nin immutable root'udur;
2. later revisions exact T1 revision nesneleri olarak korunur;
3. T2 correction audit events exact parent/result transition'ına bağlanır;
4. T3 approval records exact preserved revision'a historical evidence olarak bağlanır;
5. undo hiçbir eski revision'ı silmez, değiştirmez veya yeniden etiketlemez;
6. undo, current revision'dan seçilen historical target'ın exact content'ine **yeni corrected revision** üretir;
7. undo sonucu historical target ile aynı `contentFingerprint` değerine sahip olabilir ama current parent lineage nedeniyle farklı recursive `lineageFingerprint` taşır;
8. bu nedenle historical target approval'ı undo sonucuna otomatik taşınmaz;
9. revision/event/approval identity reuse ve cross-source evidence fail closed olur;
10. history validator yalnız metadata eşleştirmez; correction audit operations'ı parent üzerinde tekrar oynatıp exact result lineage ile doğrular;
11. externally reconstructed current-parent/no-op undo records fail closed olur;
12. T4 persistence/backend API, concurrency ve UI eklemez.

### 4.5 T4 review-hardening ve CI kanıtı

PR #97 ilk yeşil sonucu beklerken domain self-review ve PR review ile iki önemli integrity açığı kapatıldı:

- forged correction audit semantics: operation list parent üzerinde replay edilmeden kabul edilebiliyordu;
- impossible current-parent/no-op undo: externally reconstructed history validator creator kurallarıyla tam eşleşmiyordu.

Her ikisi production validator + regression test ile kapatıldı.

Final implementation evidence:

- PR #97 final head: `0c83c54b2353ff5b82a4acfa7bb64e0f23635b0b`;
- exact-head CI #247 aynı exact-head rerun: **1173/1173 tests PASS**, 232 suites, 0 vulnerabilities, production build PASS;
- ilk #247 attempt'teki tek fail mevcut API cancellation timing testindeki tekil 502 flake idi; T4 regressions o denemede de PASS'ti ve aynı SHA rerun'da tekrarlanmadı;
- protected-main squash merge: `eaf967174d1cc0f2552cc97e7e0a6bf0a1715c64`;
- exact-main CI #248 / run `33177550356`: **1173/1173 tests PASS**, 232 suites, 0 fail/skipped/cancelled, 0 vulnerabilities, production build PASS;
- existing Audiveris/OMR, Render Blueprint ve Dockerfile security regressions PASS.

### 4.6 Sonraki Package 8 aşamaları

- **8-T1 — Completed**
- **8-T2 — Completed**
- **8-T3 — Completed**
- **8-T4 — Completed**
- **8-T5 — NEXT / Not started:** optimistic concurrency / stale-base conflict
- **8-T6 — Not started:** accessible teacher UI

**Package 8B — Audiveris training dataset** ayrı ve daha sonraki pakettir; T5 kapsamına dahil değildir.

## 5. T5 için mimari sınır

T5'in görevi aynı history üzerinde eşzamanlı/stale teacher editlerinin sessiz overwrite edilmesini önlemektir.

Güvenli T5 yönü:

- caller, işlem yaparken beklediği exact current revision/history identity bilgisini sunar;
- current state bu beklentiyle eşleşmiyorsa işlem uygulanmaz ve explicit conflict sonucu üretilir;
- conflict çözümü otomatik merge veya müzikal veri uydurma değildir;
- T5 current history'yi mutasyona uğratmaz; başarılı operation yeni immutable history snapshot üretir;
- correction/approval/undo evidence T1–T4 exact binding kurallarını korur;
- T5 persistence/backend API veya distributed lock zorunluluğu oluşturmaz; domain-level optimistic concurrency contract olarak kalabilir;
- UI conflict presentation T6'ya bırakılır.

T5 başlamadan fresh repository read, exact-main CI, open PR/issue ve protected boundary kontrolü zorunludur.

## 6. Güvenlik bağımlılıkları

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

## 7. Veri sahipliği ve mutasyon sınırı

Yerinde overwrite edilmemelidir:

- orijinal PDF;
- orijinal OMR sonucu / `.omr`;
- otomatik MusicXML;
- automatic/source revision;
- teacher-corrected revision'lar;
- correction audit event'leri;
- teacher approval record'ları;
- T4 history snapshot ve undo audit event'leri.

Correction, undo veya gelecekte T5 guarded operation yeni immutable state üretir. Historical evidence korunur.

## 8. Erişilebilirlik sınırı

Teacher UI T6'ya kadar genişletilmemelidir. T6 geldiğinde:

- klavye ile tam kullanılabilir;
- native control öncelikli;
- revision/change/approval/conflict durumları ekran okuyucu ile açık;
- görsel ve spoken durum aynı state kaynağından;
- kritik/onaysız/conflict durumu yalnız renk ile ifade edilmemiş olmalıdır.

## 9. Repository sınırları

- Frontend orchestration/UI: `src/`, `main.js`, `index.html`
- Canonical/parser/theory: root-level music modules + `src/services/`
- Teacher revision domain: `src/services/teacherRevisionModel.js`
- Teacher correction domain: `src/services/teacherCorrectionOperations.js`
- Teacher approval domain: `src/services/teacherApprovalModel.js`
- Teacher history/undo domain: `src/services/teacherRevisionHistory.js`
- Backend OMR/API: `backend/`
- Tests: `tests/`
- CI: `.github/workflows/`
- Deployment: `Dockerfile`, `render.yaml`
- Architecture/status docs: `docs/`

## 10. Mevcut durum

- Package 0–7: **Completed**.
- Package 8: **Partially implemented** — T1/T2/T3/T4 Completed; T5 next.
- Package 8-T5/T6: Not started.
- Package 8B, 9–13: Not started.
- Package 14: Partially implemented.

T4 final implementation baseline: `eaf967174d1cc0f2552cc97e7e0a6bf0a1715c64`; exact-main CI #248: **1173/1173 tests**, 232 suites, 0 fail/skipped/cancelled, audit 0 vulnerabilities ve production build PASS.

Bu belge gelecekteki implementasyon için sınırsız izin değildir. T5 ve sonraki her aşama fresh-read, ayrı branch, focused test, full regression, review çözümü ve exact-head/exact-main CI kanıtı ile yürütülmelidir.
