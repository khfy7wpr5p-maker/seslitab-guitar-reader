# S15 Smoosic Product Write-back Bridge — Design

**Date:** 2026-09-21  
**Repository:** `khfy7wpr5p-maker/seslitab-guitar-reader`  
**Baseline main:** `d92670f6c659236902f41e46871c2ddd916eb7d1`  
**Status:** Architecture direction approved; written spec pending final user review before implementation planning.

## 1. Purpose

SesliTab currently sends the accepted MusicXML source into the same-origin Smoosic editor, where the teacher can visually edit and export an edited MusicXML file. The missing production connection is the reverse path: an edited score does not become a new SesliTab product revision, so SesliTab quality, playback, Guitar TAB, violin, MIDI, and later export/share decisions continue to describe the pre-edit source.

S15 adds one narrow, explicit bridge:

```text
SesliTab accepted MusicXML
        ↓
      Smoosic
        ↓
 teacher edits score
        ↓
"Düzenlemeyi SesliTab'a Uygula"
        ↓
bounded write-back request
        ↓
SesliTab parse + structural revalidation
        ↓
immutable corrected revision
        ↓
fresh quality evidence
        ↓
current product consumers refresh
```

Smoosic remains the visible editor. SesliTab remains the authority for canonical product state, immutable revision history, quality evidence, and downstream outputs.

## 2. Design goals

1. Make a supported Smoosic edit become a new immutable SesliTab revision.
2. Reuse the existing tested Package 8 / PR-D revalidation and revision contracts rather than creating a second authority model.
3. Never mutate the original imported source revision.
4. Never transfer old quality or approval evidence to an edited revision.
5. Refresh the existing SesliTab result pipeline from the newly committed revision so playback, Guitar TAB, violin, MIDI, rhythmic output, and note controls observe the same current score.
6. Reject stale, malformed, oversized, structurally invalid, or unsupported write-backs without damaging the last accepted SesliTab revision.
7. Preserve Smoosic's existing local MusicXML export even when a write-back cannot be promoted.
8. Keep the retired Stage E/F/PR-D visible editor UI retired.

## 3. Non-goals

S15 does **not**:

- restore the legacy teacher score workspace or keypad UI;
- make Smoosic the canonical authority;
- automatically commit every editor keystroke;
- add user accounts, authentication, cloud save, student delivery, or sharing;
- add provisional Guitar TAB;
- change Audiveris/OMR behavior;
- change the current definitive Guitar TAB quality policy;
- claim physical iPhone/Safari acceptance;
- support arbitrary score-structure replacement in the first slice.

Structural edits that add/remove notes or alter stable part/measure/voice/staff identity are handled explicitly under Section 11.

## 4. Core authority rule

There is exactly one product authority:

```text
Smoosic = visible editing surface
SesliTab = revision + validation + quality + consumer authority
```

A Smoosic edit is only a **candidate** until SesliTab reparses and revalidates its exact MusicXML.

The iframe may report local round-trip information for user feedback, but the host must not trust the iframe's own "valid" or "roundTripOk" flags as product evidence.

## 5. Commit model: explicit, not automatic

Write-back is triggered by an explicit host-side action:

**Button label:** `Düzenlemeyi SesliTab'a Uygula`

The button lives in the SesliTab Smoosic panel, outside the iframe.

Reasons:

- prevents one revision per keystroke;
- makes teacher intent explicit;
- avoids edit/reload loops;
- preserves Smoosic's native undo/redo while editing;
- creates a clean transaction boundary for revalidation;
- keeps product authority visibly owned by SesliTab.

The existing Smoosic `XML Kaydet` behavior remains independent and unchanged.

## 6. Bridge protocol

Use a versioned same-origin `postMessage` protocol instead of reaching into Smoosic internals directly.

### 6.1 Host → iframe export request

```js
{
  type: 'seslitab:smoosic-export-request',
  version: 1,
  requestId: '<secure uuid>',
  sourceRevision: <integer>
}
```

### 6.2 Iframe → host candidate result

```js
{
  type: 'seslitab:smoosic-export-result',
  version: 1,
  requestId: '<same uuid>',
  sourceRevision: <same integer>,
  fileName: '<edited name>.musicxml',
  musicXml: '<score-partwise ...>...</score-partwise>'
}
```

