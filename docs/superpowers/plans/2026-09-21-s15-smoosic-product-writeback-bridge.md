# S15 Smoosic Product Write-back Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a supported Smoosic score edit explicitly commit as a new immutable SesliTab revision, revalidate the exact edited MusicXML, and refresh current playback/TAB/violin/MIDI/result consumers without reviving the retired legacy editor UI.

**Architecture:** Smoosic remains the visible editing surface and sends a bounded, versioned same-origin MusicXML candidate to the SesliTab host only when the teacher presses `Düzenlemeyi SesliTab'a Uygula`. A new pure `smoosicProductWriteback` domain adapter reuses the existing Package 8 / PR-D revision and revalidation contracts, while `src/app.js` republishes the committed exact revision through the existing result pipeline. The host serializes transactions, rejects stale/foreign messages, and preserves the last accepted SesliTab revision when a candidate is invalid or structurally unsupported.

**Tech Stack:** Node.js 24, browser ES modules, Vite 8.2.0, Smoosic embedded same-origin iframe, Web Crypto `randomUUID()`, `postMessage`, Node `node:test`, existing Chromium/CDP browser proof scripts, GitHub Actions, Playwright protected baseline, SonarQube Cloud.

**Spec:** `docs/superpowers/specs/2026-09-21-s15-smoosic-product-writeback-bridge-design.md`

## Global Constraints

- Smoosic is the visible editor; SesliTab remains the canonical product/revision/quality authority.
- The existing imported/root revision is immutable.
- Every committed edit creates a new Package 8 teacher-corrected revision.
- Old quality evidence and old approval applicability must not transfer to the new revision.
- The existing Smoosic `XML Kaydet` behavior must remain available even when write-back is rejected.
- The first S15 production slice supports only same-cardinality edits that preserve stable part/measure/voice/staff/grace/chord locator identity.
- Note insertion/deletion and stable-locator-changing edits must fail closed as `UNSUPPORTED_STRUCTURE`; they remain in Smoosic and remain exportable.
- Candidate MusicXML is bounded by `MAX_MUSIC_XML_FILE_SIZE = 10 * 1024 * 1024`.
- Host acceptance requires exact `event.origin`, exact `event.source`, exact pending `requestId`, exact `sourceRevision`, and a connected current iframe.
- Existing retired Stage E/F/PR-D visible UI must remain absent from `main.js`.
- Existing S14/STI browser regression proofs must remain green.
- Normal CI, production build, Playwright protected baseline, SonarQube analysis, and SonarQube Quality Gate must pass on the exact implementation head.
- No new unresolved Security issue may be introduced by the bridge protocol.

## Review Focus

1. **Very large but valid-looking iframe response:** a candidate at exactly the 10 MB boundary is processed, while one byte over the limit is rejected before structural revalidation. Task 2 pins this with byte-length tests.
2. **Source replacement during an in-flight export:** a response for the old `sourceRevision` must be ignored even when its `requestId` is otherwise valid. Task 4 pins this with host protocol tests and Task 5 repeats it in real Chromium.
3. **Structurally valid but unsupported edit:** note insertion/deletion or voice/staff relocation must not partially commit any revision; the previous accepted revision stays current and XML export remains usable. Task 2 and Task 5 pin this.
4. **Second supported edit after a first successful write-back:** history must extend the first corrected revision rather than silently creating a new root workspace. Task 2 pins a two-commit chain and Task 4 pins retained authority state.
5. **Publish failure after domain commit:** the committed revision must remain authoritative in memory, no second revision may be created automatically, and an explicit publish retry must reuse the exact registered MusicXML. Task 4 pins the retry state.

---

### Task 1: Add the versioned Smoosic export bridge without changing local XML export

**Files:**
- Modify: `experiments/smoosic-mobile/src/index.js:633-680` and the initialization/wiring section near the existing `mobile-xml-export` listener
- Create: `tests/stageS15SmoosicWriteback.test.js`

**Interfaces:**
- Consumes: existing `applicationInstance`, `editorReady`, `SmoToXml`, `XmlToSmo`, `sameScoreShape()`, `sameSemanticScore()`, `currentScoreBaseName`
- Produces: internal `serializeCurrentMusicXml()` returning `{ musicXml, fileName, roundTripOk, shapeOk, semanticOk }`; exact message types `seslitab:smoosic-export-request` and `seslitab:smoosic-export-result`

- [ ] **Step 1: Write the failing protocol/source-contract test**

Create `tests/stageS15SmoosicWriteback.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const editor = readFileSync(
  new URL('../experiments/smoosic-mobile/src/index.js', import.meta.url),
  'utf8',
)

test('S15 exposes a non-downloading MusicXML serializer for the host bridge', () => {
  assert.match(editor, /function serializeCurrentMusicXml\(\)/)
  assert.match(editor, /SmoToXml\.convert\(sourceScore\)/)
  assert.match(editor, /return \{[\s\S]*musicXml: xmlText,[\s\S]*fileName,[\s\S]*roundTripOk,[\s\S]*shapeOk,[\s\S]*semanticOk/)
})

test('S15 uses an exact same-origin versioned postMessage protocol', () => {
  assert.match(editor, /seslitab:smoosic-export-request/)
  assert.match(editor, /seslitab:smoosic-export-result/)
  assert.match(editor, /event\.source !== parent/)
  assert.match(editor, /event\.origin !== window\.location\.origin/)
  assert.match(editor, /version !== 1/)
  assert.match(editor, /requestId/)
  assert.match(editor, /sourceRevision/)
  assert.match(editor, /event\.source\.postMessage\([\s\S]*event\.origin/)
})

test('S15 keeps local XML Kaydet separate from host write-back', () => {
  assert.match(editor, /async function exportMusicXml\(\)/)
  assert.match(editor, /navigator\.share/)
  assert.match(editor, /URL\.createObjectURL/)
  assert.match(editor, /serializeCurrentMusicXml\(\)/)
})
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
node --test tests/stageS15SmoosicWriteback.test.js
```

Expected: FAIL because `serializeCurrentMusicXml()` and the S15 message protocol do not exist yet.

- [ ] **Step 3: Extract serialization from `exportMusicXml()`**

Refactor the current serialization block into this exact shape:

```js
function serializeCurrentMusicXml() {
  if (!editorReady || !applicationInstance || !applicationInstance.view) {
    throw new Error('Editör henüz hazır değil')
  }

  stopNativePlayback()
  const sourceScore = applicationInstance.view.storeScore || applicationInstance.view.score
  const xmlDom = SmoToXml.convert(sourceScore)
  const xmlText = new XMLSerializer().serializeToString(xmlDom)
  if (!xmlText || !xmlText.includes('<score-')) {
    throw new Error('MusicXML üretilemedi')
  }

  const parsed = new DOMParser().parseFromString(xmlText, 'text/xml')
  if (parsed.querySelector('parsererror')) {
    throw new Error('Üretilen MusicXML yeniden ayrıştırılamadı')
  }

  const roundTripScore = XmlToSmo.convert(parsed)
  const shapeOk = sameScoreShape(scoreShape(sourceScore), scoreShape(roundTripScore))
  const semanticOk = sameSemanticScore(sourceScore, roundTripScore)
  const roundTripOk = shapeOk && semanticOk
  const fileName = `${currentScoreBaseName}-edited.musicxml`

  return Object.freeze({
    musicXml: xmlText,
    fileName,
    roundTripOk,
    shapeOk,
    semanticOk,
  })
}
```

