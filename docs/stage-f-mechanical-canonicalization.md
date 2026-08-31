# Stage F — Mechanical canonicalization boundary

Tarih: 30 Ağustos 2026

## Amaç

Stage E yalnız öğretmen niyetini kaydeder: `step`, `alter`, `octave` veya `durationValue`.
Bu alanlardan türeyen teknik değerleri öğretmen düzeltmesiymiş gibi sessizce değiştirmez.

Stage F canonicalization bu boşluğu ayrı bir immutable revision ile kapatır.

Akış:

`automatic root → teacher intent revision → system canonicalization revision`

Canonicalizer actor kimliği sabittir:

`system:stage-f-canonicalizer`

Bu actor authentication değildir; provenance/audit etiketidir.

## Pitch

Teacher intent `step`, `alter` veya `octave` değiştirdiyse canonicalizer mevcut canonical pitch resolver ile yalnız türetilmiş alanları hesaplar:

- `midi`
- `frequency`
- `noteName`
- yalnız mevcut `stringLetter` korunabiliyorsa `fret`

String identity değiştirilmez. Düzeltilen pitch mevcut string üzerinde çalınamıyorsa işlem fail-closed olur.

## Duration

Teacher intent `durationValue` değiştirdiyse canonicalizer yalnız mevcut `divisions` kanıtından:

- `beats`
- `duration`
- `dotCount`

alanlarını türetir.

Yakın nota değeri seçilmez. `durationValue / divisions` mevcut canonical duration tablosunda exact karşılık bulmuyorsa işlem reddedilir.

`startBeat` canonicalizer tarafından tahmin edilmez veya sessizce yeniden zamanlanmaz. Timeline tutarlılığı ayrı structural revalidation sınırında kanıtlanmalıdır.

## Güvenlik

Canonicalizer:

- automatic root'u değiştirmez;
- teacher intent revision'ını değiştirmez;
- ayrı immutable revision oluşturur;
- ayrı system actor audit event üretir;
- source MusicXML'i değiştirmez;
- string identity, voice, staff, tie, tuplet, part/measure identity üretmez;
- Stage E dışındaki teacher correction alanlarını reddeder;
- stale history expectation durumunda mevcut Package 8-T5 conflict davranışını korur;
- eski teacher approval'ı yeni revision'a taşımaz.

## Package 12 ayrımı

Package 12-T3/T4 paylaşım uygunluğu için tasarlanmıştır ve automatic root üzerinde T2 share-quality eligibility şartı taşır. Stage F product revalidation bunu gevşetmez veya REVIEW root'u sahte PASS yapmaz.

Bu canonicalization katmanı bu nedenle share authorization/eligibility semantiğinden bağımsızdır. Corrected MusicXML materialization ve Stage F product revalidation ayrı güvenli adım olarak bağlanacaktır.
