# SesliTab — Audiveris Dağıtım Rehberi

Bu belge, mevcut SesliTab OMR Gateway'i gerçek Audiveris motoruyla bir Linux sunucusunda çalıştırmak için gerekli adımları açıklar.

## Gereksinimler

### İşletim Sistemi
- 64-bit Linux (Ubuntu 22.04+ veya Debian 12+ önerilir)
- En az 2 GB RAM (Audiveris için)
- En az 2 GB boş disk alanı

### Java Çalışma Zamanı
- OpenJDK 17 veya üzeri (JRE yeterlidir)
- Kurulum: `sudo apt-get install openjdk-17-jre-headless`
- Doğrulama: `java -version`

### Audiveris
- Sadece resmi Audiveris sürümünü kullanın
- Resmi sürüm: https://github.com/Audiveris/audiveris/releases
- İndirdiğiniz arşivi çıkarın ve `audiveris` çalıştırılabilir dosyasının yolunu kaydedin
- Doğrulama: `audiveris -version`

## Kurulum Adımları

### 1. Java Kurulumu
```bash
sudo apt-get update
sudo apt-get install -y openjdk-17-jre-headless
java -version
```

### 2. Audiveris Kurulumu
```bash
# Resmi sürümü indirin (örnek — gerçek sürüm numarasını GitHub'dan kontrol edin)
# Sadece resmi GitHub sürümlerini kullanın
curl -L -o audiveris.zip https://github.com/Audiveris/audiveris/releases/latest/download/audiveris.zip
unzip audiveris.zip -d /opt/audiveris
chmod +x /opt/audiveris/bin/audiveris
# Doğrulama
/opt/audiveris/bin/audiveris -version
```

### 3. Ortam Değişkenleri
`.env` dosyasını oluşturun (repo'ya eklemeyin):

```
OMR_PROVIDER=audiveris
AUDIVERIS_COMMAND=/opt/audiveris/bin/audiveris
AUDIVERIS_TIMEOUT_MS=110000
AUDIVERIS_EXTRA_ARGS=
PORT=3001
```

### 4. Gateway'i Başlatma
```bash
npm install
node backend/server.js
```

### 5. Health Endpoint Doğrulama
```bash
curl http://localhost:3001/api/v1/health
```

Beklenen yanıt (Audiveris çalışır durumda):
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "provider": "audiveris",
    "runtime": {
      "available": true
    }
  }
}
```

Audiveris bulunamazsa:
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "provider": "audiveris",
    "runtime": {
      "available": false,
      "error": {
        "code": "EXECUTABLE_NOT_FOUND"
      }
    }
  }
}
```

### 6. PDF Testi
```bash
curl -X POST -F "file=@test.pdf" http://localhost:3001/api/jobs
# jobId alın
curl http://localhost:3001/api/jobs/<jobId>/status
# completed olunca:
curl http://localhost:3001/api/jobs/<jobId>/musicxml
```

### 7. MockProvider'a Güvenli Dönüş
Geliştirme veya test için MockProvider'a dönmek için:
```bash
# .env dosyasında:
OMR_PROVIDER=mock
```
Sunucuyu yeniden başlatın.

## Docker ile Dağıtım

Docker kullanılabilir ortamlarda:

```bash
docker build -t seslitab-gateway .
docker run -d -p 3001:3001 --env-file .env seslitab-gateway
```

Docker imajı OpenJDK 17 içerir. Audiveris'i imaja kurmak için `Dockerfile`'ı düzenin veya Audiveris'i bir volume olarak bağlayın.

## Güvenlik Notları

- `.env` dosyasını repo'ya eklemeyin
- `AUDIVERIS_COMMAND` değerini repo'da saklamayın
- API anahtarlarını veya hassas yapılandırmayı imajda tutmayın
- Health endpoint yalnızca güvenli bilgileri açığa çıkarır: seçilen sağlayıcı, runtime durumu ve hata kategorisi
- Mutlak yollar, ortam değişkenleri, süreç çıktısı veya dosya sistemi detayları açığa çıkarılmaz

## Sorun Giderme

| Hata Kodu | Açıklama |
|-----------|----------|
| `EXECUTABLE_NOT_FOUND` | Audiveris çalıştırılabilir dosyası bulunamadı |
| `RUNTIME_ERROR` | Audiveris çalışma zamanı kullanılamıyor (Java eksik olabilir) |
| `SPAWN_ERROR` | Süreç başlatılamadı |
| `TIMEOUT` | Audiveris yanıt vermedi (8 saniye içinde) |
| `TMP_NOT_WRITABLE` | Geçici dizin yazılabilir değil |
| `MISSING_CONFIG` | Audiveris komutu yapılandırılmamış |
| `INVALID_TIMEOUT` | Zaman aşımı yapılandırması geçersiz |
