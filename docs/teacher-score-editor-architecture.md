# SesliTab Teacher Score Editor Architecture

Tarih: 31 Ağustos 2026  
Durum: **Stage A–L bounded product roadmap production main üzerinde tamamlandı.** Bu kapanış, authenticated öğrenci teslimatı, evrensel müzikal doğruluk veya kaynakla görsel birebir doğruluk iddiası değildir.

## Status vocabulary

- **IMPLEMENTED** — protected production `main` üzerindeki kod ve testler belirtilen bounded capability'yi sağlar.
- **BOUNDED** — yalnız açıkça desteklenen kanıt/sözleşme alanında çalışır; unsupported veya belirsiz durum fail-closed kalır.
- **OUT OF SCOPE / BLOCKED** — ayrı güvenlik, backend veya ürün sözleşmesi gerektirir ve A–L kapanışı tarafından uygulanmış sayılmaz.

## 1. Product routing: PASS / REVIEW / BLOCK

**IMPLEMENTED — Stage G.**

Package 2D mevcut quality-gate kararlarının ürün eşlemesi:

- `ACCEPT → PASS` — **“Otomatik kontrollerden geçti”**
- `REVIEW → REVIEW` — **“İnceleme gerekiyor”**
- `BLOCK → BLOCK` — **“Kullanım engellendi”**

Eksik, malformed veya çelişkili karar hiçbir zaman PASS olamaz.

`PASS != teacher-approved != share-authorized != delivered-to-student`

Quality-gate ACCEPT sonucu OMR transkripsiyonunun kaynak görüntüyle birebir aynı olduğunu kanıtlamaz. Presentation katmanı yeni source-verification veya musical-truth iddiası üretemez.

## 2. Authority chain

**IMPLEMENTED as architectural boundary.**

Authority ayrımı:

Original PDF/source evidence
→ OMR output
→ MusicXML source evidence
→ parser/normalization
→ canonical note/time model
→ structural/quality evidence
→ bounded consumer gates
→ teacher correction/approval where required
→ exact-revision share authorization/eligibility where requested

Kurallar:

1. Renderer yalnız presentation/interaction katmanıdır.
2. OMR musical-truth authority değildir.
3. MusicXML structural validity, kaynakla veya müzikal olarak doğru olmayı tek başına kanıtlamaz.
4. Canonical `NoteObject[]` mevcut consumer'ların ortak runtime music-data authority'sidir; eksik kaynak gerçeği icat edemez.
5. Automatic source, teacher-corrected revision, system-canonicalized revision ve teacher approval ayrı evidence türleridir.
6. Yeni correction eski approval veya authorization'ı miras alamaz.
7. Package 12 paylaşım semantiği product routing veya product-local revalidation ile birleştirilemez.

## 3. Visual score editor

**IMPLEMENTED / BOUNDED — Stages C, E ve F.**

Ürün akışı:

Open score
→ canonical measure seç
→ exact canonical note seç
→ desteklenen bounded alanı düzenle
→ yeni immutable revision oluştur
→ canonicalize/revalidate
→ yalnız kanıt varsa rerender
→ gerektiğinde exact revision'ı onayla

Stage E yalnız güvenli bounded teacher intent alanlarını sunar:

- `step`
- `alter`
- `octave`
- `durationValue`

String/fret, MIDI, frequency, voice, staff, tie, source identity veya verification evidence doğrudan teacher field olarak açılmaz. Türetilmiş pitch/duration alanları Stage F'deki ayrı mekanik canonicalization/revalidation zincirine aittir.

## 4. Measure / note selection and renderer interaction

**IMPLEMENTED / BOUNDED — Stage C.**

Selection identity şu kanıtlara bağlıdır:

- exact published canonical `NoteObject[]` reference,
- parser-owned canonical `measureKey`,
- exact array index,
- exact `NoteObject` reference.

ST Score Rendering Layer pinned note-interaction runtime hit-test/highlight sağlar; renderer hit sonucu yalnız bounded `ScoreNoteRef` üretir. Renderer → canonical eşleme pitch, SVG yakınlığı veya görünür label tahminiyle yapılmaz. Kanıt eksik, stale, ambiguous veya out-of-range ise eşleme abstain/fail-closed olur.

