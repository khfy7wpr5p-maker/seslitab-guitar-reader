# Package 6 Closure — MusicXML Chord-Symbol Parser

Date: 2026-08-28

Status: **Closure candidate. Final Package 6 completion requires this documentation PR to merge and its exact merged-main `test-and-build` to succeed.**

## Scope closed

Package 6 adds a deterministic, read-only MusicXML `<harmony>` parser and chord-symbol normalization layer without modifying the protected production OMR path.

Implementation flow:

```text
MusicXML
  -> shared inspectMusicXml security boundary
  -> DOMParser
  -> physical part/measure traversal
  -> source-order harmony timing
  -> normalized harmony descriptor
  -> deterministic source chord symbol
```

Package 6 does not infer chords from notes and does not add chord display or Turkish chord TTS; those remain Package 7.

## Implementation evidence

Implementation PR: **#75 — Package 6: add fail-closed MusicXML chord-symbol parser**

Accepted feature head after review fixes:
`3bb822d2df750079359c2c8c9e43060f6b0fedd2`

Implementation merge on protected main:
`4417a32f3ddaa46dacf149dc1317f6a83d19403c`

Exact-head CI after review fixes:
- run #183 / `33124475810`
- required job `test-and-build`
- 1057/1057 tests PASS
- 229 suites
- 0 failed / skipped / cancelled
- dependency audit: 0 vulnerabilities
- Vite 8.2.0 production build PASS

Exact implementation-main CI:
- run #184 / `33124708562`
- job `98699924529` / `test-and-build`
- exact head SHA `4417a32f3ddaa46dacf149dc1317f6a83d19403c`
- Node 24.19.0
- npm 11.17.0
- 119 packages installed; 120 packages audited
- 0 vulnerabilities
- 1057/1057 tests PASS
- 229 suites
- 0 failed / skipped / cancelled
- Vite 8.2.0 production build PASS
- 49 modules transformed

## Review findings handled before merge

The first green PR head was not merged after two valid automated review findings were identified:

1. P1: a mid-measure `<divisions>` change could reinterpret an already accumulated cursor in the new unit scale.
2. P2: an explicitly present but malformed `<divisions>` value could silently reuse a stale inherited divisions value.

Both were fixed before merge. Dedicated regression coverage verifies:

- accumulated timing is preserved in beat units across valid divisions changes;
- empty/nonnumeric/non-positive explicit divisions invalidates stale timing;
- timed source events without trustworthy divisions fail timing closed.

Both review threads were resolved and the accepted feature head was re-run through the complete required CI before merge.

## Verified parser behavior

Package 6 preserves source harmony evidence including:

- root step and supported accidental;
- MusicXML harmony `kind` and optional text;
- explicit bass/slash-chord evidence;
- inversion metadata without inventing a slash bass;
- degree add/alter/subtract evidence;
- staff metadata;
- physical `partId`, `partIndex`, `measureIndex`, `measureKey`;
- source-order onset evidence;
- source provenance with `teacherApproved=false`.

Supported deterministic examples include `C`, `Am`, `G7`, `D#m7/A#`, `C7(b5,add9,no3)` and `N.C.`.

Both `score-partwise` and `score-timewise` physical layouts are covered.

## Fail-closed rules

No finalized source chord symbol is emitted when required descriptor evidence is unsupported or contradictory. Examples include:

- unknown harmony kind;
- unsupported/microtonal alteration;
- unsupported functional-harmony representation;
- malformed degree semantics;
- invalid inversion/staff metadata.

These cases remain `REVIEW_REQUIRED` with `symbol=null` rather than producing a partial definitive symbol.

Missing or duplicate source part identity is `INVALID`; Package 6 does not invent replacement physical identity.

Untrustworthy timing remains `REVIEW_REQUIRED`; negative or otherwise unsupported onset is never fabricated.

## Security and architecture boundary

Package 6:

- reuses the shared `inspectMusicXml()` security boundary before DOM parsing;
- adds no external dependency;
- performs no filesystem writes;
- performs no network calls;
- does not modify `musicXmlParser.js`;
- does not modify Audiveris provider/runtime/preflight;
- does not modify the OMR worker/provider;
- does not modify the gateway;
- does not modify production MusicXML OMR integration;
- does not modify E2E workflow behavior;
- does not modify playback, UI or TTS;
- performs no deployment.

## Claims deliberately not made

Package 6 does not claim:

- that a parsed chord symbol proves the performed notes;
- that Audiveris/OMR recognized a harmony correctly;
- teacher approval;
- harmonic analysis from note content;
- Roman-numeral/functional harmony interpretation;
- accessible chord presentation or Turkish chord pronunciation.

## Next strict package

After this closure PR itself is merged and its exact-main required CI succeeds, the next roadmap package is:

**Package 7 — Chord display and Turkish TTS.**

Package 7 is not started by this closure.
