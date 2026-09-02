# SesliTab Teacher Score Editor Architecture

Tarih: 2 Eylül 2026  
Durum: **Stage A–L bounded product roadmap ve `SESLITAB-EDITOR-INTEGRATION-01` STI-00–16 protected `main` üzerinde production durumundadır. STI-17 physical iPhone Safari acceptance henüz tamamlanmamıştır.**

Bu belge, öğretmen çalışma alanı, score runtime, Editor Core, Rendering Layer, quality routing ve Package 12 readiness sınırları için canonical production mimari referanstır. SHA, PR ve workflow numaraları audit kanıtıdır; mimari sözleşmenin kendisi değildir.

Machine-readable current integration snapshot: `docs/sti-18-runtime-integration-manifest.json`.

## Status vocabulary

- **PRODUCTION** — bounded capability production `main` kodu ve ilgili testlerle mevcuttur.
- **BOUNDED** — yalnız açıkça kanıtlanan veri/sözleşme alanında çalışır; unsupported veya belirsiz durum fail-closed kalır.
- **OUT_OF_SCOPE** — mevcut ürün özelliği değildir; ayrı bir geliştirme ve güvenlik sözleşmesi gerekir.
- **BLOCKED_BY_CONTRACT** — mevcut sözleşme bilinçli olarak ilerlemeye izin vermez.
- **PENDING_HUMAN_DEVICE_GATE** — otomasyonla kapatılamayan fiziksel cihaz acceptance kanıtı beklenir.

## 1. Product purpose

SesliTab, görme engelli, az gören ve gören öğrenciler için öğretmen denetimli, erişilebilir ve yarı otomatik bir müzik eğitim uygulamasıdır.

Amaç yalnızca PDF → MusicXML dönüşümü değildir. Sistem; nota, ritim, TTS, playback, Guitar TAB, violin ve tuner çıktılarında belirsizliği gizlemeden öğretmenin inceleme, exact note selection, bounded correction ve exact-revision approval kararını korur.

Temel ilke:

`Structural validity != musical correctness`

Parse edilebilir veya yapısal olarak geçerli MusicXML, kaynak görüntüyle ya da müzikal olarak doğru olduğunu tek başına kanıtlamaz.

## 2. Current production status

Protected production `main`:

`a21c1533b919554dd00d0f9852ab865b52e8f475`

Bu commit post-merge CI run #527 üzerinde `test-and-build` ile doğrulanmıştır ve live Render deployment aynı exact commit üzerinde gözlenmiştir.

Current upstream runtime pins:

- ST Score Editor Core `2e6b975b4b6b8b558593ca43132309848dc3ccab`;
- ST Score Rendering Layer `a8961e0e68a950cbe980162e23c09f23f0ce5d0a`;
- Rendering contract `0.2.0`, OSMD `2.1.2`;
- Editor browser/runtime contract version `1.0.0`.

Integration program status: **17/19**. STI-00–16 complete; STI-17 physical iPhone Safari is `PENDING_HUMAN_DEVICE_GATE`; STI-18 documentation synchronization is prepared but final acceptance wording cannot close before STI-17.

Package 8B'nin gerçek eğitim verisi/training sonucu yoktur; araştırma sözleşmesi production modeline kanıt sağlamaz. `READY_EXACT_REVISION`, yalnız Package 12 readiness sonucudur; öğrenci hesabı, kalıcı yetki veya teslimat değildir.

## 3. High-level architecture

```text
PDF -> mevcut OMR Gateway/Audiveris sınırı -> MusicXML
MusicXML / TAB -> parser + normalization
  -> canonical NoteObject[] + timing
  -> structural / quality / provenance evidence
  -> PASS / REVIEW / BLOCK consumer routing
  -> TTS / playback / MIDI / Guitar TAB / violin / score presentation

Teacher score interaction:
physical tap
  -> ST Score Rendering Layer hitTestNoteDetailed
  -> current renderEpoch + source correlation validation
  -> exact ScoreNoteRef
  -> SesliTab canonical/current-revision resolver
  -> exact ST Score Editor Core manifest token
  -> Editor semantic selection
  -> SMuFL keypad
  -> one Editor score+notation commit
  -> exact MusicXML materialization
  -> SesliTab structural/product revalidation
  -> one immutable Package 8 product revision
  -> rerender with fresh renderer correlation
  -> exact surviving selection rebind or safe clear
```

