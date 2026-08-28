# SesliTab Music Engine — Güncel Mimari

**Belge sürümü:** 2.2.0  
**Güncelleme tarihi:** 2026-08-28  
**T1 kapanış main:** `218c3e18eed3a82861a4a1c24efd5458445ea9ca`  
**T2 kapanış main:** `f6d80b4614654ee63a4fd2d51101e4961476a1ee`  
**T3 final/hardened main:** `95f11139929d1e3d65bd6c295794c316bb04ca84`  
**Durum:** Mevcut kod, review bulguları ve kapanmış paketlerle uzlaştırılmış mimari yönlendirme belgesi.

## 1. Değişmez ürün ilkesi

SesliTab öğretmen denetimli, yarı otomatik ve erişilebilir bir müzik eğitimi sistemidir.

Yapısal olarak geçerli MusicXML, müzikal doğruluk kanıtı değildir. Kaynakla doğrulanmamış veya kalite kapısında güvenli bulunmamış veri öğrenciye kesin doğru bilgi olarak sunulmamalıdır. Otomatik kaynak, öğretmen düzeltmesi ve öğretmen onayı birbirinden ayrı, izlenebilir ve immutable kayıtlar olarak korunmalıdır.

## 2. Güncel ana veri akışı

```text
PDF
  -> mevcut Cloud OMR Gateway
  -> mevcut Audiveris provider/runtime
  -> MusicXML

Doğrudan MusicXML / Guitar TAB
  -> parse / normalize
  -> canonical NoteObject[]
  -> structuralRhythmValidator + qualityErrorReport
  -> appQualityGate (ACCEPT / REVIEW / BLOCK)
  -> rhythmic text/HTML, TTS/playback, MIDI, Basic Guitar TAB, Basic Violin

MusicXML <harmony>
  -> source-only chord parser/presentation/TTS

Package 8 domain layer
  AutomaticSourceRevision (immutable)
    -> controlled replace-only correction
    -> TeacherCorrectedRevision (new immutable revision)
       + TeacherCorrectionAuditEvent (separate immutable evidence)
    -> TeacherApprovalRecord v2 (separate immutable approval evidence)
       bound to exact revision identity + lineage + fingerprint
    -> future T4 lossless history/undo
    -> future T5 stale-base concurrency
    -> future T6 accessible teacher UI
    -> later Package 12 approved-revision sharing
```

## 3. Doğrulanmış mimari katmanlar

### 3.1 OMR katmanı — korunacak mevcut bağlantı

PDF yolu mevcut backend OMR gateway/provider mimarisini kullanır; Audiveris ana OMR motorudur.

Package 8 kapsamında ayrı izin olmadan değiştirilmeyecek alanlar:

- `backend/` Audiveris provider/runtime/preflight;
- OMR worker/provider seçimi;
- Cloud OMR Gateway sözleşmeleri;
- üretim MusicXML OMR yolu;
- `Dockerfile`;
- `render.yaml`;
- mevcut Render servis/deployment bağlantısı.

Package 8 öğretmen katmanı bu altyapının üstünde çalışır; OMR mimarisini yeniden yazmaz.

### 3.2 Canonical nota/zaman modeli — Package 2A

Canonical `NoteObject[]` tüketiciler arasındaki ortak veri sınırıdır. Fiziksel ölçü kimliği, canonical pitch/time ve source-verification bilgisi korunur. Eksik nota/ritim icat edilmez.

### 3.3 Yapısal doğrulama/kalite — Package 2B–2D

- `structuralRhythmValidator.js`
- `qualityErrorReport.js`
- `appQualityGate.js`
- canonical consumer policy/bindings

Quality-gate `ACCEPT` öğretmen onayı değildir ve T3 bunu değiştirmez.

### 3.4 OMR benchmark — Package 2E

İzole ölçüm/evidence katmanıdır; üretim OMR hattını otomatik değiştirmez ve universal accuracy iddiası üretmez.

