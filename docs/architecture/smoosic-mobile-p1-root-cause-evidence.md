# P1 — Smoosic mobil scroll / blank / toolbar root-cause kanıtı

Durum: başlangıç kanıtı, production değişikliği yok.

## ISSUE-MOB-01 — Scroll sırasında titreme

### Kanıtlanmış yapısal neden adayı

`viewport-fit.js` mobilde iframe yüksekliğini şu bağıntı ile hesaplıyor:

`availableHeight = viewportBottom - frameTop - BOTTOM_GAP_PX`

Aynı modül parent `scroll` olayını ve `visualViewport` scroll/resize olaylarını dinliyor. Parent scroll sırasında `frameTop` değiştiğinden `availableHeight` de değişiyor; kod bu değeri `frame.style.height` olarak yazıyor. Dolayısıyla host scroll ile iframe layout'u birbirine kapalı geri besleme ile bağlanmış durumda.

Bu davranış tahmin değil, mevcut kodun doğrudan sonucudur. Bunun Safari'deki görülen flicker'ın tek nedeni olduğu henüz kanıtlanmış değildir.

## ISSUE-MOB-02 — Blank/loading benzeri geçici yüzey

Host kodunda iframe'in `hidden=true` yapılması source transition pending durumunda var. P1 diagnostic şu hipotezleri ayırır:

- iframe load/reload oluyor mu?
- `mobile-xml-input` tekrar `change` alıyor mu?
- iframe `hidden` attribute'u scroll sırasında değişiyor mu?
- score DOM scroll sırasında yeniden üretiliyor mu?
- yalnız iframe geometry/layout mutasyonu mu görülüyor?

Chromium diagnostic sonucu fiziksel iPhone Safari kanıtı değildir; yalnız hipotez elemek için kullanılır.

## ISSUE-MOB-03 — Menü başlangıç konumu

Mevcut `mobile-layout.js`, retained focus'u blur ediyor ve açık menü için `scrollTop=0` değerini immediate + iki RAF + 80ms + 180ms pencerelerinde tekrar uyguluyor. Bu, geçmiş WebKit scroll restoration problemini hedefliyor. Menü dış shell'i `body` seviyesine portal ediliyor; nested gerçek menü normal flow'da tutuluyor.

Kalan P1 ölçümü: outer/inner rect, activeElement, scrollTop ve visual viewport snapshot'ı aynı evidence kaydında tutulmalı.

## ISSUE-MOB-04 — Toolbar/dropdown geometry drift

Mevcut CSS üst toolbar'ı sabit yükseklikli horizontal flex olarak tanımlıyor. P1 diagnostic scroll sırasında iframe reload/source re-import olmadığını kanıtlarsa toolbar drift için resize/layout/compositing zinciri daha güçlü aday olur. Modal/dropdown state ayrıca fiziksel Safari protokolünde gözlenmelidir.

## ISSUE-MOB-05 — Chromium / gerçek Safari farkı

Mevcut CI Chromium tabanlıdır. Playwright/WebKit dependency mevcut değil. Bu nedenle WebKit engine evidence ve fiziksel iPhone Safari product acceptance ayrı tutulur.
