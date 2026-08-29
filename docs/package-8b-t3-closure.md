# Package 8B-T3 Closure — MUSCIMA Accidental Mapping

Closure date: 2026-08-29  
Status: **Completed**  
Package 8B parent status: **Partially implemented**

## Scope closed

Package 8B-T3 introduced a bounded, research-only mapping boundary from user-supplied MUSCIMA-style accidental annotations to the five reviewed Audiveris accidental shape names.

T3 does not train Audiveris and does not modify production OMR/model/deployment wiring.

## Supplied evidence measured

Conversation uploads:

- `Images.rar` SHA-256 `7732e6fece20a5928dc19c45c008b24f1899a1a7510c9d7cac30cb7d18fb1a04`
- `Parsed_by_page_omr_xml.rar` SHA-256 `ffa0caaf1c87b2f34011f42943a8f897701030ddcea9e57a24d6a9735ae24cca`

Measured pilot:

- 100 PNG images;
- 100 XML annotation files;
- 100/100 page matches;
- 10,109 total annotation objects;
- 2,714 accidental annotations;
- 0 accidental bbox overruns;
- 1,131 `SHARP` mappings;
- 821 `FLAT` mappings;
- 350 `NATURAL` mappings;
- 220 `DOUBLE_SHARP` mappings;
- 192 `DOUBLE_FLAT` mappings.

A local research-only normalized artifact used a deterministic page-disjoint 80/20 split:

- 2,247 mapped train records;
- 467 mapped evaluation records;
- normalized manifest SHA-256 `1e5ae9441f7d1e02d39f24c4851545eb34b8587428365c5f2b44ebb1ef494a40`;
- normalized ZIP SHA-256 `f571fca71f00ff50d88e2083611a71a822bed8d40d18499c011933c9d3d3a2c4`.

No writer-independent claim is made.

## Safety closure

T3 preserves all of the following boundaries:

- annotation XML is not represented as Audiveris `.omr`;
- engineering-stage user approval is not converted into per-sample `audiveris_training_sample` approval;
- mapped evidence does not bypass T1/T2 admission;
- each mapped sample remains explicitly blocked by missing `.omr`, missing training approval and external licence review;
- unrelated notation classes are not guessed into classifier shapes;
- source/derived MUSCIMA images are not published into the public repository;
- no Audiveris training was executed;
- no accuracy-improvement claim was created;
- no production model was replaced;
- production provider/runtime, Gateway, Docker and Render wiring were unchanged.

Therefore T3 has **2,714 experimental mappings but 0 T1/T2-admitted trainable samples**.

## Implementation evidence

- stage-start protected main: `627e7abbe15d922dd90e0c4d8a745dd9d75a90b0`
- implementation branch: `feature/package-8b-t3-muscima-accidental-mapping`
- PR #113 final head: `b3f4b71a9748f2b8281abe5f0d9e6fb925a0fd9a`
- changed implementation files:
  - `scripts/audiverisMuscimaAccidentalMapping.js`
  - `tests/package8bMuscimaAccidentalMapping.test.js`
  - `docs/package-8b-t3-muscima-accidental-mapping.md`
- exact-head CI #285 / run `33246314925`, job `99084280341`: **SUCCESS**
- review threads before merge: **0 unresolved**
- exact-head-locked squash merge: `258ac27262aa4715164aafebe8fce97bb89f9dfb`
- protected main remained protected with required `test-and-build`
- exact-main CI #286 / run `33246461356`, job `99084669804`: **SUCCESS**

Exact-main CI #286 verified:

- **1275/1275 tests PASS**;
- **232 suites**;
- **0 failed / skipped / cancelled**;
- **0 vulnerabilities**;
- production build **PASS**;
- real-browser score runtime proof **PASS**.

## Result

**Package 8B-T3 is Completed.**

**Package 8B remains Partially implemented.** T3 supplies bounded accidental mapping evidence but does not yet satisfy T1/T2 trainability, authorize model training, establish writer-independent evaluation, or authorize production model replacement.

## Next safe boundary

Before any later training stage:

1. fresh-read the current protected main and evidence contracts;
2. decide explicitly whether third-party classifier-glyph evidence must retain T1's `.omr` requirement or use a separately reviewed contract extension;
3. establish compatible exact per-sample training authorization under the external licence boundary;
4. establish a defensible evaluation protocol beyond page-disjoint-only evidence if generalization claims are desired;
5. keep all training experiments isolated from production model selection unless separately authorized with measured comparison evidence.
