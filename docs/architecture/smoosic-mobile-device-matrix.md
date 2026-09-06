# Smoosic mobil cihaz kanıt matrisi

Tarih: 6 Eylül 2026

| Kanıt sınıfı | Mevcut durum | Bu programdaki rol |
|---|---|---|
| Chromium 390x844 real-browser | Var | CI regression ve P1 diagnostic |
| Chromium desktop | Var | Genel production integration regression |
| Playwright WebKit engine | Yok / bağımlılık mevcut değil | P1'de ayrı POC; fiziksel Safari yerine geçmez |
| Fiziksel iPhone Safari | Repository CI'da yok | Mobil Safari için zorunlu product acceptance |
| Android Chrome | Henüz bu P0 fresh-read ile doğrulanmadı | Broad mobile release öncesi gerekli |
| iPad Safari | Doğrulanmadı | Secondary/deferred |

## Mevcut CI kanıtı

`.github/workflows/ci.yml` ana test/build dışında S14 için gerçek Chromium browser scriptleri çalıştırıyor. Mobil menü host-occlusion, source lifecycle, failed replacement ve production Smoosic integration kontrolleri CI kapsamındadır.

## Eksik kanıt

Repository dependency setinde Playwright/WebKit bulunmuyor. P1 WebKit POC'u için yeni dependency eklemek gerekirse mevcut güvenli geliştirme kuralı gereği dependency eklenmeden önce ayrı karar/inceleme gerekir. Bu eksik, fiziksel iPhone Safari testinin yerini doldurmaz.

## Fiziksel iPhone kısa kabul protokolü

1. Production/acceptance build'de gerçek MusicXML aç.
2. Nota Düzenle sekmesini aç; score, üst toolbar ve alt toolbar'ın aynı anda erişilebilir olduğunu doğrula.
3. Parent sayfayı yukarı/aşağı yavaş ve hızlı scroll et; titreme, beyaz/boş yüzey, iframe yeniden yükleme belirtisi ve score kaybını gözle.
4. Menü'yü en az 10 kez aç/kapat; her açılışta ilk öğe `Help` görünür, scrollTop başlangıcı üstte ve toolbar geometrisi sabit olmalı.
5. Portrait -> landscape -> portrait döndür; selected score/source ve toolbar erişimi korunmalı.
6. Bir notayı seç/düzelt; transpose, piano/guitar sesi, playback ve metronom smoke kontrolü yap.
7. A success -> B failure -> C success source lifecycle'ını tekrar et; başarısız B accepted source'u bozmasın.
8. Sonucu `PASS`, `FAIL` veya `NOT_TESTED` olarak kaydet; fiziksel Safari kanıtı yoksa `Safari tamamen çözüldü` denmemeli.
