# SesliTab — Render Audiveris Dağıtım Rehberi

Bu belge, mevcut SesliTab OMR Gateway'i Render platformunda Docker ile gerçek Audiveris motoru kullanarak dağıtmak için gerekli adımları açıklar.

**Render dağıtımı henüz yapılmamıştır.** Bu belge yalnızca hazırlık adımlarını içerir.

## 1. Maliyet Uyarısı

Render Standard örnekleri ve kalıcı diskler ücretlendirilir. Bu dağıtım:
- **Standard örnek** (1 CPU, 2 GB RAM) — aylık ücret
- **1 GB kalıcı disk** — aylık ücret

Kullanılmadığında servisi duraklatın veya silin. Gereksiz ücretlerden kaçınmak için `autoDeploy: false` ayarlıdır.

## 2. GitHub Deposu

1. Mevcut GitHub deponuzu Render'a bağlayın veya yeni bir depo oluşturun.
2. `render.yaml` dosyası depo kök dizininde olmalıdır.
3. `.env` dosyasının depoya eklenmediğinden emin olun (`.gitignore` kontrolü).

## 3. Servis Oluşturma

1. Render dashboard'da **New → Web Service** seçin.
2. **Deploy from a Git repository** seçin.
3. Deponuzu bağlayın.
4. Render, `render.yaml` dosyasını otomatik algılayacaktır.
5. Servis adı: `seslitab-omr`
6. Runtime: Docker
7. Plan: Standard (1 CPU, 2 GB RAM)

## 4. Standard Örnek Seçimi

- **Standard** plan önerilir (1 CPU, 2 GB RAM).
- Audiveris Java tabanlıdır ve en az 2 GB RAM gerektirir.
- Free plan Audiveris için yetersizdir.

## 5. Kalıcı Disk

- Disk adı: `seslitab-data`
- Bağlama noktası: `/var/lib/seslitab`
- Boyut: 1 GB
- Bu disk geçici dosyaları, MusicXML çıktılarını ve Audiveris önbelleğini saklar.

## 6. Ortam Değişkenleri

`render.yaml` dosyasında aşağıdaki güvenli varsayılanlar tanımlıdır:

| Değişken | Değer |
|----------|-------|
| `NODE_ENV` | `production` |
| `OMR_PROVIDER` | `audiveris` |
| `AUDIVERIS_COMMAND` | `/opt/audiveris/bin/Audiveris` |
| `AUDIVERIS_TIMEOUT_MS` | `110000` |
| `SESLITAB_DATA_DIR` | `/var/lib/seslitab` |
| `SESLITAB_TEMP_DIR` | `/var/lib/seslitab/tmp` |
| `SESLITAB_MUSICXML_DIR` | `/var/lib/seslitab/musicxml` |

`PORT` Render tarafından otomatik sağlanır, ayarlanmamalıdır.

## 7. Gizli Anahtar Doğrulaması

- API anahtarları veya `.env` dosyası repo'ya eklenmemelidir.
- `render.yaml` yalnızca güvenli, gizli olmayan varsayılanlar içerir.
- Hassas değerler Render dashboard'da manuel olarak eklenmelidir.

## 8. İlk Dağıtım

1. `autoDeploy: false` ayarı nedeniyle ilk dağıtım manuel tetiklenmelidir.
2. Render dashboard'da **Manual Deploy** seçin.
3. Build günlüklerini izleyin.

## 9. Build Günlüğü Kontrolü

Build sırasında şu adımların başarılı olduğunu doğrulayın:
- Ubuntu 24.04 base image indirildi
- `curl` ve `ca-certificates` kuruldu
- Audiveris 5.11.0 .deb dosyası GitHub'dan indirildi (HTTPS)
- `dpkg -i` ile Audiveris kuruldu
- `/opt/audiveris/bin/Audiveris -version` çalıştırıldı
- Node.js 20 kuruldu
- `npm ci` ile bağımlılıklar kuruldu

