# CE-BRIDGE-01 — Smoosic Teacher Structural Edit → CE-STRUCT Revalidation Design

Tarih: 29 Eylül 2026  
Linear: SES-108  
Primary repository: khfy7wpr5p-maker/seslitab-guitar-reader  
Related engine: khfy7wpr5p-maker/st-omr-correction-engine  
Durum: DESIGN SPEC — HUMAN REVIEW REQUIRED BEFORE IMPLEMENTATION PLAN

## 1. Amaç

CE-BRIDGE-01, öğretmenin Smoosic içinde yaptığı açık yapısal düzenlemeyi SesliTab'ın immutable revision akışına güvenli biçimde bağlar ve yapısal değişikliğin bütünlüğünü CE-STRUCT-01 sözleşmesiyle bağımsız olarak yeniden doğrular.

Hedef akış:

SesliTab accepted MusicXML
→ Smoosic editor
→ explicit teacher action provenance
→ explicit Apply
→ SES-68 padding-rest normalization
→ teacher structural action mapping
→ CE-STRUCT TeacherStructuralPatchSetV1
→ CE projection + independent structural revalidation
→ exact candidate MusicXML conformance check
→ new immutable teacher_corrected revision
→ fresh SesliTab quality analysis
→ separate explicit teacher approval

Bu paket otomatik müzik düzeltme yetkisi eklemez. CE-STRUCT PASS müzikal doğruluk veya öğretmen onayı değildir.

## 2. Fresh-read production gerçeği

Bu spec yazılmadan önce exact fresh-read yapıldı.

SesliTab:
- protected main: be6484915ff7d0a04eab1424e30ef63db4d771b5
- required check: test-and-build
- SES-68 PR #277: OPEN + DRAFT, henüz main'e merge edilmemiş
- PR #277 current head: 402acc62051ab2e05c2714644967fbe52891a5f7
- SES-68 base, güncel main'in gerisindedir ve merge öncesi exact-main reconciliation gerektirir

Correction Engine:
- main: c11d35b35321c5d7761e7033ce4ce1d91cbeb1c2
- CE-STRUCT-01 PR #96 merged
- CE-STRUCT implementation exact merged head: 533f375ed399f0d31722b724a28c81b14ae6118a
- CE-STRUCT final qualification: 353 tests passed, npm run check passed
- deploy yapılmadı

Bu nedenle:
- design/spec çalışması şimdi yapılabilir;
- SES-108 production implementation, SES-68 merge edilip exact main yeniden okunmadan başlayamaz;
- SES-68 branch'i veya PR #277 bu spec çalışmasında değiştirilmez.

## 3. Bağlayıcı önceki sözleşmeler

### SES-68

SES-68 yalnız Smoosic'in import sırasında ürettiği editor-padding rest nesnelerini kesin provenance ile tanır ve export sonrası yalnız bu ispatlanmış padding rest'leri MusicXML note → forward olarak normalize eder.

SES-68 provenance:
- teacher intent değildir;
- MusicXML source truth değildir;
- gerçek kaynak rest'i silme yetkisi vermez;
- note insertion/deletion veya diğer yapısal öğretmen düzenlemelerini otomatik olarak desteklemez.

CE-BRIDGE-01 bu lane'i aynen korur.

### CE-STRUCT-01

CE-STRUCT-01 aşağıdaki teacher-only operation vocabulary'yi sağlar:
- INSERT_EVENT
- REMOVE_EVENT
- CHANGE_EVENT_DURATION
- CHANGE_EVENT_VOICE
- CHANGE_EVENT_STAFF
- CHANGE_EVENT_TIE
- CHANGE_MEASURE_METER

TeacherStructuralPatchSetV1:
- exact baseSourceId;
- exact SHA-256 baseGraphFingerprint;
- explicit teacher authorization actionId;
- ordered patch list;
- insert/remove için exact eventIndex;
- immutable atomic projection;
- deterministic inverse;
- independent structural revalidation;
- exact rollback proof;
- automaticApplyAuthority=false;
- finalTeacherApproval=false;
- studentShareEligible=false;
- musicXmlWriteBackAuthority=false;
- learningAuthority=false.

Arbitrary edited MusicXML diff'i teacher intent olarak kullanılamaz.

## 4. Temel mimari karar

CE-BRIDGE-01 üç farklı kanıt türünü birbirine karıştırmaz:

1. Editor-generated padding provenance
   - SES-68 tarafından üretilir.
   - Yalnız editor-padding rest normalizasyonu içindir.