Optional iframe-only diagnostic values may be included, but SesliTab must ignore them for trust decisions.

### 6.3 Host validation

The host accepts a candidate only when all are true:

- `event.source === frame.contentWindow`;
- `event.origin === window.location.origin`;
- message type/version are exact;
- `requestId` is the currently pending write-back request;
- returned `sourceRevision` equals the current accepted-source revision;
- no PDF/MusicXML replacement transition is currently pending;
- MusicXML is a string, non-empty, contains a score root, and is at most the existing 10 MB MusicXML limit;
- the editor frame is still connected and is the active frame for this root.

Any mismatch fails closed and leaves current SesliTab product state unchanged.

## 7. Product authority session

S15 introduces a hidden product-authority session for the current accepted MusicXML source. It uses pure domain services only; it does not revive the retired UI.

For each accepted source:

1. Obtain the exact current `NoteObject[]` from the existing Package 3 handoff.
2. Create a Package 8 teacher workspace with:
   - a generated source id,
   - a generated automatic revision id,
   - a generated history id,
   - an audit actor label such as `smoosic-local-editor`.
3. Register the exact accepted MusicXML against the automatic/root revision in the existing PR-D MusicXML registry.
4. Store the workspace in the Smoosic host state together with the current accepted-source revision integer.

When a different PDF/MusicXML source is accepted, discard the old in-memory authority session and create a new one. A failed/cancelled replacement must not replace the current authority session.

The actor label is audit metadata only and must not be described as authentication.

## 8. Candidate revalidation

A new focused domain adapter, proposed as:

`src/services/smoosicProductWriteback.js`

owns the Smoosic candidate → Package 8 product transition.

Responsibilities:

1. parse the candidate through existing SesliTab MusicXML parsing;
2. compare the candidate against the exact current immutable revision;
3. derive the **exact changed note indexes** rather than marking all notes changed;
4. reject unsupported structural changes;
5. call existing `revalidatePrDEditorMusicXml()`;
6. call existing `commitPrDProductRevision()`;
7. advance the in-memory workspace to the returned authoritative history;
8. return the exact committed revision + revalidated MusicXML.

It must not render UI, manipulate the iframe, or update result panels.

### 8.1 Supported S15 correction scope

The first S15 production slice supports edits that the existing PR-D product pipeline can safely prove:

- pitch changes;
- duration/rhythm changes that survive structural validation;
- accidentals;
- ties/slurs/notation already represented by the PR-D notation bridge;
- other same-cardinality semantic changes that preserve stable product locators.

The existing PR-D constraints remain authoritative:

- note cardinality must remain unchanged;
- stable locator identity must remain unchanged for part, measure, voice, staff, grace/chord placement and related locator fields;
- the candidate must pass structural/rhythmic revalidation.

This scope is intentionally conservative for the first bridge and can be expanded in a later structural-revision stage.

## 9. Publishing the committed revision

After a write-back commits successfully, the current SesliTab product UI must be refreshed through the same result path used by ordinary MusicXML intake.

Add one narrow exported host function from `src/app.js`, conceptually:

```js
applyRevalidatedMusicXmlRevision(notes, musicXml)
```

It must reuse the existing `handleAnalysisResult()` path rather than duplicate result rendering logic.

That existing path already:

- stores current notes;
- prepares fresh MusicXML quality evidence;
- resolves Stage H playback;
- regenerates rhythmic text and HTML;
- republishes the exact notes through the Package 3 handoff;
- refreshes note cards and visible MusicXML;
- causes Guitar TAB / violin / MIDI consumers subscribed to Package 3 to observe the new note array.

This means downstream products refresh from one current revision instead of each bridge component manually updating individual consumers.

### 9.1 No stale evidence transfer

The write-back revision must receive fresh evidence from:

`prepareMusicXmlQualityGate(committedRevision.content, committedMusicXml)`

Old source quality evidence, approval records, and consumer authorization must never be copied to the new revision.

If the new revision evaluates to REVIEW or BLOCK for a definitive consumer, that consumer follows its existing policy. S15 does not override it.

## 10. Preventing editor reload loops

Publishing the new MusicXML updates the SesliTab result DOM, which is already observed by `smoosicEditorTabUi.js`.

