import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { parseMusicXmlToNotes } from '../src/services/musicEngine.js'
import { publishPackage3Notes, clearPackage3Notes } from '../package3MeasureBridge.js'
import { createSmoosicProductAuthority } from '../src/services/smoosicProductWriteback.js'
import { getTeacherWorkspaceCurrentRevision } from '../src/services/teacherWorkspaceModel.js'
import { createSmoosicCeStructIdentityBridge } from '../src/services/smoosicCeStructIdentityBridge.js'
import { SmoosicTestDOMParser, SmoosicTestXMLSerializer } from './support/smoosicXmlDom.js'

const host = readFileSync(new URL('../src/smoosicEditorTabUi.js', import.meta.url), 'utf8')

test('CE bridge host loads the pinned browser runtime only for explicit structural Apply', () => {
  assert.match(host, /CE_STRUCT_RUNTIME_SRC\s*=\s*['"]\/st-omr-correction-engine-runtime\/ce-struct-browser-runtime\.js['"]/)
  assert.match(host, /async function loadCeStructRuntime\(root\)/)
  assert.match(host, /resolveCeStructRuntime\(globalScope\)/)
  assert.match(host, /structuralActionManifest/)
  assert.match(host, /validateTeacherStructuralActionManifest/)
  assert.match(host, /createSmoosicCeStructIdentityBridge/)
  assert.match(host, /ceStructRuntime/)
  assert.match(host, /structuralPatchSetId/)
})

test('CE bridge host keeps nonstructural S15 routing and never infers structural intent from candidate XML', () => {
  assert.match(host, /if \(candidate\.structuralActionManifest !== undefined\)/)
  assert.match(host, /applySmoosicProductWriteback\(\{[\s\S]*paddingRestProvenance: proof/)
  assert.doesNotMatch(host, /inferStructural|structural.*diff|diff.*structural/i)
})

test('CE bridge host accepts APPLIED_STRUCTURAL as a committed publication result', () => {
  assert.match(host, /SMOOSIC_WRITEBACK_STATUS\.APPLIED_STRUCTURAL/)
  assert.match(host, /state\.authority = result\.authority/)
  assert.match(host, /pendingPublication/)
})

test('CE bridge host exposes accessible typed fail-closed status without raw provenance payload', () => {
  assert.match(host, /role['"], kind === 'error' \? 'alert' : 'status'/)
  assert.match(host, /aria-live['"], kind === 'error' \? 'assertive' : 'polite'/)
  for (const status of [
    'INVALID_ACTION_PROVENANCE',
    'STALE_SOURCE',
    'CE_RUNTIME_UNAVAILABLE',
    'CE_CONTRACT_MISMATCH',
    'CE_PROJECTION_FAILED',
    'CE_REVALIDATION_FAILED',
    'CONFORMANCE_FAILED',
  ]) assert.match(host, new RegExp(status))
  assert.doesNotMatch(host, /JSON\.stringify\(candidate\.structuralActionManifest\)/)
})


globalThis.DOMParser = SmoosicTestDOMParser
globalThis.XMLSerializer = SmoosicTestXMLSerializer

const STRUCT_SOURCE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Task 7</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>
    <forward><duration>1</duration></forward>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff><type>half</type></note>
  </measure></part>
</score-partwise>`

const STRUCT_CANDIDATE_XML = STRUCT_SOURCE_XML.replace(
  '<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>\n    <forward><duration>1</duration></forward>',
  '<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff><type>half</type></note>',
)

function structuralManifest(overrides = {}) {
  const parsed = parseMusicXmlToNotes(STRUCT_SOURCE_XML)
  assert.equal(parsed.error, undefined)
  const authority = createSmoosicProductAuthority({
    notes: parsed.notes,
    musicXml: STRUCT_SOURCE_XML,
    sourceId: 'task7-manifest-source',
    automaticRevisionId: 'task7-manifest-auto',
    historyId: 'task7-manifest-history',
    actorId: 'task7-test',
    createdAt: '2026-09-29T17:00:00Z',
  })
  const currentRevision = getTeacherWorkspaceCurrentRevision(authority.workspace)
  const identity = createSmoosicCeStructIdentityBridge({
    currentRevision,
    currentMusicXml: STRUCT_SOURCE_XML,
  })
  return {
    version: 1,
    sourceRevision: 0,
    editorSessionId: 'task7-editor-session',
    actionId: 'task7-explicit-apply',
    operations: [{
      order: 0,
      operation: 'CHANGE_EVENT_DURATION',
      rawNoteOrdinal: 0,
      staffIndex: 0,
      measureIndex: 0,
      voiceIndex: 0,
      noteIndex: 0,
      noteIdentity: 'task7-note-0',
      before: 1,
      after: 2,
    }],
    baseMappingFingerprint: identity.baseMappingFingerprint,
    createdFromExplicitTeacherApply: true,
    ...overrides,
  }
}

function ceRuntime(mode = 'pass') {
  const api = {
    contract: 'ST_OMR_CORRECTION_ENGINE_CE_STRUCT_BROWSER',
    contractVersion: '1.0.0',
    runtimeVersion: '1.0.0',
    patchSchemaVersion: 'teacher-structural-patch-set-v1',
    createMeasure(value) {
      return Object.freeze({ ...value, expectedQuarterBeats: value.beats * (4 / value.beatType) })
    },
    createScoreEvent(value) {
      return Object.freeze({ ...value, end: value.onset + value.duration })
    },
    createScoreGraph({ measures, events, sourceId }) {
      return Object.freeze({
        sourceId,
        measures: Object.freeze([...measures]),
        events: Object.freeze([...events]),
      })
    },
    createTeacherEditAuthorization({ actionId }) {
      return Object.freeze({ mode: 'EXPLICIT_TEACHER_EDIT', actionId })
    },
    createTeacherStructuralPatch(value) {
      return Object.freeze({ eventIndex: null, ...value })
    },
    createTeacherStructuralPatchSet(value) {
      return Object.freeze({
        schemaVersion: 'teacher-structural-patch-set-v1',
        ...value,
        automaticApplyAuthority: false,
        finalTeacherApproval: false,
        studentShareEligible: false,
      })
    },
    fingerprintScoreGraph() {
      return 'a'.repeat(64)
    },
    processSesliTabTeacherStructuralEdit(input) {
      const patch = input.patchSet.patches[0]
      const events = input.scoreGraph.events.map((event) =>
        event.id === patch.eventId
          ? api.createScoreEvent({ ...event, duration: patch.after })
          : event
      )
      const graph = api.createScoreGraph({
        sourceId: input.scoreGraph.sourceId,
        measures: input.scoreGraph.measures,
        events,
      })
      if (mode === 'projection-fail') {
        return {
          projection: { ok: false, code: 'TASK7_PROJECTION_FAIL' },
          automaticApplyAuthority: false,
          finalTeacherApproval: false,
          studentShareEligible: false,
          musicXmlWriteBackAuthority: false,
          learningAuthority: false,
        }
      }
      if (mode === 'revalidation-fail') {
        return {
          projection: { ok: true, graph },
          revalidation: { integrityDecision: 'FAIL' },
          teacherCorrectedRevisionEligible: false,
          automaticApplyAuthority: false,
          finalTeacherApproval: false,
          studentShareEligible: false,
          musicXmlWriteBackAuthority: false,
          learningAuthority: false,
        }
      }
      if (mode === 'contract-fail') {
        return {
          projection: { ok: true, graph },
          revalidation: { integrityDecision: 'PASS' },
          teacherCorrectedRevisionEligible: true,
          automaticApplyAuthority: true,
          finalTeacherApproval: false,
          studentShareEligible: false,
          musicXmlWriteBackAuthority: false,
          learningAuthority: false,
        }
      }
      return Object.freeze({
        projection: Object.freeze({ ok: true, graph }),
        revalidation: Object.freeze({ integrityDecision: 'PASS' }),
        teacherCorrectedRevisionEligible: true,
        automaticApplyAuthority: false,
        finalTeacherApproval: false,
        studentShareEligible: false,
        musicXmlWriteBackAuthority: false,
        learningAuthority: false,
      })
    },
  }
  return api
}

class Task7Element {
  constructor(root, tagName = 'div') {
    this.root = root
    this.tagName = tagName.toUpperCase()
    this.children = []
    this.parentElement = null
    this.listeners = new Map()
    this.attributes = new Map()
    this.dataset = {}
    this.className = ''
    this.hidden = false
    this.textContent = ''
    this.disabled = false
    this.isConnected = true
    this.classList = { add() {}, remove() {}, toggle() {} }
  }
  set id(value) { this._id = value; this.root.nodes.set(value, this) }
  get id() { return this._id }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  hasAttribute(name) { return this.attributes.has(name) }
  removeAttribute(name) { this.attributes.delete(name) }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child }
  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]) }
  dispatchEvent(event) { for (const listener of this.listeners.get(event.type) ?? []) listener(event); return true }
  click() { return this.dispatchEvent({ type: 'click' }) }
  set src(value) { this.setAttribute('src', value) }
  get src() { return this.getAttribute('src') }
}

function installPublicationSurface(root) {
  for (const id of [
    'rhythmic-output',
    'rhythmic-html-output',
    'notes-summary',
    'notes-output',
    'rhythm-warning',
    'rhythm-warning-html',
    'voice-section',
    'rhythm-section',
  ]) {
    const element = root.createElement('div')
    element.id = id
  }
}

function task7Host({
  candidateXml = STRUCT_CANDIDATE_XML,
  manifest = structuralManifest(),
  runtime = ceRuntime(),
  runtimeLoad = 'existing',
  publish = false,
} = {}) {
  const windowListeners = new Map()
  let idCounter = 0
  const root = {
    nodes: new Map(),
    postMessageCount: 0,
    runtimeScriptLoads: 0,
    defaultView: {
      crypto: { randomUUID: () => `task7-${++idCounter}` },
      location: { origin: 'https://seslitab.test' },
      DOMParser: SmoosicTestDOMParser,
      XMLSerializer: SmoosicTestXMLSerializer,
      addEventListener(type, listener) {
        windowListeners.set(type, [...(windowListeners.get(type) ?? []), listener])
      },
      STOmrCorrectionAnalysisRuntime: {
        contract: 'ST_OMR_CORRECTION_ENGINE_ANALYSIS_BROWSER',
        contractVersion: '1.0.0',
        runtimeVersion: '1.0.0',
        analyzeMusicXmlSuspiciousMeasures({ sourceId }) {
          return {
            contract: 'ST_OMR_CORRECTION_ENGINE_SUSPICIOUS_MEASURES_V1',
            mode: 'SHADOW_ONLY',
            sourceId,
            sourceHash: 'a'.repeat(64),
            partId: 'P1',
            measureCount: 1,
            eventCount: 2,
            findings: [],
            suspiciousMeasures: [],
            unmappedFindingCount: 0,
            sourceGraphMutated: false,
            automaticApplyAuthority: false,
            musicXmlWriteBackAuthority: false,
          }
        },
      },
    },
    createElement(tagName) {
      const element = new Task7Element(root, tagName)
      if (tagName === 'iframe') {
        const editorStatus = new Task7Element(root, 'p')
        editorStatus.textContent = 'Yüklendi: task7.musicxml'
        editorStatus.setAttribute('data-loaded-file-name', 'task7.musicxml')
        const editorInput = new Task7Element(root, 'input')
        editorInput.dispatchEvent = () => {
          editorStatus.setAttribute('data-loaded-file-name', 'task7.musicxml')
          editorStatus.textContent = 'Yüklendi: task7.musicxml'
          return true
        }
        element.contentDocument = {
          getElementById(id) {
            if (id === 'poc-status') return editorStatus
            if (id === 'mobile-xml-input') return editorInput
            return null
          },
        }
        element.contentWindow = {
          File: class { constructor(parts, name) { this.parts = parts; this.name = name } },
          Event: class { constructor(type) { this.type = type } },
          postMessage(message) {
            if (message?.type === 'seslitab:smoosic-correction-overlay-request') {
              queueMicrotask(() => {
                for (const listener of windowListeners.get('message') ?? []) {
                  listener({
                    origin: root.defaultView.location.origin,
                    source: element.contentWindow,
                    data: {
                      type: 'seslitab:smoosic-correction-overlay-result',
                      version: 1,
                      requestId: message.requestId,
                      sourceRevision: message.sourceRevision,
                      ok: true,
                      appliedCount: Array.isArray(message.targets) ? message.targets.length : 0,
                      sourceHash: message.sourceHash,
                    },
                  })
                }
              })
              return
            }
            assert.equal(message?.type, 'seslitab:smoosic-export-request')
            root.postMessageCount += 1
            queueMicrotask(() => {
              const payload = {
                type: 'seslitab:smoosic-export-result',
                version: 2,
                requestId: message.requestId,
                sourceRevision: message.sourceRevision,
                musicXml: candidateXml,
                paddingRestProvenance: {
                  version: 1,
                  sourceRevision: message.sourceRevision,
                  rawNoteCount: (candidateXml.match(/<note\b/g) ?? []).length,
                  entries: [],
                },
                structuralActionManifest: typeof manifest === 'function'
                  ? manifest(message.sourceRevision)
                  : manifest,
              }
              for (const listener of windowListeners.get('message') ?? []) {
                listener({
                  origin: root.defaultView.location.origin,
                  source: element.contentWindow,
                  data: payload,
                })
              }
            })
          },
        }
      }
      return element
    },
    getElementById(id) { return root.nodes.get(id) ?? null },
    addEventListener() {},
    querySelector(selector) { return selector === '.input-tabs' ? tabs : null },
    querySelectorAll() { return [] },
  }

  if (runtimeLoad === 'existing') {
    root.defaultView.STOmrCorrectionCeStructRuntime = runtime
  }
  root.head = {
    appendChild(script) {
      root.runtimeScriptLoads += 1
      queueMicrotask(() => {
        if (runtimeLoad === 'success') {
          root.defaultView.STOmrCorrectionCeStructRuntime = runtime
          script.dispatchEvent({ type: 'load' })
        } else {
          script.dispatchEvent({ type: 'error' })
        }
      })
      return script
    },
  }

  const tabs = root.createElement('div')
  tabs.className = 'input-tabs'
  const parent = root.createElement('div')
  const tabPanel = root.createElement('div')
  tabPanel.id = 'tab-panel'
  parent.appendChild(tabPanel)

  const progress = root.createElement('div')
  progress.id = 'progress-container'
  progress.hidden = true
  const xmlProgress = root.createElement('div')
  xmlProgress.id = 'musicxml-progress'
  xmlProgress.hidden = true
  const results = root.createElement('section')
  results.id = 'results-section'
  results.hidden = false
  const xmlOutput = root.createElement('pre')
  xmlOutput.id = 'xml-output'
  xmlOutput.textContent = STRUCT_SOURCE_XML
  root.xmlOutput = xmlOutput
  const fileName = root.createElement('span')
  fileName.id = 'musicxml-file-name'
  fileName.textContent = 'task7.musicxml'

  if (publish) installPublicationSurface(root)
  return root
}

async function settleTask7(turns = 6) {
  for (let index = 0; index < turns; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

async function runTask7Apply(options = {}) {
  const root = task7Host(options)
  const parsed = parseMusicXmlToNotes(STRUCT_SOURCE_XML)
  assert.equal(parsed.error, undefined)
  publishPackage3Notes(parsed.notes)
  const previousDocument = globalThis.document
  globalThis.document = root
  try {
    const { ensureSmoosicEditorTab } = await import('../src/smoosicEditorTabUi.js')
    assert.ok(ensureSmoosicEditorTab(root))
    root.getElementById('smoosic-tab-btn').click()
    root.getElementById('smoosic-editor-frame').dispatchEvent({ type: 'load' })
    await settleTask7()
    root.getElementById('smoosic-apply-btn').click()
    await settleTask7()
    return root
  } finally {
    clearPackage3Notes()
    globalThis.document = previousDocument
  }
}

test('Task 7 dynamically loads CE runtime and publishes one structural teacher correction', async () => {
  const root = await runTask7Apply({ runtimeLoad: 'success', publish: true })
  const status = root.getElementById('smoosic-editor-host-status')
  assert.equal(root.runtimeScriptLoads, 1)
  assert.equal(root.postMessageCount, 1)
  assert.equal(status.dataset.kind, 'ready')
  assert.equal(status.getAttribute('role'), 'status')
  assert.equal(status.getAttribute('aria-live'), 'polite')
  assert.match(status.textContent, /Yeni sürüm doğrulandı/)
  assert.equal(root.xmlOutput.textContent, STRUCT_CANDIDATE_XML)
})

test('Task 7 uses an already loaded exact CE runtime without adding another script', async () => {
  const root = await runTask7Apply({ runtimeLoad: 'existing', publish: true })
  assert.equal(root.runtimeScriptLoads, 0)
  assert.match(root.getElementById('smoosic-editor-host-status').textContent, /Yeni sürüm doğrulandı/)
})

test('Task 7 fails closed with accessible status when CE runtime cannot load', async () => {
  const root = await runTask7Apply({ runtimeLoad: 'error' })
  const status = root.getElementById('smoosic-editor-host-status')
  assert.equal(root.runtimeScriptLoads, 1)
  assert.equal(status.dataset.kind, 'error')
  assert.equal(status.getAttribute('role'), 'alert')
  assert.equal(status.getAttribute('aria-live'), 'assertive')
  assert.match(status.textContent, /doğrulama motoru yüklenemedi/)
  assert.equal(root.xmlOutput.textContent, STRUCT_SOURCE_XML)
})

test('Task 7 rejects invalid, stale and ambiguous action provenance before CE commit', async () => {
  for (const [manifest, expected] of [
    [structuralManifest({ createdFromExplicitTeacherApply: false }), /kanıtı doğrulanamadı/],
    [structuralManifest({ sourceRevision: 99 }), /Kaynak değişti/],
    [structuralManifest({ baseMappingFingerprint: '0'.repeat(16) }), /güvenli biçimde eşleştirilemedi/],
  ]) {
    const root = await runTask7Apply({ manifest, runtimeLoad: 'existing' })
    const status = root.getElementById('smoosic-editor-host-status')
    assert.equal(status.dataset.kind, 'error')
    assert.match(status.textContent, expected)
    assert.equal(root.xmlOutput.textContent, STRUCT_SOURCE_XML)
  }
})

test('Task 7 surfaces typed CE projection, revalidation and contract failures without publication', async () => {
  for (const [mode, expected] of [
    ['projection-fail', /güvenli olarak uygulanamadı/],
    ['revalidation-fail', /yeniden doğrulanamadı/],
    ['contract-fail', /motoru sürümü uyuşmuyor/],
  ]) {
    const root = await runTask7Apply({ runtime: ceRuntime(mode), runtimeLoad: 'existing' })
    const status = root.getElementById('smoosic-editor-host-status')
    assert.equal(status.dataset.kind, 'error')
    assert.match(status.textContent, expected)
    assert.equal(root.xmlOutput.textContent, STRUCT_SOURCE_XML)
  }
})

test('Task 7 rejects candidate XML that does not conform to the CE projection', async () => {
  const mixed = STRUCT_CANDIDATE_XML.replace('<step>C</step>', '<step>E</step>')
  const root = await runTask7Apply({
    candidateXml: mixed,
    runtime: ceRuntime(),
    runtimeLoad: 'existing',
  })
  const status = root.getElementById('smoosic-editor-host-status')
  assert.equal(status.dataset.kind, 'error')
  assert.match(status.textContent, /Editör sonucu doğrulanan yapısal değişiklikle eşleşmiyor/)
  assert.equal(root.xmlOutput.textContent, STRUCT_SOURCE_XML)
})


test('Task 7 protected CI runs a dedicated real-browser structural proof after S15', () => {
  const scriptUrl = new URL('../scripts/verifyCeBridgeStructuralBrowser.js', import.meta.url)
  const fixtureUrl = new URL('./fixtures/ce-bridge-structural-browser-proof.html', import.meta.url)
  assert.equal(existsSync(scriptUrl), true)
  assert.equal(existsSync(fixtureUrl), true)

  const script = readFileSync(scriptUrl, 'utf8')
  const fixture = readFileSync(fixtureUrl, 'utf8')
  const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')

  assert.match(script, /2× süre/)
  assert.match(script, /structuralActionManifest/)
  assert.match(script, /CONFORMANCE_FAILED/)
  assert.match(script, /CE_RUNTIME_UNAVAILABLE/)
  assert.match(script, /undo/i)
  assert.match(fixture, /CE-BRIDGE structural browser proof/)

  const s15 = ci.indexOf('node scripts/verifyS15SmoosicWritebackBrowser.js')
  const ce = ci.indexOf('node scripts/verifyCeBridgeStructuralBrowser.js')
  const downstream = ci.indexOf('node scripts/verifySti17CrossRealmBrowser.js')
  assert.ok(s15 >= 0 && ce > s15 && downstream > ce)
})