2. Explicit teacher structural action provenance
   - Öğretmenin Smoosic içinde yaptığı gerçek komutlardan yakalanır.
   - CE structural patch üretiminin tek yetkili intent kaynağıdır.

3. Candidate MusicXML
   - Düzenlemenin görsel/editor temsili ve sonuç materyalidir.
   - Teacher intent çıkarımı için kaynak değildir.
   - CE projection ile exact conformance kanıtı olmadan teacher-corrected revision olamaz.

Bu ayrım değişmezdir.

## 5. Correction Engine çalışma sınırı

Mevcut st-omr-correction-engine paketi browser runtime sağlamıyor ve CE-STRUCT graph fingerprint sözleşmesi Node tarafındaki SHA-256 uygulamasına bağlıdır.

Bu nedenle SesliTab frontend içine CE-STRUCT kodunu kopyalamak, yeniden yazmak veya host-local bir taklit validator üretmek kabul edilmez.

Seçilen entegrasyon yaklaşımı:

### Pinned CE-STRUCT browser runtime prerequisite

Correction Engine kendi reposunda yalnız CE-STRUCT teacher structural lane'i için bounded, browser-consumable bir runtime artifact üretmelidir.

Bu prerequisite:
- ayrı bounded engine PR'ı olmalıdır;
- existing CE-STRUCT public semantics'i değiştirmemelidir;
- exact SHA-256 fingerprint ile Node sonucu byte-for-byte aynı olmalıdır;
- network, persistence, authentication, approval, student sharing veya automatic correction authority içermemelidir;
- E11A ve existing automatic correction lane'i bundle'a taşımak zorunda değildir;
- manifest içinde source revision, contract version, artifact digest ve forbidden-authority flags bulunmalıdır;
- browser artifact external network çağrısı yapmamalıdır.

SesliTab daha sonra mevcut Score Renderer ve Editor Core desenine benzer biçimde exact Correction Engine commit'ine pinli build-time runtime hazırlamalıdır.

Yeni Render service/domain açılmaz.

Bu prerequisite tamamlanamazsa CE-BRIDGE-01 implementation BLOCKED olarak kalır; host içinde engine mantığı kopyalanmaz.

## 6. Runtime manifest sözleşmesi

Önerilen bounded manifest:

contract: ST_OMR_CORRECTION_ENGINE_CE_STRUCT_BROWSER
contractVersion: 1.0.0
engineSourceRevision: exact commit SHA
artifact: ce-struct-browser-runtime.js
global veya ESM export: bounded CE-STRUCT surface
sha256: exact artifact digest
externalImports: 0 veya açıkça izin verilmiş bounded inventory
networkCapable: false
persistenceCapable: false
authenticationAuthority: false
automaticApplyAuthority: false
finalTeacherApprovalAuthority: false
studentShareAuthority: false
learningAuthority: false
musicXmlWriteBackAuthority: false

SesliTab prepare script:
- exact engine revision fetch eder;
- runtime build'i çalıştırır;
- upstream manifest'i doğrular;
- artifact byte-size ve SHA-256 doğrular;
- yalnız doğrulanmış artifact'i public/generated runtime alanına kopyalar;
- source revision mismatch'te build fail eder.

Runtime pin güncellemesi ayrı review evidence gerektirir.

## 7. Smoosic teacher structural action provenance

CE-BRIDGE, final XML'i diff ederek teacher intent üretmez.

Smoosic editor boundary'sinde yeni versioned action manifest gerekir.

Önerilen contract:

TeacherStructuralActionManifestV1:
- version
- sourceRevision
- editorSessionId
- actionId
- operations: ordered non-empty array
- baseMappingFingerprint
- createdFromExplicitTeacherApply: true

Her operation:
- kind
- exact target locator veya inserted-event payload
- exact before snapshot
- exact after payload
- action order

Bu manifest yalnız teacher interaction sırasında yakalanan editor command/event verisinden üretilebilir.

Undo/redo sonrası export edilen manifest, yalnız current editor state'e etkisi halen bulunan net structural teacher actions'ı temsil etmelidir. History'de undo edilmiş bir action final patch set'e taşınmamalıdır.

## 8. Import-time exact identity bridge

Existing event için teacher action'ın CE eventId + measureKey + eventIndex'e dönüşebilmesi adına import sırasında exact identity mapping kurulmalıdır.

Mapping en az:
- SesliTab sourceRevision
- canonical source identity
- partId
- measureKey
- canonical event identity
- source eventIndex
- Smoosic note object identity
- supported editor locator
- raw MusicXML ordinal where applicable