Change `exportMusicXml()` to call `serializeCurrentMusicXml()`, build the `File`, set the same existing status text, and preserve the current Web Share/download fallback unchanged.

- [ ] **Step 4: Add the iframe request listener**

Add:

```js
const SESLITAB_EXPORT_REQUEST = 'seslitab:smoosic-export-request'
const SESLITAB_EXPORT_RESULT = 'seslitab:smoosic-export-result'
const SESLITAB_EXPORT_VERSION = 1

function handleSesliTabExportRequest(event) {
  if (event.source !== parent) return
  if (event.origin !== window.location.origin) return

  const message = event.data
  if (!message || typeof message !== 'object') return
  if (message.type !== SESLITAB_EXPORT_REQUEST) return
  if (message.version !== SESLITAB_EXPORT_VERSION) return
  if (typeof message.requestId !== 'string' || !message.requestId) return
  if (!Number.isSafeInteger(message.sourceRevision) || message.sourceRevision < 0) return

  try {
    const serialized = serializeCurrentMusicXml()
    event.source.postMessage({
      type: SESLITAB_EXPORT_RESULT,
      version: SESLITAB_EXPORT_VERSION,
      requestId: message.requestId,
      sourceRevision: message.sourceRevision,
      fileName: serialized.fileName,
      musicXml: serialized.musicXml,
      roundTripOk: serialized.roundTripOk,
      shapeOk: serialized.shapeOk,
      semanticOk: serialized.semanticOk,
    }, event.origin)
  } catch (error) {
    event.source.postMessage({
      type: SESLITAB_EXPORT_RESULT,
      version: SESLITAB_EXPORT_VERSION,
      requestId: message.requestId,
      sourceRevision: message.sourceRevision,
      fileName: `${currentScoreBaseName}-edited.musicxml`,
      musicXml: '',
      error: String(error?.message || 'MusicXML üretilemedi'),
    }, event.origin)
  }
}
```

Register exactly once during the existing editor initialization:

```js
window.addEventListener('message', handleSesliTabExportRequest)
```

Do not use `'*'` as `targetOrigin`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test tests/stageS15SmoosicWriteback.test.js tests/stageS14SmoosicTabIntegration.test.js
```

Expected: PASS.

- [ ] **Step 6: Build the Smoosic production bundle**

Run:

```bash
npm run smoosic:prepare
```

Expected: PASS; `public/smoosic-editor/build/mobile.js` is produced and the existing `XML Kaydet` control remains present.

- [ ] **Step 7: Commit Task 1**

```bash
git add experiments/smoosic-mobile/src/index.js tests/stageS15SmoosicWriteback.test.js
git commit -m "feat: add Smoosic writeback export protocol"
```

---

### Task 2: Build the pure immutable Smoosic product write-back domain adapter

**Files:**
- Create: `src/services/smoosicProductWriteback.js`
- Create: `tests/smoosicProductWriteback.test.js`

**Interfaces:**
- Consumes:
  - `createTeacherWorkspace({ content, actorId, sourceId, automaticRevisionId, historyId, createdAt })`
  - `getTeacherWorkspaceCurrentRevision(workspace)`
  - `withTeacherWorkspaceAuthoritativeHistory({ workspace, history })`
  - `refreshTeacherWorkspace(workspace)`
  - `registerPrDProductMusicXml(revision, musicXml, options)`
  - `resolvePrDProductMusicXml(revision)`
  - `revalidatePrDEditorMusicXml({ musicXml, currentRevision, changedIndexes, DOMParserCtor })`
  - `commitPrDProductRevision({ workspace, revalidated, revisionId, eventId, operationIdPrefix, createdAt })`
- Produces:
  - `SMOOSIC_WRITEBACK_STATUS`
  - `createSmoosicProductAuthority(options)`
  - `applySmoosicProductWriteback(options)`

Use these exact statuses:

```js
export const SMOOSIC_WRITEBACK_STATUS = Object.freeze({
  APPLIED: 'APPLIED',
  NO_CHANGE: 'NO_CHANGE',
  UNSUPPORTED_STRUCTURE: 'UNSUPPORTED_STRUCTURE',
  INVALID_XML: 'INVALID_XML',
  CONFLICT: 'CONFLICT',
})
```

- [ ] **Step 1: Write domain fixtures and failing root-authority tests**

Start `tests/smoosicProductWriteback.test.js` with the repository's DOMParser bootstrap and a stable 4/4 source:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import '../scripts/runOmrQualityReport.js'

import { parseMusicXmlToNotes } from '../src/services/musicEngine.js'
import {
  SMOOSIC_WRITEBACK_STATUS,
  applySmoosicProductWriteback,
  createSmoosicProductAuthority,
} from '../src/services/smoosicProductWriteback.js'
import {
  approveTeacherWorkspace,
  getTeacherWorkspaceApplicableApproval,
  getTeacherWorkspaceCurrentRevision,
} from '../src/services/teacherWorkspaceModel.js'
import { MAX_MUSIC_XML_FILE_SIZE } from '../src/services/musicXmlFile.js'
import { resolvePrDProductMusicXml } from '../src/services/editorPrDRevisionMusicXmlRegistry.js'

const SOURCE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes>
      <divisions>1</divisions>
      <time><beats>4</beats><beat-type>4</beat-type></time>
      <clef><sign>G</sign><line>2</line></clef>
    </attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
  </measure></part>
</score-partwise>`

function sourceNotes() {
  const parsed = parseMusicXmlToNotes(SOURCE_XML)
  assert.equal(Boolean(parsed.error), false)
  assert.equal(parsed.notes.length, 4)
  return parsed.notes
}

function authority() {
  return createSmoosicProductAuthority({
    notes: sourceNotes(),
    musicXml: SOURCE_XML,
    sourceId: 's15-source-1',
    automaticRevisionId: 's15-auto-1',
    historyId: 's15-history-1',
    actorId: 'smoosic-local-editor',
    createdAt: '2026-09-21T10:00:00Z',
  })
}

test('creates one immutable root authority and registers its exact MusicXML', () => {
  const value = authority()
  const revision = getTeacherWorkspaceCurrentRevision(value.workspace)
  assert.equal(revision.revisionId, 's15-auto-1')
  assert.equal(revision.revisionKind, 'automatic')
  assert.equal(revision.content.length, 4)
  assert.equal(resolvePrDProductMusicXml(revision)?.musicXml, SOURCE_XML)
})
```

- [ ] **Step 2: Run the domain test and verify it fails**

Run:

```bash
node --test tests/smoosicProductWriteback.test.js
```

Expected: FAIL because `src/services/smoosicProductWriteback.js` does not exist.

- [ ] **Step 3: Implement root authority creation and input bounds**

Create `src/services/smoosicProductWriteback.js` with these imports and root constructor:

```js
import { MAX_MUSIC_XML_FILE_SIZE } from './musicXmlFile.js'
import { parseMusicXmlToNotes } from './musicEngine.js'
import { extractPrDProductNotationByIndex } from './editorPrDNotationBridge.js'
import {
  commitPrDProductRevision,
  revalidatePrDEditorMusicXml,
} from './editorPrDProductPipeline.js'
import {
  registerPrDProductMusicXml,
  resolvePrDProductMusicXml,
} from './editorPrDRevisionMusicXmlRegistry.js'
import {
  createTeacherWorkspace,
  getTeacherWorkspaceCurrentRevision,
  refreshTeacherWorkspace,
  withTeacherWorkspaceAuthoritativeHistory,
} from './teacherWorkspaceModel.js'

