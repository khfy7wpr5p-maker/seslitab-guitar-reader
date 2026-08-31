# Stage K — Compact Tuner Presentation

## Amaç

Stage K, tamamlanmış Package 11 kromatik akort cihazını ürün yüzeyinde daha sade ve hızlı kullanılabilir hale getirir.

Bu aşama **yalnız presentation katmanıdır**. Package 11 mikrofon, Web Audio, YIN pitch detection, smoothing, cent eşikleri, kalibrasyon ve privacy davranışı değişmez.

## Ana kullanıcı akışı

Primary tuner yüzeyi:

1. **Akort** bölümünü aç.
2. **Mikrofonu Başlat**.
3. Notayı çal.
4. Büyük nota adı + yön + cent metre üzerinden akort durumunu izle.
5. Gerekirse **Durdur**.

İkincil bilgiler **Ayarlar ve ölçümler** native `<details>` alanındadır:

- La4 kalibrasyonu;
- frekans (Hz);
- signed cent değeri;
- Package 11 eşik açıklaması;
- 12-ses/kromatik bilgi rozeti.

Bu gruplama mevcut DOM düğümlerini yeniden kullanır; Package 11 kontrol kimliklerini veya event listener sahipliğini değiştirmez.

## Privacy sınırı

Ana tuner yüzeyinde görünür olarak:

> Mikrofon sesi SesliTab sunucusuna gönderilmez, kaydedilmez veya saklanmaz.

Package 11 sözleşmesi değişmez:

```text
device microphone
  -> browser-local Web Audio
  -> bounded pitch detector
  -> local display only
```

Stage K:

- `getUserMedia` çağırmaz;
- `AudioContext` oluşturmaz;
- pitch/frequency/cents hesaplamaz;
- tuner eşiklerini değiştirmez;
- mikrofon akışını upload/persist/record etmez;
- network isteği eklemez.

## Erişilebilirlik

- Native Start/Stop buttons korunur.
- Native calibration input korunur.
- Native `<meter>` ve mevcut accessible value text davranışı korunur.
- `tuner-status` polite live-region ana yüzeyde kalır; secondary details içine taşınmaz.
- Privacy bilgisi yalnız renkle verilmez.
- **Ayarlar ve ölçümler** summary kontrolü en az 44px dokunma hedefidir.
- Existing primary button touch target korunur.
- Dar ekranda secondary readout tek sütuna iner.

## Değişmeyen sınırlar

Stage K değiştirmez:

- `chromaticTunerEngine.js`;
- Package 11 microphone lifecycle;
- A4 415.0–466.2 Hz contract;
- 40–2000 Hz analysis bound;
- YIN detector/confidence/RMS gates;
- ±2 / ±5 cent guidance thresholds;
- local-audio/privacy contract;
- OMR/Audiveris/gateway/backend;
- canonical score model;
- PASS/REVIEW/BLOCK routing;
- teacher approval;
- Package 12 sharing;
- authentication/persistence/student delivery;
- dependencies/framework.

## Doğrulama kapısı

Stage K merge-ready olmak için:

1. focused Stage K presentation regressions;
2. mevcut Package 11 tuner-engine regressions;
3. full repository test suite;
4. production build;
5. gerçek Chrome compact-tuner proof;
6. browser'da `<=640px` mobile breakpoint + 44px proof;
7. Package 11 `localAudioOnly=true` / `uploadsAudio=false` contract proof;
8. required `test-and-build` CI;
9. unresolved review thread olmaması;
10. merge öncesi explicit kullanıcı onayı

gerektirir.

Headless Chrome dar `--window-size` isteklerini kendi minimum CSS viewport değerine clamp edebilir. Bu nedenle Stage K exact cihaz piksel genişliği iddia etmez; gözlenen viewport'un `<=640px` product breakpoint içinde olduğunu ve touch-target sınırlarını doğrular.