Canonical note/timing modeli ve current immutable product revision, product consumer'ların ortak domain kanıtıdır. UI, renderer, Discovery veya herhangi bir projection kendi pitch, duration, onset, voice, staff, tie, slur, tuplet veya measure anlamını icat edemez.

## 4. Teacher workflow

Teacher-facing bounded workflow:

1. Eseri açar ve score/çıktıları görür.
2. Visible score üzerinden exact current note seçer; ordinary selection quality marker gerektirmez.
3. Gerekirse quality marker aynı exact selection modeline navigasyon sağlar.
4. SMuFL keypad yalnız current exact Editor selection/target sözleşmesi sağlanıyorsa eylem sunar.
5. Bir keypad commit'i bir Editor score+notation revision veya hiçbiri üretir.
6. SesliTab sonucu MusicXML'e materialize eder, structural/product revalidation yapar ve tek immutable Package 8 product revision oluşturur.
7. Renderer yeni içerikle rerender edilir; eski hit evidence stale sayılır; surviving exact selection güvenli biçimde rebind edilir veya temizlenir.
8. Undo/redo eski product revision ID'sine pointer geri taşımak yerine yeni immutable product revision üretir ve aynı revalidation/rerender/rebind zincirini kullanır.
9. Teacher approval exact current revision'a bağlanır.
10. Quality/share readiness sonucu ayrı evidence olarak değerlendirilir.

## 5. Revision lifecycle

```text
original/imported revision
        ↓
exact current selection
        ↓
Editor Core bounded commit
        ↓
MusicXML materialization
        ↓
SesliTab structural/product revalidation
        ↓
new immutable Package 8 revision
        ↓
rerender + fresh renderer correlation
        ↓
exact rebind or safe clear
        ↓
exact-revision teacher approval
        ↓
quality/share eligibility evaluation
```

Automatic/imported revision immutable kalır. Correction eski revision'ı overwrite etmez. Editor Core local score/notation history, SesliTab product revision kimliği yerine geçmez. Product undo/redo yeni immutable revision ID oluşturur; eski semantic state gerektiğinde current product revision kimliği altında validated Editor session'a yeniden hydrate edilir. Daha sonraki correction/undo/redo önceki approval'ı otomatik olarak geçerli kılmaz.

## 6. Score runtime

Production score runtime build sırasında exact ST Score Rendering Layer revision `a8961e0e68a950cbe980162e23c09f23f0ce5d0a` üzerinden hazırlanır.

Admission contract:

- score renderer contract `0.2.0`;
- OSMD `2.1.2`;
- manifest file inventory, byte size ve SHA-256 doğrulanır;
- runtime source `hitTestNoteDetailed` ve `renderEpoch` yüzeylerini içermelidir.

Runtime sınırları:

- score render ve lifecycle hata durumları fail-closed temizlenir;
- stale source/render evidence kabul edilmez;
- renderer instance değişiminde textual epoch tek başına global identity sayılmaz; source correlation ile birlikte değerlendirilir;
- renderer-only recovery OMR'yi yeniden çalıştırmaz;
- corrected/undo/redo current revision için revalidated product MusicXML varsa recovery bunu tercih eder;
- exact current selection yeni render üzerinde hâlâ kanıtlanabiliyorsa highlight rebind edilir, aksi halde temizlenir.

Primary implementation: `src/scoreViewUi.js`, `src/services/scoreRendererConsumer.js`, `src/services/rendererPrERecovery.js`, `scripts/prepareScoreRuntime.js`.

## 7. Renderer boundary

Renderer yalnız **presentation / interaction layer**'dır.

Renderer:

- canonical score'un sahibi değildir;
- müzikal semantic authority değildir;
- canonical score'u mutate etmez;
- teacher approval üretmez;
- correction engine değildir;
- quality veya provenance kararı vermez.

Selection için tek admitted yol exact renderer hit evidence'dır. Semantic identity olarak şunlar kullanılamaz:

- DOM/SVG id;
- görünen pitch label;
- nearest note;
- pitch-nearest;
- SVG/geometry proximity;
- `ScoreNoteRef.noteIndex`'in global identity gibi kullanılması.