Kurallar:
- pitch label ile eşleme yok;
- görünür measureNumber tek başına kimlik değildir;
- nearest note fallback yok;
- SVG geometry/proximity fallback yok;
- candidate XML ordinal'i tek başına authority değildir;
- duplicate/ambiguous mapping fail closed;
- sourceRevision değişince mapping stale olur;
- import-time mapping editor clone/adoption sırasında exact invariant checks ile taşınabilir;
- identity kanıtı kaybolursa structural Apply desteklenmez.

SES-68 padding-rest identity registry bu mapping'den ayrı tutulur.

## 9. Existing-event structural operations

CHANGE_EVENT_DURATION, CHANGE_EVENT_VOICE, CHANGE_EVENT_STAFF ve CHANGE_EVENT_TIE:

- teacher action exact imported event identity'ye bağlı olmalıdır;
- host import mapping üzerinden CE eventId, measureKey ve base before değerini bulur;
- teacher payload'daki before değeri base/current expected state ile eşleşmelidir;
- stale mismatch fail closed;
- after değeri yalnız teacher action'dan gelir;
- host komşu notalardan, meter'dan veya XML diff'inden after değer tahmin etmez.

Aynı event için birden fazla sequential edit varsa ordered action semantics korunur.

## 10. INSERT_EVENT

INSERT_EVENT yalnız teacher'ın açıkça eklediği nota/rest için desteklenir.

Gerekli explicit bilgi:
- target measure identity;
- exact insertion position veya exact neighbor-bounded position;
- isRest;
- onset;
- duration;
- voice;
- staff;
- pitch bilgisi note ise;
- supported metadata;
- stable new event identity.

Yeni event id host tarafından action-bound collision-resistant bir kimlik olarak üretilebilir; bu kimlik müzikal kanıt değildir.

Eksik müzikal alan:
- komşu notadan;
- measure boşluğundan;
- key signature'dan;
- Smoosic'in otomatik padding davranışından;
- görsel konumdan

tahmin edilmez.

Complete explicit event üretilemiyorsa UNSUPPORTED_STRUCTURE.

Teacher tarafından eklenen gerçek rest ile SES-68 editor-padding rest kesinlikle karıştırılmaz. Padding tracker yalnız import sırasında Smoosic factory tarafından yaratıldığı kanıtlanan rest'leri normalize edebilir.

## 11. REMOVE_EVENT

REMOVE_EVENT:
- exact imported/current event target ister;
- exact full before snapshot ister;
- exact current eventIndex ister;
- teacher explicit delete action provenance ister.

Final candidate XML'de event'in kaybolmuş olması tek başına delete intent değildir.

Target stale, missing veya ambiguous ise fail closed.

## 12. CHANGE_MEASURE_METER

Meter change:
- exact measureKey üzerinden bağlanır;
- before state: beats, beatType, implicit, pickup;
- after state teacher action payload'dan gelir;
- measure insertion/deletion/reorder yok;
- visible measure number identity değildir;
- measure arithmetic'in dengelenmesi müzikal doğruluk değildir.

Smoosic meter UI action'ı exact measure identity sağlayamıyorsa bu milestone'da unsupported kalır.

## 13. Explicitly unsupported structural edits

CE-BRIDGE-01 şu değişiklikleri desteklemez:
- measure insert/delete/reorder/renumber;
- part insert/delete;
- arbitrary metadata mutation;
- beam topology mutation;
- slur mutation;
- ornament mutation;
- tuplet topology mutation;
- cross-staff relation reconstruction;
- arbitrary relation graph mutation;
- automatic missing note/rest inference;
- automatic meter correction;
- heuristic final-XML diff to intent;
- automatic structural correction;
- teacher learning/training write;
- student sharing/delivery;
- new database/object storage;
- new Render service/domain.

Unsupported action algılanırsa whole Apply fail closed olmalıdır; supported subset sessizce partial commit edilmemelidir.

## 14. Apply pipeline

Explicit Apply sırası:

1. Freeze starting sourceRevision and exact current teacher revision.
2. Request Smoosic export.
3. Validate postMessage origin, requestId, response version and sourceRevision.
4. Validate SES-68 paddingRestProvenance.
5. Validate TeacherStructuralActionManifestV1.
6. Confirm both proofs belong to the same starting sourceRevision/session.
7. Normalize only certified editor-padding rests.
8. Preserve existing part/divisions/voice representation normalizations only where SES-68/current lane already proves them safe.
9. Route actions:
   - non-structural existing bounded pitch/notation-only changes → existing S15 same-cardinality lane;
   - any CE structural operation → CE-BRIDGE structural lane.
