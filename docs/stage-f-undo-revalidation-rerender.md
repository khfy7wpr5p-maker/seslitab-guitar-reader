# Stage F — Undo / Revalidation / Rerender

Tarih: 31 Ağustos 2026
Durum: **PRODUCTION / BOUNDED** — Stage F, Stage A–L üretim zincirinin parçasıdır.

## Amaç

Stage F, bounded teacher correction sonrasında canonical coherence, immutable revision lifecycle, revalidation, rerender ve güvenli undo davranışını ürün yüzeyine bağlar.

## Üretim zinciri

```text
original/imported revision
  -> teacher review
  -> bounded correction
  -> corrected revision
  -> revalidation
  -> rerender
  -> teacher approval when applicable
  -> quality/share eligibility evaluation
```

Automatic/imported revision sessizce overwrite edilmez. Correction yeni immutable lineage üretir. Undo geçmişi silmez ve eski approval'ı yeniden etkinleştirmez; önceki revision integrity korunur.

## Rerender ve revalidation sınırı

Rerender yalnız current revision için yeterli canonical/corrected MusicXML ve renderer kanıtı varsa gerçekleşir. Eski raw MusicXML, teacher correction uygulanmış gibi gösterilmek için kullanılamaz.

Stage F; pitch/alter/octave, duration/rhythm, voice/staff, tie/string identity ve bounded undo geçmişi için uygun Package 12 revalidation sözleşmelerini kullanır. Unsupported, malformed, stale veya eksik evidence fail closed olur. Stage F kendi başına MusicXML semantiği icat etmez, correction engine değildir ve teacher approval/quality/share authorization üretmez.

## Package 12 ayrımı

Revalidation corrected revision için kanıt üretir; otomatik olarak teacher approval, share eligibility, share authorization veya student delivery üretmez. `READY_EXACT_REVISION` sonucu network delivery anlamına gelmez.

## Kullanıcı yüzeyi

`Doğrula ve görünümü yenile` ve `Son değişikliği geri al` eylemleri metinsel durum bildirimiyle sunulur. Renk tek bilgi taşıyıcısı değildir; görünür focus ve minimum 44px etkileşim hedefi korunur.

## Kanıt

Stage F kapsamı `src/services/stageFCanonicalization.js`, `src/services/stageFCorrectedMusicXml.js`, `src/services/stageFRevisionLifecycle.js` ve `src/stageFRevisionLifecycleUi.js` ile; `stageFCanonicalization`, `stageFCorrectedMusicXml`, `stageFDurationTimelineProof` ve `stageFRevisionLifecycle` testleriyle doğrulanır. Full regression, production build ve gerçek-browser proof mevcut required CI modelinin parçalarıdır.

Bu belge production davranışını tarif eder; yeni correction class, persistence, authentication veya delivery davranışı tanımlamaz.
