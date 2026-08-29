# Package 8B-T4 — Research-Only Audiveris Training Admission

Status: **Candidate implementation. Do not mark Completed until protected-main merge and exact-main CI succeed.**

Stage-start protected-main baseline: `35d3e9f475d15922ee0eef77b9804467622e5e27`.

## Purpose

T4 answers a narrower question than model training:

> Can the bounded Package 8B-T3 MUSCIMA accidental evidence be admitted to preparation of an **isolated, non-commercial research** Audiveris glyph-classifier experiment without weakening SesliTab's existing T1/T2 evidence rules or changing production OMR?

T4 does **not** build `samples.zip`, run the Audiveris trainer, produce `basic-classifier.zip`, replace any model, or change production OMR/Gateway/Docker/Render wiring.

## Upstream findings used by this boundary

### Audiveris technical classifier input

Current Audiveris documentation describes the basic classifier as a **Glyph classifier**. A training sample is basically a glyph plus its related shape. The global `samples.zip` repository is the only source used for glyph-classifier training. Audiveris can populate book sample repositories from reviewed sheet/book data and later merge them into the global repository.

This means an Audiveris `.omr` project is an important standard provenance/curation route, but `.omr` is **not itself the neural classifier's final technical input format**. The final classifier-training source is the global glyph+shape sample repository.

References:

- https://audiveris.github.io/audiveris/_pages/guides/advanced/samples/
- https://audiveris.github.io/audiveris/_pages/guides/advanced/training/
- https://audiveris.github.io/audiveris/_pages/reference/outputs/zip/
- https://audiveris.github.io/audiveris/_pages/reference/folders/essential/

### External licence boundary

MUSCIMA++ documents **CC BY-NC-SA 4.0** terms. The underlying CVC-MUSCIMA source likewise states non-commercial research use. T4 therefore encodes this corpus as research-only and fail-closes commercial or production intent.

References:

- https://github.com/OMR-Research/muscima-pp
- https://ufal.mff.cuni.cz/muscima
- https://pages.cvc.uab.es/cvcmuscima/index_database.html

This repository record is a technical policy/provenance boundary, **not legal advice**.

## T1 remains intentionally stricter

Package 8B-T1 currently requires exact image, label, `.omr`, approval and other evidence before a candidate can become a genuine T1 trainable sample.

T4 does **not** revise that contract.

Therefore even a fully T4-approved research sample continues to report:

```text
t1OmrEvidenceSatisfied: false
t1TrainableSampleCount: 0
t1Blockers: [missing_omr_artifact]
```

This separation is intentional:

- **Audiveris technical training format:** global `samples.zip` glyph + shape samples.
- **SesliTab T1 production-oriented evidence rule:** stricter exact provenance including `.omr`.

## Separate T4 research approval

T4 introduces a new, narrower approval scope:

```text
audiveris_classifier_research_sample
```

It is not the T1 scope `audiveris_training_sample` and is not teacher approval, student-sharing approval, production authorization or model-replacement approval.

A T4 approval binds exactly to:

- `sampleId`;
- mapped `audiverisShape`;
- decoded-mask SHA-256;
- explicit approval identity;
- explicit reviewer identity;
- exact ISO-8601 approval time;
- the fixed MUSCIMA research-only licence profile.

Changing the sample identity, shape or mask evidence invalidates the binding.

## Admission states

T4 exposes three states:

1. `blocked_license_use`
   - commercial or production intent;
   - zero admitted research samples.
2. `blocked_missing_sample_approvals`
   - non-commercial research intent but incomplete exact T4 sample approvals;
   - zero admitted research samples.
3. `ready_for_isolated_samples_zip_build`
   - non-commercial research intent;
   - every mapped sample has an exact T4 research approval;
   - this authorizes only the **next isolated artifact-preparation step**, not training execution.

No T4 state ever sets:

```text
productionAuthorized: true
modelReplacementAuthorized: true
```

## Current 2,714-sample pilot result

The T3 pilot contains 2,714 mapped accidental samples over 100 matched pages, with a page-disjoint 2,247/467 mapping split.

At T4 stage start there are **no exact T4 per-sample research approval records** for those 2,714 mapped samples.

Therefore the current pilot outcome is:

```text
mapped experimental samples: 2,714
T4 exact research approvals: 0
T4 research samples admitted: 0
T1/T2 trainable samples: 0
status: blocked_missing_sample_approvals
samples.zip built: NO
Audiveris training executed: NO
production model changed: NO
```

The user's approval to implement Package 8B-T4 is an engineering-stage authorization. It is **not silently expanded into 2,714 per-sample research-training approvals**.

## Evaluation claim remains bounded

T4 preserves T3's exact evaluation statement:

- page-disjoint only;
- writer-independent evaluation: **not established / not claimed**.

No T4 approval may upgrade this evidence into a writer-independent benchmark claim.

## Security and no-touch boundary

`scripts/audiverisMuscimaResearchTrainingAdmission.js` is pure data-domain code. It must not:

- write files;
- create `samples.zip`;
- invoke Java/Audiveris;
- invoke a trainer;
- write or replace `basic-classifier.zip`;
- import production AudiverisProvider/worker/gateway modules;
- change `Dockerfile`;
- change `render.yaml`;
- change Render service/deployment wiring;
- change production model selection;
- publish source/derived MUSCIMA images.

## Mandatory verification

Before merge:

- focused T4 approval/admission tests PASS;
- full repository regression PASS;
- production build PASS;
- real-browser score runtime proof PASS;
- exact-head required CI PASS;
- no unresolved valid P1/P2 review blocker;
- branch fresh against protected `main`;
- expected-head SHA merge locking.

After merge:

- exact protected-main push CI must PASS before T4 can be declared Completed.

## Deferred next step

Only after explicit approval of the required research samples may a later package build an **isolated research-only Audiveris `samples.zip` adapter/harness**. That later package must still keep the production classifier untouched and must independently gate any actual training run and evaluation.
