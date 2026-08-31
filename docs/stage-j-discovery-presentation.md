# Stage J — Discovery Presentation Simplification

## Amaç

Stage J, mevcut SesliTab Discovery yüzeyini gerçek kullanıcı görevi etrafında sadeleştirir. Bu aşama yalnız presentation katmanıdır.

Discovery hâlâ yalnız kaynak bulma aracıdır:

```text
FOUND
!= SOURCE VERIFIED
!= MUSICALLY VERIFIED
!= TEACHER APPROVED
```

Stage J yeni arama sağlayıcısı, yeni katalog, yeni doğrulama yöntemi veya yeni import yetkisi oluşturmaz.

## Ürün sunumu

Ana Discovery görevi:

1. **Eser veya sanatçı** yaz.
2. **Ara**.
3. Doğrudan sonuç varsa **Kaynak Sitesinde Aç**.
4. PDF/MusicXML için mevcut güvenli intake sekmesine geç.
5. İstenirse **Arama seçenekleri** açılarak repertuvar, katalog, format, enstrüman ve içerik filtreleri kullanılabilir.

Filtreler silinmez ve request sözleşmesi değişmez; yalnız bir `<details>` altında ikincil göreve dönüştürülür.

## Güven sınırı

Discovery paneli açıkça şu bilgiyi verir:

> Bulunan kaynaklar doğrulanmış nota değildir. Açtığınız PDF veya MusicXML normal SesliTab doğrulama sürecinden geçmelidir.

Bu ifade presentation kopyasıdır; yeni verification evidence üretmez.

Doğrudan sonuçlarda güvenli HTTPS external-open eylemi kullanıcı dilinde **Kaynak Sitesinde Aç** olarak gösterilir. Stage J:

- `sourcePageUrl` değerini değiştirmez;
- `target="_blank"` / `rel="noopener noreferrer"` güvenlik davranışını değiştirmez;
- source locator aramalarını doğrudan eser sonucu gibi yeniden etiketlemez;
- `handoffMode`, `rightsStatus`, `rightsLicense`, `canOpenSource` veya `canDirectImport` alanlarını değiştirmez;
- doğrudan import özelliği eklemez.

## Erişilebilirlik

- Native search/input/select/checkbox/details/button/link semantiği korunur.
- Arama alanının mevcut `aria-describedby="discovery-help"` ilişkisi korunur.
- **Arama seçenekleri** summary kontrolü en az 44px dokunma hedefidir.
- Discovery eylemleri en az 44px dokunma hedefidir.
- 640px ve altında sonuç eylemleri tek sütuna iner.
- Kaynak doğrulama uyarısı renk dışında metinle sunulur.

## Değişmeyen sınırlar

Stage J değiştirmez:

- `discoveryService` veya backend Discovery gateway;
- provider/routing/catalog sonuç semantiği;
- arama request filtreleri;
- rights/licence evidence;
- external source URL sanitization;
- PDF/MusicXML intake doğrulaması;
- OMR/Audiveris;
- canonical music model;
- PASS/REVIEW/BLOCK quality routing;
- Stage H playback;
- Stage I Guitar TAB / Violin integration;
- teacher approval;
- Package 12 share authorization/eligibility;
- authentication, persistence veya student delivery;
- framework/dependencies.

## Doğrulama kapısı

Stage J merge-ready olmak için:

1. focused Stage J regressions;
2. full repository test suite;
3. production build;
4. gerçek Chrome Discovery presentation proof;
5. 390px narrow viewport + 44px touch-target proof;
6. required `test-and-build` CI;
7. unresolved review thread olmaması;
8. merge öncesi explicit kullanıcı onayı

gerektirir.
