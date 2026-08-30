# Stage F — Undo / Revalidation / Rerender

Tarih: 30 Ağustos 2026

## Amaç

Stage F, Stage E bounded visual note editor sonrasında revision lifecycle'ını ürün yüzeyine bağlar:

correction → revalidation durumu → yalnız kanıt varsa rerender → güvenli tek-adımlı undo.

## Fresh-read sınırı

Stage F başlangıcında protected `main`:

`58c29d800bb4b9e4167ba073cf813cac875971c0`

Required check: `test-and-build`.

Open PR #138 (`Package 12-T4: bounded structural/rhythmic corrected revalidation`) hâlâ ayrı ve main'de değildir.

## Uygulanan güvenli subset

### Tek-adımlı undo

`resolveStageFPreviousUndoTarget()` mevcut immutable history içinde en yakın farklı içeriği bulur.

Undo:

- eski revision'a pointer taşımaz,
- geçmişi silmez,
- yeni teacher-corrected revision oluşturmak için mevcut Package 8 immutable undo yolunu kullanır,
- eski approval'ı tekrar etkinleştirmez.

### Rerender politikası

Stage F kaynak MusicXML'i yalnız current revision içeriği automatic root içeriğiyle exact aynıysa yeniden render eder.

Bu durum automatic root current olduğunda veya undo exact root içeriğini geri getirdiğinde mümkündür.

Corrected revision için düzeltilmiş MusicXML materialization kanıtı yoksa Stage F eski source MusicXML'i yeni correction'ın görsel karşılığıymış gibi render etmez.

### Revalidation durumu

- `step` / `alter` / `octave`: Package 12-T3 corrected-revision evidence + corrected MusicXML materialization gerekir. Stage F bunu kendisi icat etmez.
- `durationValue`: structural/rhythmic revalidation gerekir. Bu sınır open PR #138 Package 12-T4 kapsamındadır ve main'e merge edilmeden Stage F onu var saymaz.
- non-root undo: structural/rhythmic revalidation gerekir.
- Package 8'de bulunan fakat Stage E kapsamı dışındaki correction alanları Stage F tarafından unsupported kabul edilir.

## Güvenlik invariantları

Stage F:

- source notes veya raw MusicXML'i mutate etmez,
- corrected MusicXML üretmez veya patch etmez,
- pitch/duration/voice/tie/source identity tahmin etmez,
- renderer'ı semantic authority yapmaz,
- quality gate veya teacher approval üretmez,
- Package 12-T4 kodunu kopyalamaz,
- open PR #138'i merged kabul etmez,
- yeni dependency eklemez,
- OMR/backend/auth/database/deployment sınırını değiştirmez.

Yanlış veya eski görsel sunmaktansa rerender `false`/unavailable kalır.

## Kullanıcı yüzeyi

Yeni bölüm:

**Doğrulama ve geri alma**

Eylemler:

- `Doğrula ve görünümü yenile`
- `Son değişikliği geri al`

Durumlar `aria-live` üzerinden metinsel olarak açıklanır; renk tek bilgi taşıyıcısı değildir. Kontroller 44px minimum hedef ve görünür keyboard focus sağlar.

## Bilinçli olarak tamamlanmayan kısım

Stage F'nin corrected-score rerender zinciri, corrected MusicXML materialization ve duration/undo structural revalidation main'de kanıtlanmadan tamamlanmış sayılmaz.

Bu nedenle bu stage'in doğru rapor statüsü:

- ✅ exact-root undo + safe source rerender
- ✅ fail-closed product lifecycle orchestration
- ⚠️ corrected pitch rerender — T3 evidence + corrected MusicXML materialization prerequisite
- ⚠️ duration/non-root undo revalidation — Package 12-T4 prerequisite

Bu sınırlama güvenli geliştirme kararıdır; eski MusicXML'in correction uygulanmış gibi gösterilmesini önler.
