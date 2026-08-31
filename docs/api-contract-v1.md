# SesliTab Cloud API — API Contract v1

> HISTORICAL / PROPOSED CONTRACT — NOT CURRENT PRODUCTION ARCHITECTURE. This document records an earlier API direction. The current architecture is `docs/teacher-score-editor-architecture.md`; authenticated student delivery and server-side authorization are out of scope.

**Sürüm:** 1.0.0
**Durum:** Taslak (backend henüz uygulanmadı)
**Base URL:** `https://api.seslitab.cloud`
**API Prefix:** `/api/v1`
**Protokol:** HTTPS only
**Kimlik doğrulama:** Henüz yok (v1.0 anonim erişim). Gelecekte Bearer JWT (Supabase Auth) planlanmaktadır.

---

## İçindekiler

1. [Genel Kurallar](#1-genel-kurallar)
2. [Kimlik Doğrulama](#2-kimlik-doğrulama)
3. [Ortak Veri Modelleri](#3-ortak-veri-modelleri)
4. [Hata Formatı](#4-hata-formatı)
5. [Endpoint'ler](#5-endpointler)
   - [POST /api/v1/pdf/upload](#51-post-apiv1pdfupload)
   - [POST /api/v1/pdf/analyze](#52-post-apiv1pdfanalyze)
   - [GET /api/v1/job/{jobId}](#53-get-apiv1jobjobid)
   - [GET /api/v1/musicxml/{jobId}](#54-get-apiv1musicxmljobid)
   - [GET /api/v1/midi/{jobId}](#55-get-apiv1midijobid)
   - [POST /api/v1/teacher/approve](#56-post-apiv1teacherapprove)
   - [GET /api/v1/student/session/{sessionId}](#57-get-apiv1studentsessionsessionid)
6. [Durum Kodları Özeti](#6-durum-kodları-özeti)
7. [Veri Akış Diyagramı](#7-veri-akış-diyagramı)
8. [Çapraz Platform Uyumluluk Notları](#8-çapraz-platform-uyumluluk-notları)
9. [Gelecek Genişletmeler](#9-gelecek-genişletmeler)

---

## 1. Genel Kurallar

| Kural | Değer |
|-------|-------|
| Content-Type | `application/json` (dosya yükleme hariç: `multipart/form-data`) |
| Karakter kodlaması | UTF-8 |
| Tarih formatı | ISO 8601 (`2026-07-03T14:30:00Z`) |
| Dosya boyut sınırı | 50 MB |
| Rate limit | 60 istek/dakika |
| Rate limit header'ları | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` |
| ID formatı | `{prefix}_{unixTimestamp}_{random6}` (örn. `job_1751534400_a1b2c3`) |
| Pagination | `?page=1&limit=20` (gelecekteki list endpoint'leri için) |

### Job yaşam döngüsü

```
uploaded → processing → converting → completed
                                    ↘ failed
```

| Status | Açıklama |
|--------|----------|
| `uploaded` | PDF alındı, iş kaydı oluşturuldu |
| `processing` | OMR motoru PDF'i işliyor |
| `converting` | OMR sonucu MusicXML'e dönüştürülüyor |
| `completed` | Dönüşüm tamam, çıktı indirilebilir |
| `failed` | İş başarısız, `error` alanında sebep |

---

## 2. Kimlik Doğrulama

**v1.0:** Kimlik doğrulama yoktur. Tüm endpoint'ler anonim olarak erişilebilir.
Bu, prototip ve test aşaması içindir.

**Gelecek v1.1+:** Supabase Auth tabanlı Bearer JWT kimlik doğrulaması
planlanmaktadır. O zaman tüm isteklerde şu header gerekecektir:

```
Authorization: Bearer <eyJhbGciOi...>
```

JWT içinde `sub` (kullanıcı ID'si) ve `role` (`student` | `teacher` | `admin`)
claim'leri bulunacaktır.

---

## 3. Ortak Veri Modelleri

### 3.1 Job

Bir OMR işinin tam temsilidir.

```json
{
  "jobId": "job_1751534400_a1b2c3",
  "status": "completed",
  "fileName": "etude-no-1.pdf",
  "provider": "audiveris",
  "progress": 100,
  "createdAt": "2026-07-03T14:30:00Z",
  "updatedAt": "2026-07-03T14:31:15Z",
  "completedAt": "2026-07-03T14:31:15Z",
  "error": null
}
```

**JSON Şeması:**

```json
{
  "$id": "Job",
  "type": "object",
  "required": ["jobId", "status", "fileName", "provider", "createdAt", "updatedAt"],
  "properties": {
    "jobId":         { "type": "string", "pattern": "^job_\\d{10}_[a-z0-9]{6}$" },
    "status":        { "type": "string", "enum": ["uploaded", "processing", "converting", "completed", "failed"] },
    "fileName":      { "type": "string" },
    "provider":      { "type": "string", "enum": ["mock", "audiveris"] },
    "progress":      { "type": "integer", "minimum": 0, "maximum": 100 },
    "createdAt":     { "type": "string", "format": "date-time" },
    "updatedAt":     { "type": "string", "format": "date-time" },
    "completedAt":   { "type": ["string", "null"], "format": "date-time" },
    "error":         { "type": ["object", "null"] }
  }
}
```

### 3.2 NoteObject

MusicXML parser'ın ürettiği tek bir nota nesnesidir.

```json
{
  "measure": 1,
  "string": "G",
  "fret": 2,
  "noteName": "A4",
  "frequency": 440.0,
  "midi": 69,
  "duration": "quarter",
  "beats": 1,
  "startBeat": 0,
  "isRest": false,
  "confidence": 0.85,
  "confidenceReason": "MusicXML teknik bilgi"
}
```

**JSON Şeması:**

```json
{
  "$id": "NoteObject",
  "type": "object",
  "required": ["measure", "noteName", "duration", "beats", "startBeat", "isRest"],
  "properties": {
    "measure":         { "type": "integer", "minimum": 1 },
    "string":          { "type": "string", "enum": ["E", "A", "D", "G", "B", "e"] },
    "fret":            { "type": "integer", "minimum": 0, "maximum": 24 },
    "noteName":        { "type": "string", "description": "Örn. A4, C5, F#3" },
    "frequency":       { "type": "number", "minimum": 0, "description": "Hz" },
    "midi":            { "type": "integer", "minimum": 0, "maximum": 127 },
    "duration":        { "type": "string", "enum": ["whole", "half", "quarter", "eighth", "16th", "32nd"] },
    "beats":           { "type": "number", "minimum": 0 },
    "startBeat":       { "type": "number", "minimum": 0 },
    "isRest":          { "type": "boolean" },
    "confidence":      { "type": "number", "minimum": 0, "maximum": 1 },
    "confidenceReason":{ "type": "string" }
  }
}
```

### 3.3 Session

Öğretmen onaylı çalışma seansıdır. Öğrenci bu session üzerinden çalışır.

```json
{
  "id": "sess_1751534500_x7y8z9",
  "jobId": "job_1751534400_a1b2c3",
  "studentId": "usr_abc123",
  "teacherId": "usr_def456",
  "status": "approved",
  "musicXml": "<?xml version=\"1.0\"...",
  "notes": [],
  "rhythmicText": "Ölçü 1: La dörtlük, Do dörtlük, Mi ikilik...",
  "teacherNotes": "İlk ölçüde tempo biraz yavaş olmalı.",
  "corrections": [],
  "approvedAt": "2026-07-03T15:00:00Z",
  "createdAt": "2026-07-03T14:35:00Z"
}
```

**JSON Şeması:**

```json
{
  "$id": "Session",
  "type": "object",
  "required": ["id", "jobId", "status", "notes", "rhythmicText", "createdAt"],
  "properties": {
    "id":            { "type": "string", "pattern": "^sess_\\d{10}_[a-z0-9]{6}$" },
    "jobId":         { "type": "string" },
    "studentId":     { "type": ["string", "null"] },
    "teacherId":     { "type": ["string", "null"] },
    "status":        { "type": "string", "enum": ["approved", "archived"] },
    "musicXml":      { "type": "string", "description": "MusicXML dokümanı" },
    "notes":         { "type": "array", "items": { "$ref": "NoteObject" } },
    "rhythmicText":  { "type": "string", "description": "Türkçe ritmik metin" },
    "teacherNotes":  { "type": ["string", "null"] },
    "corrections":   { "type": "array", "items": { "$ref": "Correction" } },
    "approvedAt":    { "type": ["string", "null"], "format": "date-time" },
    "createdAt":     { "type": "string", "format": "date-time" }
  }
}
```

### 3.4 Correction

Öğretmenin bir notada yaptığı düzeltmedir.

```json
{
  "measure": 3,
  "string": "G",
  "originalFret": 2,
  "correctedFret": 3,
  "reason": "Öğrenci yanlış perde basmış"
}
```

**JSON Şeması:**

```json
{
  "$id": "Correction",
  "type": "object",
  "required": ["measure", "originalFret", "correctedFret"],
  "properties": {
    "measure":        { "type": "integer", "minimum": 1 },
    "string":         { "type": "string", "enum": ["E", "A", "D", "G", "B", "e"] },
    "originalFret":   { "type": "integer", "minimum": 0, "maximum": 24 },
    "correctedFret":  { "type": "integer", "minimum": 0, "maximum": 24 },
    "reason":         { "type": "string" }
  }
}
```

---

## 4. Hata Formatı

Tüm hatalar tek tip JSON envelope döner:

```json
{
  "success": false,
  "error": {
    "code": "JOB_NOT_FOUND",
    "message": "Belirtilen iş kimliği bulunamadı.",
    "details": { "jobId": "job_invalid_id" }
  }
}
```

**JSON Şeması:**

```json
{
  "$id": "ErrorResponse",
  "type": "object",
  "required": ["success", "error"],
  "properties": {
    "success": { "type": "boolean", "enum": [false] },
    "error": {
      "type": "object",
      "required": ["code", "message"],
      "properties": {
        "code":    { "type": "string" },
        "message": { "type": "string" },
        "details": { "type": "object" }
      }
    }
  }
}
```

### Hata kodları

| Code | HTTP | Açıklama |
|------|------|----------|
| `VALIDATION_ERROR` | 400 | İstek gövdesi/parametresi geçersiz |
| `FILE_TOO_LARGE` | 413 | Dosya 50 MB sınırını aşıyor |
| `UNSUPPORTED_FILE_TYPE` | 415 | Sadece PDF kabul edilir |
| `JOB_NOT_FOUND` | 404 | İş kimliği geçersiz |
| `SESSION_NOT_FOUND` | 404 | Seans kimliği geçersiz |
| `JOB_NOT_READY` | 409 | İş henüz tamamlanmadı |
| `ALREADY_APPROVED` | 409 | Seans zaten onaylanmış |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit aşıldı |
| `INTERNAL_ERROR` | 500 | Sunucu içi hata |
| `OMR_PROVIDER_ERROR` | 502 | OMR motoru hatası |
| `OMR_PROVIDER_TIMEOUT` | 504 | OMR motoru zaman aşımı |

---

## 5. Endpoint'ler

---

### 5.1 POST /api/v1/pdf/upload

**Amaç:** PDF dosyasını yükler, yeni bir OMR işi kaydı oluşturur. İşlem
bittiğinde `jobId` döner; bu ID sonraki tüm endpoint'lerde kullanılır.

**Content-Type:** `multipart/form-data`

#### Request

| Alan | Tip | Zorunlu | Açıklama |
|------|-----|---------|----------|
| `file` | binary | evet | PDF dosyası (max 50 MB) |
| `provider` | string | hayır | OMR motoru: `mock`, `audiveris`. Belirtilmezse config varsayılanı |

```
POST /api/v1/pdf/upload HTTP/1.1
Host: api.seslitab.cloud
Content-Type: multipart/form-data; boundary=----FormBoundary

------FormBoundary
Content-Disposition: form-data; name="file"; filename="etude-no-1.pdf"
Content-Type: application/pdf

(binary data)
------FormBoundary
Content-Disposition: form-data; name="provider"

audiveris
------FormBoundary--
```

#### Response — 201 Created

```json
{
  "success": true,
  "jobId": "job_1751534400_a1b2c3",
  "status": "uploaded",
  "fileName": "etude-no-1.pdf",
  "provider": "audiveris",
  "createdAt": "2026-07-03T14:30:00Z"
}
```

**JSON Şeması (Response):**

```json
{
  "$id": "UploadPdfResponse",
  "type": "object",
  "required": ["success", "jobId", "status", "fileName", "provider", "createdAt"],
  "properties": {
    "success":   { "type": "boolean", "enum": [true] },
    "jobId":     { "type": "string" },
    "status":    { "type": "string", "enum": ["uploaded"] },
    "fileName":  { "type": "string" },
    "provider":  { "type": "string" },
    "createdAt": { "type": "string", "format": "date-time" }
  }
}
```

#### HTTP Status Kodları

| Status | Anlamı |
|--------|--------|
| 201 | Created — iş kaydı oluşturuldu |
| 400 | Bad Request — `file` alanı eksik |
| 413 | Payload Too Large — dosya > 50 MB |
| 415 | Unsupported Media Type — dosya PDF değil |
| 429 | Too Many Requests — rate limit aşıldı |
| 500 | Internal Server Error |

#### Hata Durumları

| Senaryo | HTTP | Code | Message |
|---------|------|------|---------|
| `file` alanı gönderilmedi | 400 | `VALIDATION_ERROR` | "PDF dosyası zorunludur." |
| Dosya boyutu 50 MB'ı aşıyor | 413 | `FILE_TOO_LARGE` | "Dosya boyutu 50 MB sınırını aşıyor." |
| Dosya tipi PDF değil | 415 | `UNSUPPORTED_FILE_TYPE` | "Sadece PDF dosyaları kabul edilir." |
| 60 istek/dakika aşıldı | 429 | `RATE_LIMIT_EXCEEDED` | "Rate limit aşıldı. Daha sonra tekrar deneyin." |
| Sunucu hatası | 500 | `INTERNAL_ERROR` | "Beklenmeyen sunucu hatası." |

---

### 5.2 POST /api/v1/pdf/analyze

**Amaç:** Önceden yüklenmiş bir iş için OMR tanıma işlemini başlatır. İşlem
asenkrondur — bu endpoint hemen 202 döner, durum `GET /api/v1/job/{jobId}`
ile poll edilir.

#### Request

```
POST /api/v1/pdf/analyze HTTP/1.1
Host: api.seslitab.cloud
Content-Type: application/json

{
  "jobId": "job_1751534400_a1b2c3"
}
```

| Alan | Tip | Zorunlu | Açıklama |
|------|-----|---------|----------|
| `jobId` | string | evet | upload-pdf'den dönen iş kimliği |

**JSON Şeması (Request):**

```json
{
  "$id": "AnalyzePdfRequest",
  "type": "object",
  "required": ["jobId"],
  "properties": {
    "jobId": { "type": "string", "pattern": "^job_\\d{10}_[a-z0-9]{6}$" }
  }
}
```

#### Response — 202 Accepted

```json
{
  "success": true,
  "jobId": "job_1751534400_a1b2c3",
  "status": "processing",
  "message": "OMR analizi başlatıldı. Durum için GET /api/v1/job/{jobId} kullanın."
}
```

**JSON Şeması (Response):**

```json
{
  "$id": "AnalyzePdfResponse",
  "type": "object",
  "required": ["success", "jobId", "status", "message"],
  "properties": {
    "success": { "type": "boolean", "enum": [true] },
    "jobId":   { "type": "string" },
    "status":  { "type": "string", "enum": ["processing"] },
    "message": { "type": "string" }
  }
}
```

#### HTTP Status Kodları

| Status | Anlamı |
|--------|--------|
| 202 | Accepted — OMR analizi başlatıldı |
| 400 | Bad Request — `jobId` eksik/geçersiz |
| 404 | Not Found — iş kaydı yok |
| 409 | Conflict — iş zaten tamamlanmış veya işleniyor |
| 429 | Too Many Requests |
| 502 | Bad Gateway — OMR motoru başlatılamadı |
| 504 | Gateway Timeout — OMR motoru zaman aşımı |

#### Hata Durumları

| Senaryo | HTTP | Code | Message |
|---------|------|------|---------|
| `jobId` eksik | 400 | `VALIDATION_ERROR` | "jobId zorunludur." |
| `jobId` formatı geçersiz | 400 | `VALIDATION_ERROR` | "jobId formatı geçersiz." |
| İş kaydı bulunamadı | 404 | `JOB_NOT_FOUND` | "Belirtilen iş kimliği bulunamadı." |
| İş zaten `completed` | 409 | `JOB_NOT_READY` | "İş zaten tamamlandı, tekrar analiz gerekmez." |
| İş zaten `processing` | 409 | `JOB_NOT_READY` | "İş zaten işleniyor." |
| OMR motoru başlatılamadı | 502 | `OMR_PROVIDER_ERROR` | "OMR motoru başlatılamadı." |
| OMR motoru zaman aşımı | 504 | `OMR_PROVIDER_TIMEOUT` | "OMR motoru yanıt vermedi." |

---

### 5.3 GET /api/v1/job/{jobId}

**Amaç:** Bir OMR işinin mevcut durumunu döndürür. Polling için kullanılır.
Önerilen polling aralığı: 2 saniye (exponential backoff ile 2→4→8 saniye).

#### Request

```
GET /api/v1/job/job_1751534400_a1b2c3 HTTP/1.1
Host: api.seslitab.cloud
Accept: application/json
```

| Parametre | Tip | Konum | Zorunlu |
|-----------|-----|-------|---------|
| `jobId` | string | path | evet |

#### Response — 200 OK (processing durumunda)

```json
{
  "success": true,
  "jobId": "job_1751534400_a1b2c3",
  "status": "converting",
  "progress": 65,
  "fileName": "etude-no-1.pdf",
  "provider": "audiveris",
  "createdAt": "2026-07-03T14:30:00Z",
  "updatedAt": "2026-07-03T14:30:45Z",
  "completedAt": null,
  "error": null
}
```

#### Response — 200 OK (completed durumunda)

```json
{
  "success": true,
  "jobId": "job_1751534400_a1b2c3",
  "status": "completed",
  "progress": 100,
  "fileName": "etude-no-1.pdf",
  "provider": "audiveris",
  "createdAt": "2026-07-03T14:30:00Z",
  "updatedAt": "2026-07-03T14:31:15Z",
  "completedAt": "2026-07-03T14:31:15Z",
  "error": null
}
```

#### Response — 200 OK (failed durumunda)

```json
{
  "success": true,
  "jobId": "job_1751534400_a1b2c3",
  "status": "failed",
  "progress": 0,
  "fileName": "etude-no-1.pdf",
  "provider": "audiveris",
  "createdAt": "2026-07-03T14:30:00Z",
  "updatedAt": "2026-07-03T14:30:50Z",
  "completedAt": null,
  "error": {
    "code": "OMR_PROVIDER_ERROR",
    "message": "PDF sayfası çözümlenemedi: bozuk görüntü."
  }
}
```

**JSON Şeması (Response):**

```json
{
  "$id": "JobStatusResponse",
  "type": "object",
  "required": ["success", "jobId", "status", "fileName", "provider", "createdAt", "updatedAt"],
  "properties": {
    "success":      { "type": "boolean", "enum": [true] },
    "jobId":        { "type": "string" },
    "status":       { "type": "string", "enum": ["uploaded", "processing", "converting", "completed", "failed"] },
    "progress":     { "type": "integer", "minimum": 0, "maximum": 100 },
    "fileName":     { "type": "string" },
    "provider":     { "type": "string" },
    "createdAt":    { "type": "string", "format": "date-time" },
    "updatedAt":    { "type": "string", "format": "date-time" },
    "completedAt":  { "type": ["string", "null"], "format": "date-time" },
    "error":        { "type": ["object", "null"] }
  }
}
```

#### HTTP Status Kodları

| Status | Anlamı |
|--------|--------|
| 200 | OK — iş durumu döndü |
| 400 | Bad Request — `jobId` formatı geçersiz |
| 404 | Not Found — iş kaydı yok |
| 429 | Too Many Requests |

#### Hata Durumları

| Senaryo | HTTP | Code | Message |
|---------|------|------|---------|
| `jobId` formatı geçersiz | 400 | `VALIDATION_ERROR` | "jobId formatı geçersiz." |
| İş kaydı bulunamadı | 404 | `JOB_NOT_FOUND` | "Belirtilen iş kimliği bulunamadı." |
| Rate limit aşıldı | 429 | `RATE_LIMIT_EXCEEDED` | "Rate limit aşıldı." |

---

### 5.4 GET /api/v1/musicxml/{jobId}

**Amaç:** Tamamlanmış bir işin MusicXML çıktısını döndürür. İki format
destekler: raw XML (varsayılan) veya JSON envelope (`Accept: application/json`).

#### Request

```
GET /api/v1/musicxml/job_1751534400_a1b2c3 HTTP/1.1
Host: api.seslitab.cloud
Accept: application/xml
```

| Parametre | Tip | Konum | Zorunlu |
|-----------|-----|-------|---------|
| `jobId` | string | path | evet |

| Header | Değer | Açıklama |
|--------|-------|----------|
| `Accept` | `application/xml` (varsayılan) | Raw XML döner |
| `Accept` | `application/json` | JSON envelope döner |

#### Response — 200 OK (XML formatı)

**Content-Type:** `application/xml`
**Content-Disposition:** `attachment; filename="etude-no-1.musicxml"`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN"
  "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>Etude No. 1</work-title>
  </work>
  <part-list>
    <score-part id="P1">
      <part-name>Guitar</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
        </time>
      </attributes>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>4</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>
```

#### Response — 200 OK (JSON formatı)

```json
{
  "success": true,
  "jobId": "job_1751534400_a1b2c3",
  "musicXml": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>...",
  "fileName": "etude-no-1.musicxml"
}
```

**JSON Şeması (JSON formatı response):**

```json
{
  "$id": "MusicXmlResponse",
  "type": "object",
  "required": ["success", "jobId", "musicXml", "fileName"],
  "properties": {
    "success":   { "type": "boolean", "enum": [true] },
    "jobId":     { "type": "string" },
    "musicXml":  { "type": "string", "description": "MusicXML dokümanı (string olarak)" },
    "fileName":  { "type": "string" }
  }
}
```

#### HTTP Status Kodları

| Status | Anlamı |
|--------|--------|
| 200 | OK — MusicXML döndü |
| 400 | Bad Request — `jobId` formatı geçersiz |
| 404 | Not Found — iş kaydı yok |
| 409 | Conflict — iş henüz `completed` değil |
| 429 | Too Many Requests |

#### Hata Durumları

| Senaryo | HTTP | Code | Message |
|---------|------|------|---------|
| `jobId` formatı geçersiz | 400 | `VALIDATION_ERROR` | "jobId formatı geçersiz." |
| İş kaydı bulunamadı | 404 | `JOB_NOT_FOUND` | "Belirtilen iş kimliği bulunamadı." |
| İş henüz tamamlanmadı | 409 | `JOB_NOT_READY` | "İş henüz tamamlanmadı. Mevcut durum: processing." |

---

### 5.5 GET /api/v1/midi/{jobId}

**Amaç:** Tamamlanmış bir işin MIDI çıktısını döndürür. MusicXML'den
dönüştürülür. İlk istekte MIDI henüz hazır değilse arka planda dönüştürme
başlar ve 409 döner; kısa süre sonra tekrar denenebilir.

#### Request

```
GET /api/v1/midi/job_1751534400_a1b2c3 HTTP/1.1
Host: api.seslitab.cloud
Accept: audio/midi
```

| Parametre | Tip | Konum | Zorunlu |
|-----------|-----|-------|---------|
| `jobId` | string | path | evet |

#### Response — 200 OK

**Content-Type:** `audio/midi`
**Content-Disposition:** `attachment; filename="etude-no-1.mid"`

```
(binary MIDI data — Standard MIDI File format)
```

#### HTTP Status Kodları

| Status | Anlamı |
|--------|--------|
| 200 | OK — MIDI dosyası döndü |
| 400 | Bad Request — `jobId` formatı geçersiz |
| 404 | Not Found — iş kaydı yok |
| 409 | Conflict — iş tamamlanmadı veya MIDI dönüştürme devam ediyor |
| 429 | Too Many Requests |
| 502 | Bad Gateway — MIDI dönüştürme hatası |

#### Hata Durumları

| Senaryo | HTTP | Code | Message |
|---------|------|------|---------|
| `jobId` formatı geçersiz | 400 | `VALIDATION_ERROR` | "jobId formatı geçersiz." |
| İş kaydı bulunamadı | 404 | `JOB_NOT_FOUND` | "Belirtilen iş kimliği bulunamadı." |
| İş henüz `completed` değil | 409 | `JOB_NOT_READY` | "İş henüz tamamlanmadı." |
| MIDI dönüştürme devam ediyor | 409 | `JOB_NOT_READY` | "MIDI dönüştürme devam ediyor. Kısa süre sonra tekrar deneyin." |
| MIDI dönüştürme hatası | 502 | `OMR_PROVIDER_ERROR` | "MIDI dönüştürme başarısız." |

---

### 5.6 POST /api/v1/teacher/approve

**Amaç:** Öğretmen, bir OMR işinin sonucunu inceler ve onaylar. Onaylanan iş
bir "session" oluşturur — öğrenci bu session üzerinden çalışabilir. Öğretmen
nota düzeltmeleri (corrections) ve ritmik metin üzerine yazımı
belirtebilir.

#### Request

```
POST /api/v1/teacher/approve HTTP/1.1
Host: api.seslitab.cloud
Content-Type: application/json

{
  "jobId": "job_1751534400_a1b2c3",
  "studentId": "usr_abc123",
  "corrections": {
    "notes": [
      {
        "measure": 3,
        "string": "G",
        "originalFret": 2,
        "correctedFret": 3,
        "reason": "Öğrenci yanlış perde basmış"
      }
    ]
  },
  "rhythmicTextOverride": null,
  "notes": "İlk ölçüde tempo biraz yavaş olmalı."
}
```

| Alan | Tip | Zorunlu | Açıklama |
|------|-----|---------|----------|
| `jobId` | string | evet | Onanacak OMR işi |
| `studentId` | string | hayır | Hangi öğrenciye atanacak (v1.0'da opsiyonel) |
| `corrections` | object | hayır | Öğretmenin nota düzeltmeleri |
| `corrections.notes` | array | hayır | Düzeltilecek notaların listesi (Correction[]) |
| `rhythmicTextOverride` | string | hayır | Ritmik metnin üzerine yazımı |
| `notes` | string | hayır | Öğrenciye genel not |

**JSON Şeması (Request):**

```json
{
  "$id": "TeacherApproveRequest",
  "type": "object",
  "required": ["jobId"],
  "properties": {
    "jobId":                { "type": "string", "pattern": "^job_\\d{10}_[a-z0-9]{6}$" },
    "studentId":            { "type": ["string", "null"] },
    "corrections": {
      "type": "object",
      "properties": {
        "notes": { "type": "array", "items": { "$ref": "Correction" } }
      }
    },
    "rhythmicTextOverride": { "type": ["string", "null"] },
    "notes":                { "type": ["string", "null"] }
  }
}
```

#### Response — 201 Created

```json
{
  "success": true,
  "sessionId": "sess_1751534500_x7y8z9",
  "jobId": "job_1751534400_a1b2c3",
  "studentId": "usr_abc123",
  "teacherId": "usr_def456",
  "status": "approved",
  "approvedAt": "2026-07-03T15:00:00Z",
  "correctionsApplied": 1,
  "rhythmicText": "Ölçü 1: La dörtlük, Do dörtlük, Mi ikilik...",
  "notes": "İlk ölçüde tempo biraz yavaş olmalı."
}
```

**JSON Şeması (Response):**

```json
{
  "$id": "TeacherApproveResponse",
  "type": "object",
  "required": ["success", "sessionId", "jobId", "status", "approvedAt", "rhythmicText"],
  "properties": {
    "success":            { "type": "boolean", "enum": [true] },
    "sessionId":          { "type": "string" },
    "jobId":              { "type": "string" },
    "studentId":          { "type": ["string", "null"] },
    "teacherId":          { "type": ["string", "null"] },
    "status":             { "type": "string", "enum": ["approved"] },
    "approvedAt":         { "type": "string", "format": "date-time" },
    "correctionsApplied": { "type": "integer", "minimum": 0 },
    "rhythmicText":       { "type": "string" },
    "notes":              { "type": ["string", "null"] }
  }
}
```

#### HTTP Status Kodları

| Status | Anlamı |
|--------|--------|
| 201 | Created — session oluşturuldu |
| 400 | Bad Request — `jobId` eksik/geçersiz |
| 404 | Not Found — iş kaydı yok |
| 409 | Conflict — iş tamamlanmadı veya zaten onaylanmış |
| 422 | Unprocessable Entity — `corrections` formatı geçersiz |
| 429 | Too Many Requests |

#### Hata Durumları

| Senaryo | HTTP | Code | Message |
|---------|------|------|---------|
| `jobId` eksik | 400 | `VALIDATION_ERROR` | "jobId zorunludur." |
| İş kaydı bulunamadı | 404 | `JOB_NOT_FOUND` | "Belirtilen iş kimliği bulunamadı." |
| İş henüz `completed` değil | 409 | `JOB_NOT_READY` | "İş henüz tamamlanmadı." |
| Bu iş için zaten session oluşturulmuş | 409 | `ALREADY_APPROVED` | "Bu iş zaten onaylanmış." |
| `corrections.notes` formatı geçersiz | 422 | `VALIDATION_ERROR` | "Düzeltme formatı geçersiz: measure, originalFret, correctedFret zorunludur." |

---

### 5.7 GET /api/v1/student/session/{sessionId}

**Amaç:** Öğrenci, kendisine atanan onaylı session'ı getirir. Bu session
MusicXML, nota listesi (NoteObject[]), ritmik metin ve öğretmen notlarını
içerir. Öğrenci bu veriyi kullanarak çalışmaya başlar.

#### Request

```
GET /api/v1/student/session/sess_1751534500_x7y8z9 HTTP/1.1
Host: api.seslitab.cloud
Accept: application/json
```

| Parametre | Tip | Konum | Zorunlu |
|-----------|-----|-------|---------|
| `sessionId` | string | path | evet |

#### Response — 200 OK

```json
{
  "success": true,
  "session": {
    "id": "sess_1751534500_x7y8z9",
    "jobId": "job_1751534400_a1b2c3",
    "studentId": "usr_abc123",
    "teacherId": "usr_def456",
    "status": "approved",
    "musicXml": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>...",
    "notes": [
      {
        "measure": 1,
        "string": "G",
        "fret": 2,
        "noteName": "A4",
        "frequency": 440.0,
        "midi": 69,
        "duration": "quarter",
        "beats": 1,
        "startBeat": 0,
        "isRest": false,
        "confidence": 0.85,
        "confidenceReason": "MusicXML teknik bilgi"
      },
      {
        "measure": 1,
        "string": "B",
        "fret": 1,
        "noteName": "C5",
        "frequency": 523.25,
        "midi": 72,
        "duration": "quarter",
        "beats": 1,
        "startBeat": 1,
        "isRest": false,
        "confidence": 0.85,
        "confidenceReason": "MusicXML teknik bilgi"
      }
    ],
    "rhythmicText": "Ölçü 1: La dörtlük, Do dörtlük, Mi ikilik...",
    "teacherNotes": "İlk ölçüde tempo biraz yavaş olmalı.",
    "corrections": [
      {
        "measure": 3,
        "string": "G",
        "originalFret": 2,
        "correctedFret": 3,
        "reason": "Öğrenci yanlış perde basmış"
      }
    ],
    "approvedAt": "2026-07-03T15:00:00Z",
    "createdAt": "2026-07-03T14:35:00Z"
  }
}
```

**JSON Şeması (Response):**

```json
{
  "$id": "StudentSessionResponse",
  "type": "object",
  "required": ["success", "session"],
  "properties": {
    "success":  { "type": "boolean", "enum": [true] },
    "session":  { "$ref": "Session" }
  }
}
```

#### HTTP Status Kodları

| Status | Anlamı |
|--------|--------|
| 200 | OK — session döndü |
| 400 | Bad Request — `sessionId` formatı geçersiz |
| 404 | Not Found — session kaydı yok |
| 429 | Too Many Requests |

#### Hata Durumları

| Senaryo | HTTP | Code | Message |
|---------|------|------|---------|
| `sessionId` formatı geçersiz | 400 | `VALIDATION_ERROR` | "sessionId formatı geçersiz." |
| Session kaydı bulunamadı | 404 | `SESSION_NOT_FOUND` | "Belirtilen seans bulunamadı." |
| Rate limit aşıldı | 429 | `RATE_LIMIT_EXCEEDED` | "Rate limit aşıldı." |

---

## 6. Durum Kodları Özeti

| HTTP | Anlamı | Kullanıldığı endpoint'ler |
|------|--------|---------------------------|
| 200 | OK | job, musicxml, midi, student/session |
| 201 | Created | pdf/upload, teacher/approve |
| 202 | Accepted | pdf/analyze |
| 400 | Bad Request | Tümü (validasyon) |
| 404 | Not Found | job, musicxml, midi, teacher/approve, student/session |
| 409 | Conflict | pdf/analyze, musicxml, midi, teacher/approve |
| 413 | Payload Too Large | pdf/upload |
| 415 | Unsupported Media Type | pdf/upload |
| 422 | Unprocessable Entity | teacher/approve (corrections) |
| 429 | Too Many Requests | Tümü (rate limit) |
| 500 | Internal Server Error | Tümü |
| 502 | Bad Gateway | pdf/analyze, midi (OMR/dönüştürme motoru) |
| 504 | Gateway Timeout | pdf/analyze (OMR motoru) |

---

## 7. Veri Akış Diyagramı

### 7.1 Uçtan Uca Ana Akış

```
┌─────────────────────┐
│   SesliTab App      │
│   (iOS/Android/Web) │
└─────────┬───────────┘
          │  1. POST /api/v1/pdf/upload  (multipart/form-data, PDF dosyası)
          ▼
┌─────────────────────┐
│   Cloud API         │
│   (api.seslitab.cloud) │
└─────────┬───────────┘
          │  2. uploadPdf(pdfFile)  →  jobId oluştur, PDF'i depola
          ▼
┌─────────────────────┐
│   OMR Service       │
│   (services/omrService.js)
└─────────┬───────────┘
          │  3. IOmrProvider arayüzü  (providers/index.js)
          ▼
┌─────────────────────┐
│   Audiveris         │
│   (providers/audiverisProvider.js)
│   OMR motoru PDF'i  │
│   görüntü olarak    │
│   işler             │
└─────────┬───────────┘
          │  4. Ham OMR sonucu  →  MusicXML
          ▼
┌─────────────────────┐
│   MusicXML          │
│   (score-partwise)  │
└─────────┬───────────┘
          │  5. parseMusicXml(xml)  (musicXmlParser.js)
          ▼
┌─────────────────────┐
│   Music Engine      │
│   ├─ musicXmlParser │  → NoteObject[]
│   ├─ noteTheory     │  → frekans, MIDI, nota adı
│   └─ rhythmicText   │  → Türkçe ritmik metin
└─────────┬───────────┘
          │  6. JSON Response  (NoteObject[] + rhythmicText)
          ▼
┌─────────────────────┐
│   Cloud API         │
│   JSON envelope     │
│   { success, ... }  │
└─────────┬───────────┘
          │  7. JSON Response
          ▼
┌─────────────────────┐
│   SesliTab App      │
│   (iOS/Android/Web) │
│   ┌─ MusicXML göster │
│   ├─ Nota listesi   │
│   ├─ Ritmik metin   │
│   └─ MIDI oynat     │
└─────────────────────┘
```

### 7.2 Polling Akışı (Job Status)

```
SesliTab App                    Cloud API
     │                              │
     │  POST /api/v1/pdf/upload     │
     ├─────────────────────────────>│  jobId = "job_..."
     │  201 Created                 │
     │<─────────────────────────────┤
     │                              │
     │  POST /api/v1/pdf/analyze    │
     ├─────────────────────────────>│  OMR başlat (asenkron)
     │  202 Accepted                │
     │<─────────────────────────────┤
     │                              │
     │  GET /api/v1/job/{jobId}     │  (2 sn sonra)
     ├─────────────────────────────>│
     │  200 { status: "processing" }│
     │<─────────────────────────────┤
     │                              │
     │  GET /api/v1/job/{jobId}     │  (4 sn sonra)
     ├─────────────────────────────>│
     │  200 { status: "converting" } │
     │<─────────────────────────────┤
     │                              │
     │  GET /api/v1/job/{jobId}     │  (8 sn sonra)
     ├─────────────────────────────>│
     │  200 { status: "completed" }  │
     │<─────────────────────────────┤
     │                              │
     │  GET /api/v1/musicxml/{jobId}│  (paralel)
     │  GET /api/v1/midi/{jobId}    │  (paralel)
     ├─────────────────────────────>│
     │  200 (MusicXML + MIDI)        │
     │<─────────────────────────────┤
```

### 7.3 Öğretmen Onay Akışı

```
Öğretmen                        Cloud API                    Öğrenci
     │                              │                            │
     │  GET /api/v1/musicxml/{jobId}│                            │
     ├─────────────────────────────>│                            │
     │  200 (MusicXML)              │                            │
     │<─────────────────────────────┤                            │
     │                              │                            │
     │  POST /api/v1/teacher/approve│                            │
     │  { jobId, corrections, ... } │                            │
     ├─────────────────────────────>│  Session oluştur           │
     │  201 { sessionId }           │  (sess_...)                │
     │<─────────────────────────────┤                            │
     │                              │                            │
     │                              │  GET /api/v1/student/session/{sessionId}
     │                              │<───────────────────────────┤
     │                              │  200 { session }            │
     │                              │  (notes[], rhythmicText,    │
     │                              │   teacherNotes, corrections)│
     │                              │───────────────────────────>│
     │                              │                            │
     │                              │              Öğrenci çalışmaya başlar
```

### 7.4 Modül Sorumluluk Matrisi

| Akış adımı | Sorumlu modül | Dosya |
|------------|---------------|-------|
| PDF yükleme | Cloud API | (backend henüz yok) |
| OMR provider seçimi | OMR Service | `services/omrService.js` |
| Provider arayüzü | IOmrProvider | `providers/IOmrProvider.js` |
| Audiveris entegrasyonu | Audiveris Provider | `providers/audiverisProvider.js` |
| Mock provider (test) | Mock Provider | `providers/mockOmrProvider.js` |
| MusicXML parsing | MusicXML Parser | `musicXmlParser.js` |
| Nota teorisi | Note Theory | `noteTheory.js` |
| Ritmik metin | Rhythmic Text Generator | `rhythmicTextGenerator.js` |
| MIDI üretimi | (gelecekte) | — |
| Ses oynatma | Audio Engine | `audio.js` |
| UI | Main App | `main.js` |

---

## 8. Çapraz Platform Uyumluluk Notları

### 8.1 iOS (Swift / URLSession)

```swift
// Multipart upload örneği
var request = URLRequest(url: URL(string: "https://api.seslitab.cloud/api/v1/pdf/upload")!)
request.httpMethod = "POST"
let boundary = UUID().uuidString
request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
// Body: file data + boundary
```

- `URLSession.uploadTask` ile multipart upload
- `URLSessionDownloadTask` ile MIDI/MusicXML indirme (background download destekli)
- `application/xml` yanıtı için `String(data:encoding:.utf8)` ile parse

### 8.2 Android (Kotlin / OkHttp)

```kotlin
// Multipart upload örneği
val requestBody = MultipartBody.Builder()
    .setType(MultipartBody.FORM)
    .addFormDataPart("file", "etude.pdf",
        file.asRequestBody("application/pdf".toMediaType()))
    .build()
val request = Request.Builder()
    .url("https://api.seslitab.cloud/api/v1/pdf/upload")
    .post(requestBody)
    .build()
```

- OkHttp `MultipartBody` ile upload
- `ResponseBody.bytes()` ile MIDI binary indirme
- Coroutines + Retrofit için `@Multipart` annotation

### 8.3 Web (fetch API)

```javascript
// Multipart upload örneği
const formData = new FormData()
formData.append('file', pdfFile)
formData.append('provider', 'audiveris')

const res = await fetch('https://api.seslitab.cloud/api/v1/pdf/upload', {
  method: 'POST',
  body: formData,  // Content-Type otomatik set edilir
})
const data = await res.json()
```

- `FormData` ile multipart upload
- `response.blob()` ile MIDI binary indirme
- `response.text()` ile MusicXML parse

### 8.4 Network Senaryoları

| Senaryo | Öneri |
|---------|-------|
| Zayıf ağ (mobile) | Polling aralığı: 2→4→8→16 sn (exponential backoff) |
| Offline | App son session'ı local cache'le (IndexedDB / Core Data / Room) |
| Timeout | İstek timeout: 30 sn (upload), 10 sn (polling) |
| Retry | 429 alındığında `Retry-After` header'ına uy |
| MIDI ilk istek | 409 dönerse 3 sn bekle, tekrar dene (max 3 deneme) |

---

## 9. Gelecek Genişletmeler

| Özellik | Endpoint | Sürüm |
|---------|----------|-------|
| Kimlik doğrulama | Tümü (Bearer JWT) | v1.1 |
| İş iptali | `DELETE /api/v1/job/{jobId}` | v1.1 |
| İş listesi | `GET /api/v1/jobs?page=1&limit=20` | v1.1 |
| Öğrenci geri bildirimi | `POST /api/v1/session/{id}/feedback` | v1.2 |
| Gerçek zamanlı durum | `WS /api/v1/ws/job/{jobId}` | v1.2 |
| Session sonrası düzeltme | `POST /api/v1/teacher/corrections` | v1.2 |
| Toplu yükleme | `POST /api/v1/pdf/upload-batch` | v2.0 |
| OAuth (Google/Apple) | `POST /api/v1/auth/oauth` | v2.0 |