### 3.5 Playback, ölçü seçimi, MIDI — Package 3

Canonical measure identity, selected-measure TTS/playback ve quality-gated deterministic MIDI doğrulanmıştır.

### 3.6 Basic Guitar TAB — Package 4

Conservative quality-gated basic projection/rendering kullanılır. Polyphonic/pedagojik gelişmiş Guitar TAB Package 9'a aittir.

### 3.7 Basic Violin — Package 5

Conservative first-position quality-gated yönlendirme vardır. Advanced violin Package 10'a aittir.

### 3.8 Harmony/chord — Package 6–7

Yalnız MusicXML `<harmony>` source evidence işlenir; nota içeriğinden akor tahmini yapılmaz.

## 4. Package 8 — teacher revision/correction/approval mimarisi

Package 8 mutable bir “correction engine” olarak otomatik kaynağın üstüne yazmaz. Doğrulanmış sınır immutable revision + ayrı correction audit + ayrı approval evidence modelidir.

### 4.1 T1 — revision domain (Completed)

T1 sağlar:

- immutable `automatic` ve `teacher_corrected` revision records;
- exact parent/root-source lineage;
- deterministic `contentFingerprint`;
- strict frozen plain-data snapshots;
- approval-field injection rejection.

Önemli sınır: T1 immediate parent ve root-source revision ID reuse'u engeller; bütün tarih boyunca ara revision ID'lerinin global uniqueness'ını tek başına garanti etmez.

### 4.2 T2 — controlled corrections (Completed)

```text
ParentRevision
  -> applyTeacherCorrectionBatch
  -> replace_value / existing path only
  -> NewTeacherCorrectedRevision
  +-> TeacherCorrectionAuditEvent
```

Doğrulanmış kurallar:

- insertion/delete yok;
- parent overwrite yok;
- duplicate operation ID / overlap / no-op fail closed;
- prototype-sensitive paths reddedilir;
- `-0`/`0` aynı array target'tır;
- unsafe audit/correction data reddedilir;
- correction approval değildir.

### 4.3 T3 — exact revision approval (Completed after review hardening)

Final schema: **TeacherApprovalRecord v2**.

```text
Revision R1
  sourceId = S
  sourceRevisionId = A0
  revisionId = R1
  revisionKind = teacher_corrected
  parentRevisionId = A0
  revision.createdAt = T1
  contentFingerprint = F1
        |
        | explicit teacher approval
        v
Approval A1
  bound to (S, A0, R1, kind, parent, T1, F1)
```

Applicability vocabulary:

- `APPROVED_EXACT_REVISION`
- `NOT_APPLICABLE_TO_REVISION`

Approval exact olarak şu yedi boyuta bağlanır:

1. `sourceId`
2. root `sourceRevisionId`
3. exact `revisionId`
4. exact `revisionKind`
5. exact `parentRevisionId`
6. exact revision `createdAt`
7. exact `contentFingerprint`

### 4.4 P1 review hardening neden gerekliydi

İlk T3 PR #91 dört boyut kullanıyordu: source, root-source revision, revision ID ve fingerprint. Docs closure PR #92 review'ında şu geçerli risk bulundu:

```text
A0 -> R1 (approved) -> R2 -> later R1 id reused + R1 content restored
```

T1 ara ancestor ID'nin daha sonra tekrar kullanılmasını global olarak engellemediği için dört alan aynı hale getirilebilirdi. Bu, eski approval'ın yeni revision için yanlışlıkla geçerli görünmesine yol açabilirdi.

PR #92 merge edilmeden kapatıldı. PR #93 approval schema'yı v2 yaptı ve parent lineage + revision kind + revision timestamp'i exact binding'e ekledi. Regression testi ayrıca eski timestamp ve içeriği kasıtlı olarak geri getirerek saldırı senaryosunu doğrular; farklı parent lineage nedeniyle yeni kayıt `NOT_APPLICABLE_TO_REVISION` kalır.

### 4.5 Approval sınırı

T3 approval:

