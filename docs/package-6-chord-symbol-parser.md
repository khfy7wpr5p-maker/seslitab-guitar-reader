# Package 6 — MusicXML Chord-Symbol Parser

Status: implementation merged and exact-main implementation CI verified. Final package closure evidence: `docs/package-6-closure.md`.

## Scope

Package 6 adds an isolated, read-only parser for MusicXML `<harmony>` material. It does not change the existing production note parser, Audiveris/OMR provider/runtime, gateway, worker, E2E workflow, playback, UI or TTS.

Package 7 remains responsible for chord display and Turkish TTS.

## Architecture

```text
MusicXML text
  -> shared MusicXML security policy
  -> DOMParser boundary
  -> physical part/measure traversal
  -> source-order harmony timing extraction
  -> normalized harmony descriptor
  -> deterministic chord-symbol model
```

The parser is implemented in `musicXmlHarmonyParser.js` and exposes:

- `normalizeHarmonyDescriptor()`
- `extractHarmonyEventsFromDocument()`
- `parseMusicXmlHarmony()`

## Package 6A — Normalized harmony model

The normalized model preserves:

- root step and accidental
- MusicXML `kind` value and optional display text
- optional explicit bass step/accidental
- inversion metadata
- degree additions/alterations/subtractions
- staff metadata
- source provenance
- `teacherApproved=false`

Supported basic MusicXML harmony kinds include major/minor, augmented/diminished, dominant/major/minor sevenths, sixths, ninths, 11ths, 13ths, suspended chords, power chords and explicit `none`/N.C.

No chord notes are synthesized from the symbol. Package 6 parses source harmony markup only.

## Package 6B — Source-order timing and physical identity

Harmony events use the same physical identity convention already used elsewhere in the repository:

- `partId`
- `partIndex`
- `measureIndex`
- `measureKey = partId:measureIndex`

Visible measure numbers are metadata only and are not used as unique identity.

Missing or duplicate source `partId` evidence fails closed as `INVALID`; Package 6 does not invent replacement part identities. In `score-timewise`, `measureIndex` follows the outer physical measure position so a temporarily absent part does not renumber later physical measures.

Timing follows MusicXML source order with inherited divisions and observes:

- ordinary note duration advances the beat cursor using the active divisions value
- `<chord/>` continuation does not advance the cursor
- grace notes do not advance the cursor
- `<backup>` moves the cursor backward using the active divisions value
- `<forward>` moves the cursor forward using the active divisions value
- `<harmony><offset>` shifts the harmony event relative to the current cursor
- a valid divisions change does not reinterpret already accumulated beat position

If divisions or timeline manipulation are not trustworthy, the harmony semantics may remain preserved but timing becomes `REVIEW_REQUIRED`; no onset is invented. A negative computed harmony onset is therefore not emitted as measured timing.

An explicitly present but empty, nonnumeric or non-positive `<divisions>` declaration invalidates inherited divisions instead of silently reusing a stale value. A timed note, backup or forward encountered before a trustworthy divisions value likewise makes that measure timing review-required.

Both `score-partwise` and `score-timewise` physical part/measure layouts are supported.

## Package 6C — Fail-closed symbol normalization

A finalized `symbol` is emitted only when the descriptor is fully supported.

Examples of supported deterministic output:

- C major -> `C`
- A minor -> `Am`
- G dominant -> `G7`
- D-sharp minor seventh over A-sharp -> `D#m7/A#`
- altered/add/subtract degrees -> e.g. `C7(b5,add9,no3)`
- no chord -> `N.C.`

The parser does not invent a slash bass from inversion metadata alone.

The following are retained as evidence but fail closed to `REVIEW_REQUIRED` with `symbol=null`:

- unknown/unsupported `kind`
- unsupported/microtonal root or bass alteration
- functional harmony (`<function>`) not represented by the current basic symbol contract
- malformed/unsupported degree semantics
- invalid inversion/staff metadata

This prevents partial chord symbols from being presented as definitive source material.

## Package 6D — Security and isolation

`parseMusicXmlHarmony()` calls the existing shared `inspectMusicXml()` security boundary before `DOMParser`.

The new module:

- performs no filesystem writes
- performs no network calls
- imports no Audiveris/OMR/gateway module
- imports no quality-gate consumer wiring
- imports no UI or TTS module
- introduces no external dependency
- is deterministic and deeply freezes public result containers

Unsafe/invalid MusicXML returns `INVALID` before DOM parsing.

## Acceptance matrix

Package 6 tests cover:

1. explicit immutable kind vocabulary
2. major/minor/seventh/slash chords
3. degree add/alter/subtract preservation
4. inversion without invented bass
5. explicit N.C.
6. unknown kinds and microtones fail closed
7. malformed degree evidence fails closed
8. deterministic/deep-frozen source-only model
9. source-order timing and duplicate visible measure numbers
10. chord/grace cursor behavior
11. backup/forward behavior
12. missing divisions timing review
13. invalid timeline manipulation review
14. score-timewise identity
15. missing/duplicate part identity fails closed
16. negative harmony onset fails timing closed
17. kind text, inversion, staff and hidden degree preservation
18. functional harmony fail-closed behavior
19. shared XML security before DOM parsing
20. raw wrapper extraction boundary
21. empty harmony input without chord invention
22. deterministic frozen parser result
23. production-boundary isolation
24. mid-measure divisions change preserves accumulated beat position
25. malformed explicit divisions invalidates stale inherited timing
26. timed source event without divisions fails timing closed

## Verified implementation evidence

- implementation PR: #75
- accepted feature head after review fixes: `3bb822d2df750079359c2c8c9e43060f6b0fedd2`
- implementation merge: `4417a32f3ddaa46dacf149dc1317f6a83d19403c`
- exact-head CI #183 / `33124475810`: PASS
- exact implementation-main CI #184 / `33124708562`: PASS
- tests: 1057/1057 PASS; 229 suites; 0 failures/skips/cancellations
- dependency audit: 0 vulnerabilities
- Vite 8.2.0 production build: PASS

The first green feature head was not merged after two valid review findings in divisions handling. Both findings were fixed, dedicated regressions were added, the exact corrected head passed full CI, the review threads were resolved, and merge used expected-head locking.

## Safety claims

Package 6 does **not** claim:

- that a chord symbol proves the performed notes
- that OMR harmony recognition is correct
- teacher approval
- harmonic analysis or chord inference from notes
- functional/Roman-numeral harmony interpretation
- chord display accessibility or Turkish pronunciation

Those concerns remain separate packages or human-review responsibilities.

## Closure evidence

Detailed closure and boundary evidence is recorded in `docs/package-6-closure.md`. Package 7 is not implemented by Package 6.