export const SMOOSIC_WRITEBACK_STATUS = Object.freeze({
  APPLIED: 'APPLIED',
  NO_CHANGE: 'NO_CHANGE',
  UNSUPPORTED_STRUCTURE: 'UNSUPPORTED_STRUCTURE',
  INVALID_XML: 'INVALID_XML',
  CONFLICT: 'CONFLICT',
})

const STABLE_LOCATOR_FIELDS = Object.freeze([
  'partId',
  'partIndex',
  'measureIndex',
  'measureKey',
  'voice',
  'staff',
  'isGrace',
  'isChordNote',
])

const SEMANTIC_FIELDS = Object.freeze([
  'partId',
  'partIndex',
  'measureIndex',
  'measureKey',
  'voice',
  'staff',
  'isRest',
  'isGrace',
  'isChordNote',
  'startBeat',
  'durationValue',
  'duration',
  'beats',
  'dotCount',
  'tieStart',
  'tieStop',
  'tieContinue',
  'step',
  'alter',
  'octave',
  'midi',
  'frequency',
  'noteName',
  'string',
  'stringLetter',
  'stringNumber',
  'fret',
])

function musicXmlByteLength(value) {
  return new TextEncoder().encode(value).byteLength
}

function validMusicXml(value) {
  return typeof value === 'string'
    && value.trim() !== ''
    && value.includes('<score-')
    && musicXmlByteLength(value) <= MAX_MUSIC_XML_FILE_SIZE
}

export function createSmoosicProductAuthority({
  notes,
  musicXml,
  sourceId,
  automaticRevisionId,
  historyId,
  actorId = 'smoosic-local-editor',
  createdAt = null,
} = {}) {
  if (!Array.isArray(notes) || notes.length === 0) {
    throw new TypeError('Smoosic product authority requires non-empty current notes.')
  }
  if (!validMusicXml(musicXml)) {
    throw new TypeError('Smoosic product authority requires bounded MusicXML.')
  }

  const workspace = createTeacherWorkspace({
    content: notes,
    actorId,
    sourceId,
    automaticRevisionId,
    historyId,
    createdAt,
  })
  const revision = getTeacherWorkspaceCurrentRevision(workspace)
  registerPrDProductMusicXml(revision, musicXml, {
    evidence: 'smoosic-accepted-source',
  })

  return Object.freeze({ workspace })
}
```

- [ ] **Step 4: Add failing tests for exact changes, no-op, structural rejection, and the 10 MB boundary**

Append tests:

```js
test('applies one pitch edit as one new immutable revision', () => {
  const root = authority()
  const approvedWorkspace = approveTeacherWorkspace({
    workspace: root.workspace,
    approvalId: 'root-approval-1',
    createdAt: '2026-09-21T10:00:30Z',
  })
  assert.ok(getTeacherWorkspaceApplicableApproval(approvedWorkspace))

  const approvedAuthority = Object.freeze({ workspace: approvedWorkspace })
  const candidate = SOURCE_XML.replace('<step>C</step>', '<step>G</step>')
  const result = applySmoosicProductWriteback({
    authority: approvedAuthority,
    musicXml: candidate,
    revisionId: 's15-edit-1',
    eventId: 's15-event-1',
    operationIdPrefix: 's15-op-1',
    createdAt: '2026-09-21T10:01:00Z',
    DOMParserCtor: DOMParser,
  })

  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.APPLIED)
  assert.deepEqual(result.changedIndexes, [0])
  assert.equal(result.revision.revisionId, 's15-edit-1')
  assert.equal(result.authority.workspace.history.revisions.length, 2)
  assert.equal(resolvePrDProductMusicXml(result.revision)?.musicXml, candidate)
  assert.equal(getTeacherWorkspaceApplicableApproval(result.authority.workspace), null)
})

test('returns NO_CHANGE without creating a revision for exact current MusicXML', () => {
  const root = authority()
  const result = applySmoosicProductWriteback({
    authority: root,
    musicXml: SOURCE_XML,
    revisionId: 'unused-revision',
    eventId: 'unused-event',
    operationIdPrefix: 'unused-op',
    DOMParserCtor: DOMParser,
  })
  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.NO_CHANGE)
  assert.equal(result.authority.workspace.history.revisions.length, 1)
})

test('rejects note removal as unsupported structure without partial history', () => {
  const root = authority()
  const candidate = SOURCE_XML.replace(
    '<note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>',
    '',
  )
  const result = applySmoosicProductWriteback({
    authority: root,
    musicXml: candidate,
    revisionId: 's15-structural-1',
    eventId: 's15-structural-event-1',
    operationIdPrefix: 's15-structural-op-1',
    DOMParserCtor: DOMParser,
  })
  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.UNSUPPORTED_STRUCTURE)
  assert.equal(root.workspace.history.revisions.length, 1)
})

test('rejects a voice relocation as unsupported structure', () => {
  const root = authority()
  const candidate = SOURCE_XML.replace('<voice>1</voice>', '<voice>2</voice>')
  const result = applySmoosicProductWriteback({
    authority: root,
    musicXml: candidate,
    revisionId: 's15-voice-1',
    eventId: 's15-voice-event-1',
    operationIdPrefix: 's15-voice-op-1',
    DOMParserCtor: DOMParser,
  })
  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.UNSUPPORTED_STRUCTURE)
  assert.equal(root.workspace.history.revisions.length, 1)
})

test('accepts the exact byte limit and rejects one byte over it before revalidation', () => {
  const root = authority()
  const sourceBytes = new TextEncoder().encode(SOURCE_XML).byteLength
  const exactLimit = SOURCE_XML + ' '.repeat(MAX_MUSIC_XML_FILE_SIZE - sourceBytes)
  const exact = applySmoosicProductWriteback({
    authority: root,
    musicXml: exactLimit,
    revisionId: 'exact-limit',
    eventId: 'exact-limit-event',
    operationIdPrefix: 'exact-limit-op',
    DOMParserCtor: DOMParser,
  })
  assert.equal(exact.status, SMOOSIC_WRITEBACK_STATUS.NO_CHANGE)

  const oversized = exactLimit + ' '
  const result = applySmoosicProductWriteback({
    authority: root,
    musicXml: oversized,
    revisionId: 'oversized',
    eventId: 'oversized-event',
    operationIdPrefix: 'oversized-op',
    DOMParserCtor: DOMParser,
  })
  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.INVALID_XML)
  assert.equal(root.workspace.history.revisions.length, 1)
})
```

- [ ] **Step 5: Implement exact change detection and typed write-back outcomes**

Add helpers:

```js
function sameValue(left, right) {
  if (typeof left === 'number' || typeof right === 'number') {
    return typeof left === 'number'
      && typeof right === 'number'
      && Number.isFinite(left)
      && Number.isFinite(right)
      && Math.abs(left - right) <= 1e-9
  }
  return Object.is(left ?? null, right ?? null)
}

