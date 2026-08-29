# Package 8B-T4 Closure — Research-Only Audiveris Training Admission

Closure date: 2026-08-29  
Status: **Completed**  
Package 8B parent status: **Partially implemented**

## Scope closed

Package 8B-T4 introduced a separate fail-closed admission boundary for deciding whether bounded T3 MUSCIMA accidental evidence may proceed toward a later **isolated, non-commercial research** Audiveris glyph-classifier sample-repository preparation step.

T4 does not build `samples.zip`, execute Audiveris training, produce or replace a classifier, or change production OMR/model/deployment wiring.

## Architecture decision closed

T4 records the following separation:

- Audiveris glyph-classifier training ultimately consumes glyph + shape samples from the global `samples.zip` repository;
- `.omr` is a standard Audiveris project/provenance/curation route but is not itself the final neural classifier input format;
- SesliTab Package 8B-T1 deliberately remains stricter and still requires exact `.omr` evidence for a genuine T1 trainable sample;
- T4 does **not** relax or reinterpret that T1 rule.

## External-corpus licence boundary

The T4 research profile records:

- MUSCIMA++: `CC-BY-NC-SA-4.0`;
- CVC-MUSCIMA use boundary: `noncommercial_research_only`;
- attribution required;
- share-alike required;
- commercial use not admitted by T4;
- production use not admitted by T4.

This is a repository technical policy/provenance boundary, not legal advice.

## Exact research-sample approval

T4 uses a distinct scope:

```text
audiveris_classifier_research_sample
```

The approval binds exact:

- sample identity;
- Audiveris shape;
- decoded-mask SHA-256;
- approval identity;
- reviewer identity;
- exact ISO-8601 time;
- fixed T4 research licence profile.

It is separate from:

- T1 `audiveris_training_sample` approval;
- teacher revision approval;
- engineering-stage package approval;
- student-sharing authorization;
- production-model authorization.

## Admission semantics

T4 verifies three bounded outcomes:

```text
commercial / production intent
  -> blocked_license_use
  -> admitted sample count = 0

non-commercial research + incomplete exact T4 approvals
  -> blocked_missing_sample_approvals
  -> admitted sample count = 0

non-commercial research + complete exact T4 approvals
  -> ready_for_isolated_samples_zip_build
  -> only later artifact-preparation readiness
```

Even the ready state does **not** authorize:

- an Audiveris training run;
- classifier artifact adoption;
- production model replacement;
- deployment changes.

## Current 2,714-sample result

T3 supplied 2,714 bounded mapped accidental records over 100 matched pages.

At T4 closure:

```text
mapped experimental samples:     2,714
T4 exact research approvals:          0
T4 research samples admitted:         0
T1/T2 trainable samples:              0
status: blocked_missing_sample_approvals
samples.zip built:                    NO
Audiveris training executed:          NO
production model changed:             NO
```

The user's package-level approval to implement T4 was not converted into per-sample approval.

The T3 2,247/467 train/evaluation mapping remains **page-disjoint only**. Writer-independent evaluation is not established or claimed.

## Security closure

T4 preserves all of the following boundaries:

- T1 `.omr` requirement remains unchanged;
- no sample approval is invented;
- no research approval is copied across changed sample identity/shape/mask evidence;
- commercial and production intent fail closed;
- no write-capable filesystem API is used by the T4 admission module;
- no Java/Audiveris/trainer process is invoked;
- no `samples.zip` or classifier artifact is created;
- no production Audiveris/provider/runtime/worker/Gateway import is introduced;
- `Dockerfile` is unchanged;
- `render.yaml` is unchanged;
- Render service/deployment wiring is unchanged;
- production model selection/replacement is unchanged;
- source/derived MUSCIMA images are not published by T4.

## Implementation evidence

- stage-start protected main: `35d3e9f475d15922ee0eef77b9804467622e5e27`
- implementation branch: `feature/package-8b-t4-research-training-admission`
- implementation PR: #115
- implementation final head: `9142e9b3f81f75e0f0f1e44450c0ee9294e1f640`
- net implementation files:
  - `scripts/audiverisMuscimaResearchTrainingAdmission.js`
  - `tests/package8bMuscimaResearchTrainingAdmission.test.js`
  - `docs/package-8b-t4-research-training-admission.md`
- exact-head CI #289: **SUCCESS**
- unresolved review threads before merge: **0**
- branch freshness before merge: **0 behind**
- expected-head-locked squash merge: `08bb9a1d909c20445cc0dbcaf1a5514e48470ee8`
- protected main remained protected with required `test-and-build`
- exact-main CI #290 / run `33247398205`, job `99087145954`: **SUCCESS**

Exact-main CI #290 verified:

- **1287/1287 tests PASS**;
- **232 suites**;
- **0 failed / skipped / cancelled**;
- **0 vulnerabilities**;
- production build **PASS**;
- real-browser score runtime proof **PASS** using Google Chrome.

## Result

**Package 8B-T4 is Completed.**

**Package 8B remains Partially implemented.** The corpus is not yet admitted for an actual research training run because the current T4 exact per-sample approval count is 0. No Audiveris model has been trained or replaced by T4.

## Next safe boundary

A later package may build an **isolated research-only `samples.zip` adapter/harness** only after separate explicit authorization and the required exact sample approvals. Artifact preparation, training execution, evaluation and production-model adoption must remain separately gated stages.
