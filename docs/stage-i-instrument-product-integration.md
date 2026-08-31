# Stage I — Guitar TAB + Violin Product Integration

## Amaç

Stage I, mevcut Package 9 Guitar TAB ve Package 10 Violin consumer'larını SesliTab'ın Stage G PASS / REVIEW / BLOCK ürün routing'i ile birleştirir.

Bu aşama yeni bir quality engine, gitar çözücü, keman çözücü veya müzikal doğruluk otoritesi oluşturmaz.

## Yetki zinciri

```text
exact canonical NoteObject[]
  -> existing Stage G exact-consumer route
      -> REVIEW/BLOCK: solver çağrılmaz
      -> PASS + explicit consumer permission
          -> existing Package 9 / Package 10 consumer
              -> product action available / withheld
```

Stage I yalnız mevcut kararları tüketir.

## Ürün davranışı

### Guitar TAB

- Stage G `PASS` + Package 9 definitive rendered result -> **Gitar TAB'ı Aç** etkin.
- Stage G `REVIEW` -> **İnceleme gerekiyor**, Package 9 çağrılmaz.
- Stage G `BLOCK` -> **Kullanım engellendi**, Package 9 çağrılmaz.
- PASS olduğu halde desteklenen TAB projection üretilemiyorsa eylem kapalı kalır; kısmi/tahmini TAB gösterilmez.
- Nominal PASS gerekli `automaticProceed` / `definitiveConsumerAllowed` izinlerini taşımıyorsa fail closed.

### Violin

- Stage G `PASS` + Package 10 definitive generated projection + `teacherApproved:false` -> **Keman Çalışmasını Aç** etkin.
- Stage G `REVIEW` -> **İnceleme gerekiyor**, Package 10 çağrılmaz.
- Stage G `BLOCK` -> **Kullanım engellendi**, Package 10 çağrılmaz.
- Consumer-level string/position ambiguity review gerektiriyorsa ürün REVIEW olarak kalır ve eylem açılmaz.
- Desteklenmeyen/unplayable sonuçlarda kısmi veya tahmini pozisyon gösterilmez.

## Erişilebilirlik

Stage I ürün eylemleri:

- native `<button>` kullanır;
- `aria-disabled` ile görünür durumunu yansıtır;
- durum metinleri `role="status"` + `aria-live="polite"` kullanır;
- minimum 44px dokunma hedefi taşır;
- dar ekranda tek sütuna iner;
- mevcut erişilebilir Package 4/5 result tablarını açar, ikinci bir çıktı renderer'ı oluşturmaz.

## Değişmeyen sınırlar

Stage I:

- Stage G quality kararını değiştirmez;
- REVIEW'i PASS'e yükseltmez;
- BLOCK'u bypass etmez;
- canonical note/timing verisini clone/reparse etmez;
- Guitar TAB / Violin solver semantiğini değiştirmez;
- teacher approval üretmez veya devralmaz;
- Package 12 share authorization / eligibility / recipient binding'i değiştirmez;
- student delivery authority üretmez;
- TTS veya playback routing'ini değiştirmez;
- renderer semantic contract'ını değiştirmez;
- OMR/Audiveris/backend/auth/database/deployment/dependency sınırlarına dokunmaz.

## Doğrulama kapısı

Stage I merge-ready olmak için:

1. Stage I focused regression testleri;
2. repository full test suite;
3. production build;
4. gerçek Chrome'da Stage I ürün action proof'u;
5. 390px dar viewport + 44px touch target proof'u;
6. required `test-and-build` CI;
7. unresolved review thread olmaması;
8. merge öncesi explicit kullanıcı onayı

gerektirir.