10. Mixed structural + non-structural transaction:
   - first milestone defaults to unsupported unless one atomic mapping contract proves all changes;
   - no split partial commits.
11. Build exact base ScoreGraph from current immutable SesliTab revision using one canonical adapter.
12. Build TeacherStructuralPatchSetV1 only from explicit structural action manifest.
13. Bind baseSourceId and exact baseGraphFingerprint.
14. Invoke CE-STRUCT processSesliTabTeacherStructuralEdit.
15. Require projection.ok.
16. Require revalidation.integrityDecision=PASS.
17. Require teacherCorrectedRevisionEligible=true.
18. Require all CE authority flags remain false.
19. Parse normalized candidate MusicXML.
20. Convert candidate to the same canonical ScoreGraph representation.
21. Compare candidate graph with CE projected graph on exact supported structure/event order.
22. Reject undeclared XML semantic differences.
23. Materialize a new immutable teacher_corrected host revision.
24. Register exact candidate MusicXML against that revision.
25. Invalidate any prior approval/authorization/readiness that was bound to older revision.
26. Run fresh SesliTab quality analysis.
27. Rerender only from the accepted corrected revision.
28. Keep final teacher approval as separate explicit action.

Any failure before step 23 leaves the current source/revision authoritative.

## 15. Candidate MusicXML conformance

Candidate MusicXML is not teacher-intent authority, but after CE projection it must prove that the editor representation matches the accepted structural result.

Required comparison:
- sourceId/host source binding;
- measure count/order/key for admitted operations;
- event count/order;
- event identity mapping;
- note/rest identity;
- onset;
- duration;
- voice;
- staff;
- tie state;
- meter;
- pitch for inserted note payload;
- no undeclared semantic change.

Allowed representation normalization must be explicitly enumerated and already evidence-backed, for example:
- SES-68 certified padding-rest → forward normalization;
- reviewed part-id representation normalization;
- reviewed divisions-grid normalization;
- reviewed Smoosic voice-number representation normalization.

No new normalization may be introduced by convenience.

If candidate MusicXML cannot be proven equivalent to CE projected graph, result is CONFORMANCE_FAILED and no revision is committed.

## 16. Existing SesliTab structural revalidation

src/services/teacherStructuralCorrectionRevalidation.js already exists and serves Package 12 T4/share-readiness scope.

CE-BRIDGE must not replace or duplicate it.

Roles:

CE-STRUCT revalidation:
- proves declared structural patch integrity;
- proves no undeclared structural mutation;
- proves reversibility;
- classifies added/residual/resolved deterministic findings;
- decides structural integrity PASS/FAIL.

SesliTab T4 structural revalidation:
- evaluates current host teacher revision/history against existing SesliTab source/quality/share-readiness contracts;
- remains downstream host evidence;
- does not authorize CE structural patch application.

After CE-BRIDGE creates a new host revision, existing downstream quality/T4 evidence must be regenerated for the exact new revision where applicable. Old evidence is stale.

## 17. Status contract

Recommended new host-level structural outcomes:

APPLIED_STRUCTURAL
NO_CHANGE
UNSUPPORTED_STRUCTURE
INVALID_ACTION_PROVENANCE
STALE_SOURCE
AMBIGUOUS_IDENTITY
CE_RUNTIME_UNAVAILABLE
CE_CONTRACT_MISMATCH
CE_PROJECTION_FAILED
CE_REVALIDATION_FAILED
CONFORMANCE_FAILED
CONFLICT
PUBLISH_FAILED

Rules:
- unknown status → fail closed;
- malformed engine output → fail closed;
- runtime revision/contract mismatch → fail closed;
- CE PASS cannot be translated to teacher approved;
- error UI user-safe, internal structural evidence audit-safe.

## 18. Atomicity

Bir explicit Apply tek transaction semantiğine sahiptir.

Aşağıdakilerden biri başarısızsa hiçbir partial teacher-corrected revision üretilmez:
- padding provenance validation;
- structural action provenance;
- exact identity mapping;
- patch construction;
- CE projection;
- CE revalidation;
- candidate XML conformance;
- immutable host commit.

Source revision immutable kalır.

## 19. Concurrency ve stale revision

Apply başlangıcındaki exact revision id/sourceRevision freeze edilir.