Hit evidence stale, ambiguous, source-mismatched veya current render correlation ile uyuşmuyorsa selection abstain eder.

## 8. Editor Core and correction boundary

Production build exact ST Score Editor Core revision `2e6b975b4b6b8b558593ca43132309848dc3ccab` üzerinden browser runtime hazırlar.

Admission contract:

- browser contract `ST_SCORE_EDITOR_CORE_BROWSER_BUNDLE`;
- browser/runtime version `1.0.0`;
- global `STScoreEditorCoreRuntime`;
- upstream manifest byte size ve SHA-256 exact match;
- `externalImports = 0`;
- network, persistence, server revision authority, approval authority ve publication authority disabled.

Authority split:

- **ST Score Editor Core** — new SMuFL keypad score/notation mutation authority;
- **SesliTab Package 8** — immutable product revision/audit authority;
- **ST Score Rendering Layer** — display/lifecycle/exact hit-test authority only;
- legacy dual-write forbidden.

Basic keypad surface includes bounded duration/rest/accidental/dot actions admitted by the current runtime/host contract.

Advanced actions are explicit-target only:

- `tie.edit` — exactly two explicit revision-bound note endpoints;
- `slur.edit` — exactly two explicit revision-bound note endpoints;
- `tuplet.triplet` — exactly three consecutive revision-bound `EVENT_RANGE` addresses inside one exact measure voice, with canonical timing proving the admitted 3:2 written base.

Known bounded triplet limitation:

- triplet removal/transformation requiring canonical onset/duration retiming is not implemented;
- an already-present tuplet state requiring retiming fails closed.

No endpoint or event range is inferred from nearest notation object, pitch or geometry. Exact source/current notation evidence that cannot be safely represented is not invented.

## 9. Atomic commit, materialization and revalidation

A production keypad mutation follows one serialized pipeline:

```text
Editor commit
→ semantic score+notation result
→ exact MusicXML materialization
→ SesliTab parser / structural validation
→ immutable Package 8 product revision
→ current-revision selection/quality/routing refresh
→ renderer content replacement
→ fresh render correlation
→ exact surviving selection rebind or clear
```

An Editor-only revision is not allowed to become visible product truth while Package 8/render state remains stale. A failed materialization/revalidation does not get labeled as a successful product revision.

Current product MusicXML provenance is stored separately from raw/source OMR provenance. Corrected product state is not written back into the raw-source evidence registry as if it were original source evidence.

## 10. Quality routing and playback

Stage G maps applicable current-revision consumer evidence to `PASS`, `REVIEW` or `BLOCK` with fail-closed defaults. Corrected revisions do not silently inherit an old source quality report.

Quality marker navigation and ordinary direct note tap share the same exact current selection model. Quality marker is not required for ordinary note selection.

Guitar TAB and Violin routes are recomputed against current revision projection. If current evidence cannot justify definitive use, the UI remains REVIEW/BLOCK and exposes the reason rather than silently opening a consumer.

Playback is a separate bounded product policy. Renderer/editor readiness is not playback authority. A renderer/editor failure must not itself disable an otherwise permitted playback path. Playback does not gain authority to override independent musical/quality policy.

## 11. Guitar TAB / Violin consumers

Stage I uses current-revision routing for existing Package 9 Guitar TAB and Package 10 Violin consumers.

- PASS + applicable definitive permission may open bounded action.
- REVIEW/BLOCK does not get silently upgraded to PASS.
- unsupported, ambiguous veya unplayable yapı partial/tahmini TAB veya fingering olarak source truth şeklinde gösterilmez.
- generated string/fret/position evidence teacher approval veya source truth değildir.
- Stage I `teacherApproved`, `shareAuthorized` veya `studentDeliveryAuthorized` üretmez.

## 12. Discovery

Stage J Discovery yalnız source-finding presentation'ıdır:

`FOUND != SOURCE VERIFIED != MUSICALLY VERIFIED != TEACHER APPROVED`

Arama seçenekleri, trust notice ve güvenli external source action mevcuttur. Discovery verification authority kazanmaz; bulunan kaynak normal intake, provenance, quality ve teacher-review akışına geri girer.

## 13. Tuner