function parseCandidate(musicXml, DOMParserCtor) {
  const parsed = parseMusicXmlToNotes(musicXml)
  if (parsed?.error || !Array.isArray(parsed?.notes) || parsed.notes.length === 0) {
    throw new Error(parsed?.error || 'MusicXML semantic parse failed.')
  }
  const notation = extractPrDProductNotationByIndex(
    musicXml,
    { content: parsed.notes },
    { DOMParserCtor },
  )
  return Object.freeze({ notes: parsed.notes, notation })
}

function stableLocatorsMatch(currentRevision, candidateNotes) {
  if (currentRevision.content.length !== candidateNotes.length) return false
  for (let index = 0; index < candidateNotes.length; index += 1) {
    const current = currentRevision.content[index]
    const candidate = candidateNotes[index]
    for (const field of STABLE_LOCATOR_FIELDS) {
      if (!sameValue(current?.[field], candidate?.[field])) return false
    }
  }
  return true
}

function changedIndexesFor({
  currentRevision,
  currentMusicXml,
  candidateMusicXml,
  DOMParserCtor,
}) {
  const current = parseCandidate(currentMusicXml, DOMParserCtor)
  const candidate = parseCandidate(candidateMusicXml, DOMParserCtor)

  if (!stableLocatorsMatch(currentRevision, candidate.notes)) {
    return Object.freeze({ supported: false, changedIndexes: Object.freeze([]) })
  }

  const changedIndexes = []
  for (let index = 0; index < candidate.notes.length; index += 1) {
    const semanticChanged = SEMANTIC_FIELDS.some(
      (field) => !sameValue(current.notes[index]?.[field], candidate.notes[index]?.[field]),
    )
    const notationChanged =
      JSON.stringify(current.notation[index] ?? null)
      !== JSON.stringify(candidate.notation[index] ?? null)

    if (semanticChanged || notationChanged) changedIndexes.push(index)
  }

  return Object.freeze({
    supported: true,
    changedIndexes: Object.freeze(changedIndexes),
  })
}
```

Then implement:

```js
export function applySmoosicProductWriteback({
  authority,
  musicXml,
  revisionId,
  eventId,
  operationIdPrefix,
  createdAt = null,
  DOMParserCtor = globalThis.DOMParser,
} = {}) {
  if (!authority?.workspace) {
    throw new TypeError('Smoosic product authority is required.')
  }
  if (!validMusicXml(musicXml)) {
    return Object.freeze({
      status: SMOOSIC_WRITEBACK_STATUS.INVALID_XML,
      authority,
    })
  }

  const currentRevision = getTeacherWorkspaceCurrentRevision(authority.workspace)
  const currentRecord = resolvePrDProductMusicXml(currentRevision)
  if (!currentRecord?.musicXml) {
    return Object.freeze({
      status: SMOOSIC_WRITEBACK_STATUS.CONFLICT,
      authority,
    })
  }

  let changeSet
  try {
    changeSet = changedIndexesFor({
      currentRevision,
      currentMusicXml: currentRecord.musicXml,
      candidateMusicXml: musicXml,
      DOMParserCtor,
    })
  } catch {
    return Object.freeze({
      status: SMOOSIC_WRITEBACK_STATUS.INVALID_XML,
      authority,
    })
  }

  if (!changeSet.supported) {
    return Object.freeze({
      status: SMOOSIC_WRITEBACK_STATUS.UNSUPPORTED_STRUCTURE,
      authority,
    })
  }
  if (changeSet.changedIndexes.length === 0) {
    return Object.freeze({
      status: SMOOSIC_WRITEBACK_STATUS.NO_CHANGE,
      authority,
      changedIndexes: changeSet.changedIndexes,
    })
  }

  let revalidated
  try {
    revalidated = revalidatePrDEditorMusicXml({
      musicXml,
      currentRevision,
      changedIndexes: changeSet.changedIndexes,
      DOMParserCtor,
    })
  } catch {
    return Object.freeze({
      status: SMOOSIC_WRITEBACK_STATUS.INVALID_XML,
      authority,
      changedIndexes: changeSet.changedIndexes,
    })
  }

  const committed = commitPrDProductRevision({
    workspace: authority.workspace,
    revalidated,
    revisionId,
    eventId,
    operationIdPrefix,
    createdAt,
  })

  if (!committed.ok) {
    return Object.freeze({
      status: SMOOSIC_WRITEBACK_STATUS.CONFLICT,
      authority,
      changedIndexes: changeSet.changedIndexes,
    })
  }

  const nextWorkspace = refreshTeacherWorkspace(
    withTeacherWorkspaceAuthoritativeHistory({
      workspace: authority.workspace,
      history: committed.result.history,
    }),
  )
  const nextAuthority = Object.freeze({ workspace: nextWorkspace })

  return Object.freeze({
    status: SMOOSIC_WRITEBACK_STATUS.APPLIED,
    authority: nextAuthority,
    revision: committed.revision,
    musicXml: committed.musicXml,
    changedIndexes: changeSet.changedIndexes,
  })
}
```

- [ ] **Step 6: Add the two-commit history regression**

Append:

```js
test('a second supported edit extends the first corrected revision', () => {
  const firstXml = SOURCE_XML.replace('<step>C</step>', '<step>G</step>')
  const first = applySmoosicProductWriteback({
    authority: authority(),
    musicXml: firstXml,
    revisionId: 's15-edit-1',
    eventId: 's15-event-1',
    operationIdPrefix: 's15-op-1',
    createdAt: '2026-09-21T10:01:00Z',
    DOMParserCtor: DOMParser,
  })
  assert.equal(first.status, SMOOSIC_WRITEBACK_STATUS.APPLIED)

  const secondXml = firstXml.replace('<step>D</step>', '<step>A</step>')
  const second = applySmoosicProductWriteback({
    authority: first.authority,
    musicXml: secondXml,
    revisionId: 's15-edit-2',
    eventId: 's15-event-2',
    operationIdPrefix: 's15-op-2',
    createdAt: '2026-09-21T10:02:00Z',
    DOMParserCtor: DOMParser,
  })

  assert.equal(second.status, SMOOSIC_WRITEBACK_STATUS.APPLIED)
  assert.equal(second.authority.workspace.history.revisions.length, 3)
  assert.equal(second.revision.parentRevisionId, 's15-edit-1')
  assert.equal(resolvePrDProductMusicXml(second.revision)?.musicXml, secondXml)
})
```

- [ ] **Step 7: Add the structurally valid duration/timeline regression**

Add a dedicated divisions=2 three-note fixture whose total measure duration remains exactly 4 beats while the first and last note durations trade places:

```js
const RHYTHM_SOURCE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Rhythm</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes>
      <divisions>2</divisions>
      <time><beats>4</beats><beat-type>4</beat-type></time>
    </attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>half</type></note>
  </measure></part>
</score-partwise>`

const RHYTHM_EDIT_XML = RHYTHM_SOURCE_XML
  .replace(
    '<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>',
    '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>half</type></note>',
  )
  .replace(
    '<note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>half</type></note>',
    '<note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>',
  )
```

Add the explicit regression:

