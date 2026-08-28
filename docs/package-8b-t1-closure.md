# Package 8B-T1 Closure

Date: 2026-08-28  
Status: **Completed**

## Scope closed

Package 8B-T1 established the isolated, fail-closed Audiveris training-candidate and dataset-manifest contract required before real training evidence may be admitted.

No Audiveris training, model replacement, production OMR/provider/runtime/gateway/worker change, Dockerfile change, `render.yaml` change or Render deployment change was made.

## Implementation evidence

- implementation PR: **#104**
- final PR head: `4005192f55afead7d22e7a32db596569faa7aff9`
- exact-head CI: **#265 / run `33196559638`, job `98935074605` — SUCCESS**
- exact-head tests: **1228/1228 PASS**, 232 suites, 0 failed/skipped/cancelled
- dependency audit: **0 vulnerabilities**
- production build: **PASS**
- review threads: **none**
- branch freshness before merge: **0 behind**
- squash merge to protected main: `278b69ed1f7f0cede6a3dc00e8265e887811c88b`
- exact-main CI: **#266 / run `33196791822`, job `98935863577` — SUCCESS**
- exact-main tests: **1228/1228 PASS**, 232 suites, 0 failed/skipped/cancelled
- exact-main dependency audit: **0 vulnerabilities**
- exact-main production build: **PASS**

## Security hardening included

Before PR merge, self-review added two explicit regressions:

1. training approval is bound to the exact candidate-evidence SHA-256 fingerprint, so approval cannot be copied to a changed sample;
2. train/evaluation leakage detection includes direct shared glyph and MusicXML hashes in addition to provenance, PDF, page image and `.omr` evidence.

Strict validators also reject mutable nested evidence, injected fields, accessors, sparse arrays, unsafe repository paths and malformed hashes.

## Current real dataset truth

The repository has one owner/teacher-approved golden-reference chain with:

- source PDF;
- preserved `.omr`;
- expected MusicXML;
- approval record;
- SHA-256 integrity evidence;
- CC0-1.0 rights evidence;
- Audiveris 5.11.0 metadata.

That chain is **not** currently an Audiveris training sample. It lacks separate page-image evidence, glyph image, real shape label, symbol coordinates, explicit `audiveris_training_sample` approval and split assignment.

Current admitted real trainable sample count: **0**.

This is intentional fail-closed behavior. No missing training evidence is inferred or fabricated.

## Package status after closure

- Package 8: **Completed**
- Package 8B: **Partially implemented**
- Package 8B-T1: **Completed**
- Package 8B-T2: **Not started / next bounded safe stage**

T2 may build only an evidence intake/readiness/report boundary over T1 unless new genuinely verified training artifacts are supplied. It must not train a model or alter production OMR without separate explicit authorization and measured evidence.
