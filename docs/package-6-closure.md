# Package 6 Closure — MusicXML Chord-Symbol Parser

Date: 2026-08-28

Status: **Completed.** The implementation, documentation closure merge, and exact merged-main required CI have all succeeded.

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

## Documentation closure evidence

Closure PR: **#76 — Docs: close Package 6 chord-symbol parser**

Accepted closure head after documentation review fix:
`bf91a58951cbef79842b093656d3e75f61cb71b9`

Closure merge on protected main:
`99232915ebcd5089055d0f8695b6c1b08c697739`

Exact closure-head CI:
- run #187 / `33142892750`
- required `test-and-build`: SUCCESS
- 1057/1057 tests PASS
- 229 suites
- dependency audit: 0 vulnerabilities
- production build PASS

Exact closure-main CI:
- run #188 / `33142995146`
- job `98757771854` / `test-and-build`
- exact head SHA `99232915ebcd5089055d0f8695b6c1b08c697739`
- 1057/1057 tests PASS
- 229 suites
- 0 failed / skipped / cancelled
- 120 packages audited; 0 vulnerabilities
- Vite 8.2.0 production build PASS
- 49 modules transformed

The later evidence-reconciliation documentation change only records already-achieved closure evidence and is not a new Package 6 closure gate.

## Review findings handled before merge

The first green implementation PR head was not merged after two valid automated review findings were identified:

1. P1: a mid-measure `<divisions>` change could reinterpret an already accumulated cursor in the new unit scale.
2. P2: an explicitly present but malformed `<divisions>` value could silently reuse a stale inherited divisions value.

Both were fixed before merge. Dedicated regression coverage verifies:

- accumulated timing is preserved in beat units across valid divisions changes;
- empty/nonnumeric/non-positive explicit divisions invalidates stale timing;
- timed source events without trustworthy divisions fail timing closed.

The closure PR also received a valid P2 documentation finding: Package 6 must not be marked Completed before the closure PR's own exact-main CI exists. The status was reverted to pending, CI #188 then succeeded, and this reconciliation records that completed evidence.

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

Package 6 closure is satisfied. The next roadmap package is:

**Package 7 — Chord display and Turkish TTS.**
