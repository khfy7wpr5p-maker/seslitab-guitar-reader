# SesliTab Current Status

## Güncel mimari ve kayıt eşitleme — 26 Ekim 2026

Bu bölüm aşağıdaki tarihsel sürüm ve açık iş anlatımlarından önceliklidir. İnceleme kaynak-main ve görev kayıtları üzerinden yapıldı; bu çalışma yeni üretim dağıtımı veya fiziksel cihaz testi değildir.

- Teacher kaynak baseline: `6c6ae9d652e02d295a65af586a6f91121f1685d7` (PR #376). Kalıcı öğretmen araçları/güvenli MusicXML navigasyonu #375; dosyasız Nota Düzenle ve bağımsız XML oturum izolasyonu #376 ile main'de.
- Student kaynak baseline: `60a17cd9213aa9ae085165ecad77c9987e852dd5` (PR #105). Kaynak Service Worker shell `st-student-shell-v49`; bu değer kurulu cihazın yükseldiğinin kanıtı değildir.
- Çok partili aktarım: Teacher #374 ve Student #103 açık part-enstrüman eşlemesini taşır. Student #102 ayrı keman/piyano seslerini mevcut tek transport üzerinden yönlendirir. Fingerboard yalnız açık hedef keman partisini izler; piyano eşliği parmaklama otoritesi değildir. Legacy tek enstrüman paketleri korunur.
- Student #104 ses kalibrasyonu ve MusicXML dinamik aktarımını içerir. Vendored ses runtime 0.3.0, public contract 0.2.0; manifest sourceRevision `34637d92b8c8a7c56f0e6850449e747e7e4ef711`. pp/p/mp/mf/f/ff ve sayısal dinamik desteği uygulama kapsamındadır; ayrı p/f dinleme kabulü iddia edilmez.
- Student #105 çevrimdışı çalışmanın geri çekilmesini uzlaştırır; müzikal playback davranışı değişikliği değildir. Private paketler IndexedDB, statik shell/runtime Service Worker sınırında kalır.
- SES-248/249/250/251 Done; 250 ve 251 için 26 Ekim kullanıcı PASS/kapatma kaydı vardır. SES-247 ana görevindeki eski “T2/T3/T4 henüz yapılmadı” ifadeleri güncel değildir.
- SES-256 ses dengesi kullanıcı kabulü 25 Ekim PASS. Bu kabul tüm platform/VoiceOver/offline matrisine genişletilmez.
- SES-243/245/246 Done; eski pending GET/404, npm-audit ve Sonar C ifadeleri tarihsel bulgulardır. Yeni bir audit/Sonar çalıştırıldığı iddia edilmez.
- SES-242 genel PWA/cihaz ve ertelenmiş Nota/TAB tel–perde VoiceOver kabulü açık. Eser İste round-trip ve temel VoiceOver gezinmesi önceki kullanıcı PASS kayıtlarıdır.
- Havuz içerik yayınlama tasarımı yeni uygulama tamamlandı diye kaydedilmez. GitHub #187/#191 ve eski açık PR'lar güncel kodla ayrı karşılaştırılmadan kapatılmaz; açık kayıt sayısı güncel hata sayısı değildir.
- Kalıcı uçlar: https://st-student-app.onrender.com ve https://st-student-api.onrender.com/api/secure-delivery/v1. Öğretmen/backend atama ve lifecycle otoritesini; Student salt okunur paket tüketimini; StudentPlaybackPort tek müzikal zaman kaynağını korur.

Takip: [Mimari rapor](https://app.notion.com/p/4002be2e566481b48afbf46d3a9647a2), [SES-37](https://linear.app/seslitab/issue/SES-37), [SES-242](https://linear.app/seslitab/issue/SES-242).

## Önceki tarihli mimari kayıtlar

> **21 Ekim 2026 güncel Teacher/Student mimarisi ve arayüz kapanışı:** [Uyumluluk matrisi, tamamlanan PR'lar, canlı kanıt ve açık hata/kabul](student-teacher-ui-compatibility-2026-10-21.md). [19 Ekim kaydı](project-status-2026-10-19.md) tarihsel kanıt olarak korunmuştur. Aşağıdaki 1 Eylül snapshot'ı bugünkü ürün yokluğu veya sürüm kabulü olarak okunmamalıdır.

Last documentation review: 2026-09-01
STI-01/02 branch base: `4bb5ae76a63935fd6ec7f827e3b7fc7dc4d548ed`
Observed branch metadata at start: `main` protected; required check `test-and-build`.

## Current production result

Stage A–L bounded product roadmap production main üzerinde tamamlanmıştır. Bu ifade yalnız uygulanan bounded capability'leri kapsar; evrensel müzikal doğruluk, kaynak görüntüyle birebirlik veya authenticated öğrenci teslimatı anlamına gelmez.

## S12 mobile-score acceptance baseline

S12 accepted the renderer revision
`5ac49bf5483fe6ab0d4ba0cbd09978054ff8af4f` for the then-current exact mobile note-hit bridge. Pointer, Touch and synthetic click delivery resolve only through:

```text
renderer hit-test → exact ScoreNoteRef → canonical note resolver → S06 selection
```

There is no nearest-note, pitch-label, SVG-proximity or DOM-element fallback.
If identity cannot be proven, selection and editing remain unchanged. The mobile
toolbar projects an already verified S06/S07 selection only; it does not create
musical, revision, quality, approval or routing truth.

This is production code and CI evidence, not a claim that the final JSON 3
physical iPhone/Safari acceptance has been completed. The final real-device gate
remains STI-17.

## STI-01/02 integration baseline

The JSON 3 integration branch repins the exact ST Score Rendering Layer source to
`a8961e0e68a950cbe980162e23c09f23f0ce5d0a`, contract `0.2.0`, OSMD `2.1.2`.
Runtime admission additionally verifies that the built artifact contains the
reviewed `hitTestNoteDetailed` and `renderEpoch` surfaces. Consumption of the
detailed hit result remains STI-04 and is not enabled early by STI-01/02.

The same production build preparation path now admits ST Score Editor Core only
from exact source revision `b9fcad22568c55184aab5d3e345f74f1c8dc311e`.
The browser bundle's upstream manifest, byte size and SHA-256 must match exactly;
network, persistence, server-revision, approval and publication authority must
all remain disabled.

STI-02 freezes the new keypad authority before any keypad UI is wired:

- new keypad mutation authority: ST Score Editor Core only;
- renderer mutation authority: none;
- legacy SesliTab keypad dual-write: forbidden;
- Package 8 remains SesliTab product revision/audit authority;
- Package 3 and Package 8 must match exact `sourceId`, `sourceRevisionId`,
  `revisionId` and `contentFingerprint` before Editor initialization;
- Editor document/revision/parent revision must match the bound SesliTab
  revision exactly;
- Editor Core history navigation is not yet a SesliTab product undo authority.
  Undo reconciliation remains STI-12.

The machine-readable baseline is `docs/sti-01-02-runtime-authority-baseline.json`.

## Verification baseline

The protected CI workflow is `test-and-build`; it runs dependency installation,
the full test suite, production build and browser runtime verification. STI-01/02
must not be merged until its exact PR head passes this workflow and the normal
pre-merge fresh-read gate.

## Stage A–L production matrix

| Stage | Production status | Bounded capability |
|---|---|---|
| A — Teacher UI simplification | PRODUCTION | Teacher task-oriented shell, simplified copy, grouped technical details and accessible controls |
| B — Score runtime stabilization | PRODUCTION | Pinned renderer preparation, lifecycle cleanup, fail-closed retry and narrow-browser handling |
| C — Measure/note selection | PRODUCTION / BOUNDED | Exact canonical measure/note selection with renderer hit-test/highlight bridge |
| D — Quality overlay | PRODUCTION / BOUNDED | Exact-report-backed PASS/REVIEW/BLOCK and finding presentation |
| E — Visual bounded note editor | PRODUCTION / BOUNDED | Teacher intent edits limited to step/alter/octave/durationValue |
| F — Undo/revalidation/rerender | PRODUCTION / BOUNDED | Immutable undo, canonicalization, corrected MusicXML materialization and product-local revalidation |
| G — Product routing | PRODUCTION / BOUNDED | Existing consumer gate mapping to PASS/REVIEW/BLOCK |
| H — Review playback | PRODUCTION / BOUNDED | Explicit non-definitive REVIEW preview or withheld playback |
| I — Guitar TAB/Violin integration | PRODUCTION / BOUNDED | PASS-gated existing Guitar TAB and violin consumer actions |
| J — Discovery presentation | PRODUCTION / BOUNDED | Source-finding presentation, trust notice and safe external source actions |
| K — Compact tuner | PRODUCTION / BOUNDED | Compact accessible UI with explicit local microphone start/stop |
| L — Student/share readiness | PRODUCTION / BOUNDED | Exact-revision Package 12 readiness UI; delivery remains BLOCKED_BY_CONTRACT |

Detailed historical matrix and primary files: `docs/teacher-score-editor-architecture.md`.
Full architecture synchronization for the completed JSON 3 program remains STI-18.

## Package 12 boundary

T1 exact share authorization, T2 exact-revision quality eligibility, T3 bounded corrected pitch/position revalidation and T4 bounded structural/rhythmic revalidation are production contracts. Stage L evaluates the applicable existing contract and returns readiness only.

The following remain separate:

- teacher approval;
- exact revision identity;
- revalidation;
- share eligibility;
- share authorization/readiness;
- actual student delivery.

READY_EXACT_REVISION != DELIVERED_TO_STUDENT.

Stage L always keeps deliveryState=not_implemented and deliveryAllowed=false. It creates no authenticated account, persistent grant, token, URL, payload or network delivery.

## Quality and renderer boundaries

PASS is granted only by an exact consumer gate that explicitly authorizes allowed, definitive and automatic use. REVIEW remains non-definitive; BLOCK cannot proceed to a definitive downstream consumer. Teacher approval is not the same as quality routing.

The renderer is a presentation/interaction layer. It does not own canonical musical meaning, quality decisions, correction, teacher approval or sharing authority. Discovery is source finding, not source or musical verification.

## Research and out-of-scope state

Package 8B remains research-only: no genuine admitted training corpus, executed Audiveris training run or production model replacement is claimed. Authenticated student accounts, persistent student identity, backend/cloud delivery, permanent share authorization, share token/URL, student portal, cloud persistence and server-side authorization require a separate security/application program. They are not unfinished Stage L work.

## Protected infrastructure

Without a separately reviewed change, preserve the production Audiveris provider/runtime/preflight, OMR worker/provider selection, Cloud OMR Gateway, backend OMR path, Docker/Render wiring, framework, dependencies and public API contracts.