Renderer presentation authority olarak kalır; canonical veya quality authority olmaz.

## 5. Quality overlay

**IMPLEMENTED / BOUNDED — Stage D.**

UI, exact canonical array için mevcut Package 2D/quality evidence'tan PASS/REVIEW/BLOCK durumunu ve report-backed finding'leri sunar.

Overlay:

- finding olmayan note/measure hedefi icat etmez,
- renderer geometry'sinden kalite sonucu türetmez,
- rengi tek bilgi taşıyıcısı yapmaz,
- textual/screen-reader state sağlar.

## 6. Correction lifecycle, canonicalization and revalidation

**IMPLEMENTED / BOUNDED — Package 8 + Stages E/F.**

Akış:

automatic root
→ bounded teacher intent revision
→ gerekiyorsa separate system canonicalization revision
→ corrected MusicXML materialization / product-local revalidation
→ evidence-backed rerender

Automatic root immutable kalır. Teacher correction eski revision'ı overwrite etmez.

Stage F supported pitch correction için türetilmiş `midi`, `frequency`, `noteName` ve ancak mevcut string identity ile kanıtlanabiliyorsa fret coherence üretir. Duration correction için mevcut divisions/canonical duration kanıtı kullanılır; timeline coherence product revalidation ile ayrıca kanıtlanır.

Package 12-T3/T4 artık production main üzerindedir, ancak paylaşım eligibility semantiği Stage F product-local revalidation authority değildir. İki sınır ayrı tutulur.

Unsupported correction class, eksik corrected MusicXML, stale lineage veya başarısız structural revalidation fail-closed kalır.

## 7. Exact-revision teacher approval

**IMPLEMENTED — Package 8.**

Teacher approval exact current revision'a bağlanır. Approval:

- quality gate override değildir,
- share authorization değildir,
- student delivery değildir.

Daha sonraki correction eski approval'ı non-applicable yapar. Aynı içerikli yeni revision bile eski approval'ı miras alamaz.

## 8. Undo

**IMPLEMENTED / BOUNDED — Package 8 + Stage F.**

Undo:

- geçmiş revision'a pointer geri taşımaz,
- geçmişi silmez/yeniden yazmaz,
- yeni immutable revision oluşturur,
- eski approval'ı diriltmez.

Stage F güvenli tek-adımlı previous-different-content hedefini çözer. Root'a dönüş exact source rerender yolunu kullanabilir; non-root undo yeniden product revalidation ister.

## 9. Review playback

**IMPLEMENTED / BOUNDED — Stage H.**

Playback route modları:

- `DEFINITIVE`
- `REVIEW_PREVIEW`
- `REVIEW_WITHHELD`
- `BLOCKED`

REVIEW hiçbir zaman ACCEPT/PASS'e yükseltilmez. Yalnız mevcut Package 2D REVIEW kararı ve bounded güvenli structural evidence varsa explicit non-definitive preview açılır:

- **“İnceleme İçin Dinle”**
- **“Doğrulanmamış önizleme”**

Kanıt eksik/unsafe ise ürün REVIEW kalır fakat playback withheld olur. BLOCK bypass edilmez.

## 10. Guitar TAB and violin product integration

**IMPLEMENTED / BOUNDED — Stage I.**

Guitar TAB ve violin shared canonical authority ile kendi mevcut quality-gated consumer sınırlarını kullanır.

Stage I:

- exact canonical array'i korur,
- product PASS olmadan solver/output yoluna geçmez,
- REVIEW/BLOCK durumlarında partial definitive output üretmez,
- teacher approval, sharing veya delivery authority kazanmaz,
- generated fingering/TAB sonucunu source/teacher truth olarak etiketlemez.

## 11. Discovery

**IMPLEMENTED — Stage J.**

Discovery product presentation sadeleştirilmiştir; kaynak arama ana görevdir ve safe external-source action korunur.

`FOUND != SOURCE VERIFIED != MUSICALLY VERIFIED != TEACHER APPROVED`

Discovery musical truth veya teacher approval üretmez.

## 12. Chromatic tuner

**IMPLEMENTED — Stage K.**

Package 11 chromatic tuner'ın pitch-analysis ve microphone-local privacy davranışı değiştirilmeden presentation compact hale getirilmiştir.

