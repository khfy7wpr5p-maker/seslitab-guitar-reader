# SesliTab Cloud API — API Contract (v1)

**Sürüm:** 1.0.0
**Durum:** Taslak (backend henüz uygulanmadı)
**Base URL:** `https://api.seslitab.cloud/v1`
**Protokol:** HTTPS only
**Kimlik doğrulama:** Bearer JWT (Supabase Auth)

---

## İçindekiler

1. [Genel Kurallar](#genel-kurallar)
2. [Kimlik Doğrulama](#kimlik-doğrulama)
3. [Ortak Veri Modelleri](#ortak-veri-modelleri)
4. [Hata Formatı](#hata-formatı)
5. [Endpoint'ler](#endpointler)
   - [POST /api/upload-pdf](#1-post-apiupload-pdf)
   - [POST /api/analyze-pdf](#2-post-apianalyze-pdf)
   - [GET /api/job-status/{jobId}](#3-get-apijob-statusjobid)
   - [GET /api/download/musicxml/{jobId}](#4-get-apidownloadmusicxmljobid)
   - [GET /api/download/midi/{jobId}](#5-get-apidownloadmidijobid)
   - [POST /api/teacher/approve](#6-post-apiteacherapprove)
   - [GET /api/student/session/{id}](#7-get-apistudentsessionid)
6. [Durum Kodları Özeti](#durum-kodları-özeti)

---

## Genel Kurallar

| Kural | Değer |
|-------|-------|
| Content-Type | `application/json` (dosya yükleme hariç: `multipart/form-data`) |
| Karakter kodlaması | UTF-8 |
| Tarih formatı | ISO 8601 (`2026-07-03T14:30:00Z`) |
| Dosya boyut sınırı | 50 MB |
| Rate limit | 60 istek/dakika (kimlik doğrulı kullanıcı) |
| Rate limit header'ları | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` |

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

## Kimlik Doğrulama

Tüm endpoint'ler (upload-pdf hariç test modunda) geçerli bir JWT gerektirir.

```
Authorization: Bearer <eyJhbGciOi...>
```

JWT, Supabase Auth tarafından verilir. Token'da `sub` (kullanıcı ID'si) ve
`role` (`student` | `teacher` | `admin`) claim'leri bulunur.

---

## Ortak Veri Modelleri

### Job

```json
{
  "jobId": "job_1751534400_a1b2c3",
  "status": "completed",
  "fileName": "etude-no-1.pdf",
  "provider": "audiveris",
  "createdAt": "2026-07-03T14:30:00Z",
  "updatedAt": "2026-07-03T14:31:15Z",
  "completedAt": "2026-07-03T14:31:15Z",
  "error": null
}
```

### NoteObject (parser çıktısı)

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

### Session (öğretmen-onaylı çalışma seansı)

```json
{
  "id": "sess_1751534500_x7y8z9",
  "jobId": "job_1751534400_a1b2c3",
  "studentId": "usr_abc123",
  "teacherId": "usr_def456",
  "status": "approved",
  "musicXml": "<?xml version=\"1.0\"...",
  "notes": [ { "measure": 1, "noteName": "A4", "..." : "..." } ],
  "rhythmicText": "Ölçü 1: La dörtlük, Do dörtlük, Mi ikilik...",
  "approvedAt": "2026-07-03T15:00:00Z",
  "createdAt": "2026-07-03T14:35:00Z"
}
```

---

## Hata Formatı

Tüm hatalar tek tip JSON formatı döner:

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

### Hata kodları

| Code | HTTP | Açıklama |
|------|------|----------|
| `UNAUTHORIZED` | 401 | JWT eksik veya geçersiz |
| `FORBIDDEN` | 403 | Kaynağa erişim yetkisi yok |
| `VALIDATION_ERROR` | 400 | İstek gövdesi/p parametresi geçersiz |
| `FILE_TOO_LARGE` | 413 | Dosya 50 MB sınırını aşıyor |
| `UNSUPPORTED_FILE_TYPE` | 415 | Sadece PDF kabul edilir |
| `JOB_NOT_FOUND` | 404 | İş kimliği geçersiz |
| `SESSION_NOT_FOUND` | 404 | Seans kimliği geçirsiz |
| `JOB_NOT_READY` | 409 | İş henüz tamamlanmadı |
| `ALREADY_APPROVED` | 409 | Seans zaten onaylanmış |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit aşıldı |
| `INTERNAL_ERROR` | 500 | Sunucu içi hata |
| `OMR_PROVIDER_ERROR` | 502 | OMR motoru hatası |
| `OMR_PROVIDER_TIMEOUT` | 504 | OMR motoru zaman aşımı |

---

## Endpoint'ler

---

### 1. POST /api/upload-pdf

PDF dosyasını yükler, yeni bir OMR işi kaydı oluşturur.

**Kimlik:** Gerekli (student, teacher, admin)

**Content-Type:** `multipart/form-data`

#### Request

| Alan | Tip | Zorunlu | Açıklama |
|------|-----|---------|----------|
| `file` | binary | evet | PDF dosyası (max 50 MB) |
| `provider` | string | hayır | OMR motoru: `mock`, `audiveris`. Belirtilmezse config varsayılanı |

```
POST /api/upload-pdf
Authorization: Bearer <token>
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

#### Hata Durumları

| HTTP | Code | Senaryo |
|------|------|---------|
| 400 | `VALIDATION_ERROR` | `file` alanı eksik |
| 401 | `UNAUTHORIZED` | JWT eksik/geçersiz |
| 413 | `FILE_TOO_LARGE` | Dosya > 50 MB |
| 415 | `UNSUPPORTED_FILE_TYPE` | Dosya PDF değil |
| 429 | `RATE_LIMIT_EXCEEDED` | Rate limit aşıldı |
| 500 | `INTERNAL_ERROR` | Sunucu hatası |

---

### 2. POST /api/analyze-pdf

Önceden yüklenmiş bir iş için OMR tanıma işlemini başlatır.

**Kimlik:** Gerekli (iş sahibi veya teacher/admin)

#### Request

```json
{
  "jobId": "job_1751534400_a1b2c3"
}
```

| Alan | Tip | Zorunlu | Açıklama |
|------|-----|---------|----------|
| `jobId` | string | evet | upload-pdf'den dönen iş kimliği |

#### Response — 202 Accepted

```json
{
  "success": true,
  "jobId": "job_1751534400_a1b2c3",
  "status": "processing",
  "message": "OMR analizi başlatıldı. Durum için GET /api/job-status/{jobId} kullanın."
}
```

#### Hata Durumları

| HTTP | Code | Senaryo |
|------|------|---------|
| 400 | `VALIDATION_ERROR` | `jobId` eksik veya geçersiz format |
| 401 | `UNAUTHORIZED` | JWT eksik/geçersiz |
| 403 | `FORBIDDEN` | İş başka bir kullanıcıya ait |
| 404 | `JOB_NOT_FOUND` | İş kimliği kayıtlı değil |
| 409 | `JOB_NOT_READY` | İş zaten `completed` veya `processing` durumunda |
| 429 | `RATE_LIMIT_EXCEEDED` | Rate limit aşıldı |
| 502 | `OMR_PROVIDER_ERROR` | OMR motoru başlatılamadı |
| 504 | `OMR_PROVIDER_TIMEOUT` | OMR motoru zaman aşımı |

---

### 3. GET /api/job-status/{jobId}

Bir OMR işinin mevcut durumunu döndürür. Polling için kullanılır.

**Kimlik:** Gerekli (iş sahibi veya teacher/admin)

#### Request

```
GET /api/job-status/job_1751534400_a1b2c3
Authorization: Bearer <token>
```

| Parametre | Tip | Konum | Zorunlu |
|-----------|-----|-------|---------|
| `jobId` | string | path | evet |

#### Response — 200 OK

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
  "error": null
}
```

**Failed durumunda:**

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
  "error": {
    "code": "OMR_PROVIDER_ERROR",
    "message": "PDF sayfası çözümlenemedi: bozuk görüntü."
  }
}
```

#### Hata Durumları

| HTTP | Code | Senaryo |
|------|------|---------|
| 400 | `VALIDATION_ERROR` | `jobId` formatı geçersiz |
| 401 | `UNAUTHORIZED` | JWT eksik/geçersiz |
| 403 | `FORBIDDEN` | İş başka bir kullanıcıya ait |
| 404 | `JOB_NOT_FOUND` | İş kimliği kayıtlı değil |
| 429 | `RATE_LIMIT_EXCEEDED` | Rate limit aşıldı |

---

### 4. GET /api/download/musicxml/{jobId}

Tamamlanmış bir işin MusicXML çıktısını döndürür.

**Kimlik:** Gerekli (iş sahibi veya teacher/admin)

#### Request

```
GET /api/download/musicxml/job_1751534400_a1b2c3
Authorization: Bearer <token>
Accept: application/xml
```

| Parametre | Tip | Konum | Zorunlu |
|-----------|-----|-------|---------|
| `jobId` | string | path | evet |

#### Response — 200 OK

**Content-Type:** `application/xml`
**Content-Disposition:** `attachment; filename="etude-no-1.musicxml"`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <!-- ... MusicXML içerik ... -->
</score-partwise>
```

**Alternatif — JSON formatı** (Accept: `application/json`):

```json
{
  "success": true,
  "jobId": "job_1751534400_a1b2c3",
  "musicXml": "<?xml version=\"1.0\"...",
  "fileName": "etude-no-1.musicxml"
}
```

#### Hata Durumları

| HTTP | Code | Senaryo |
|------|------|---------|
| 400 | `VALIDATION_ERROR` | `jobId` formatı geçersiz |
| 401 | `UNAUTHORIZED` | JWT eksik/geçersiz |
| 403 | `FORBIDDEN` | İş başka bir kullanıcıya ait |
| 404 | `JOB_NOT_FOUND` | İş kimliği kayıtlı değil |
| 409 | `JOB_NOT_READY` | İş henüz `completed` değil |
| 429 | `RATE_LIMIT_EXCEEDED` | Rate limit aşıldı |

---

### 5. GET /api/download/midi/{jobId}

Tamamlanmış bir işin MIDI çıktısını döndürür. MusicXML'den dönüştürülür.

**Kimlik:** Gerekli (iş sahibi veya teacher/admin)

#### Request

```
GET /api/download/midi/job_1751534400_a1b2c3
Authorization: Bearer <token>
Accept: audio/midi
```

| Parametre | Tip | Konum | Zorunlu |
|-----------|-----|-------|---------|
| `jobId` | string | path | evet |

#### Response — 200 OK

**Content-Type:** `audio/midi`
**Content-Disposition:** `attachment; filename="etude-no-1.mid"`

```
(binary MIDI data)
```

#### Hata Durumları

| HTTP | Code | Senaryo |
|------|------|---------|
| 400 | `VALIDATION_ERROR` | `jobId` formatı geçersiz |
| 401 | `UNAUTHORIZED` | JWT eksik/geçersiz |
| 403 | `FORBIDDEN` | İş başka bir kullanıcıya ait |
| 404 | `JOB_NOT_FOUND` | İş kimliği kayıtlı değil |
| 409 | `JOB_NOT_READY` | İş henüz `completed` değil |
| 409 | `JOB_NOT_READY` | MIDI dönüştürme henüz hazır değil (ilk istekte arka planda başlar) |
| 429 | `RATE_LIMIT_EXCEEDED` | Rate limit aşıldı |
| 502 | `OMR_PROVIDER_ERROR` | MIDI dönüştürme hatası |

---

### 6. POST /api/teacher/approve

Öğretmen, bir OMR işinin sonucunu inceler ve onaylar. Onaylanan iş bir
"session" oluşturur — öğrenci bu session üzerinden çalışabilir.

**Kimlik:** Gerekli (teacher veya admin)

#### Request

```json
{
  "jobId": "job_1751534400_a1b2c3",
  "studentId": "usr_abc123",
  "corrections": {
    "notes": [
      {
        "measure": 3,
        "string": "G",
        "fret": 2,
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
| `studentId` | string | evet | Hangi öğrenciye atanacak |
| `corrections` | object | hayır | Öğretmenin nota düzeltmeleri |
| `corrections.notes` | array | hayır | Düzeltilecek notaların listesi |
| `rhythmicTextOverride` | string | hayır | Ritmik metnin üzerine yazımı |
| `notes` | string | hayır | Öğrenciye genel not |

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

#### Hata Durumları

| HTTP | Code | Senaryo |
|------|------|---------|
| 400 | `VALIDATION_ERROR` | `jobId` veya `studentId` eksik |
| 401 | `UNAUTHORIZED` | JWT eksik/geçersiz |
| 403 | `FORBIDDEN` | Kullanıcı `teacher`/`admin` rolünde değil |
| 404 | `JOB_NOT_FOUND` | İş kimliği kayıtlı değil |
| 409 | `JOB_NOT_READY` | İş henüz `completed` değil |
| 409 | `ALREADY_APPROVED` | Bu iş için zaten session oluşturulmuş |
| 422 | `VALIDATION_ERROR` | `corrections` formatı geçersiz |
| 429 | `RATE_LIMIT_EXCEEDED` | Rate limit aşıldı |

---

### 7. GET /api/student/session/{id}

Öğrenci, kendisine atanan onaylı session'ı getirir. Bu session MusicXML,
nota listesi (NoteObject[]), ritmik metin ve öğretmen notlarını içerir.

**Kimlik:** Gerekli (session sahibi student veya atayan teacher/admin)

#### Request

```
GET /api/student/session/sess_1751534500_x7y8z9
Authorization: Bearer <token>
```

| Parametre | Tip | Konum | Zorunlu |
|-----------|-----|-------|---------|
| `id` | string | path | evet |

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
    "musicXml": "<?xml version=\"1.0\"...",
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

#### Hata Durumları

| HTTP | Code | Senaryo |
|------|------|---------|
| 400 | `VALIDATION_ERROR` | `id` formatı geçersiz |
| 401 | `UNAUTHORIZED` | JWT eksik/geçersiz |
| 403 | `FORBIDDEN` | Session başka bir öğrenciye ait |
| 404 | `SESSION_NOT_FOUND` | Session kimliği kayıtlı değil |
| 429 | `RATE_LIMIT_EXCEEDED` | Rate limit aşıldı |

---

## Durum Kodları Özeti

| HTTP | Anlamı | Kullanıldığı endpoint'ler |
|------|--------|---------------------------|
| 200 | OK | job-status, download/musicxml, download/midi, student/session |
| 201 | Created | upload-pdf, teacher/approve |
| 202 | Accepted | analyze-pdf |
| 400 | Bad Request | Tümü (validasyon) |
| 401 | Unauthorized | Tümü (kimlik doğrulama) |
| 403 | Forbidden | Tümü (yetki) |
| 404 | Not Found | job-status, download/*, teacher/approve, student/session |
| 409 | Conflict | analyze-pdf, download/*, teacher/approve |
| 413 | Payload Too Large | upload-pdf |
| 415 | Unsupported Media Type | upload-pdf |
| 422 | Unprocessable Entity | teacher/approve (corrections) |
| 429 | Too Many Requests | Tümü (rate limit) |
| 500 | Internal Server Error | Tümü |
| 502 | Bad Gateway | analyze-pdf, download/midi (OMR motoru) |
| 504 | Gateway Timeout | analyze-pdf (OMR motoru) |

---

## Akış Diyagramı

```
Öğrenci                          Sunucu                        OMR Motoru
  │                                │                               │
  │  POST /api/upload-pdf          │                               │
  ├───────────────────────────────>│                               │
  │  201 { jobId, status: uploaded }                               │
  │<───────────────────────────────┤                               │
  │                                │                               │
  │  POST /api/analyze-pdf         │                               │
  ├───────────────────────────────>│  analyzePdf(jobId)            │
  │  202 { status: processing }    ├──────────────────────────────>│
  │<───────────────────────────────┤                               │
  │                                │                               │
  │  GET /api/job-status/{jobId}   │                               │
  ├───────────────────────────────>│                               │
  │  200 { status: converting }    │                               │
  │<───────────────────────────────┤                               │
  │                                │                               │
  │  GET /api/job-status/{jobId}   │                               │
  ├───────────────────────────────>│                               │
  │  200 { status: completed }     │                               │
  │<───────────────────────────────┤                               │
  │                                │                               │
  │  GET /api/download/musicxml    │                               │
  ├───────────────────────────────>│                               │
  │  200 (MusicXML)                │                               │
  │<───────────────────────────────┤                               │
  │                                │                               │
  │  GET /api/download/midi        │                               │
  ├───────────────────────────────>│                               │
  │  200 (MIDI binary)             │                               │
  │<───────────────────────────────┤                               │
  │                                │                               │
  Öğretmen                         │                               │
  │  POST /api/teacher/approve     │                               │
  ├───────────────────────────────>│                               │
  │  201 { sessionId }             │                               │
  │<───────────────────────────────┤                               │
  │                                │                               │
  Öğrenci                          │                               │
  │  GET /api/student/session/{id} │                               │
  ├───────────────────────────────>│                               │
  │  200 { session }               │                               │
  │<───────────────────────────────┤                               │
```

---

## Gelecek Genişletmeler (kapsam dışı)

- `DELETE /api/job/{jobId}` — iş iptali
- `GET /api/jobs` — kullanıcının iş listesi (pagination)
- `POST /api/session/{id}/feedback` — öğrenci geri bildirimi
- `WS /api/ws/job-status/{jobId}` — WebSocket ile gerçek zamanlı durum
- `POST /api/teacher/corrections` — session sonrası ek düzeltme