```js
test('duration redistribution commits every note whose semantic timeline changes', () => {
  const parsed = parseMusicXmlToNotes(RHYTHM_SOURCE_XML)
  assert.equal(Boolean(parsed.error), false)

  const root = createSmoosicProductAuthority({
    notes: parsed.notes,
    musicXml: RHYTHM_SOURCE_XML,
    sourceId: 's15-rhythm-source',
    automaticRevisionId: 's15-rhythm-auto',
    historyId: 's15-rhythm-history',
    actorId: 'smoosic-local-editor',
    createdAt: '2026-09-21T11:00:00Z',
  })

  const result = applySmoosicProductWriteback({
    authority: root,
    musicXml: RHYTHM_EDIT_XML,
    revisionId: 's15-rhythm-edit',
    eventId: 's15-rhythm-event',
    operationIdPrefix: 's15-rhythm-op',
    createdAt: '2026-09-21T11:01:00Z',
    DOMParserCtor: DOMParser,
  })

  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.APPLIED)
  assert.deepEqual(result.changedIndexes, [0, 1, 2])
  assert.equal(result.revision.content[0].beats, 2)
  assert.equal(result.revision.content[1].startBeat, 2)
  assert.equal(result.revision.content[2].startBeat, 3)
})
```

The expected `[0, 1, 2]` is intentional: changing the first duration shifts the later `startBeat` values, so all three semantic note records change even though only the first and last XML duration/type elements were edited.

- [ ] **Step 8: Run domain tests and existing PR-D regression tests**

Run:

```bash
node --test tests/smoosicProductWriteback.test.js
node --test tests/teacherRevisionHistory.test.js tests/teacherRevisionConcurrency.test.js tests/editorPrDContracts.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit Task 2**

```bash
git add src/services/smoosicProductWriteback.js tests/smoosicProductWriteback.test.js
git commit -m "feat: add immutable Smoosic product writeback service"
```

---

### Task 3: Add a narrow current-revision publisher that reuses the existing SesliTab result path

**Files:**
- Modify: `src/app.js:483-543`
- Modify: `tests/stageS15SmoosicWriteback.test.js`

**Interfaces:**
- Consumes: `handleAnalysisResult(notes, xmlString, hasRhythm, options)`, `musicXmlHasRhythm(notes)`
- Produces: `applyRevalidatedMusicXmlRevision(notes, musicXml)`

- [ ] **Step 1: Add the failing source-contract test**

Append to `tests/stageS15SmoosicWriteback.test.js`:

```js
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8')