## 10. /health Doğrulaması

Dağıtım sonrası:
```bash
curl https://<servis-adı>.onrender.com/health
```

Beklenen yanıt:
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "provider": "audiveris",
    "runtime": { "available": true }
  }
}
```

## 11. Audiveris Preflight Sonucu

Health endpoint `runtime.available: true` döndürmelidir. `false` dönerse:
- `EXECUTABLE_NOT_FOUND`: Audiveris kurulamamış
- `RUNTIME_ERROR`: Java eksik veya bozuk
- `TIMEOUT`: Audiveris yanıt vermedi

## 12. Test PDF Yükleme

Yasal bir müzik partisyonu PDF'i yükleyin. Telif hakkı korunan müzik kullanmayın.

```bash
curl -X POST -F "file=@test.pdf" https://<servis-adı>.onrender.com/api/jobs
```

## 13. Smoke Test Scripti

```bash
node scripts/real-omr-smoke-test.js test.pdf --gateway https://<servis-adı>.onrender.com
```

Script şunları rapor eder:
- İş durumu
- Sağlayıcı
- MusicXML kök tipi
- Part sayısı
- Ölçü sayısı
- Nota/dinlenme sayısı

## 14. Gerçek MusicXML Doğrulaması

Smoke test scripti tamamlandığında:
- MusicXML kök tipi `score-partwise` veya `score-timewise` olmalıdır
- En az 1 part, 1 ölçü bulunmalıdır
- Nota sayısı > 0 olmalıdır

## 15. MockProvider'a Geçici Dönüş

Test için:
1. Render dashboard'da `OMR_PROVIDER` değerini `mock` olarak değiştirin.
2. Servisi yeniden başlatın.
3. `curl https://<servis-adı>.onrender.com/health` ile doğrulayın.

## 16. Servisi Duraklatma veya Silme

Gereksiz ücretleri önlemek için:
- **Suspend**: Servisi geçici olarak durdurur, disk ücreti devam eder.
- **Delete**: Servisi ve diski kalıcı olarak siler.

## 17. Sorun Giderme

### Docker Build Başarısız
- Audiveris .deb URL'sini kontrol edin
- GitHub release varlığını doğrulayın
- Ağ erişimini kontrol edin

### Audiveris Paket İndirme Başarısız
- `curl -fL` bayrakları kullanıldı (HTTP hatası varsa build başarısız olur)
- Resmi GitHub URL'si: `https://github.com/Audiveris/audiveris/releases/download/5.11.0/`

### Çalıştırılabilir Dosya Bulunamadı
- `AUDIVERIS_COMMAND` değerini kontrol edin: `/opt/audiveris/bin/Audiveris`
- Büyük/küçük harf duyarlıdır

### İzin Hatası
- `/var/lib/seslitab` dizini `seslitab` kullanıcısına ait olmalıdır
- `chmod 777` kullanılmaz

### Bellek Yetersizliği
- Standard plan (2 GB RAM) kullanın
- Free plan yetersizdir

### Zaman Aşımı
- `AUDIVERIS_TIMEOUT_MS=110000` (110 saniye)
- Frontend zaman aşımı 120 saniye

### MusicXML Üretilmedi
- PDF'nin müzik notasyonu içerdiğinden emin olun
- Audiveris log'larını kontrol edin (sunucu tarafı)

### Geçersiz MusicXML
- Çıktı dosyası boş olabilir
- `.mxl` arşivi bozuk olabilir
- Health endpoint ile runtime durumunu kontrol edin

## Lisans Bildirimi

Audiveris, AGPL-3.0 (GNU Affero General Public License v3.0) lisansı altında dağıtılmaktadır. Kamu veya ticari dağıtım yapmadan önce lisans yükümlülüklerini gözden geçirin. Bu belge hukuki bir sonuç içermez; lisans şartlarını ilgili uzmanla değerlendirin.