Aşağıdakiler stale conflict üretir:
- editor export dönene kadar host revision değişmesi;
- structural mapping'in başka revision'a ait olması;
- CE base fingerprint mismatch;
- SES-68 proof sourceRevision mismatch;
- candidate action manifest sourceRevision mismatch;
- prior Apply'nin current revision'ı değiştirmiş olması.

Automatic retry, stale structural action'ı yeni revision'a replay etmez.

## 20. Approval ve downstream authority

Successful structural correction:
- teacher_corrected revision oluşturabilir;
- teacher_approved oluşturamaz;
- share eligibility oluşturamaz;
- student delivery oluşturamaz;
- learning dataset entry oluşturamaz.

Teacher approval:
- yalnız exact current corrected revision'a ayrı explicit action ile verilir;
- correction sonrası önceki approval geçersiz kalır.

Fresh quality analysis REVIEW/BLOCK dönerse CE structural integrity PASS olsa bile definitive downstream output açılmaz.

## 21. Accessibility

Yeni structural Apply durumu:
- yalnız renk ile anlatılmaz;
- status/alert semantics kullanır;
- keyboard-only akış bozulmaz;
- mevcut Smoosic editor erişilebilirliği geriye gitmez;
- unsupported/failed apply durumunda kullanıcıya kısa Türkçe açıklama verilir;
- engine iç error codes normal öğretmen yüzeyini işgal etmez;
- teacher action provenance debug verisi normal UI'da gösterilmez.

## 22. Security ve privacy

- Arbitrary postMessage kabul edilmez.
- Exact same-origin + source window + requestId + version kontrolü korunur.
- Payload size bounded olmalıdır.
- Prototype pollution / malformed nested objects reject edilir.
- Runtime artifact source revision ve SHA-256 ile pinlenir.
- Structural runtime network-capable değildir.
- No credentials/secrets added.
- No audio/student personal data involved.
- No new persistence.
- No new Render service/domain.
- OMR/Audiveris provider behavior unchanged.

## 23. Implementation scope by repository

### A. st-omr-correction-engine prerequisite

Only if user approves this spec and subsequent plan:
- add bounded CE-STRUCT browser runtime export;
- preserve CE-STRUCT public semantic behavior;
- exact SHA-256 parity tests;
- runtime manifest;
- no automatic policy widening;
- no service/deploy.

This should be a separate PR and must be merged/qualified before SesliTab pins it.

### B. seslitab-guitar-reader

Only after:
- SES-68 is merged;
- exact main fresh-read is repeated;
- CE runtime prerequisite is merged and pinned.

Likely areas, final paths determined by implementation-plan fresh-read:
- scripts/prepareCorrectionEngineRuntime.js
- runtime preparation/build wiring
- Smoosic editor action provenance module
- Smoosic export envelope
- src/smoosicEditorTabUi.js
- src/services/smoosicProductWriteback.js
- new bounded CE bridge adapter
- ScoreGraph/canonical adapter
- candidate MusicXML conformance validator
- focused tests
- browser verification script/fixture

Files are not pre-authorized by this design document; implementation plan must name exact paths after fresh-read.

## 24. Required test matrix

### Engine runtime prerequisite

1. browser runtime manifest exact contract/version.
2. pinned source revision included.
3. artifact digest valid.
4. SHA-256 fingerprint matches Node implementation on canonical fixtures.
5. TeacherStructuralPatchSetV1 behavior parity.
6. insert/remove eventIndex parity.
7. duration/voice/staff/tie/meter parity.
8. stale fingerprint fails closed.
9. revalidation PASS/FAIL parity.
10. reversibility parity.
11. authority flags remain false.
12. no network/persistence APIs exposed.
13. existing engine full regression passes.
14. npm run check passes.

### SesliTab bridge