Primary tuner controls görünür ve erişilebilir kalır; secondary calibration/readout/help bounded details altında toplanır.

## 13. Student/share readiness

**IMPLEMENTED as readiness UI / AUTHENTICATED DELIVERY OUT OF SCOPE — Stage L.**

Stage L mevcut Package 12 exact-revision zincirini öğretmen ürün akışına bağlar:

- exact teacher approval,
- explicit exact-recipient authorization,
- exact-revision quality/revalidation eligibility.

Yalnız mevcut evaluator `eligible` sonucu verirse UI `ready_exact_revision` durumuna ulaşabilir.

Kritik invariant:

`READY_EXACT_REVISION != DELIVERED_TO_STUDENT`

Stage L sonucu her zaman delivery açısından fail-closed sınırdadır:

- `deliveryState = not_implemented`
- `deliveryAllowed = false`
- link/token/URL/payload/content bytes üretilmez,
- student account/authentication oluşturulmaz,
- persistence/database/backend/network/email/message delivery eklenmez.

Gerçek authenticated student delivery A–L roadmap kapanışının dışında, ayrı security/application architecture review gerektirir.

## 14. Mobile and accessibility

**IMPLEMENTED for bounded browser/product proofs; platform assistive-technology manual QA remains separate.**

Current product stages retain/prove:

- semantic native controls,
- visible keyboard focus,
- bounded teacher inputs/fieldsets,
- approximately 44px minimum interactive targets in covered flows,
- narrow/mobile-safe browser layouts,
- textual `aria-live` state where dynamic feedback is required,
- non-color-only quality/status communication,
- accessible canonical note-selection controls,
- real Chrome desktop + narrow viewport regression proof in CI.

A–L closure does **not** claim completed manual iPhone Safari + VoiceOver or Android Chrome + TalkBack certification unless separately recorded by operational QA.

## Stage map — production closure

| Stage | Production status | Bounded delivered capability |
|---|---|---|
| A — Teacher UI simplification | **IMPLEMENTED** | simpler teacher product navigation/copy, technical details grouping, accessible controls |
| B — Score runtime stabilization | **IMPLEMENTED** | pinned runtime, fail-closed poisoned-frame retry, responsive/narrow browser handling |
| C — Measure/note selection | **IMPLEMENTED / BOUNDED** | exact canonical measure/note selection + reviewed renderer hit-test/highlight bridge |
| D — Quality overlay | **IMPLEMENTED / BOUNDED** | report-backed accessible PASS/REVIEW/BLOCK and finding presentation |
| E — Visual bounded note editor | **IMPLEMENTED / BOUNDED** | step/alter/octave/durationValue teacher intent only |
| F — Undo/revalidation/rerender | **IMPLEMENTED / BOUNDED** | immutable undo, mechanical canonicalization, corrected materialization/revalidation, evidence-backed rerender |
| G — PASS/REVIEW/BLOCK routing | **IMPLEMENTED** | existing quality decisions mapped to product routing without new truth authority |
| H — Review playback | **IMPLEMENTED / BOUNDED** | safe explicit non-definitive REVIEW preview or withheld playback |
| I — Guitar TAB + violin integration | **IMPLEMENTED / BOUNDED** | PASS-gated instrument product actions using existing consumer gates |
| J — Discovery simplification | **IMPLEMENTED** | source-search-first presentation without verification claims |
| K — Compact tuner | **IMPLEMENTED** | compact accessible tuner presentation with microphone-local privacy preserved |
| L — Student/share UI | **IMPLEMENTED as readiness only** | exact-revision Package 12 readiness UI; authenticated delivery remains out of scope |

## Roadmap closure invariant

Stages A–L are merged as their **bounded product capabilities**. This does not mean:

- every OMR result is musically correct,
- structural validity proves source fidelity,
- PASS equals teacher approval,
- teacher approval equals sharing authorization,
- sharing readiness equals student delivery,
- renderer output is semantic authority,
- unsupported correction classes may be guessed or normalized.

When evidence is incomplete, ambiguous, stale or outside the documented bounded contract, the product must continue to abstain, REVIEW, withhold, or BLOCK rather than invent certainty.
