# SesliTab ↔ Smoosic mobil entegrasyon production gerçeği

Tarih: 6 Eylül 2026

## Referans baseline

- Repository: `khfy7wpr5p-maker/seslitab-guitar-reader`
- Protected/default branch: `main`
- Fresh-read main HEAD: `0c522268860da1f97546bff3fb71331fbc3a3ecc`
- Son doğrulanmış main CI: GitHub Actions `CI` run `626`, sonuç `success`
- Render frontend service: `seslitab-app`
- Render branch: `main`
- Render auto-deploy: açık
- Aynı SHA için 6 Eylül 2026 06:25 UTC deploy kaydı `live` olmuştu. Fresh-read sırasında aynı SHA için service-resume kaynaklı yeni build ayrıca başlatılmıştı; bu yeni deploy tamamlanmadan yeni LIVE iddiası yapılmamalıdır.
- OMR service bu çalışma kapsamında salt-okunur sınırdır ve değiştirilmez.

## Açık PR gerçekliği

Fresh-read sırasında açık PR'lar: `#198`, `#192`, `#183`. Bunların hiçbiri bu P0/P1 mobil hardening branch'i değildir. Branch/protection endpoint'i bağlı GitHub App yetkisi nedeniyle okunamadı; main'e doğrudan yazma yine bu programda yasaktır.

## Production mimari sınırı

SesliTab host uygulaması `Nota Düzenle` sekmesini yönetir. Smoosic same-origin `/smoosic-editor/index.html` iframe'i içinde çalışır. Host tarafındaki `src/smoosicEditorTabUi.js` accepted source lifecycle'ı, iframe oluşturma/ready bekleme ve MusicXML File/DataTransfer/change aktarımını yönetir.

Mobil iframe içindeki ana bileşenler:

- `experiments/smoosic-mobile/public/viewport-fit.js`: parent scroll/resize, parent `visualViewport` scroll/resize ve orientation olaylarını dinler; iframe yüksekliği ile mobil menü üst konumunu hesaplar.
- `experiments/smoosic-mobile/src/mobile-layout.js`: mobil ana menünün dış `#controls-left` kabuğunu `body` seviyesine portal eder; focus/scroll stabilizasyonu ve overlay kapatma davranışını yürütür.
- `experiments/smoosic-mobile/public/mobile.css`: üst toolbar, score viewport, dış/inner `controls-left` ayrımı ve alt toolbar geometrisini tanımlar.
- `experiments/smoosic-mobile/src/index.js`: MusicXML import/export, Smoosic score değişimi, piano/guitar sampler, playback ve metronom köprülerini yürütür.

## Değişmez sınırlar

Bu programda aşağıdakiler korunur:

- Üst Smoosic toolbar yeri ve işlevleri.
- Alt mobil toolbar ve mevcut `Menü` tetikleyicisi.
- Menü içeriği/sırası.
- PDF/MusicXML/TAB/Nota Düzenle geçişleri.
- Son accepted source'un başarısız replacement sonrasında korunması.
- Nota seçme/düzeltme, transpose, MusicXML açma/kaydetme, piano/guitar sesleri, metronom ve playback.
- Canonical/semantic authority'nin Smoosic'e taşınmaması.
- `st-score-rendering-layer` ve `st-score-editor-core` sorumluluklarının değiştirilmemesi.

## P0 gözlemleri

1. `viewport-fit.js`, mobilde `availableHeight = viewportBottom - frameTop - BOTTOM_GAP_PX` hesaplıyor ve sonucu doğrudan `frame.style.height` olarak yazıyor.
2. Aynı fonksiyon parent `scroll`, parent `resize`, `orientationchange`, `visualViewport.scroll` ve `visualViewport.resize` tarafından `requestAnimationFrame` üzerinden tekrar çağrılıyor.
3. Bu nedenle parent scroll sırasında `frameTop` değiştiğinde iframe yüksekliği de tasarım gereği değişiyor. Bu, mobil scroll ile iframe geometrisini birbirine geri besleyen deterministik bir layout-write zinciridir.
4. Mevcut unit testleri bu dinleyicilerin ve doğrudan height yazımının varlığını doğruluyor; same-height no-op, scroll-settle veya single-scroll-owner davranışını doğrulamıyor.
5. Mevcut CI gerçek Chromium browser doğrulamaları içeriyor ancak Playwright/WebKit engine koşusu bulunmuyor.
6. Gerçek iPhone Safari kabulü repository/CI kanıtıyla ikame edilemez.

Bu bulgular production fix değildir. P1 browser diagnostic ile iframe reload, source re-import, hidden-state ve score DOM mutation ihtimalleri ayrı ayrı ölçülmelidir.