Before publishing a successful write-back, the host must mark the committed MusicXML as the editor's current accepted content in its own source-lifecycle state so the MutationObserver does not immediately re-import the same document as if it were an unrelated new file.

The exact requirement is behavioral:

- successful write-back leaves the Smoosic editor open;
- the editor does not reset to the original source;
- no duplicate source load occurs;
- host accepted-source state advances to the committed MusicXML;
- a later genuine PDF/MusicXML replacement still invalidates the old editor/source transaction normally.

## 11. Unsupported structural edits

Smoosic can express edits that the current immutable correction pipeline cannot safely replay, especially:

- adding/removing notes;
- changing note cardinality;
- moving content across part/measure/voice/staff identity;
- other changes that violate stable-locator constraints.

For S15 these edits must **not** be silently discarded and must **not** be promoted as canonical.

Behavior:

1. SesliTab rejects the product write-back transaction.
2. The current accepted SesliTab revision remains unchanged.
3. The edited Smoosic document remains open and editable.
4. Existing `XML Kaydet` remains available so the teacher can keep the work.
5. Host status explains that the edit is structurally outside the current SesliTab write-back scope.

Suggested message:

> Bu yapısal düzenleme editörde korunuyor ancak henüz SesliTab sürümüne uygulanamıyor. MusicXML olarak kaydedebilirsiniz.

A later dedicated structural-revision design may extend Package 8 audit/history semantics. S15 must not weaken current history validation to force these edits through.

## 12. Error states

Write-back is a serialized transaction with one of these terminal outcomes:

- **APPLIED** — new immutable revision committed and product UI refreshed;
- **NO_CHANGE** — serialized MusicXML produces no product-semantic change;
- **STALE_SOURCE** — source changed while export/write-back was in flight;
- **UNSUPPORTED_STRUCTURE** — valid Smoosic edit exceeds S15 correction scope;
- **INVALID_XML** — candidate cannot be parsed/revalidated;
- **CONFLICT** — immutable history expectation changed;
- **PUBLISH_FAILED** — revision committed but current product refresh failed.

The last case requires special handling: do not create a second revision automatically. Keep the committed revision in authority state, show an error, and allow an explicit retry of product publication. The exact MusicXML is already registered against the revision.

## 13. Proposed file boundaries

### Modify

`src/smoosicEditorTabUi.js`
- add apply button/status behavior;
- own request serialization;
- validate postMessage source/origin/request identity;
- own per-root write-back workspace state;
- coordinate source-revision stale guards;
- call domain adapter and result publisher.

`experiments/smoosic-mobile/src/index.js`
- factor current MusicXML serialization so it can serve both existing local export and bridge requests;
- listen for exact same-origin export requests;
- return serialized MusicXML to parent;
- retain existing `XML Kaydet` behavior.

`src/app.js`
- expose a narrow function that republishes an already revalidated MusicXML revision through the existing analysis/result path;
- do not duplicate `handleAnalysisResult()`.

### Create

`src/services/smoosicProductWriteback.js`
- pure write-back/domain adapter;
- create/seed authority workspace;
- register root MusicXML;
- derive exact changed indexes;
- revalidate candidate;
- commit immutable product revision;
- advance workspace history;
- return typed outcomes.

`tests/smoosicProductWriteback.test.js`
- pure domain tests.

`tests/stageS15SmoosicWriteback.test.js`
- host protocol and stale-state tests.

`tests/fixtures/s15-smoosic-writeback-browser-proof.html`
- real-browser production proof fixture if needed by the existing browser harness pattern.

`scripts/verifyS15SmoosicWritebackBrowser.js`
- production build proof of source → edit candidate → committed revision → refreshed product.

No legacy Stage E/F/PR-D visible UI file should be re-enabled in `main.js`.

## 14. Testing strategy

Implementation must follow TDD.

### Domain tests

Prove:

- root authority session is created from exact accepted notes + MusicXML;
- pitch edit produces exactly one changed index;
- duration edit produces exact changed indexes;
- no-op candidate creates no revision;
- stale/foreign workspace state fails;
- old approval is not inherited;
- malformed MusicXML fails closed;
- 10 MB limit is enforced before expensive revalidation;
- note add/remove is classified unsupported, not partially committed;
- stable-locator changes are unsupported;
- exact revalidated MusicXML is registered to committed revision;
- undo/history invariants remain valid.