- revision içine mutable flag eklemez;
- eski approval record'u invalidate etmek için mutate/delete etmez;
- quality-gate `ACCEPT` değildir;
- authentication/authorization kanıtı değildir;
- `shareAllowed`/`safeToShare` üretmez;
- Package 12 student sharing'i aktive etmez;
- fingerprint'i cryptographic authorization olarak kullanmaz.

## 5. Sonraki Package 8 aşamaları

- **8-T1 — Completed**
- **8-T2 — Completed**
- **8-T3 — Completed after review hardening**
- **8-T4 — NEXT / Not started:** lossless undo/version history
- **8-T5 — Not started:** optimistic concurrency / stale-base conflict
- **8-T6 — Not started:** accessible teacher UI

Package 8B — Audiveris training dataset — ayrı ve daha sonraki roadmap paketidir.

### T4 mimari sınırı

T4 historical revision/audit/approval records üzerinde lossless history kurmalıdır. Undo:

- historical revision bytes'ı overwrite/delete etmemeli;
- duplicate veya contradictory revision identity'yi fail closed ele almalı;
- broken ancestry/cross-source history'yi reddetmeli;
- T3 approval'ı sessizce restore/icat etmemeli;
- T5 concurrency veya T6 UI davranışını erken eklememelidir.

## 6. Güvenlik bağımlılıkları

| Tüketici / özellik | Canonical | Quality gate | Teacher approval |
|---|---:|---:|---:|
| Öğretmen inceleme | Evet | Uyarı/engelleme | Hayır |
| Playback/TTS | Evet | Evet | Mevcut akışta zorunlu değil |
| MIDI export | Evet | Evet | Öğrenci paylaşımında ayrıca gerekir |
| Basic Guitar TAB | Evet | Evet | Otomatik öneri için hayır; paylaşım için evet |
| Basic Violin | Evet | Evet | Otomatik öneri için hayır; paylaşım için evet |
| Chord source display/TTS | Kaynak/canonical | Fail-closed source state | Paylaşım için evet |
| Package 12 student sharing | Evet | Evet | **Evet, exact revision** |

## 7. Veri sahipliği / mutasyon sınırı

Yerinde overwrite edilmemeli:

- original PDF;
- original OMR / `.omr`;
- automatic MusicXML/canonical source;
- automatic revision;
- teacher-corrected revisions;
- correction audit events;
- teacher approval records.

T4 history de bu kayıtları lossless korumalıdır.

## 8. Erişilebilirlik sınırı

Teacher UI T6'dır. UI başlamadan domain/history/concurrency sözleşmeleri kapanmalıdır. Gelecekte native controls, keyboard erişimi, screen-reader eşdeğer durum bilgisi ve yalnız-renk olmayan hata/onay anlatımı korunmalıdır.

## 9. Repository sınırları

- Frontend/UI: `src/`, `main.js`, `index.html`
- Canonical/parser/theory: root modules + `src/services/`
- Teacher domain:
  - `src/services/teacherRevisionModel.js`
  - `src/services/teacherCorrectionOperations.js`
  - `src/services/teacherApprovalModel.js`
- Backend OMR/API: `backend/`
- Tests: `tests/`
- CI: `.github/workflows/`
- Deployment: `Dockerfile`, `render.yaml`
- Docs: `docs/`

## 10. Verified T3 final baseline

- initial PR #91 / exact-head CI #233 / main CI #234: green but later review showed closure gap;
- superseded docs PR #92: closed unmerged after valid P1;
- final hardening PR #93 head: `ee215d3c1d53e2bb7a7323387c02a79223643e46`;
- exact-head CI #236: SUCCESS;
- final protected main: `95f11139929d1e3d65bd6c295794c316bb04ca84`;
- exact-main CI #237: **1151/1151 tests, 232 suites, 0 failures/skips/cancels, 0 vulnerabilities, build PASS**.

Package 8 remains **Partially implemented**. T4 is the next stage but is not started by this documentation closure.