test('S15 republishes a committed revision through the existing result path', () => {
  assert.match(app, /export function applyRevalidatedMusicXmlRevision\(notes, musicXml\)/)
  assert.match(
    app,
    /handleAnalysisResult\(notes, musicXml, musicXmlHasRhythm\(notes\), \{ scrollToResults: false \}\)/,
  )
  assert.match(
    app,
    /function handleAnalysisResult\(notes, xmlString, hasRhythm, \{ scrollToResults = true \} = \{\}\)/,
  )
  assert.match(app, /if \(scrollToResults\) \{[\s\S]*scrollIntoView/)
})
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
node --test tests/stageS15SmoosicWriteback.test.js
```

Expected: FAIL because the exported publisher does not exist.

- [ ] **Step 3: Make result scrolling optional without changing normal intake**

Change the function signature:

```js
function handleAnalysisResult(
  notes,
  xmlString,
  hasRhythm,
  { scrollToResults = true } = {},
) {
```

Wrap the existing scroll block:

```js
if (scrollToResults) {
  setTimeout(() => {
    $('results-section').scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 300)
}
```

All existing PDF/MusicXML/TAB callers continue using the default `scrollToResults = true`.

- [ ] **Step 4: Export the narrow S15 publisher**

Immediately after `handleAnalysisResult()`, add:

```js
export function applyRevalidatedMusicXmlRevision(notes, musicXml) {
  if (!Array.isArray(notes) || notes.length === 0) {
    throw new TypeError('Revalidated revision requires non-empty notes.')
  }
  if (typeof musicXml !== 'string' || !musicXml.trim().includes('<score-')) {
    throw new TypeError('Revalidated revision requires MusicXML.')
  }

  handleAnalysisResult(
    notes,
    musicXml,
    musicXmlHasRhythm(notes),
    { scrollToResults: false },
  )
  return true
}
```

Do not create a second rendering/quality/TAB refresh implementation.

- [ ] **Step 5: Run focused tests and full unit suite**

Run:

```bash
node --test tests/stageS15SmoosicWriteback.test.js
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/app.js tests/stageS15SmoosicWriteback.test.js
git commit -m "feat: republish revalidated Smoosic revisions"
```

---

### Task 4: Wire the host apply transaction, stale guards, authority retention, and publish retry

**Files:**
- Modify: `src/smoosicEditorTabUi.js`
- Modify: `src/smoosicEditorTab.css`
- Modify: `tests/stageS15SmoosicWriteback.test.js`

**Interfaces:**
- Consumes:
  - `getPackage3MeasureSnapshot()`
  - `createSmoosicProductAuthority(options)`
  - `applySmoosicProductWriteback(options)`
  - `applyRevalidatedMusicXmlRevision(notes, musicXml)`
- Produces:
  - host button id `smoosic-apply-btn`
  - one pending bridge request per root
  - retained `state.authority`
  - retained `state.pendingPublication` for explicit publish retry
  - exact host messages/status states

- [ ] **Step 1: Add failing host security/state tests**

Append:

```js
const host = readFileSync(new URL('../src/smoosicEditorTabUi.js', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/smoosicEditorTab.css', import.meta.url), 'utf8')

test('S15 host exposes one explicit apply control and secure request identity', () => {
  assert.match(host, /const APPLY_ID = 'smoosic-apply-btn'/)
  assert.match(host, /Düzenlemeyi SesliTab'a Uygula/)
  assert.match(host, /crypto\?\.randomUUID|randomUUID/)
  assert.match(host, /pendingWriteback/)
  assert.match(host, /pendingPublication/)
  assert.match(css, /#smoosic-apply-btn/)
  assert.match(css, /min-height:\s*44px/)
})

test('S15 host validates origin, source, request id and source revision', () => {
  assert.match(host, /event\.origin !== win\.location\.origin/)
  assert.match(host, /event\.source !== state\.frame\?\.contentWindow/)
  assert.match(host, /message\.requestId !== pending\.requestId/)
  assert.match(host, /message\.sourceRevision !== pending\.sourceRevision/)
})

test('S15 successful writeback republishes exact committed revision and retains authority', () => {
  assert.match(host, /applySmoosicProductWriteback/)
  assert.match(host, /applyRevalidatedMusicXmlRevision\(result\.revision\.content, result\.musicXml\)/)
  assert.match(host, /state\.authority = result\.authority/)
  assert.match(host, /state\.observedSourceXml = result\.musicXml/)
})

test('S15 unsupported structural edit remains exportable instead of becoming canonical', () => {
  assert.match(host, /UNSUPPORTED_STRUCTURE/)
  assert.match(host, /MusicXML olarak kaydedebilirsiniz/)
  assert.doesNotMatch(host, /initStagePrDKeypadIntegrationUi/)
})
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
node --test tests/stageS15SmoosicWriteback.test.js
```

Expected: FAIL because the host transaction does not exist.

- [ ] **Step 3: Add host imports, constants, and state**

At the top of `src/smoosicEditorTabUi.js`, import:

```js
import { getPackage3MeasureSnapshot } from '../package3MeasureBridge.js'
import { applyRevalidatedMusicXmlRevision } from './app.js'
import {
  SMOOSIC_WRITEBACK_STATUS,
  applySmoosicProductWriteback,
  createSmoosicProductAuthority,
} from './services/smoosicProductWriteback.js'
```

Add constants:

```js
const APPLY_ID = 'smoosic-apply-btn'
const WRITEBACK_TIMEOUT_MS = 45000
const WRITEBACK_REQUEST = 'seslitab:smoosic-export-request'
const WRITEBACK_RESULT = 'seslitab:smoosic-export-result'
const WRITEBACK_VERSION = 1
```

Extend state:

```js
authority: null,
authoritySourceXml: null,
authoritySourceName: null,
authoritySourceRevision: null,
pendingWriteback: null,
pendingPublication: null,
publishingWritebackXml: null,
writebackPromise: Promise.resolve(false),
writebackMessageHandler: null,
```

- [ ] **Step 4: Add secure ids and authority seeding**

Add:

```js
function secureId(root, prefix) {
  const scope = root?.defaultView?.crypto ?? globalThis.crypto
  if (typeof scope?.randomUUID !== 'function') {
    throw new Error('Güvenli düzenleme kimliği üretilemiyor.')
  }
  return `${prefix}-${scope.randomUUID()}`
}

function createAuthorityForAcceptedSource(root) {
  const state = stateFor(root)
  const source = acceptedSource(root)
  const snapshot = getPackage3MeasureSnapshot()
  if (!source || !Array.isArray(snapshot?.notes) || snapshot.notes.length === 0) {
    throw new Error('SesliTab current nota verisi düzenleme için hazır değil.')
  }

  if (
    state.authority
    && state.authoritySourceXml === source.xml
    && state.authoritySourceName === source.fileName
  ) {
    state.authoritySourceRevision = state.sourceRevision
    return state.authority
  }

  const authority = createSmoosicProductAuthority({
    notes: snapshot.notes,
    musicXml: source.xml,
    sourceId: secureId(root, 'smoosic-source'),
    automaticRevisionId: secureId(root, 'smoosic-auto'),
    historyId: secureId(root, 'smoosic-history'),
    actorId: 'smoosic-local-editor',
    createdAt: new Date().toISOString(),
  })
  state.authority = authority
  state.authoritySourceXml = source.xml
  state.authoritySourceName = source.fileName
  state.authoritySourceRevision = state.sourceRevision
  state.pendingPublication = null
  return authority
}
```

Before ordinary accepted-source promotion in `refreshObservedSource()`, ignore a partially published write-back while retry state is retained:

```js
if (
  state.pendingPublication
  && state.publishingWritebackXml
  && xml === state.publishingWritebackXml
) {
  return false
}
```

When `refreshObservedSource()` accepts a genuinely different XML source, clear:

```js
if (
  state.authority
  && (
    state.authoritySourceXml !== xml
    || state.authoritySourceName !== fileName
  )
) {
  state.authority = null
  state.authoritySourceXml = null
  state.authoritySourceName = null
  state.authoritySourceRevision = null
  state.pendingPublication = null
  state.publishingWritebackXml = null
}
```

Do not clear authority merely because a replacement entered the pending state. In the existing failed/cancelled replacement branch, if accepted XML is unchanged, update only:

```js
if (
  state.authority
  && state.authoritySourceXml === state.observedSourceXml
  && state.authoritySourceName === state.observedSourceName
) {
  state.authoritySourceRevision = state.sourceRevision
}
```

This preserves history after a failed replacement while still invalidating stale in-flight requests.

- [ ] **Step 5: Add exact message acceptance and request timeout**

Add:

```js
function validateWritebackMessage(root, event) {
  const state = stateFor(root)
  const pending = state.pendingWriteback
  const win = root.defaultView
  const message = event.data

  if (!pending || !win) return null
  if (event.origin !== win.location.origin) return null
  if (event.source !== state.frame?.contentWindow) return null
  if (!message || typeof message !== 'object') return null
  if (message.type !== WRITEBACK_RESULT || message.version !== WRITEBACK_VERSION) return null
  if (message.requestId !== pending.requestId) return null
  if (message.sourceRevision !== pending.sourceRevision) return null
  if (state.sourceRevision !== pending.sourceRevision) return null
  if (sourceTransitionPending(root)) return null

  return message
}
```

Bind one `message` listener per root. Its only job is to resolve the currently pending request when `validateWritebackMessage()` returns a message. Foreign/stale messages are ignored.

Implement `requestEditorMusicXml(root)` as a Promise that:

- creates `requestId = secureId(root, 'smoosic-writeback')`;
- captures `sourceRevision = state.sourceRevision`;
- stores resolve/reject/timeout in `state.pendingWriteback`;
- posts the exact request to `frame.contentWindow` with `targetOrigin = root.defaultView.location.origin`;
- clears the timeout and pending state on success/error;
- rejects after `WRITEBACK_TIMEOUT_MS`.

- [ ] **Step 6: Add publish retry before requesting another editor export**

Add:

```js
function publishCommittedRevision(root, committed) {
  const state = stateFor(root)
  state.publishingWritebackXml = committed.musicXml

  try {
    applyRevalidatedMusicXmlRevision(committed.revision.content, committed.musicXml)
    state.observedSourceXml = committed.musicXml
    state.lastSourceXml = committed.musicXml
    state.sourceRevision += 1
    state.authoritySourceXml = committed.musicXml
    state.authoritySourceName = state.observedSourceName || state.authoritySourceName
    state.authoritySourceRevision = state.sourceRevision
    state.lastSourceName = state.observedSourceName || state.lastSourceName
    state.pendingPublication = null
    state.publishingWritebackXml = null
    return true
  } catch (error) {
    // Keep the marker while publication is pending so the source observer does
    // not reinterpret a partially-written result DOM as a new external source.
    throw error
  }
}

function retryPendingPublication(root) {
  const state = stateFor(root)
  if (!state.pendingPublication) return false
  publishCommittedRevision(root, state.pendingPublication)
  setHostStatus(
    root,
    'Düzenleme SesliTab\'a uygulandı. Yeni sürüm doğrulandı ve çıktılar güncellendi.',
    'ready',
  )
  return true
}
```

In the apply button transaction, check `pendingPublication` first. If present, retry publication only; do **not** create another immutable revision.

- [ ] **Step 7: Implement serialized apply transaction**

Add an async transaction:

```js
async function applyEditorWriteback(root) {
  const state = stateFor(root)
  if (sourceTransitionPending(root)) {
    setHostStatus(root, 'Yeni eser hazırlanırken düzenleme uygulanamaz.', 'error')
    return false
  }

  if (state.pendingPublication) {
    try {
      return retryPendingPublication(root)
    } catch (error) {
      setHostStatus(root, error?.message || 'Güncel sürüm yayımlanamadı.', 'error')
      return false
    }
  }

  if (state.pendingWriteback) return false

  const authority = createAuthorityForAcceptedSource(root)
  setHostStatus(root, 'Düzenleme SesliTab için doğrulanıyor…', 'loading')

  const candidate = await requestEditorMusicXml(root)
  if (typeof candidate.musicXml !== 'string' || !candidate.musicXml.trim()) {
    setHostStatus(root, candidate.error || 'Editörden MusicXML alınamadı.', 'error')
    return false
  }

  const result = applySmoosicProductWriteback({
    authority,
    musicXml: candidate.musicXml,
    revisionId: secureId(root, 'smoosic-revision'),
    eventId: secureId(root, 'smoosic-edit-event'),
    operationIdPrefix: secureId(root, 'smoosic-operation'),
    createdAt: new Date().toISOString(),
    DOMParserCtor: root.defaultView?.DOMParser ?? globalThis.DOMParser,
  })

  if (result.status === SMOOSIC_WRITEBACK_STATUS.NO_CHANGE) {
    setHostStatus(root, 'SesliTab’a uygulanacak yeni bir müzikal değişiklik yok.', 'info')
    return true
  }

  if (result.status === SMOOSIC_WRITEBACK_STATUS.UNSUPPORTED_STRUCTURE) {
    setHostStatus(
      root,
      'Bu yapısal düzenleme editörde korunuyor ancak henüz SesliTab sürümüne uygulanamıyor. MusicXML olarak kaydedebilirsiniz.',
      'error',
    )
    return false
  }

  if (result.status !== SMOOSIC_WRITEBACK_STATUS.APPLIED) {
    setHostStatus(root, 'Düzenleme doğrulanamadı; mevcut SesliTab sürümü korunuyor.', 'error')
    return false
  }

  state.authority = result.authority
  state.pendingPublication = Object.freeze({
    revision: result.revision,
    musicXml: result.musicXml,
  })

  try {
    publishCommittedRevision(root, state.pendingPublication)
    setHostStatus(
      root,
      'Düzenleme SesliTab\'a uygulandı. Yeni sürüm doğrulandı ve çıktılar güncellendi.',
      'ready',
    )
    return true
  } catch (error) {
    setHostStatus(
      root,
      'Yeni sürüm kaydedildi ancak ekran güncellenemedi. Yeniden uygulayarak yayını tekrar deneyin.',
      'error',
    )
    return false
  }
}
```

Serialize calls by assigning `state.writebackPromise = state.writebackPromise.catch(() => false).then(() => applyEditorWriteback(root))` in the button handler.

- [ ] **Step 8: Add the host-side apply button and accessible styling**

In `ensureSmoosicEditorTab()`, create the status first, then:

```js
const applyButton = root.createElement('button')
applyButton.id = APPLY_ID
applyButton.type = 'button'
applyButton.className = 'smoosic-apply-button'
applyButton.textContent = 'Düzenlemeyi SesliTab\'a Uygula'
applyButton.setAttribute('aria-describedby', STATUS_ID)
applyButton.addEventListener('click', () => {
  const state = stateFor(root)
  state.writebackPromise = state.writebackPromise
    .catch(() => false)
    .then(() => applyEditorWriteback(root))
})
panel.appendChild(applyButton)
```

Keep the iframe below the host control.

In `src/smoosicEditorTab.css` add:

```css
#smoosic-apply-btn {
  min-height: 44px;
  max-width: 100%;
  margin: 0 0 0.75rem;
  padding: 0.65rem 0.9rem;
  font: inherit;
  cursor: pointer;
}

#smoosic-apply-btn:disabled {
  cursor: wait;
}

#smoosic-apply-btn:focus-visible {
  outline: 3px solid currentColor;
  outline-offset: 2px;
}
```

During an active request, disable the button; re-enable it in `finally`.

- [ ] **Step 9: Add host tests for stale source and publish retry**

Extend the source-contract tests so they require:

```js
assert.match(host, /state\.sourceRevision !== pending\.sourceRevision/)
assert.match(host, /sourceTransitionPending\(root\)/)
assert.match(host, /state\.pendingPublication = Object\.freeze/)
assert.match(host, /state\.publishingWritebackXml/)
assert.match(host, /if \(state\.pendingPublication\)/)
assert.match(host, /retryPendingPublication\(root\)/)
assert.match(host, /state\.authoritySourceXml === state\.observedSourceXml/)
assert.match(host, /state\.authoritySourceName === state\.observedSourceName/)
```

Also retain the existing S14 failed-replacement assertions unchanged.

- [ ] **Step 10: Run unit/integration tests**

Run:

```bash
node --test tests/stageS15SmoosicWriteback.test.js tests/smoosicProductWriteback.test.js
node --test tests/stageS14SmoosicTabIntegration.test.js
npm test
```

Expected: PASS.

- [ ] **Step 11: Commit Task 4**

```bash
git add src/smoosicEditorTabUi.js src/smoosicEditorTab.css tests/stageS15SmoosicWriteback.test.js
git commit -m "feat: wire Smoosic edits into SesliTab revisions"
```

---

### Task 5: Prove the full S15 transaction in the production browser bundle and add it to CI

**Files:**
- Create: `tests/fixtures/s15-smoosic-writeback-browser-proof.html`
- Create: `scripts/verifyS15SmoosicWritebackBrowser.js`
- Modify: `.github/workflows/ci.yml:52-55`
- Modify: `tests/stageS15SmoosicWriteback.test.js`

**Interfaces:**
- Consumes: built `dist/index.html`, built `dist/smoosic-editor/index.html`, host apply button, Smoosic toolbar `button[data-key="d"]`
- Produces: fail-closed browser evidence marker `data-s15-writeback="true"` and optional artifact `artifacts/s15-smoosic-writeback.json`

- [ ] **Step 1: Add the failing CI/source-contract test**

Append:

```js
const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
)

test('S15 real-browser proof is part of protected CI after source lifecycle acceptance', () => {
  assert.match(ci, /Verify S15 Smoosic write-back in real browser/)
  assert.match(ci, /node scripts\/verifyS15SmoosicWritebackBrowser\.js/)
  assert.match(packageJson.scripts.build, /smoosic:prepare/)
})
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
node --test tests/stageS15SmoosicWriteback.test.js
```

Expected: FAIL because the CI step/script do not exist.

- [ ] **Step 3: Create the browser proof fixture**

Create `tests/fixtures/s15-smoosic-writeback-browser-proof.html` as a small outer proof shell that loads `/index.html` in a 390×844 iframe and exposes these terminal markers on `document.body`:

```html
<body data-s15-writeback="pending">
  <iframe id="app-frame" src="/index.html" style="width:390px;height:844px;border:0"></iframe>
  <pre id="status">pending</pre>
</body>
```

The script in the fixture must:

1. assign this exact one-note MusicXML to the app's `musicxml-file-input`:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <score-partwise version="4.0">
     <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
     <part id="P1"><measure number="1">
       <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
       <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>
     </measure></part>
   </score-partwise>
   ```
2. open the MusicXML in SesliTab and wait for `xml-output` to contain `<step>C</step>`;
3. open `Nota Düzenle`;
4. wait for Smoosic status `Yüklendi: s15-writeback.musicxml`;
5. click `editorDoc.querySelector('button[data-key="d"]')` so the selected C becomes D;
6. click host `#smoosic-apply-btn`;
7. wait for host status to contain `Yeni sürüm doğrulandı`;
8. assert `xml-output` now contains `<step>D</step>` and not the old first-note C pitch;
9. assert the Smoosic iframe is still connected and visible;
10. assert `#guitar-tab-output` and violin/current consumer regions reach the same terminal policy state they normally use after a fresh MusicXML result rather than remaining stale;
11. start a second source replacement and, before it completes, deliver an old write-back response; assert the old response cannot overwrite the replacement/current source;
12. set `data-s15-writeback="true"` only after all checks pass.

For the stale-response step, use the host's actual pending request metadata only through the real message flow: start an apply request, then start source replacement before the Smoosic result is accepted. Do not mutate host state directly.

- [ ] **Step 4: Create the fail-closed Chromium verifier**

Create `scripts/verifyS15SmoosicWritebackBrowser.js` using the same static-dist server and Chrome discovery rules as the current S14 production verifiers:

```js
const candidates = [
  process.env.CHROME_BIN,
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
].filter(Boolean)
```

Required build artifacts:

```js
for (const required of [
  resolve(distRoot, 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'build', 'mobile.js'),
]) {
  if (!existsSync(required)) {
    console.error(`S15 write-back proof failed closed: missing build artifact ${required}`)
    process.exit(1)
  }
}
```

Serve the fixture at `/__s15-writeback.html`, launch Chromium headless with a bounded wall timeout, dump/evaluate the terminal page, and fail unless the final HTML contains:

```text
data-s15-writeback="true"
```

Also write `artifacts/s15-smoosic-writeback.json` containing:

```json
{
  "documentType": "S15SmoosicWritebackEvidence",
  "evidenceClass": "CHROMIUM_REAL_BROWSER_PRODUCTION_BUNDLE",
  "supportedEditCommitted": true,
  "freshProductPublished": true,
  "staleWritebackRejected": true,
  "editorRemainedUsable": true,
  "physicalIphoneSafariVerified": false
}
```

- [ ] **Step 5: Add the S15 proof to CI**

Immediately after the existing S14 complete source lifecycle step, add:

```yaml
      - name: Verify S15 Smoosic write-back in real browser
        run: node scripts/verifyS15SmoosicWritebackBrowser.js

      - name: Upload S15 Smoosic write-back evidence
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: s15-smoosic-writeback
          path: artifacts/s15-smoosic-writeback.json
          if-no-files-found: warn
```

Do not remove or weaken any S14/STI step.

- [ ] **Step 6: Run production build and the new browser proof**

Run:

```bash
npm run build
node scripts/verifyS15SmoosicWritebackBrowser.js
```

Expected: PASS and `artifacts/s15-smoosic-writeback.json` reports all four true proof fields.

- [ ] **Step 7: Re-run the existing S14 source lifecycle and failed-replacement proofs**

Run:

```bash
node scripts/verifyS14FailedReplacementBrowser.js
node scripts/verifyS14SourceLifecycleAcceptanceBrowser.js
node scripts/verifyS14MobileScrollSettleProductionBrowser.js
```

Expected: PASS.

- [ ] **Step 8: Run full unit suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 9: Commit Task 5**

```bash
git add tests/fixtures/s15-smoosic-writeback-browser-proof.html scripts/verifyS15SmoosicWritebackBrowser.js .github/workflows/ci.yml tests/stageS15SmoosicWriteback.test.js
git commit -m "test: prove S15 Smoosic writeback in production browser"
```

---

### Task 6: Synchronize architecture documentation and run the release-quality gates

**Files:**
- Modify: `docs/current-status.md`
- Modify: `docs/product-architecture.md`
- Modify: `docs/superpowers/specs/2026-09-21-s15-smoosic-product-writeback-bridge-design.md` only to mark the implemented state after evidence exists
- Notion update after exact-head verification: `S15 — Smoosic Product Write-back Bridge Design` and `Production Architecture & Capability Audit — 2026-09-21`

**Interfaces:**
- Consumes: exact implementation commit SHA, CI run ids, SonarQube diagnostics
- Produces: documentation that describes one current Smoosic-visible-editor / SesliTab-authority architecture

- [ ] **Step 1: Update repository status docs only after Task 5 passes**

In `docs/current-status.md`, record:

```markdown
## S15 Smoosic Product Write-back

Status: production-integrated on the exact revision listed below.

Smoosic remains the visible editor. Supported same-cardinality edits are explicitly applied through the S15 bridge, revalidated by SesliTab, committed as new immutable Package 8 revisions, and republished through the current result pipeline. Unsupported structural edits remain in Smoosic and remain exportable but are not promoted as canonical.

The retired Stage E/F/PR-D visible editor UI remains disabled.
```

In `docs/product-architecture.md`, make the current authority flow explicit:

```text
Accepted MusicXML
  -> Smoosic visible editor
  -> explicit S15 apply transaction
  -> SesliTab structural revalidation
  -> immutable Package 8 corrected revision
  -> fresh quality evidence
  -> current Package 3 / playback / Guitar TAB / violin / MIDI consumers
```

Do not describe arbitrary structural write-back as supported.

- [ ] **Step 2: Run all local release-quality commands**

Run:

```bash
npm test
npm run build
node scripts/verifyS15SmoosicWritebackBrowser.js
node scripts/verifyS14SmoosicProductionCdpBrowser.js
node scripts/verifyS14FailedReplacementBrowser.js
node scripts/verifyS14SourceLifecycleAcceptanceBrowser.js
node scripts/verifyS14MobileScrollSettleProductionBrowser.js
node scripts/verifySti17CrossRealmBrowser.js
node scripts/verifySti17SingleSelectionAuthorityBrowser.js
node scripts/verifySti17MobileEditorCleanupBrowser.js
node scripts/verifyPrCKeypadBrowser.js
node scripts/verifyPrDEditorBrowser.js
node scripts/verifyPrECoexistenceBrowser.js
node scripts/verifyPrFAccessibilityBrowser.js
```

Expected: every command PASS.

- [ ] **Step 3: Commit documentation sync**

```bash
git add docs/current-status.md docs/product-architecture.md docs/superpowers/specs/2026-09-21-s15-smoosic-product-writeback-bridge-design.md
git commit -m "docs: sync architecture after S15 writeback"
```

- [ ] **Step 4: Open the implementation PR and wait for protected checks**

The PR description must explicitly state:

```markdown
- Smoosic remains the visible editor.
- SesliTab remains the immutable revision/quality authority.
- No legacy teacher/keypad UI was restored.
- Unsupported structural edits remain exportable but are not canonically committed.
- Existing S14/STI assertions were not weakened.
```

Protected checks required before merge:

- `test-and-build`: PASS
- Regression Quality / Playwright: PASS
- SonarQube analysis: PASS
- SonarQube Quality Gate: OK
- S15 production browser proof: PASS

Do not bypass branch protection.

- [ ] **Step 5: Inspect SonarQube exact-head diagnostics before merge**

Compare the exact implementation head against the design baseline:

```text
Security baseline: 22
Reliability baseline: 60
Quality Gate baseline: OK
```

Acceptance rules:

- no new unresolved bridge-related Security issue;
- Quality Gate remains OK;
- new-code coverage satisfies the configured threshold;
- no unrelated cleanup of deterministic revision/fingerprint `.sort()` code is mixed into S15.

If SonarQube reports a new bridge issue, triage the exact rule/file/line before changing code. Do not rewrite working code solely to lower the aggregate issue count.

- [ ] **Step 6: Update Notion after exact-head verification**

Update the existing Notion S15 design page with:

- implementation PR number;
- exact head SHA;
- CI run id;
- Regression Quality run id;
- Sonar diagnostics run id;
- Quality Gate status;
- S15 browser evidence result;
- capability state changed from `NOT ACTIVE IN PRODUCTION` to `WORKING / BOUNDED`;
- explicit note that arbitrary structural add/remove/voice/staff write-back remains deferred.

Update the parent Production Architecture & Capability Audit so the active production flow shows the S15 reverse bridge.

- [ ] **Step 7: Merge only after every gate is green**

Use squash merge after all review threads are resolved and protected checks are green. After merge, verify the same CI / Regression Quality / SonarQube chain on `main`; do not treat PR-only success as final production evidence.
