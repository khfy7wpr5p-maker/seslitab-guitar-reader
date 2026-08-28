# SesliTab Music Engine — Güncel Mimari

**Belge sürümü:** 2.4.0  
**Güncelleme tarihi:** 2026-08-28  
**T1 ilk kapanış main:** `218c3e18eed3a82861a4a1c24efd5458445ea9ca`  
**T2 kapanış main:** `f6d80b4614654ee63a4fd2d51101e4961476a1ee`  
**T3 final review-hardened main:** `c57966598d2d6fe34418119670bea42a9cdcf369`  
**T4 final implementation main:** `eaf967174d1cc0f2552cc97e7e0a6bf0a1715c64`  
**T5 final implementation main:** `4747210751c1c49295052f8cca7be58281b91023`  
**T5 exact-main CI:** #253 / run `33181815397` — SUCCESS  
**Durum:** Package 0–7 Completed; Package 8 Partially implemented; T1/T2/T3/T4/T5 Completed; **T6 NEXT**.

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

MusicXML <harmony> -> source-only chord parser/presentation/TTS

Package 8 teacher revision layer:

AutomaticSourceRevision (T1, schema v2)
  contentFingerprint + recursive lineageFingerprint
        |
        | controlled replace_value correction (T2)
        v
TeacherCorrectedRevision
        |
        +--> TeacherCorrectionAuditEvent
        |
        v
TeacherRevisionHistory (T4, immutable)
  exact revisions + correction audits + approvals + undo events
        |
        +--> TeacherApprovalRecord (T3 schema v3, exact revision/lineage binding)
        +--> TeacherUndoAuditEvent (T4 schema v1, exact parent/target/result binding)
        |
        v
TeacherHistoryExpectation / guarded mutation (T5)
  full immutable history-state fingerprint
  current / applied / conflict
  stale history => zero partial domain write
        |
        v
future T6 accessible teacher UI
        |
        v
later Package 12 exact-approved-revision sharing
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

Teacher revision/history/concurrency katmanı OMR altyapısının üzerinde çalışır; Audiveris yalnız otomatik kaynak verisini sağlar. T1–T5 bu bağlantıyı değiştirmedi.

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

Doğrulanmış davranışlar tam eser playback, canonical `measureKey` ile ölçü seçimi, erişilebilir ölçü kontrolleri, seçili ölçü TTS/playback ve quality-gated deterministic SMF0 MIDI export içerir.

### 3.6 Basic Guitar TAB — Package 4

Canonical NoteObject[] kalite kapısından geçtikten sonra fiziksel aday resolver, temel pozisyon politikası, deterministic projection ve erişilebilir UI katmanına ilerler. Polifonik/pedagojik gelişmiş çözüm Package 9 kapsamındadır. Otomatik TAB öğretmen onayı değildir.

### 3.7 Basic Violin — Package 5

İlk pozisyon, konservatif ve quality-gated keman yönlendirmesi mevcuttur. Gelişmiş pozisyonlar, alternatifler ve çift sesler Package 10 kapsamındadır.

### 3.8 MusicXML harmony ve akor sunumu — Package 6–7

Package 6/7 yalnız kaynak MusicXML `<harmony>` verisini işler; nota içeriğinden akor tahmini yapmaz. Source-only parsing/normalization, sunum, Turkish chord TTS ve erişilebilir chord UI mevcuttur. Hazır akor çıktısı kendiliğinden teacher-approved veya definitive değildir.

## 4. Package 8 — öğretmen düzeltme, onay, history ve concurrency mimarisi

Package 8 mevcut canonical modeli veya OMR sonucunu yerinde değiştiren mutable bir engine değildir. Güvenli sınır:

