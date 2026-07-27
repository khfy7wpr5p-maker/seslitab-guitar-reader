# SesliTab Cloud OMR Gateway — Sistem Mimarisi

**Sürüm:** 1.0.0
**Durum:** Taslak (gerçek backend, Docker, Audiveris veya sunucu kurulumu yok)
**Amaç:** SesliTab uygulamalarının (iOS, Android, Web) ortak OMR servisine
erişmesi için ölçeklenebilir, çoklu OMR motoru destekli bir gateway mimarisi.

---

## İçindekiler

1. [Mimari Genel Bakış](#1-mimari-genel-bakış)
2. [Sistem Akış Diyagramı](#2-sistem-akış-diyagramı)
3. [Tasarım İlkeleri](#3-tasarım-ilkeleri)
4. [Bileşenler](#4-bileşenler)
   - [4.1 Upload Queue](#41-upload-queue)
   - [4.2 Job Manager](#42-job-manager)
   - [4.3 Worker](#43-worker)
   - [4.4 Provider Adapter](#44-provider-adapter)
   - [4.5 MusicXML Storage](#45-musicxml-storage)
   - [4.6 Status Service](#46-status-service)
   - [4.7 Cleanup Service](#47-cleanup-service)
5. [Job Yaşam Döngüsü](#5-job-yaşam-döngüsü)
6. [Çoklu OMR Motoru Desteği](#6-çoklu-omr-motoru-desteği)
7. [Bileşen Bağımlılık Matrisi](#7-bileşen-bağımlılık-matrisi)
8. [Veri Modelleri](#8-veri-modelleri)
9. [Hata Yönetim Stratejisi](#9-hata-yönetim-stratejisi)
10. [Ölçeklendirme Stratejisi](#10-ölçeklendirme-stratejisi)
11. [Güvenlik Stratejisi](#11-güvenlik-stratejisi)

---

## 1. Mimari Genel Bakış

Cloud OMR Gateway, SesliTab uygulamalarından gelen PDF yükleme isteklerini
kabul eder, OMR motoruna (Audiveris) iletir, MusicXML sonucunu saklar ve
durum sorgulama imkanı sunar. Gateway, REST API ile OMR motoru arasındaki
tampon bölgedir — asenkron iş kuyruğu, worker havuzu ve durum yönetimi
sağlar.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SesliTab Cloud OMR Gateway                    │
│                                                                     │
│  ┌──────────┐   ┌──────────────┐   ┌──────────┐   ┌──────────────┐ │
│  │ REST API │──>│ Upload Queue │──>│ Workers  │──>│ Provider     │ │
│  │ (v1)     │   │              │   │ (pool)   │   │ Adapters     │ │
│  └────┬─────┘   └──────┬───────┘   └────┬─────┘   └──────┬───────┘ │
│       │                │                │                │         │
│       │         ┌──────┴───────┐  ┌─────┴──────┐  ┌──────┴───────┐  │
│       │         │ Job Manager  │  │ MusicXML  │  │ Audiveris    │  │
│       │         │              │  │ Storage   │  │ (container)  │  │
│       │         └──────┬───────┘  └──────────┘  └──────────────┘  │
│       │                │                                         │
│  ┌────┴─────┐   ┌──────┴───────┐                                 │
│  │ Status   │   │ Cleanup      │                                 │
│  │ Service  │   │ Service      │                                 │
│  └──────────┘   └──────────────┘                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Sistem Akış Diyagramı

### 2.1 Ana Akış

```
SesliTab App (iOS/Android/Web)
    │
    │  POST /api/v1/pdf/upload (multipart/form-data, PDF)
    ▼
REST API
    │
    │  jobId oluştur, PDF'i geçici depoya yaz
    ▼
Upload Queue
    │
    │  iş kuyruğa eklenir (FIFO)
    ▼
Job Manager
    │
    │  iş durumu: uploaded → queued
    │  boşta olan worker'a ata
    ▼
Worker (pool'dan bir worker)
    │
    │  iş durumu: queued → processing
    │  Provider Adapter çağır
    ▼
Provider Adapter (Audiveris Adapter)
    │
    │  PDF'i Audiveris container'a gönder
    │  OMR tanıma başlat
    │  sonuç bekle (polling veya webhook)
    ▼
Audiveris (Docker container)
    │
    │  PDF → görüntü işleme → nota tanıma
    │  → MusicXML üret
    ▼
MusicXML (string)
    │
    │  Provider Adapter MusicXML'i alır
    ▼
MusicXML Storage
    │
    │  MusicXML kalıcı depoya yazılır
    │  iş durumu: processing → musicxml_created
    ▼
Job Manager
    │
    │  iş durumu: musicxml_created → completed
    ▼
Status Service
    │
    │  GET /api/v1/job/{jobId} ile durum sorgulanabilir
    │  GET /api/v1/musicxml/{jobId} ile MusicXML indirilebilir
    ▼
JSON Response
    │
    │  { success: true, jobId, status: 'completed', musicXml: '...' }
    ▼
SesliTab App
    │
    │  MusicXML'i al, Music Engine'e gönder
    │  NoteObject[] → Turkish Rhythmic Text → Voice
```

### 2.2 Detaylı Bileşen Etkileşimi

```
                    POST /api/v1/pdf/upload
                           │
                           ▼
              ┌────────────────────────┐
              │     REST API Layer     │
              │  (api.seslitab.cloud)  │
              └───────────┬────────────┘
                          │
                    1. jobId üret
                    2. PDF'i temp storage'a yaz
                    3. Job Manager'a kaydet (status: uploaded)
                    4. Upload Queue'ya ekle
                          │
                          ▼
              ┌────────────────────────┐
              │    Upload Queue        │
              │  (FIFO kuyruk)         │
              │  [job1] [job2] [job3] │
              └───────────┬────────────┘
                          │
                    Job Manager kuyruğu izler
                    Boş worker varsa iş ata
                          │
                          ▼
              ┌────────────────────────┐
              │    Job Manager         │
              │  - iş durumu yönet     │
              │  - worker atama        │
              │  - timeout izleme      │
              │  - retry yönet         │
              └───────────┬────────────┘
                          │
                    status: uploaded → queued
                    worker ataması
                          │
                          ▼
              ┌────────────────────────┐
              │    Worker (pool)       │
              │  Worker-1: [job1]      │
              │  Worker-2: [job2]      │
              │  Worker-3: boşta       │
              │  Worker-4: boşta       │
              └───────────┬────────────┘
                          │
                    status: queued → processing
                    Provider Adapter çağır
                          │
                          ▼
              ┌────────────────────────┐
              │  Provider Adapter      │
              │  (Audiveris Adapter)   │
              │                        │
              │  - PDF gönder          │
              │  - OMR başlat          │
              │  - durum poll          │
              │  - MusicXML al         │
              └───────────┬────────────┘
                          │
                    HTTP/gRPC
                          │
                          ▼
              ┌────────────────────────┐
              │  Audiveris Container   │
              │  (Docker)              │
              │                        │
              │  PDF → image → OMR     │
              │  → MusicXML            │
              └───────────┬────────────┘
                          │
                    MusicXML (string)
                          │
                          ▼
              ┌────────────────────────┐
              │  MusicXML Storage      │
              │  (object storage)      │
              │                        │
              │  /jobs/{jobId}/        │
              │    ├── input.pdf       │
              │    ├── output.xml      │
              │    └── metadata.json    │
              └───────────┬────────────┘
                          │
                    status: processing → musicxml_created
                    → completed
                          │
                          ▼
              ┌────────────────────────┐
              │  Status Service        │
              │                        │
              │  GET /job/{jobId}      │
              │  → { status, progress }│
              │                        │
              │  GET /musicxml/{jobId} │
              │  → MusicXML             │
              └───────────┬────────────┘
                          │
                    JSON Response
                          │
                          ▼
              ┌────────────────────────┐
              │  SesliTab App          │
              │  (iOS/Android/Web)     │
              └────────────────────────┘
```

---

## 3. Tasarım İlkeleri

| İlke | Açıklama |
|------|----------|
| **Asenkron işleme** | PDF yükleme hemen 201 döner; OMR işlemi arka planda yapılır. Durum polling ile takip edilir. |
| **Kuyruk tabanlı decoupling** | REST API, worker'lar ve OMR motoru birbirinden kuyruk ile ayrılır. Bir bileşen yavaşsa diğerleri etkilenmez. |
| **Provider agnostik** | Gateway, OMR motoruna dair bir şey bilmez. Provider Adapter arayüzü sayesinde Audiveris, ScanScore, SmartScore veya başka motorlar takılabilir. |
| **Stateless workers** | Worker'lar durum tutmaz. İş bittiğinde sonuç Job Manager'a yazılır, worker bir sonraki işi alır. |
| **Idempotent operations** | Aynı jobId ile tekrar işlem yapılmaz. Status sorgulama her zaman aynı sonucu döner. |
| **Graceful degradation** | Bir worker çökerse, iş kuyruğa geri döner. Bir provider hatası, tüm sistemi durdurmaz. |
| **Observable** | Her işin durumu, her adımın timestamp'i saklanır. Hatalar loglanır. |
| **Mevcut mimariyle uyum** | `IOmrProvider` arayüzü (`providers/IOmrProvider.js`) korunur. Provider Adapter, bu arayüzü uygular. |

---

## 4. Bileşenler

---

### 4.1 Upload Queue

#### Görevi

REST API'den gelen PDF yükleme isteklerini sıraya sokar. FIFO (First In
First Out) prensibiyle çalışır. İşleri boşta olan worker'lara dağıtır.
Yüksek yük altında geri basınç (backpressure) uygular — kuyruk doluysa
yeni istekleri reddeder.

#### Girdi

```typescript
interface UploadQueueInput {
  jobId: string              // Job Manager tarafından üretilen iş kimliği
  pdfPath: string            // Geçici depolamadaki PDF dosya yolu
  fileName: string           // Orijinal dosya adı
  provider: string           // 'audiveris' | 'mock' | (gelecekte: 'scanscore', vb.)
  priority?: 'normal' | 'high'  // Varsayılan: 'normal'
  uploadedAt: string         // ISO 8601 timestamp
}
```

#### Çıktı

```typescript
interface UploadQueueOutput {
  accepted: boolean          // Kuyruk kabul etti mi?
  queuePosition?: number     // Sıradaki konumu (1 = sıradaki)
  estimatedWaitSeconds?: number  // Tahmini bekleme süresi
  error?: string             // Reddedildiyse sebep
}
```

#### İç yapı

```
Upload Queue (FIFO)
┌────┬────┬────┬────┬────┬────┐
│j01 │j02 │j03 │j04 │j05 │... │
└─┬──┴────┴────┴────┴────┴────┘
  │
  └─> Worker-1 (boşta) → j01 alır
      Worker-2 (boşta) → j02 alır
      Worker-3 (meşgul) → ...
```

| Parametre | Varsayılan | Açıklama |
|-----------|------------|----------|
| `maxQueueSize` | 100 | Kuyrukta max 100 iş |
| `maxWaitSeconds` | 300 | 5 dakika üstü bekleme reddedilir |
| `priorityEnabled` | true | `high` öncelikli işler öne alınır |
| `deadLetterQueue` | true | Başarısız işler DLQ'ya taşınır |

#### Hata durumları

| Senaryo | Davranış |
|---------|----------|
| Kuyruk dolu (maxQueueSize aşıldı) | `accepted: false, error: 'Kuyruk dolu, daha sonra tekrar deneyin.'` |
| Geçersiz jobId | `accepted: false, error: 'Geçersiz iş kimliği.'` |
| PDF dosyası bulunamadı | `accepted: false, error: 'PDF dosyası bulunamadı.'` |
| Bilinmeyen provider | `accepted: false, error: 'Bilinmeyen OMR motoru.'` |
| Worker ataması başarısız | İş kuyrukta kalır, tekrar denenecek |

#### Diğer bileşenlerle ilişkisi

| Bileşen | İlişki |
|---------|--------|
| REST API | API, kuyruğa iş ekler |
| Job Manager | Kuyruk, Job Manager'a iş ataması için sinyal gönderir |
| Worker | Worker'lar kuyruktan iş çeker |
| Cleanup Service | Süresi dolan işler kuyruktan temizlenir |

---

### 4.2 Job Manager

#### Görevi

Tüm OMR işlerinin yaşam döngüsünü yönetir. İş durumu geçişlerini
(uploaded → queued → processing → musicxml_created → completed/failed)
kontrol eder. Worker ataması yapar. Timeout izleme ve retry mantığı
yürütür. İş metadata'sını (dosya adı, provider, timestamp'ler, hata
bilgisi) saklar.

Job Manager, sistemin **tek doğrulu kaynağıdır** (single source of truth) —
bir işin durumu hakkında kesin bilgi sadece burada bulunur.

#### Girdi

```typescript
interface JobManagerInput {
  // İş oluşturma
  action: 'create' | 'assign' | 'update_status' | 'get' | 'expire'

  // create için
  jobId?: string
  fileName?: string
  provider?: string
  pdfPath?: string

  // assign için
  workerId?: string

  // update_status için
  newStatus?: JobStatus
  progress?: number          // 0-100
  error?: JobError
  musicXmlPath?: string      // musicxml_created durumunda

  // get için
  queryJobId?: string
}
```

#### Çıktı

```typescript
interface JobManagerOutput {
  job?: JobRecord            // İş kaydı
  error?: string
}

interface JobRecord {
  jobId: string
  status: JobStatus
  fileName: string
  provider: string
  pdfPath: string
  musicXmlPath: string | null
  progress: number           // 0-100
  workerId: string | null    // Hangi worker işliyor
  retryCount: number         // Kaç kez yeniden denendi
  maxRetries: number         // Maks yeniden deneme (varsayılan: 3)
  timeoutSeconds: number     // İş timeout süresi (varsayılan: 300)
  createdAt: string          // ISO 8601
  updatedAt: string
  queuedAt: string | null
  processingAt: string | null
  completedAt: string | null
  expiredAt: string | null
  error: JobError | null
}

interface JobError {
  code: string               // 'OMR_TIMEOUT', 'OMR_PROVIDER_ERROR', vb.
  message: string
  details?: object
  occurredAt: string
}
```

#### Durum geçişleri

```
uploaded ──> queued ──> processing ──> musicxml_created ──> completed
   │           │           │                  │
   │           │           └──> failed        └──> failed
   │           │
   │           └──> expired (kuyrukta çok uzun süre)
   │
   └──> expired (upload sonrası çok uzun süre, analyze başlamadı)
                              completed ──> expired (TTL doldu)
                              failed ──> expired (TTL doldu)
```

| Geçiş | Tetikleyici | Koşul |
|-------|-------------|-------|
| uploaded → queued | Upload Queue kabul etti | PDF geçerli |
| queued → processing | Worker işi aldı | Worker boşta |
| processing → musicxml_created | Provider MusicXML döndürdü | MusicXML geçerli |
| musicxml_created → completed | MusicXML Storage'a yazıldı | Yazma başarılı |
| processing → failed | Provider hata döndürdü veya timeout | retryCount < maxRetries ise retry |
| * → expired | Cleanup Service TTL doldu | 7 gün geçti |
| queued → expired | Kuyrukta 5 dakikadan fazla | maxWaitSeconds aşıldı |

#### Retry mantığı

```
İş başarısız oldu:
  ├── retryCount < maxRetries (3)?
  │     ├── EVET → status: queued (kuyruğa geri dön)
  │     │         retryCount++
  │     │         backoff: 2^retryCount saniye (2, 4, 8 sn)
  │     └── HAYIR → status: failed (kalıcı hata)
  └── error kaydedilir
```

#### Diğer bileşenlerle ilişkisi

| Bileşen | İlişki |
|---------|--------|
| Upload Queue | Kuyruktan iş alır, worker atar |
| Worker | Worker'a iş atar, worker'dan durum güncellemesi alır |
| Status Service | Status Service, Job Manager'dan durum okur |
| MusicXML Storage | MusicXML yazıldığında Job Manager'a bildirir |
| Cleanup Service | Cleanup Service, Job Manager'dan süresi dolmuş işleri bulur |

#### Hata durumları

| Senaryo | Davranış |
|---------|----------|
| İş bulunamadı | `error: 'İş bulunamadı.'` |
| Geçersiz durum geçişi | `error: 'Geçersiz durum geçişi: {from} → {to}'` |
| Worker ataması başarısız | İş kuyrukta kalır |
| Timeout (300 sn) | İş `failed` durumuna geçer, retry denenir |
| Maks retry aşıldı | İş kalıcı `failed` durumuna geçer |
| Veri tabanı yazma hatası | `error: 'İş kaydı yazılamadı.'` |

---

### 4.3 Worker

#### Görevi

Kuyruktan alınan bir OMR işini işler. PDF'i Provider Adapter'a gönderir,
OMR tanıma işlemini yürütür, sonucu MusicXML Storage'a yazar. Worker'lar
bir havuz (pool) içinde çalışır — aynı anda N iş paralel işlenebilir.

Worker'lar **stateless**'tir: iş bittiğinde tüm durum Job Manager'a
yazılır, worker bir sonraki işi alır. Bir worker çökerse, işi işlediği
Job Manager tarafından tespit edilir ve kuyruğa geri döner.

#### Girdi

```typescript
interface WorkerInput {
  jobId: string              // İşlenecek iş kimliği
  workerId: string          // Bu worker'ın kimliği
  pdfPath: string            // PDF dosya yolu
  provider: string           // Hangi OMR motoru kullanılacak
  timeoutSeconds: number     // İş timeout süresi
}
```

#### Çıktı

```typescript
interface WorkerOutput {
  success: boolean
  jobId: string
  musicXml?: string          // Başarılıysa MusicXML
  error?: WorkerError
  durationMs: number         // İşlem süresi (milisaniye)
}

interface WorkerError {
  code: string               // 'TIMEOUT', 'PROVIDER_ERROR', 'STORAGE_ERROR'
  message: string
  retryable: boolean         // Yeniden denenebilir mi?
}
```

#### İşleme adımları

```
1. Job Manager'dan iş al (status: queued → processing)
2. PDF dosyasını oku (pdfPath)
3. Provider Adapter'ı seç (provider parametresine göre)
4. Provider Adapter.uploadPdf(pdf) → providerJobId
5. Provider Adapter.analyzePdf(providerJobId) → OMR başlat
6. Polling: Provider Adapter.getStatus(providerJobId)
   - Her 5 saniyede bir kontrol
   - Timeout: 300 saniye
7. Status: completed → Provider Adapter.downloadMusicXML(providerJobId)
8. MusicXML'i MusicXML Storage'a yaz
9. Job Manager'a bildir: status → musicxml_created → completed
10. Worker serbest, bir sonraki işi bekle
```

#### Worker havuzu

```
Worker Pool (örnek: 4 worker)
┌──────────┬──────────┬──────────┬──────────┐
│ Worker-1 │ Worker-2 │ Worker-3 │ Worker-4 │
│ [job_01] │ [job_02] │  boşta   │  boşta   │
│ %45      │ %80      │          │          │
└──────────┴──────────┴──────────┴──────────┘

Worker-2 işi bitirince → Job Manager'a bildir → boşta → kuyruktan job_03 al
```

| Parametre | Varsayılan | Açıklama |
|-----------|------------|----------|
| `poolSize` | 4 | Eşzamanlı worker sayısı |
| `pollInterval` | 5 sn | Provider durum kontrol aralığı |
| `jobTimeout` | 300 sn | İş başına maks süre |
| `maxRetries` | 3 | İş başına maks yeniden deneme |

#### Hata durumları

| Senaryo | Davranış |
|---------|----------|
| PDF okuma hatası | `error: 'PDF okunamadı.'`, retryable: true |
| Provider yanıt vermiyor | `error: 'OMR motoru yanıt vermiyor.'`, retryable: true |
| Provider timeout | `error: 'OMR motoru zaman aşımı.'`, retryable: true |
| MusicXML geçersiz | `error: 'Geçersiz MusicXML.'`, retryable: false |
| Storage yazma hatası | `error: 'Depolama hatası.'`, retryable: true |
| Worker crash | Job Manager timeout tespit eder, iş kuyruğa geri döner |

#### Diğer bileşenlerle ilişkisi

| Bileşen | İlişki |
|---------|--------|
| Upload Queue | Kuyruktan iş çeker |
| Job Manager | İş alır, durum günceller |
| Provider Adapter | OMR işlemini Provider'a devreder |
| MusicXML Storage | Sonucu Storage'a yazar |

---

### 4.4 Provider Adapter

#### Görevi

Farklı OMR motorları (Audiveris, ScanScore, SmartScore, vb.) ile iletişimi
soyutlar. Her OMR motoru için bir adapter uygulanır. Tüm adapter'lar
`IOmrProvider` arayüzünü (`providers/IOmrProvider.js`) uygular — böylece
Worker, hangi motorun arkada olduğunu bilmez.

Adapter, OMR motorunun API'sini/CLI'sini çağırır, durum poll eder ve
MusicXML sonucunu döndürür.

#### Arayüz (mevcut `IOmrProvider.js` ile uyumlu)

```typescript
interface IOmrProvider {
  // Stage 1: PDF'i OMR motoruna yükle, iş kaydı oluştur
  uploadPdf(pdfFile: Buffer | string): Promise<OmrResult>

  // Stage 2: OMR tanıma işlemini başlat
  analyzePdf(jobId: string): Promise<OmrResult>

  // Stage 3: İş durumunu sorgula (polling)
  getStatus(jobId: string): Promise<OmrResult>

  // Stage 4: Tamamlanan işin MusicXML'ini indir
  downloadMusicXML(jobId: string): Promise<OmrResult>
}

interface OmrResult {
  success: boolean
  jobId?: string             // OMR motorunun iş kimliği
  status?: string            // 'uploaded' | 'processing' | 'converting' | 'completed' | 'failed'
  musicXml?: string          // MusicXML dokümanı (downloadMusicXML only)
  error?: string             // Hata mesajı
}
```

#### Adapter implementasyonları

| Adapter | OMR Motoru | İletişim | Durum |
|---------|-----------|----------|-------|
| `AudiverisAdapter` | Audiveris (open-source) | HTTP → Docker container | Tasarım |
| `MockAdapter` | Mock (test/demo) | In-memory | Mevcut (`mockOmrProvider.js`) |
| `ScanScoreAdapter` | ScanScore (commercial) | REST API | Gelecek |
| `SmartScoreAdapter` | SmartScore (commercial) | REST API | Gelecek |
| `PlayScoreAdapter` | PlayScore (mobile SDK) | REST API | Gelecek |

#### Audiveris Adapter (örnek akış)

```typescript
// AudiverisAdapter — IOmrProvider uygular
//
// Audiveris Docker container ile çalışır:
//   docker run -v /pdfs:/input -v /output:/output audiveris/audiveris
//
// Adapter, container'ı yönetir veya container'ın HTTP API'sini çağırır.

interface AudiverisAdapterConfig {
  containerEndpoint: string  // 'http://audiveris:8080' (Docker network)
  apiTimeout: number         // 300 sn
  pollInterval: number       // 5 sn
  outputFormat: 'musicxml' | 'mxl'
}
```

**Audiveris Adapter akışı:**

```
1. uploadPdf(pdfFile)
   ├── POST {containerEndpoint}/jobs (multipart, PDF)
   └── Response: { jobId: 'audiveris_123', status: 'uploaded' }

2. analyzePdf(jobId)
   ├── POST {containerEndpoint}/jobs/{jobId}/analyze
   └── Response: { status: 'processing' }

3. getStatus(jobId)
   ├── GET {containerEndpoint}/jobs/{jobId}/status
   ├── Response: { status: 'processing', progress: 45 }
   └── Map: 'processing' → 'processing', 'done' → 'completed'

4. downloadMusicXML(jobId)
   ├── GET {containerEndpoint}/jobs/{jobId}/output
   └── Response: MusicXML string
```

#### Girdi

```typescript
interface ProviderAdapterInput {
  pdfFile: Buffer            // PDF dosya içeriği
  providerJobId?: string     // analyze/getStatus/download için
}
```

#### Çıktı

```typescript
interface ProviderAdapterOutput {
  success: boolean
  jobId?: string             // OMR motorunun iş kimliği
  status?: string            // Ortak durum kelime dağarcığına map'lenmiş
  progress?: number          // 0-100
  musicXml?: string          // MusicXML (downloadMusicXML only)
  error?: string
  rawResponse?: object       // OMR motorunun ham yanıtı (debug için)
}
```

#### Durum map'leme (motor → ortak)

Her adapter, OMR motorunun durum kelimelerini ortak kelime dağarcığına
çevirmelidir:

| OMR Motoru | Motor durumu | Ortak durum |
|-----------|-------------|------------|
| Audiveris | `PENDING` | `uploaded` |
| Audiveris | `RUNNING` | `processing` |
| Audiveris | `EXPORTING` | `converting` |
| Audiveris | `DONE` | `completed` |
| Audiveris | `FAILED` | `failed` |
| ScanScore | `queued` | `uploaded` |
| ScanScore | `processing` | `processing` |
| ScanScore | `finished` | `completed` |
| ScanScore | `error` | `failed` |

#### Hata durumları

| Senaryo | Davranış |
|---------|----------|
| OMR motoru erişilemiyor | `success: false, error: 'OMR motoru erişilemiyor.'` |
| OMR motoru timeout | `success: false, error: 'OMR motoru zaman aşımı.'` |
| Geçersiz PDF (motor reddetti) | `success: false, error: 'OMR motoru PDF'i reddetti: {reason}'` |
| MusicXML üretilemedi | `success: false, error: 'MusicXML üretilemedi.'` |
| Bilinmeyen motor durumu | `status: 'processing'` (varsayılan), uyarı loglanır |
| Motor HTTP 5xx | `success: false, error: 'OMR motoru hatası.'`, retryable |
| Motor HTTP 4xx | `success: false, error: 'Geçersiz istek.'`, retryable: false |

#### Diğer bileşenlerle ilişkisi

| Bileşen | İlişki |
|---------|--------|
| Worker | Worker, Adapter'ı çağırır |
| IOmrProvider | Adapter, bu arayüzü uygular |
| providers/index.js | Factory pattern ile adapter seçimi (mevcut) |
| Audiveris Container | Adapter, container ile HTTP üzerinden iletişim kurar |

---

### 4.5 MusicXML Storage

#### Görevi

OMR sonucu üretilen MusicXML dosyalarını kalıcı olarak saklar. Her iş için
bir klasör oluşturur: orijinal PDF, MusicXML çıktısı ve metadata. Storage,
hem REST API'nin `GET /musicxml/{jobId}` endpoint'i hem de Music Engine'in
erişimi için kullanılır.

Storage, object storage (S3-benzeri) veya yerel dosya sistemi olabilir.
Gateway, storage'ın somut implementasyonunu bilmez — bir arayüz üzerinden
erişir.

#### Girdi

```typescript
interface MusicXmlStorageInput {
  action: 'write' | 'read' | 'delete' | 'exists'

  // write için
  jobId?: string
  musicXml?: string          // MusicXML içeriği
  pdfBuffer?: Buffer         // Orijinal PDF (arşiv için)
  metadata?: JobMetadata

  // read/exists/delete için
  queryJobId?: string
}

interface JobMetadata {
  fileName: string
  provider: string
  fileSize: number           // byte
  musicXmlSize: number       // byte
  pageCount: number          // PDF sayfa sayısı
  noteCount: number          // MusicXML'deki nota sayısı
  createdAt: string
  completedAt: string
}
```

#### Çıktı

```typescript
interface MusicXmlStorageOutput {
  success: boolean
  path?: string              // Storage yolu (örn. /jobs/{jobId}/output.xml)
  musicXml?: string          // MusicXML içeriği (read için)
  metadata?: JobMetadata
  exists?: boolean           // exists için
  error?: string
}
```

#### Storage yapısı

```
/jobs/
  ├── job_1751534400_a1b2c3/
  │     ├── input.pdf            # Orijinal PDF
  │     ├── output.musicxml      # MusicXML çıktısı
  │     ├── output.mid           # MIDI çıktısı (gelecekte)
  │     └── metadata.json        # İş metadata'sı
  │
  ├── job_1751534500_d4e5f6/
  │     ├── input.pdf
  │     ├── output.musicxml
  │     └── metadata.json
  │
  └── ...
```

#### metadata.json örneği

```json
{
  "jobId": "job_1751534400_a1b2c3",
  "fileName": "etude-no-1.pdf",
  "provider": "audiveris",
  "fileSize": 1048576,
  "musicXmlSize": 24576,
  "pageCount": 3,
  "noteCount": 127,
  "createdAt": "2026-07-03T14:30:00Z",
  "completedAt": "2026-07-03T14:31:15Z",
  "ttlDays": 7,
  "expiresAt": "2026-07-10T14:31:15Z"
}
```

#### Storage arayüzü

```typescript
interface IMusicXmlStorage {
  write(jobId: string, musicXml: string, metadata: JobMetadata): Promise<StorageResult>
  read(jobId: string): Promise<string | null>
  readMetadata(jobId: string): Promise<JobMetadata | null>
  exists(jobId: string): Promise<boolean>
  delete(jobId: string): Promise<boolean>
  listExpired(): Promise<string[]>  // Süresi dolmuş jobId'ler
}
```

| Implementasyon | Kullanım | Durum |
|----------------|----------|-------|
| `LocalStorage` | Geliştirme, tek sunucu | Tasarım |
| `S3Storage` | Üretim, AWS S3 | Gelecek |
| `SupabaseStorage` | Üretim, Supabase Storage | Gelecek |

#### Hata durumları

| Senaryo | Davranış |
|---------|----------|
| Yazma hatası (disk dolu) | `success: false, error: 'Depolama dolu.'` |
| Okuma hatası (dosya yok) | `success: false, error: 'Dosya bulunamadı.'` |
| MusicXML çok büyük (>10 MB) | `success: false, error: 'MusicXML çok büyük.'` |
| Silme hatası | `success: false, error: 'Silme başarısız.'` |
| İzin hatası | `success: false, error: 'Depolama izin hatası.'` |

#### Diğer bileşenlerle ilişkisi

| Bileşen | İlişki |
|---------|--------|
| Worker | Worker, MusicXML'i Storage'a yazar |
| Status Service | Status Service, MusicXML'i Storage'dan okur |
| Job Manager | Job Manager, yazma başarılı olunca durumu günceller |
| Cleanup Service | Cleanup Service, süresi dolmuş dosyaları siler |

---

### 4.6 Status Service

#### Görevi

REST API'nin durum sorgulama endpoint'lerine (`GET /job/{jobId}`,
`GET /musicxml/{jobId}`) hizmet eder. Job Manager'dan iş durumunu okur,
MusicXML Storage'dan MusicXML içeriğini getirir. Polling isteklerini
karşılar — bu, sistemin en çok çağrılan bileşenidir.

Status Service **read-only**'dir — hiçbir veri yazmaz, sadece okur. Bu
sayede yüksek yük altında bile Job Manager'a yük bindirmez.

#### Girdi

```typescript
interface StatusServiceInput {
  action: 'get_status' | 'get_musicxml' | 'get_midi'

  jobId: string

  // get_musicxml için
  format?: 'xml' | 'json'    // Çıktı formatı
}
```

#### Çıktı

```typescript
interface StatusServiceOutput {
  success: boolean
  job?: JobRecord            // get_status için
  musicXml?: string          // get_musicxml için
  midi?: Buffer              // get_midi için
  error?: string
  cacheHit?: boolean         // Cache'den geldi mi?
}
```

#### Cache stratejisi

Status Service, sık sorgulanan iş durumlarını cache'ler:

| Veri | Cache süresi | Cache anahtarı |
|------|-------------|----------------|
| İş durumu (processing) | 5 saniye | `status:{jobId}` |
| İş durumu (completed) | 60 saniye | `status:{jobId}` |
| MusicXML | 5 dakika | `musicxml:{jobId}` |
| Metadata | 60 saniye | `metadata:{jobId}` |

```
GET /job/{jobId}
    │
    ├── Cache kontrol
    │     ├── HIT → Cache'den dön (hızlı)
    │     └── MISS → Job Manager'dan oku → Cache'e yaz
    │
    ▼
Response
```

#### Polling önerileri (client'a)

| İş durumu | Önerilen polling aralığı |
|-----------|--------------------------|
| `uploaded` | 2 saniye |
| `queued` | 3 saniye |
| `processing` | 5 saniye |
| `converting` | 3 saniye |
| `completed` | Dur (polling gerekmez) |
| `failed` | Dur |
| `expired` | Dur |

#### Hata durumları

| Senaryo | Davranış |
|---------|----------|
| İş bulunamadı | `success: false, error: 'İş bulunamadı.'` (404) |
| MusicXML henüz hazır değil | `success: false, error: 'MusicXML henüz hazır değil.'` (409) |
| İş expired | `success: false, error: 'İş süresi dolmuş.'` (410) |
| Cache hatası | Job Manager'dan direkt oku (fallback) |

#### Diğer bileşenlerle ilişkisi

| Bileşen | İlişki |
|---------|--------|
| REST API | API, Status Service'i çağırır |
| Job Manager | Job Manager'dan durum okur |
| MusicXML Storage | Storage'dan MusicXML okur |
| Cleanup Service | Cleanup sonrası cache invalidate |

---

### 4.7 Cleanup Service

#### Görevi

Süresi dolmuş işleri ve geçici dosyaları temizler. Her işin bir TTL (Time
To Live) süresi vardır — varsayılan 7 gün. TTL dolduğunda iş durumu
`expired`'a geçer ve ilgili dosyalar silinir. Ayrıca orphaned dosyaları
(job kaydı olmayan dosyalar) tespit eder ve temizler.

Cleanup Service periyodik olarak çalışır — her 1 saatte bir tarar.

#### Girdi

```typescript
interface CleanupServiceInput {
  action: 'run' | 'cleanup_job' | 'cleanup_orphans'

  // cleanup_job için
  jobId?: string

  // run için (otomatik tarama)
  batchSize?: number          // Bir seferde max iş (varsayılan: 50)
  olderThanDays?: number     // Kaç günden eski (varsayılan: 7)
}
```

#### Çıktı

```typescript
interface CleanupServiceOutput {
  success: boolean
  cleanedJobs?: string[]      // Temizlenen jobId'ler
  deletedFiles?: number       // Silinen dosya sayısı
  freedBytes?: number         // Boşaltılan alan (byte)
  orphanedFiles?: number      // Orphaned dosya sayısı
  error?: string
}
```

#### Cleanup kuralları

| Kural | Koşul | Aksiyon |
|-------|------|---------|
| TTL dolmuş | `completedAt + 7 gün < now` | status → expired, dosyaları sil |
| Failed iş TTL | `failedAt + 3 gün < now` | status → expired, dosyaları sil |
| Queued timeout | `queuedAt + 5 dakika < now` | status → failed (timeout) |
| Processing timeout | `processingAt + 300 sn < now` | status → failed (timeout), retry |
| Orphaned dosya | Job kaydı yok | Dosyayı sil |
| Orphaned job | PDF dosyası yok | Job kaydını sil |

#### Cleanup akışı

```
Her 1 saatte bir:
    │
    ├── 1. Job Manager'dan süresi dolmuş işleri listele
    │     (completedAt + 7 gün < now)
    │
    ├── 2. Her iş için:
    │     ├── Job Manager: status → expired
    │     ├── MusicXML Storage: dosyaları sil
    │     └── Status Service: cache invalidate
    │
    ├── 3. Orphaned dosya tarama:
    │     ├── Storage'daki tüm klasörleri listele
    │     ├── Job Manager'da karşılığı yoksa sil
    │     └── Ters: Job kaydı var, dosya yok → job kaydını sil
    │
    └── 4. Rapor üret:
          cleanedJobs: [...]
          deletedFiles: N
          freedBytes: M
```

#### Hata durumları

| Senaryo | Davranış |
|---------|----------|
| Job Manager erişilemiyor | Bu döngü atlanır, sonraki döngüde tekrar dene |
| Storage silme hatası | Dosya atlanır, loglanır, sonraki döngüde tekrar dene |
| Orphaned dosya silme hatası | Atlanır, loglanır |
| Batch çok büyük | Batch'i küçült, parça parça işle |

#### Diğer bileşenlerle ilişkisi

| Bileşen | İlişki |
|---------|--------|
| Job Manager | Süresi dolmuş işleri listeler, durum günceller |
| MusicXML Storage | Dosyaları siler |
| Status Service | Cache invalidate eder |

---

## 5. Job Yaşam Döngüsü

### 5.1 Durum Diyagramı

```
                    ┌──────────┐
                    │ uploaded │
                    └────┬─────┘
                         │
                    Upload Queue kabul
                         │
                         ▼
                    ┌──────────┐
        ┌──────────>│  queued  │<──────────┐
        │           └────┬─────┘           │
        │                │                 │
        │           Worker işi aldı        │
        │                │                 │
        │                ▼                 │
        │           ┌───────────┐          │
        │           │processing │          │
        │           └─────┬─────┘          │
        │                 │                │
        │          Provider MusicXML       │
        │          üretti                  │
        │                 │                │
        │                 ▼                │
        │    ┌─────────────────────┐       │
        │    │ musicxml_created    │       │
        │    └──────────┬──────────┘       │
        │               │                  │
        │        Storage'a yazıldı          │
        │               │                  │
        │               ▼                  │
        │           ┌──────────┐           │
        │           │completed │           │
        │           └────┬─────┘           │
        │                │                 │
        │         TTL doldu (7 gün)        │
        │                │                 │
        │                ▼                 │
        │           ┌──────────┐           │
        │           │ expired  │           │
        │           └──────────┘           │
        │                                  │
        │    Hata / Timeout                │
        └──────── (retry < maxRetries) ────┘
                         │
                   retry >= maxRetries
                         │
                         ▼
                    ┌──────────┐
                    │  failed   │
                    └────┬─────┘
                         │
                    TTL doldu (3 gün)
                         │
                         ▼
                    ┌──────────┐
                    │ expired  │
                    └──────────┘
```

### 5.2 Durum Açıklamaları

| Status | Açıklama | Sonraki durum |
|--------|----------|---------------|
| `uploaded` | PDF alındı, iş kaydı oluşturuldu. Henüz kuyrukta değil. | `queued` |
| `queued` | İş kuyrukta, worker atanmayı bekliyor. | `processing` |
| `processing` | Worker işi aldı, OMR motoru PDF'i işliyor. | `musicxml_created` veya `failed` |
| `musicxml_created` | OMR motoru MusicXML üretti, Storage'a yazılıyor. | `completed` veya `failed` |
| `completed` | MusicXML Storage'a yazıldı, iş hazır. İndirilebilir. | `expired` (TTL) |
| `failed` | İş başarısız. `error` alanında sebep. Retry tükendi. | `expired` (TTL) |
| `expired` | İş süresi doldu, dosyalar silindi. Sadece metadata kaldı. | (terminal) |

### 5.3 Durum Geçiş Tablosu

| Mevcut durum | Hedef durum | Tetikleyici | Bileşen |
|-------------|-------------|-------------|---------|
| (yok) | `uploaded` | POST /pdf/upload | REST API |
| `uploaded` | `queued` | Upload Queue kabul | Upload Queue |
| `queued` | `processing` | Worker işi aldı | Worker |
| `processing` | `musicxml_created` | Provider MusicXML döndürdü | Worker |
| `musicxml_created` | `completed` | Storage'a yazıldı | Worker |
| `processing` | `failed` | Provider hatası / timeout | Worker |
| `musicxml_created` | `failed` | Storage yazma hatası | Worker |
| `queued` | `failed` | Kuyruk timeout (5 dk) | Job Manager |
| `failed` | `queued` | Retry (retryCount < maxRetries) | Job Manager |
| `completed` | `expired` | TTL doldu (7 gün) | Cleanup Service |
| `failed` | `expired` | TTL doldu (3 gün) | Cleanup Service |
| `queued` | `expired` | Kuyrukta çok uzun süre | Cleanup Service |

### 5.4 Zaman Çizelgesi Örneği

```
t=0s     POST /pdf/upload → 201 Created, jobId, status: uploaded
t=0.1s   Upload Queue → status: queued
t=0.5s   Worker işi aldı → status: processing, progress: 0
t=5s     Provider poll → status: processing, progress: 20
t=10s    Provider poll → status: processing, progress: 45
t=15s    Provider poll → status: processing, progress: 70
t=20s    Provider poll → status: converting, progress: 85
t=25s    Provider poll → status: completed → MusicXML indir
t=25.5s  MusicXML Storage'a yaz → status: musicxml_created
t=26s    Job Manager → status: completed
t=26s+   GET /job/{jobId} → { status: completed }
t=26s+   GET /musicxml/{jobId} → MusicXML
...
t=7 gün  Cleanup Service → status: expired, dosyalar silinir
```

---

## 6. Çoklu OMR Motoru Desteği

### 6.1 Provider Registry (mevcut `providers/index.js` ile uyumlu)

Gateway, birden fazla OMR motorunu aynı anda destekler. Her iş, `provider`
parametresi ile hangi motorun kullanılacağını belirtir. Provider Registry,
motorları isme göre seçer.

```typescript
// Mevcut providers/index.js yapısının genişletilmiş hali
const registry = {
  mock: mockAdapter,           // Test/demo
  audiveris: audiverisAdapter, // Open-source (Docker)
  // scanscore: scanScoreAdapter,   // Commercial (REST API)
  // smartscore: smartScoreAdapter, // Commercial (REST API)
  // playscore: playScoreAdapter,   // Mobile SDK
}
```

### 6.2 Provider Seçim Stratejisi

| Strateji | Açıklama |
|----------|----------|
| **Manuel** | Client, `provider` parametresi ile motor seçer (varsayılan) |
| **Otomatik** | Gateway, motor uygunluğuna göre seçer (gelecek) |
| **Fallback** | Birincil motor hata verirse, yedek motora geçer (gelecek) |
| **A/B** | İşlerin bir kısmını farklı motorlara dağıtır (gelecek) |

### 6.3 Yeni OMR Motoru Ekleme

Yeni bir OMR motoru eklemek için:

1. `IOmrProvider` arayüzünü uygulayan yeni bir adapter yaz
   (`providers/{motorName}Provider.js`)
2. Provider Registry'ye ekle (`providers/index.js`)
3. Durum map'lemesi tanımla (motor durumu → ortak durum)
4. Config ekle (endpoint, timeout, pollInterval)
5. Test et (mock PDF ile)

```
Yeni adapter ekleme adımları:
┌─────────────────────────────────────────────┐
│ 1. {MotorName}Adapter.js yaz                │
│    - uploadPdf(), analyzePdf(),              │
│      getStatus(), downloadMusicXML()        │
│    - IOmrProvider arayüzünü uygula           │
│    - assertProvider() ile doğrula           │
├─────────────────────────────────────────────┤
│ 2. providers/index.js'e ekle                │
│    registry.{motorName} = {motorName}Adapter│
├─────────────────────────────────────────────┤
│ 3. Durum map'lemesi                         │
│    {motorStatus} → {commonStatus}           │
├─────────────────────────────────────────────┤
│ 4. Config                                   │
│    OMR_{MOTOR}_ENDPOINT=...                 │
│    OMR_{MOTOR}_TIMEOUT=...                  │
├─────────────────────────────────────────────┤
│ 5. Test                                     │
│    OMR_PROVIDER={motorName} ile test et     │
└─────────────────────────────────────────────┘
```

### 6.4 Motor Karşılaştırma

| Motor | Tip | Lisans | Hız | Doğruluk | Docker | Maliyet |
|-------|-----|--------|-----|----------|--------|---------|
| Audiveris | Open-source | AGPL | Orta | %70-85 | Evet | Ücretsiz |
| Mock | Test | — | Anında | N/A | Hayır | — |
| ScanScore | Commercial | Paid | Hızlı | %85-90 | Hayır | ~$0.10/sayfa |
| SmartScore | Commercial | Paid | Orta | %85-92 | Hayır | ~$0.15/sayfa |
| PlayScore | Commercial | Paid | Hızlı | %80-88 | Hayır | SDK lisans |

---

## 7. Bileşen Bağımlılık Matrisi

| Bileşen ↓ \ Bağımlı → | Queue | JobMgr | Worker | Adapter | Storage | Status | Cleanup |
|-----------------------|-------|--------|--------|---------|---------|--------|---------|
| Upload Queue | — | ✓ | | | | | |
| Job Manager | ✓ | — | ✓ | | ✓ | | ✓ |
| Worker | ✓ | ✓ | — | ✓ | ✓ | | |
| Provider Adapter | | | ✓ | — | | | |
| MusicXML Storage | | ✓ | ✓ | | — | ✓ | ✓ |
| Status Service | | ✓ | | | ✓ | — | |
| Cleanup Service | | ✓ | | | ✓ | ✓ | — |

**✓** = bileşen, diğer bileşeni kullanır.

### Veri akış yönü

```
REST API → Upload Queue → Job Manager → Worker → Provider Adapter → OMR Motor
                                    ↕                    ↓
                              MusicXML Storage ←──────────┘
                                    ↕
                              Status Service ←── REST API
                                    ↕
                              Cleanup Service (periyodik)
```

---

## 8. Veri Modelleri

### 8.1 JobRecord

```typescript
interface JobRecord {
  // --- Kimlik ---
  jobId: string               // job_{unixTimestamp}_{random6}
  fileName: string            // Orijinal dosya adı
  provider: string            // 'audiveris' | 'mock' | ...

  // --- Durum ---
  status: JobStatus           // uploaded | queued | processing | musicxml_created | completed | failed | expired
  progress: number            // 0-100
  workerId: string | null     // Hangi worker işliyor

  // --- Dosya yolları ---
  pdfPath: string             // Geçici PDF yolu
  musicXmlPath: string | null // Storage'daki MusicXML yolu

  // --- Retry ---
  retryCount: number          // Kaç kez yeniden denendi
  maxRetries: number          // Maks yeniden deneme (3)
  timeoutSeconds: number      // İş timeout (300)

  // --- Timestamp'ler ---
  createdAt: string           // ISO 8601
  updatedAt: string
  queuedAt: string | null
  processingAt: string | null
  musicxmlCreatedAt: string | null
  completedAt: string | null
  expiredAt: string | null

  // --- Hata ---
  error: JobError | null
}

type JobStatus = 'uploaded' | 'queued' | 'processing' | 'musicxml_created' | 'completed' | 'failed' | 'expired'

interface JobError {
  code: string                 // 'OMR_TIMEOUT' | 'OMR_PROVIDER_ERROR' | 'STORAGE_ERROR' | ...
  message: string
  details?: object
  occurredAt: string
}
```

### 8.2 QueueEntry

```typescript
interface QueueEntry {
  jobId: string
  priority: 'normal' | 'high'
  enqueuedAt: string
  provider: string
  pdfPath: string
  fileName: string
}
```

### 8.3 WorkerInfo

```typescript
interface WorkerInfo {
  workerId: string             // 'worker-1', 'worker-2', ...
  status: 'idle' | 'busy' | 'crashed'
  currentJobId: string | null
  jobsCompleted: number
  jobsFailed: number
  startedAt: string
  lastHeartbeat: string
}
```

---

## 9. Hata Yönetim Stratejisi

### 9.1 Hata Sınıflandırma

| Sınıf | Örnek | Etki | Kurtarma |
|-------|-------|------|----------|
| **Transient** | OMR motoru geçici yanıt vermiyor, ağ hatası | İş retry edilir | Otomatik retry (max 3) |
| **Permanent** | Geçersiz PDF, bozuk MusicXML | İş failed olur | Manuel düzeltme |
| **System** | Storage dolu, veri tabanı erişilemiyor | Sistem durabilir | Operatör müdahalesi |
| **Timeout** | OMR motoru 300 sn içinde yanıt vermedi | İş failed olur | Retry, sonra permanent |

### 9.2 Hata Kodları

| Code | Bileşen | Severity | Retryable |
|------|--------|----------|-----------|
| `QUEUE_FULL` | Upload Queue | warning | Evet (daha sonra) |
| `QUEUE_TIMEOUT` | Upload Queue | error | Evet |
| `JOB_NOT_FOUND` | Job Manager | error | Hayır |
| `INVALID_TRANSITION` | Job Manager | error | Hayır |
| `WORKER_TIMEOUT` | Worker | error | Evet |
| `WORKER_CRASH` | Worker | error | Evet |
| `PROVIDER_UNREACHABLE` | Provider Adapter | error | Evet |
| `PROVIDER_TIMEOUT` | Provider Adapter | error | Evet |
| `PROVIDER_REJECTED_PDF` | Provider Adapter | error | Hayır |
| `INVALID_MUSICXML` | Provider Adapter | error | Hayır |
| `STORAGE_WRITE_ERROR` | MusicXML Storage | error | Evet |
| `STORAGE_READ_ERROR` | MusicXML Storage | error | Evet |
| `STORAGE_FULL` | MusicXML Storage | system | Hayır |
| `CACHE_ERROR` | Status Service | warning | N/A (fallback) |
| `CLEANUP_ERROR` | Cleanup Service | warning | Evet (sonraki döngü) |

### 9.3 Hata Yayılımı

```
Provider Adapter hatası
    │
    ├── retryable?
    │     ├── EVET → Worker'a hata bildir → Job Manager retry
    │     │         retryCount < maxRetries?
    │     │         ├── EVET → status: queued (kuyruğa geri dön)
    │     │         └── HAYIR → status: failed (kalıcı)
    │     │
    │     └── HAYIR → status: failed (kalıcı, retry yok)
    │
    └── error kaydedilir (JobRecord.error)
```

---

## 10. Ölçeklendirme Stratejisi

### 10.1 Dikey Ölçeklendirme

| Parametre | Min | Tipik | Max |
|-----------|-----|-------|-----|
| Worker pool size | 1 | 4 | 16 |
| Queue size | 10 | 100 | 1000 |
| Job timeout | 120 sn | 300 sn | 600 sn |
| Poll interval | 2 sn | 5 sn | 10 sn |

### 10.2 Yatay Ölçeklendirme

```
                    ┌─────────────────────┐
                    │   Load Balancer     │
                    └─────────┬───────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
     │ Gateway Node1│ │ Gateway Node2│ │ Gateway Node3│
     │ (REST API +  │ │ (REST API +  │ │ (REST API +  │
     │  Queue +     │ │  Queue +     │ │  Queue +     │
     │  Workers)    │ │  Workers)    │ │  Workers)    │
     └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
            │                │                │
            └────────────────┼────────────────┘
                             │
                    ┌────────┴────────┐
                    │ Shared Storage  │
                    │ (S3 / Supabase) │
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │  OMR Motoru     │
                    │  (Audiveris)    │
                    │  (container)    │
                    └─────────────────┘
```

| Bileşen | Ölçeklendirme | Not |
|---------|---------------|-----|
| REST API | Yatay (stateless) | Her node bağımsız |
| Upload Queue | Merkezi (Redis) | Tüm node'lar ortak kuyruk |
| Job Manager | Merkezi (DB) | Tüm node'lar ortak veri tabanı |
| Workers | Yatay | Her node'da N worker |
| MusicXML Storage | Merkezi (S3) | Tüm node'lar ortak storage |
| Status Service | Yatay (stateless + cache) | Her node kendi cache |

### 10.3 Performans Hedefleri

| Metrik | Hedef |
|--------|-------|
| Upload latency | < 500 ms (201 response) |
| Status query latency | < 100 ms (cache hit), < 300 ms (cache miss) |
| MusicXML download latency | < 200 ms |
| OMR işlem süresi (3 sayfa PDF) | < 60 saniye |
| Throughput | 10 iş/dakika (4 worker) |
| Queue bekleme süresi | < 30 saniye (normal yük) |

---

## 11. Güvenlik Stratejisi

### 11.1 v1.0 (Taslak)

| Önlem | Durum |
|-------|-------|
| HTTPS only | Zorunlu |
| Rate limiting | 60 istek/dakika |
| Dosya boyut sınırı | 50 MB |
| Dosya tipi kontrolü | Sadece PDF |
| Input validation | jobId, fileName validasyonu |

### 11.2 v1.1+ (Gelecek)

| Önlem | Açıklama |
|-------|----------|
| Bearer JWT | Supabase Auth |
| Kullanıcı bazlı rate limit | Kimlik doğrulı kullanıcı başına |
| İş sahipliği | Kullanıcı sadece kendi işlerini görebilir |
| PDF virus tarama | Yükleme sonrası tarama |
| Storage encryption | Rest'te şifreleme |
| Audit log | Tüm işlemler loglanır |

---

## 12. Özet

Cloud OMR Gateway, 7 bileşenden oluşan asenkron bir OMR işleme sistemidir:

1. **Upload Queue** — PDF yükleme isteklerini sıraya sokar (FIFO)
2. **Job Manager** — İş yaşam döngüsünü ve durum geçişlerini yönetir
3. **Worker** — Kuyruktan iş çeker, OMR motoruna iletir (pool)
4. **Provider Adapter** — OMR motoru ile iletişimi soyutlar (IOmrProvider)
5. **MusicXML Storage** — MusicXML çıktılarını kalıcı saklar
6. **Status Service** — Durum sorgulama ve MusicXML indirme (read-only)
7. **Cleanup Service** — Süresi dolmuş işleri ve dosyaları temizler

**Job yaşam döngüsü:** `uploaded → queued → processing → musicxml_created →
completed → expired` (hata durumunda `failed → expired`)

**Çoklu motor desteği:** `IOmrProvider` arayüzü sayesinde Audiveris,
ScanScore, SmartScore ve diğer motorlar takılabilir. Mevcut
`providers/index.js` factory pattern'i korunur.

Hiçbir gerçek backend kodu, Docker kurulumu, Audiveris kurulumu veya sunucu
kurulumu bu dokümanda yapılmamıştır — sadece sistem mimarisi tasarlanmıştır.
