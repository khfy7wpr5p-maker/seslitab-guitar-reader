> Tarihsel snapshot: Güncel 21 Ekim 2026 incelemesi ve açık uyumsuzluklar [buradadır](student-teacher-ui-compatibility-2026-10-21.md). Bu kayıt kendi tarihindeki kanıtı korur.

# SesliTab Core — Kanıta Dayalı Güncel Proje Durumu (19 Ekim 2026)

> **Belge türü:** Tarihli proje durumu ve dokümantasyon eşitlemesi. Bu belge yazıldığı anda GitHub `main`, Linear ve Notion kaynaklarıyla karşılaştırıldı. Mevcut kod, CI veya üretim servisi bu belge hazırlanırken değiştirilmedi; canlı çalışma ayrıca yeniden test edilmedi. Bu kayıt önceki belgelerin tarihsel kanıtlarını silmez.

## Kaynak ve sürüm

- Repo: https://github.com/khfy7wpr5p-maker/seslitab-guitar-reader
- Doğrulanmış `main` HEAD: `c1139563bb3120a9d4bbc359ba6d72205c8c0942` (2026-10-19 02:13 UTC).
- Değişiklik: PR #368 — legacy Piece eligibility için sınırlı, transaction temelli backfill komutları; bu **otomatik üretim backfill çalıştırıldığı anlamına gelmez**.
- Yakın ilgili merged PR'lar: [#365 — Piece management refetch](https://github.com/khfy7wpr5p-maker/seslitab-guitar-reader/pull/365), [#367 — Piece eligibility ve filtreleme](https://github.com/khfy7wpr5p-maker/seslitab-guitar-reader/pull/367), [#368 — backfill ve CI düzeltmesi](https://github.com/khfy7wpr5p-maker/seslitab-guitar-reader/pull/368), [#362 — TAB export/playback tracking](https://github.com/khfy7wpr5p-maker/seslitab-guitar-reader/pull/362), [#363 — playback instrument selection](https://github.com/khfy7wpr5p-maker/seslitab-guitar-reader/pull/363).
- Öğrenci eş repo: https://github.com/khfy7wpr5p-maker/st-student-app (ayrı tarihli student durum belgesine bakın).

## Linear ile eşleştirilmiş çalışma durumu

- **SES-238 — Done:** Piece eligibility, indeks ve backfill için teknik uygulama/doğrulama kaydı. Linear'daki üretim verisi doğrulaması ve Render etkinleştirme beyanı ilgili kaydın kanıtıdır; bu dokümantasyon işlemiyle canlı servis ayrıca doğrulanmamıştır. https://linear.app/seslitab/issue/SES-238
- **SES-235 — In Progress:** Teacher Secure Delivery Firestore okuma maliyeti ölçüm kaydı. Eski kaynak temelinde PR #365 'açık/draft' ifadesi artık tarihsel bilgidir: PR #365 bugün itibarıyla **merged**. Statik read-operation tahmini, gerçek faturalanan document reads ile aynı kabul edilmemeli. https://linear.app/seslitab/issue/SES-235
- **SES-226 — In Progress / yalnız plan:** Öğretmen `Ödev Gönder | Gitar TAB | Keman` navigasyonu için onaylı tasarım; ilgili issue ayrı uygulama onayı olmadan kod değişikliğine izin vermiyor. https://linear.app/seslitab/issue/SES-226
- **SES-237 — In Progress:** Öğretmen TAB dışa aktarımı ve ST Student turuncu TAB takip hatası için birleşik kapsam. Daha önce merged düzeltmeler, fiziksel cihazda exact-runtime kabul kanıtı değildir. https://linear.app/seslitab/issue/SES-237
- **SES-236 — Backlog:** `Bülbülüm Altın Kafeste` için TAB export düğmesi. https://linear.app/seslitab/issue/SES-236
- **SES-16 — In Progress:** Öğretmen iPhone/Safari/VoiceOver fiziksel kabulü. https://linear.app/seslitab/issue/SES-16

## Kritik sözleşmeler

1. Kaynak MusicXML/OMR ve öğretmen düzeltmesi/onayı birbirinden ayrıdır. Yapısal geçerlilik müzikal doğruluk kanıtı değildir.
2. Renderer, MusicXML, TAB ve ses/ritim semantiği hakkında kaynak otorite değildir. Staff, voice, pitch, rhythm ve exact revision sınırları korunur.
3. Kalite kapısı `REVIEW/BLOCK` durumunu tahminle `PASS` yapmaz; öğretmen onayı ve öğrenci teslimi birbirinden ayrıdır.
4. Mevcut OMR/Audiveris ve Render servisleri izin verilmedikçe değiştirilmez. Yeni Render servisi bu belge işinin kapsamı dışındadır.
5. Her yeni uygulama işi ayrı onay, sınırlandırılmış branch, test/build ve CI kanıtıyla ilerler. Bu dokümantasyon çalışması merge/deploy yetkisi vermez.

## Açık doğrulamalar ve kayıt kayması

- Firestore okuma tasarrufu için billing/usage kanıtı ile kaynak koddan türetilen işlem tahmini ayrı raporlanmalıdır. Context7 ile güncel Firebase JS SDK belgesi doğrulandı: `getDoc()` güncel sunucu verisini sağlamayı dener, uygun koşullarda cache döndürebilir; `getDocFromCache()` yalnız yerel önbelleği okur. Buradan canlı fatura miktarı çıkarılamaz.
- SES-235 kayıt gövdesindeki 18 Ekim öncesi 'PR #365 açık' ibaresi tarihsel baseline olarak korunmalı; bugünkü merged gerçekliği ile karıştırılmamalıdır.
- SesliTab ile Student eşlemesi, score/TAB playback takip ve fiziksel mobil kabul ayrı sonuçlar olarak izlenmelidir.
- Bu turda CI yeniden çalıştırılmadı, üretim URL ve Firebase fatura raporu yeniden ölçülmedi.

## İlgili takip kaynakları

- [Linear SesliTab Core](https://linear.app/seslitab/project/seslitab-core-1fcb79b6639c)
- [Notion SesliTab ana proje](https://app.notion.com/p/3df2be2e56648112bd69ecf4769528a2)
- [Notion Firestore ölçüm tarihi kaydı](https://app.notion.com/p/3fc2be2e56648140aea9c57a2e3bfc55)
- [Notion GTAB closeout](https://app.notion.com/p/3fd2be2e566481eda586d61d48c41b28)

## Belgelerin öncelik sırası

Güncel protected `main` gerçek kodu → exact head CI/build → gerçek browser/cihaz/runtime kanıtı → domain contractları → güncel tarihli durum belgesi → tarihsel plan ve handoff metinleri. Önceki tarihli dokümanlar geçmiş karar ve kanıtlar için korunur.