```text
immutable revision
+ separate correction audit
+ separate exact-revision approval
+ immutable lossless history/undo
+ optimistic concurrency / stale-history conflict
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

Fingerprint alanları deterministic drift/version tokenlarıdır; kriptografik imza veya authorization credential değildir.

### 4.2 T2 — controlled correction operations: COMPLETED

`src/services/teacherCorrectionOperations.js`

Yalnız bounded `replace_value` operation desteklenir; mevcut path değiştirilebilir, insertion/delete yoktur. Parent overwrite edilmez. Accepted correction yeni immutable T1 revision ve ayrı immutable audit event üretir. Duplicate/overlapping/no-op/prototype-sensitive/unsafe işlemler fail closed olur. Correction approval değildir.

### 4.3 T3 — exact-revision approval binding/invalidation: COMPLETED

`src/services/teacherApprovalModel.js`

Approval schema v3 ayrı immutable evidence kaydıdır. Source/root-source identity, revision ID/kind, parent revision ID, revision timestamp, content fingerprint ve recursive lineage fingerprint exact olarak bağlanır. Later/replayed revision exact binding'i taşımıyorsa eski approval uygulanmaz. Historical approval evidence mutasyona uğramaz.

### 4.4 T4 — lossless revision history and undo: COMPLETED

`src/services/teacherRevisionHistory.js`

T4 automatic root, later T1 revisions, T2 correction audits, T3 approval records ve undo events'i immutable lineer history içinde korur. Undo eski state'i silmez veya pointer'ı geri taşımaz; current revision'dan historical target'ın exact content'ine yeni corrected revision üretir. Aynı içerik geri gelse bile recursive lineage yenidir ve eski approval yeniden doğmaz. Correction audit semantics parent üzerinde replay edilerek doğrulanır; impossible current-parent/no-op undo fail closed olur.

Final T4 evidence: PR #97 → merge `eaf967174d1cc0f2552cc97e7e0a6bf0a1715c64` → exact-main CI #248 SUCCESS, 1173/1173 tests, 232 suites, 0 vulnerabilities, build PASS.

### 4.5 T5 — optimistic concurrency / stale-history conflict: COMPLETED

`src/services/teacherRevisionConcurrency.js`

T5 T4 history'nin üzerinde pure domain-level compare-and-apply guard sağlar.

Doğrulanmış kurallar:

1. expectation exact valid immutable T4 history snapshot'ından üretilir;
2. expectation history/source identity, full deterministic history-state fingerprint, current revision identity/content/recursive lineage ve evidence counts taşır;
3. current revision değişmese bile approval-only history değişikliği eski expectation'ı stale yapar;
4. fresh guarded correction, approval append veya undo `applied` olur ve yeni immutable history döndürür;
5. aynı eski expectation daha yeni authoritative history'ye uygulanırsa explicit `conflict` döner;
6. conflict yeni revision, correction audit, approval veya undo evidence üretmez — zero partial domain write;
7. conflict automatic merge/rebase veya müzikal veri tahmini yapmaz;
8. malformed/mutable/injected/forged expectations fail closed olur;
9. T5 ID veya timestamp üretmez;
10. history fingerprint authentication, authorization veya cryptographic integrity credential değildir;
11. pure T5 katmanı atomic database transaction veya distributed lock garantisi vermez; gelecekteki persistence integration compare-and-apply koşulunu atomik korumalıdır.

Final T5 evidence:

- PR #99 final head: `6e151b94609ecf362b3bff0976479a6c2eda45b9`;
- exact-head CI #252: **1186/1186 tests PASS**, 232 suites, 0 vulnerabilities, production build PASS;
- protected-main squash merge: `4747210751c1c49295052f8cca7be58281b91023`;
- exact-main CI #253 / run `33181815397`: **1186/1186 tests PASS**, 232 suites, 0 fail/skipped/cancelled, 0 vulnerabilities, production build PASS;
- existing Audiveris/OMR, Render Blueprint and Dockerfile security regressions PASS.

### 4.6 Sonraki Package 8 aşaması

- **8-T1 — Completed**
- **8-T2 — Completed**
- **8-T3 — Completed**
- **8-T4 — Completed**
- **8-T5 — Completed**
- **8-T6 — NEXT / Not started:** accessible teacher UI

**Package 8B — Audiveris training dataset** ayrı ve daha sonraki pakettir; T6 kapsamında değildir.

## 5. T6 için mimari sınır

T6'nın görevi T1–T5'in doğrulanmış immutable domain state'ini öğretmene erişilebilir ve doğru semantiklerle sunmaktır.

Güvenli T6 yönü:

- UI kendi revision/history/approval gerçeğini üretmez; T1–T5 sonuçlarını gösterir ve mevcut domain operasyonlarını çağırır;
- correction yalnız T2/T5 guarded correction üzerinden yapılır;
- approval yalnız T3/T5 guarded approval append üzerinden yapılır;
- undo yalnız T4/T5 guarded undo üzerinden yapılır;
- stale state explicit conflict olarak görünür; UI silent overwrite veya automatic merge yapmaz;
- original/automatic source state ile current corrected state açıkça ayrılır;
- approval exact current revision için applicable değilse UI bunu onaylı gibi göstermez;
- keyboard-only kullanım, native controls, visible focus, accessible names ve `aria-live` durum mesajları zorunludur;
- conflict/warning/approval durumu yalnız renk ile ifade edilmemelidir;
- T6 persistence/backend API, authentication/authorization veya Package 12 sharing eklememelidir.

T6 başlamadan fresh repository read, exact-main CI, open PR/issue ve protected boundary kontrolü zorunludur.

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
- history snapshot ve undo audit event'leri;
- T5 expectation/conflict evidence.

Correction, undo ve successful guarded operations yeni immutable state üretir. Historical evidence korunur.

## 8. Erişilebilirlik sınırı

T6 geldiğinde öğretmen arayüzü:

- klavye ile tam kullanılabilir;
- native control öncelikli;
- revision/change/approval/conflict durumları ekran okuyucu ile açık;
- görsel ve spoken durum aynı state kaynağından;
- kritik/onaysız/conflict durumu yalnız renk ile ifade edilmeyen;
- focus yönetimi deterministic ve modal trap içermeyen;
- conflict sonrasında yeniden yükleme/retry gereğini açıkça ifade eden

bir katman olmalıdır.

## 9. Repository sınırları

- Frontend orchestration/UI: `src/`, `main.js`, `index.html`
- Canonical/parser/theory: root-level music modules + `src/services/`
- Teacher revision domain: `src/services/teacherRevisionModel.js`
- Teacher correction domain: `src/services/teacherCorrectionOperations.js`
- Teacher approval domain: `src/services/teacherApprovalModel.js`
- Teacher history/undo domain: `src/services/teacherRevisionHistory.js`
- Teacher optimistic concurrency domain: `src/services/teacherRevisionConcurrency.js`
- Backend OMR/API: `backend/`
- Tests: `tests/`
- CI: `.github/workflows/`
- Deployment: `Dockerfile`, `render.yaml`
- Architecture/status docs: `docs/`

## 10. Mevcut durum

- Package 0–7: **Completed**.
- Package 8: **Partially implemented** — T1/T2/T3/T4/T5 Completed; T6 next.
- Package 8-T6: Not started.
- Package 8B, 9–13: Not started.
- Package 14: Partially implemented.

T5 final implementation baseline: `4747210751c1c49295052f8cca7be58281b91023`; exact-main CI #253: **1186/1186 tests**, 232 suites, 0 fail/skipped/cancelled, audit 0 vulnerabilities ve production build PASS.

Bu belge gelecekteki implementasyon için sınırsız izin değildir. T6 ve sonraki her aşama fresh-read, ayrı branch, focused test, full regression, review çözümü ve exact-head/exact-main CI kanıtı ile yürütülmelidir.