Stage K, Package 11 chromatic tuner'ı compact presentation'a taşır; tuner motorunu değiştirmez.

```text
device microphone
  -> browser-local Web Audio / bounded pitch detector
  -> note, Hz, cents guidance
  -> local display
```

Mikrofon explicit user action ile başlar/durur. Ses upload, persistence veya recording'e gitmez.

## 14. Package 12 share readiness

Package 12'nin production bounded zinciri ayrı kanıt türleridir:

1. **T1 share authorization** — exact revision + exact approval + recipient label binding; in-memory metadata.
2. **T2 share eligibility** — automatic root için live exact source/provenance/quality eligibility.
3. **T3 corrected revalidation** — bounded pitch/position corrected revision evidence.
4. **T4 structural revalidation** — bounded duration/timeline, voice/staff, tie/chord ve permitted undo-history evidence.

Stage L current workspace revision'ını applicable evaluator'larla kontrol eder. Teacher approval, authorization, revalidation ve eligibility birbirinin yerine geçmez.

## 15. Student delivery boundary

`READY_EXACT_REVISION != DELIVERED_TO_STUDENT`

Stage L bounded readiness UI şunları üretmez:

- authenticated student account veya identity verification;
- persistent authorization/grant;
- share token, invite code veya share URL;
- downloadable payload/content bytes;
- student portal access;
- backend/network/email/message delivery.

Production sonucu `deliveryState = not_implemented` ve `deliveryAllowed = false` olarak fail-closed'dur. Gerçek öğrenci teslimatı ayrı bir security/application architecture programıdır.

## 16. Security invariants

- Original/imported MusicXML ve automatic revision sessizce overwrite edilmez.
- Structural validity musical correctness değildir.
- Her approval exact current revision'a bağlıdır.
- Correction/undo/redo eski approval veya authorization'ı miras almaz.
- T1/T2/T3/T4 kanıtı exact source, revision, lineage ve applicable scope'a bağlıdır.
- `PASS`, teacher approval değildir; teacher approval, share eligibility değildir.
- `shareEligible`, authenticated access değildir.
- `teacherApproved`, `studentDelivered` anlamına gelmez.
- Renderer, Discovery ve UI semantic authority değildir.
- Glyph/codepoint edit target değildir; semantic keypad action identity ayrı contract'tır.
- Unsupported, malformed, stale veya ambiguous evidence tahminle tamamlanmaz.
- Package 12 readiness network delivery veya student access grant değildir.

## 17. Accessibility invariants

STI-16 production evidence şunları kapsar:

- native control semantics ve keyboard interaction;
- visible focus ve keypad DOM replacement sonrası logical focus retention;
- VoiceOver-oriented `aria-label`, `aria-disabled`, `aria-describedby` semantics;
- disabled state'in yalnız gizli veya yalnız renk tabanlı olmaması;
- covered keypad controls için minimum 44px target;
- safe-area top/bottom/left/right bounds;
- narrow portrait ve narrow landscape layout;
- supporting Chrome device-metrics proof at exact `320x568`, `568x320`, `1280x900`;
- sekiz tekrarlı exact selection → edit → revalidation → rerender/focus → immutable undo cycle.

Bu automated evidence fiziksel iPhone Safari + VoiceOver sertifikasyonu değildir. STI-17 ayrı `PENDING_HUMAN_DEVICE_GATE` olarak kalır.

## 18. Fail-closed rules

- Missing/malformed quality evidence → REVIEW/BLOCK; PASS varsayılanı yoktur.
- Exact identity/revision/source/render correlation kanıtlanamıyorsa selection veya edit ilerlemez.
- Advanced endpoint/range ambiguous ise nearest fallback yapılmaz.
- Unsupported triplet retiming operation reddedilir.
- Corrected MusicXML/materialization/revalidation kanıtı yoksa source XML corrected output gibi render edilmez.
- Renderer recovery current corrected XML'i kanıtlayamıyorsa sessizce eski source state'e dönmez.
- Stale hit evidence yeni renderer epoch/source correlation'da reddedilir.
- Unsupported correction scope, stale authorization/evidence ve recipient mismatch reddedilir.
- Physical iPhone/Safari kanıtı yoksa STI-17 complete yazılmaz.