1. missing structural action proof fails closed.
2. stale sourceRevision fails.
3. wrong editor session fails.
4. ambiguous imported event mapping fails.
5. padding provenance and structural provenance remain distinct.
6. certified padding rest is normalized.
7. teacher-created rest is never removed as padding.
8. explicit insert note maps to exact CE INSERT_EVENT.
9. explicit insert rest maps to exact CE INSERT_EVENT.
10. explicit remove maps to exact CE REMOVE_EVENT + eventIndex.
11. duration change maps exactly.
12. voice change maps exactly.
13. staff change maps exactly.
14. tie change maps exactly.
15. meter change maps exactly.
16. unsupported structural action aborts whole Apply.
17. mixed unsupported transaction does not partially commit.
18. CE runtime unavailable fails closed.
19. CE source revision mismatch fails closed.
20. CE projection failure preserves current revision.
21. CE revalidation failure preserves current revision.
22. candidate MusicXML mismatch with projected graph fails.
23. undeclared candidate XML change fails.
24. source MusicXML remains immutable.
25. new corrected revision is immutable.
26. previous approval is not inherited.
27. old quality/T4 evidence becomes stale.
28. fresh quality analysis runs for exact new revision.
29. CE PASS does not auto-approve.
30. existing pitch-only same-cardinality write-back remains unchanged.
31. SES-68 positive padding-rest regression remains green.
32. SES-68 tampered/stale proof regressions remain green.
33. postMessage origin/request/version protections remain green.
34. keyboard/status accessibility regression.
35. full npm test passes.
36. production npm run build passes.
37. applicable real-browser Smoosic Apply proof passes.
38. whole-diff Guardrails review finds no unrelated change.

## 25. Real-browser acceptance scenarios

At minimum:

Scenario A — existing note duration edit
- load accepted MusicXML;
- teacher edits duration;
- Apply;
- exact action proof captured;
- CE structural PASS;
- immutable corrected revision created;
- rerender reflects duration;
- approval remains unset.

Scenario B — teacher inserts a real rest
- import may also contain Smoosic padding rest;
- teacher inserts an intentional rest;
- Apply;
- SES-68 removes only certified padding rest;
- intentional teacher rest survives;
- CE INSERT_EVENT matches exact teacher payload;
- corrected revision produced only after conformance.

Scenario C — delete event
- exact imported event selected/deleted;
- action maps to eventId + measureKey + eventIndex;
- CE revert recreates exact source order.

Scenario D — stale editor
- host revision changes before Apply response;
- candidate rejected;
- no replay against newer revision.

Scenario E — unsupported structure
- measure insertion/reorder or unsupported relation edit;
- Apply is rejected atomically;
- source/current revision remains authoritative.

## 26. Whole-diff Guardrails review

Before implementation PR qualification verify:
- no direct main work;
- SES-68 semantics not weakened;
- padding-rest provenance not reused as teacher intent;
- no generic XML diff inference;
- no nearest-match identity fallback;
- no automatic note/rest invention;
- no existing source overwrite;
- no approval inheritance;
- CE automatic E11A policy unchanged;
- no new Render service/domain;
- no deploy;
- no OMR/Audiveris behavior change;
- no authentication/student-delivery scope expansion;
- no unrelated dependency/refactor;
- every new runtime pin/digest exact;
- full tests/build/browser proof reported honestly.

Critical/Important finding requires test-first repair before qualification.

## 27. Rollback

Engine runtime prerequisite:
- revert its bounded PR; existing Node CE-STRUCT remains unaffected.

SesliTab:
- revert SES-108 bridge PR;
- existing SES-68/S15 same-cardinality write-back remains the fallback production behavior;
- source and immutable revision history remain intact;
- no data migration or persistent schema rollback is required because this milestone adds no new persistence.

## 28. Implementation gate

Bu design spec'in kabulü production code yazma izni değildir.

Sonraki sıra:
1. User reviews/approves this written spec.
2. SES-68 must merge; fresh-read exact merged main.
3. Write detailed Superpowers implementation plan with exact files, RED tests and commit sequence.
4. User reviews/approves implementation plan.
5. Implement prerequisite and bridge with TDD RED → GREEN.
6. Full regression + production build + browser proof + whole-diff review.
7. Open bounded PR(s).
8. Merge only with separate explicit user approval.
9. No deploy under SES-108 unless separately authorized.

## 29. Acceptance criteria

CE-BRIDGE-01 architecture is acceptable only when:
- teacher structural intent is explicit and action-derived;
- final MusicXML is never used to infer teacher intent heuristically;
- SES-68 padding provenance remains separate and intact;
- Correction Engine remains the structural patch/revalidation authority;
- SesliTab remains immutable revision/downstream quality authority;
- exact source/revision/event identity is proven;
- insert/remove order is exact and reversible;
- candidate XML exactly conforms to CE projected structure;
- source MusicXML remains immutable;
- partial structural commits are impossible;
- CE PASS is not musical correctness;
- teacher correction is not teacher approval;
- prior approval/evidence is invalidated after change;
- same-cardinality existing lane does not regress;
- new Render service/domain is not introduced;
- deploy is not performed;
- SES-68 exact merged main is reconciled before implementation.