### Host protocol tests

Prove:

- wrong origin/source ignored;
- wrong request id ignored;
- old sourceRevision ignored;
- only one write-back request runs at a time;
- source replacement invalidates an in-flight request;
- successful apply does not reload the iframe;
- failed write-back leaves prior accepted source current.

### Browser proof

At minimum:

1. load fixture MusicXML;
2. open Smoosic;
3. make one supported visible edit;
4. request apply;
5. prove a new SesliTab revision exists;
6. prove result MusicXML changed;
7. prove Package 3 current notes changed;
8. prove fresh quality evidence is bound to the new exact note array;
9. prove playback remains available according to Stage H policy;
10. prove Guitar TAB/violin consumers refresh according to their existing quality decisions;
11. prove the iframe remains usable after commit;
12. replace the source and prove stale write-back cannot overwrite it.

## 15. SonarQube / CI acceptance gates

S15 is not complete unless the exact implementation head satisfies:

- normal CI: PASS;
- production build: PASS;
- existing S14/STI browser regression proofs: PASS;
- Playwright protected baseline: PASS;
- SonarQube analysis: PASS;
- SonarQube Quality Gate: **OK**;
- no new unresolved Security issue introduced by the bridge protocol;
- new-code coverage meets the configured gate threshold;
- new bridge/domain files should target full branch/decision coverage where practical.

Existing backlog issue counts are not a reason to rewrite unrelated deterministic revision/fingerprint code.

Current baseline at design time:

- main CI `35511901850`: PASS;
- Regression Quality `35511901848`: PASS;
- Sonar diagnostics `35512035811`: PASS;
- Quality Gate: OK;
- Security backlog: 22;
- Reliability backlog: 60.

## 16. Security considerations

The bridge is same-origin but still treats messages as untrusted input.

Required controls:

- exact `event.origin`;
- exact `event.source`;
- generated request ids using Web Crypto;
- source revision correlation;
- one pending request per host root;
- 10 MB candidate bound;
- XML reparsing/revalidation on the host;
- no HTML injection from error strings;
- no direct trust in iframe round-trip flags;
- no persistence of raw MusicXML outside the existing in-memory/product mechanisms introduced by this stage.

S15 introduces no network endpoint and no authentication claim.

## 17. Accessibility and UX

The apply action must:

- be a native button;
- expose a clear busy/disabled state during write-back;
- use the existing host live-status pattern;
- report success, unsupported structure, stale source, and validation failures in Turkish;
- never hide or disable Smoosic's existing XML export after a write-back failure.

Suggested success message:

> Düzenleme SesliTab'a uygulandı. Yeni sürüm doğrulandı ve çıktılar güncellendi.

## 18. Rollout sequence

The implementation should be split into small PR-sized slices, but all remain under this single S15 architecture:

1. protocol + serialization extraction, no product commit;
2. pure authority/write-back domain adapter with tests;
3. host apply transaction + stale guards;
4. republish through existing app result path;
5. production browser proof + regression hardening;
6. documentation reality sync.

No slice should temporarily create two canonical authorities.

## 19. Acceptance criteria

S15 is accepted when all of the following are true:

- teacher can edit a supported note in Smoosic and explicitly apply it;
- original source revision remains immutable;
- a new immutable SesliTab revision is created;
- edited MusicXML is reparsed and structurally revalidated;
- old approval/quality evidence is not inherited;
- SesliTab result panels and subscribers use the new revision;
- stale source cannot be overwritten by an older editor transaction;
- unsupported structural edits are preserved in Smoosic and can still be exported;
- old teacher/keypad UI remains retired;
- all existing S14/STI behavior remains green;
- SonarQube Quality Gate remains OK.

## 20. Later work intentionally deferred

After S15 is proven, separate architecture work can consider:

- full structural revision history for note insertion/deletion and voice/staff changes;
- provisional/editable Guitar TAB workbench;
- unified revision-aware MusicXML/TAB/MIDI export;
- current-revision undo/redo controls outside Smoosic if product UX requires them;
- physical iPhone/Safari/VoiceOver and Android/TalkBack acceptance.

These are not prerequisites for the first safe write-back bridge.