## 19. Stage A–L completion matrix

| Stage | Purpose | Production status | Safety boundary |
|---|---|---|---|
| A | Teacher UI simplification | **PRODUCTION** | Presentation-only; Package 8 semantics unchanged |
| B | Score runtime stabilization | **PRODUCTION** | Pinned runtime, lifecycle cleanup, no semantic invention |
| C | Measure/note selection | **PRODUCTION / BOUNDED** | Exact current identity; stale renderer evidence rejected |
| D | Quality overlay | **PRODUCTION / BOUNDED** | Report-backed and shares exact selection model |
| E | Visual/SMuFL editor | **PRODUCTION / BOUNDED** | Editor Core single mutation authority; explicit targets; no dual-write |
| F | Undo/revalidation/rerender | **PRODUCTION / BOUNDED** | Immutable product lineage, materialization, revalidation, fresh rerender/rebind |
| G | PASS/REVIEW/BLOCK routing | **PRODUCTION / BOUNDED** | Current-revision evidence; no PASS invention |
| H | Review/playback policy | **PRODUCTION / BOUNDED** | Playback authority separated from renderer/editor readiness |
| I | Guitar TAB/Violin integration | **PRODUCTION / BOUNDED** | Current-revision route required |
| J | Discovery presentation | **PRODUCTION / BOUNDED** | Source-finding only; no verification authority |
| K | Compact tuner | **PRODUCTION / BOUNDED** | Explicit mic action; local audio only |
| L | Student/share readiness UI | **PRODUCTION / BOUNDED** | Readiness only; actual delivery **BLOCKED_BY_CONTRACT** |

## 20. Out-of-scope capabilities

The following are not unfinished STI-17/18 or Stage L details:

- authenticated student accounts;
- persistent student identity;
- backend student delivery;
- permanent share authorization;
- share token/invite/share URL service;
- student portal;
- cloud persistence;
- server-side authorization;
- new OMR/recognizer behavior;
- universal musical verification;
- Package 8B production model training/replacement;
- native application productisation.

## 21. Physical iPhone Safari acceptance

STI-17 is the remaining blocking human-device gate. It must run against exact live production, not Chrome responsive simulation.

Current acceptance target:

- SesliTab production commit: `a21c1533b919554dd00d0f9852ab865b52e8f475`;
- live URL: `https://seslitab-app.onrender.com`;
- tracking issue: #191.

Required real-device coverage includes PDF and MusicXML intake, score persistence, direct exact note tap, basic and supported advanced keypad edits, one atomic product revision, rerender/rebind, immutable undo, quality/routing coexistence, playback independence from renderer/editor readiness, renderer-only recovery, portrait/landscape usability and accessibility sanity.

Chrome/desktop/device-metrics evidence is supporting regression evidence only and cannot close STI-17.

## 22. CI / production verification model

Production verification is evaluated as:

```text
protected main
  + required CI: test-and-build
  + full Node regression suite
  + production build
  + score runtime browser proof
  + PR-C keypad browser proof
  + PR-D Editor→product pipeline browser proof
  + PR-E quality/routing/recovery coexistence browser proof
  + PR-F accessibility/mobile regression browser proof
```

Post-merge CI run #527 passed on exact production `main` `a21c1533b919554dd00d0f9852ab865b52e8f475`.

Build prepares upstream runtimes from reviewed exact SHAs rather than committing generated runtime directories to source control.

## 23. Future development rules

- Begin every change with fresh-read of protected `main`, required checks, open PR/issues, code, tests and runtime evidence.
- Keep documentation-only changes separate from behavior changes.
- Do not make production code fit stale documentation; classify code/document conflicts explicitly.
- Preserve exact revision, source, lineage, approval, quality and share evidence boundaries.
- Add no authentication, persistence, token, URL or network delivery by implication.
- Do not make renderer, Discovery, UI, glyphs or generated instrument output a semantic authority.
- Do not weaken fail-closed target selection, stale-hit rejection, branch protection or required CI.
- Require focused tests, full regression, build and applicable browser proof before calling a bounded capability production.
- Do not mark `SESLITAB-EDITOR-INTEGRATION-01` fully accepted until STI-17 physical iPhone Safari evidence passes and STI-18 final closure is synchronized to that evidence.
