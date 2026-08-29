# Package 8B-T3 — MUSCIMA Accidental Mapping

Status: **Implementation candidate.**

Stage-start protected-main baseline: `627e7abbe15d922dd90e0c4d8a745dd9d75a90b0`.

## Purpose

T3 converts a deliberately bounded accidental subset from supplied MUSCIMA-style page annotations into deterministic **experimental mapping evidence** for Audiveris shape names.

T3 does **not** train Audiveris, replace a model, change the production provider/runtime, modify the Cloud OMR Gateway, change Docker/Render deployment, or claim that mapped samples are T1/T2 trainable samples.

## User-supplied pilot evidence measured on 2026-08-29

Two conversation-uploaded archives were inspected outside the repository:

- `Images.rar` — SHA-256 `7732e6fece20a5928dc19c45c008b24f1899a1a7510c9d7cac30cb7d18fb1a04`
- `Parsed_by_page_omr_xml.rar` — SHA-256 `ffa0caaf1c87b2f34011f42943a8f897701030ddcea9e57a24d6a9735ae24cca`

Observed facts:

- 100 PNG page images;
- 100 XML annotation files;
- 100/100 deterministic page-name matches;
- 10,109 total annotated objects;
- 2,714 accidental objects across all 100 pages;
- 0 accidental bounding boxes outside their declared page image;
- page images measured at 2475 × 3504 pixels in the supplied pilot.

Accidental counts:

| MUSCIMA class | Audiveris shape | Count |
| --- | --- | ---: |
| `accidentalSharp` | `SHARP` | 1,131 |
| `accidentalFlat` | `FLAT` | 821 |
| `accidentalNatural` | `NATURAL` | 350 |
| `accidentalDoubleSharp` | `DOUBLE_SHARP` | 220 |
| `accidentalDoubleFlat` | `DOUBLE_FLAT` | 192 |
| **Total** |  | **2,714** |

The XML also contains noteheads, stems, barlines, staff lines, flags, rests, clefs, time-signature digits and one accent object. T3 intentionally does **not** map these unrelated classes because Audiveris handles different notation families through different recognition methods and this stage is limited to accidentals.

## Local normalized pilot artifact

A local research-only normalized artifact was generated from the uploaded evidence without publishing source images to the public repository:

- normalized dataset id: `seslitab-muscima-accidentals-pilot`
- mapped glyph count: **2,714**
- page-disjoint deterministic split: **2,247 train / 467 evaluation**
- split basis: 80 train pages / 20 evaluation pages
- normalized manifest SHA-256: `1e5ae9441f7d1e02d39f24c4851545eb34b8587428365c5f2b44ebb1ef494a40`
- local ZIP SHA-256: `f571fca71f00ff50d88e2083611a71a822bed8d40d18499c011933c9d3d3a2c4`

This split is **page-disjoint only**. Writer identity was not established from the supplied filenames, so T3 must not describe the evaluation set as writer-independent.

## Fail-closed mapping contract

`scripts/audiverisMuscimaAccidentalMapping.js`:

1. maps only the five explicit accidental source classes;
2. preserves caller-supplied page identity and exact page/annotation SHA-256 evidence;
3. requires positive integer image and glyph dimensions;
4. rejects accidental bounding boxes outside the page;
5. validates binary run-length masks against exact `width × height` area;
6. hashes decoded mask pixels rather than trusting caller-provided mask metadata;
7. creates deterministic sample identity from exact source evidence;
8. rejects duplicate object/page/sample identity;
9. provides deterministic page-disjoint split assignment only when the caller supplies the evaluation-page count;
10. ignores unrelated MUSCIMA classes rather than relabeling them;
11. retains explicit T1 blockers on every mapped record;
12. has no file-write, network, Audiveris-execution, model-training or production OMR imports.

## Why mapped samples are still not T1/T2 trainable samples

Every T3 mapped record remains explicitly blocked by:

- `missing_omr_artifact`;
- `missing_training_approval`;
- `external_license_review_required`.

The supplied XML is annotation evidence, **not an Audiveris `.omr` project**. T3 does not rename XML to `.omr` or invent an `.omr` artifact.

Likewise, user approval to proceed with this engineering stage is not silently rewritten into the T1 per-sample `audiveris_training_sample` approval record.

## License boundary

MUSCIMA++ documents its annotations under **CC BY-NC-SA 4.0** and identifies the underlying CVC-MUSCIMA images as separately sourced. The official CVC-MUSCIMA terms state non-commercial research use and CC BY-NC-SA 4.0 terms. T3 therefore keeps the normalized pilot research-only and does not publish source/derived glyph images into this public repository or authorize a production model.

Relevant upstream references:

- https://github.com/OMR-Research/muscima-pp
- https://pages.cvc.uab.es/cvcmuscima/index_database.html
- https://github.com/Audiveris/audiveris/discussions/594

This repository record is a technical provenance/safety boundary, not legal advice.

## Audiveris shape evidence

Audiveris upstream training discussions list `SHARP`, `FLAT`, `NATURAL`, `DOUBLE_SHARP` and `DOUBLE_FLAT` among classifier sample shapes. They also explain that stems/barlines are handled differently and noteheads use a different recognition path, which is why T3 does not indiscriminately convert all 10,109 annotations into classifier samples.

## Acceptance boundary

T3 may be called completed only if:

- focused mapping tests pass;
- the complete repository test/build gate passes on the exact PR head;
- review has no unresolved valid blocker;
- merge is exact-head locked;
- protected-main push CI passes on the exact merge SHA;
- production OMR/Audiveris/Render/Docker wiring remains unchanged.

Even after T3 completion, **Package 8B remains partially implemented**. Model training/evaluation and any production model replacement remain separate future decisions.
