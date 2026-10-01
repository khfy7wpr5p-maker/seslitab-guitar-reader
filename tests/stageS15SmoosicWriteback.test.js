import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import '../scripts/runOmrQualityReport.js'
import { parseMusicXmlToNotes } from '../src/services/musicEngine.js'
import { publishPackage3Notes, clearPackage3Notes } from '../package3MeasureBridge.js'
import { createSmoosicPaddingRestTracker } from '../experiments/smoosic-mobile/src/seslitab-padding-rest-provenance.js'
import { createSmoosicStructuralActionTracker } from '../experiments/smoosic-mobile/src/seslitab-structural-action-provenance.js'
import { SmoosicTestDOMParser, SmoosicTestXMLSerializer } from './support/smoosicXmlDom.js'

globalThis.DOMParser = SmoosicTestDOMParser
globalThis.XMLSerializer = SmoosicTestXMLSerializer

const editor = readFileSync(
  new URL('../experiments/smoosic-mobile/src/index.js', import.meta.url),
  'utf8',
)

test('S15 exposes a non-downloading MusicXML serializer for the host bridge', () => {
  assert.match(editor, /function serializeCurrentMusicXml\(score\)/)
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

const EXPORT_RAW_XML = '<score-partwise><part id="P1"><measure number="1"><note><rest/><duration>8</duration><voice>1</voice></note></measure></part></score-partwise>'

test('S15 host export byte cap matches the existing write-back input policy', () => {
  const policy = readFileSync(new URL('../src/services/musicXmlFile.js', import.meta.url), 'utf8')
  assert.match(policy, /MAX_MUSIC_XML_FILE_SIZE\s*=\s*10 \* 1024 \* 1024/)
  assert.match(editor, /SESLITAB_EXPORT_MAX_XML_BYTES\s*=\s*10 \* 1024 \* 1024/)
})

function editorExportHarness({ rawXml = EXPORT_RAW_XML, trackerState = 'valid' } = {}) {
  const posts = []
  const files = []
  let conversions = 0
  let serializations = 0
  const measure = { createRestNoteWithDuration(tickCount) { return { attrs: { id: 'import-padding' }, noteType: 'r', tickCount } } }
  const tracker = createSmoosicPaddingRestTracker(measure)
  const imported = tracker.runDuringImport(() => ({ staves: [{ partInfo: { stavesBefore: 0, stavesAfter: 0 }, measures: [{ voices: [{ notes: [measure.createRestNoteWithDuration(8)] }] }] }] }))
  const score = trackerState === 'stale' ? { ...imported } : imported
  const storeScore = { ...score }
  if (trackerState === 'unprovable') imported.staves[0].measures[0].voices[0].notes[0].tickCount = 16
  const parent = { postMessage(message, origin) { posts.push({ message, origin }) } }
  const context = vm.createContext({
    require(name) {
      if (name === 'smoosic') return {
        SmoMeasure: measure,
        SmoToXml: { convert(value) { assert.ok(value === score || value === storeScore); conversions += 1; return rawXml } },
        XmlToSmo: { convert() { return score } },
        SvgHelpers: { outlineRect() {}, eraseOutline() {} },
      }
      if (name === './seslitab-padding-rest-provenance') return { createSmoosicPaddingRestTracker }
      if (name === './seslitab-structural-action-provenance') return { createSmoosicStructuralActionTracker }
      if (name === './seslitab-correction-overlay') {
        return {
          createSmoosicCorrectionOverlayManager() {
            return { bindImportedSource: async () => null, replace: async () => ({ ok: false, appliedCount: 0, sourceHash: null }), refresh: async () => ({ ok: true, appliedCount: 0, sourceHash: null }), clear: () => ({ ok: true, appliedCount: 0, sourceHash: null }), reset: () => true }
          },
        }
      }
      throw new Error(`Unexpected require: ${name}`)
    },
    document: { addEventListener() {}, getElementById() { return null } },
    window: { location: { origin: 'https://seslitab.test' } },
    parent,
    TextEncoder,
    DOMParser: globalThis.DOMParser,
    XMLSerializer: class { serializeToString(value) { serializations += 1; return value } },
    File: class { constructor(parts) { files.push(parts); this.parts = parts } },
    navigator: { canShare: () => true, share: async () => {} },
  })
  vm.runInContext(editor, context)
  context.stopNativePlayback = () => {}
  vm.runInContext('editorReady = true; applicationInstance = { view: { score: globalThis.testScore, storeScore: globalThis.testStoreScore } }; activePaddingRestTracker = globalThis.testTracker',
    Object.assign(context, {
      testScore: score,
      testStoreScore: storeScore,
      testTracker: trackerState === 'missing' ? null : tracker,
    }))
  const request = (overrides = {}) => context.handleSesliTabExportRequest({
    source: parent,
    origin: 'https://seslitab.test',
    data: { type: 'seslitab:smoosic-export-request', version: 1, requestId: 'request-1', sourceRevision: 7, ...overrides },
  })
  return { request, posts, files, context, parent, get conversions() { return conversions }, get serializations() { return serializations } }
}

test('S15 host export posts v2 raw XML and import-time proof tied to the exact numeric request revision', async () => {
  const harness = editorExportHarness()
  await harness.request()
  assert.equal(harness.posts.length, 1)
  const { message, origin } = harness.posts[0]
  assert.equal(origin, 'https://seslitab.test')
  assert.equal(message.type, 'seslitab:smoosic-export-result')
  assert.equal(message.version, 2)
  assert.equal(message.requestId, 'request-1')
  assert.equal(message.sourceRevision, 7)
  assert.equal(message.error, undefined)
  assert.equal(message.musicXml, EXPORT_RAW_XML)
  assert.deepEqual(JSON.parse(JSON.stringify(message.paddingRestProvenance)), {
    version: 1, sourceRevision: 7, rawNoteCount: 1,
    entries: [{ staffIndex: 0, measureIndex: 0, voiceIndex: 0, noteIndex: 0,
      rawNoteOrdinal: 0, noteIdentity: 'import-padding', durationTicks: 8 }],
  })
  assert.equal(harness.conversions, 1)
  assert.equal(harness.serializations, 1)
})

test('S15 missing, stale, or unprovable tracker posts bounded error without raw XML success', async () => {
  for (const trackerState of ['missing', 'stale', 'unprovable']) {
    const harness = editorExportHarness({ trackerState })
    await harness.request()
    assert.equal(harness.posts.length, 1, trackerState)
    const { message } = harness.posts[0]
    assert.equal(message.version, 2)
    assert.equal(message.musicXml, '')
    assert.equal(message.paddingRestProvenance, undefined)
    assert.ok(typeof message.error === 'string' && message.error.length > 0 && message.error.length <= 256)
  }
})

test('S15 host export enforces UTF-8 10 MiB raw XML policy, while local save stays raw', async () => {
  const tooLarge = EXPORT_RAW_XML.replace('</measure>', `${'é'.repeat(5 * 1024 * 1024)}</measure>`)
  const harness = editorExportHarness({ rawXml: tooLarge })
  await harness.request()
  assert.equal(harness.posts.length, 1)
  assert.equal(harness.posts[0].message.musicXml.length, 0)
  assert.ok(harness.posts[0].message.error)
  await vm.runInContext('exportMusicXml()', harness.context)
  assert.equal(harness.files.length, 1)
  assert.ok(harness.files[0][0] === tooLarge)
})

test('S15 rejects invalid origin, source, request type, id or revision before posting', async () => {
  const harness = editorExportHarness()
  await harness.context.handleSesliTabExportRequest({ source: {}, origin: 'https://seslitab.test', data: { type: 'seslitab:smoosic-export-request', version: 1, requestId: 'request-1', sourceRevision: 7 } })
  await harness.context.handleSesliTabExportRequest({ source: harness.parent, origin: 'https://other.test', data: { type: 'seslitab:smoosic-export-request', version: 1, requestId: 'request-1', sourceRevision: 7 } })
  for (const overrides of [{ type: 'other' }, { version: 2 }, { requestId: '' }, { sourceRevision: -1 }]) await harness.request(overrides)
  assert.equal(harness.posts.length, 0)
  assert.equal(harness.conversions, 0)
})


const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8')

test('S15 republishes a committed revision through the existing result path without changing the Package 2D handler signature', () => {
  assert.match(app, /export function applyRevalidatedMusicXmlRevision\(notes, musicXml\)/)
  assert.match(app, /function handleAnalysisResult\(notes, xmlString, hasRhythm\)/)
  assert.match(app, /let suppressResultScroll = false/)
  assert.match(app, /if \(!suppressResultScroll\) \{[\s\S]*scrollIntoView/)
  assert.match(
    app,
    /suppressResultScroll = true[\s\S]*handleAnalysisResult\(notes, musicXml, musicXmlHasRhythm\(notes\)\)[\s\S]*finally[\s\S]*suppressResultScroll = false/,
  )
})


const host = readFileSync(new URL('../src/smoosicEditorTabUi.js', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/smoosicEditorTab.css', import.meta.url), 'utf8')
const writeback = readFileSync(new URL('../src/services/smoosicProductWriteback.js', import.meta.url), 'utf8')

test('S15 accepts only correlated v2 results from the expected origin and frame', () => {
  // Exercise the actual event validator without booting the iframe or waiting on
  // the request timeout; the browser integration below exercises the apply path.
  const code = host.slice(host.indexOf('function validateWritebackMessage('), host.indexOf('\nfunction bindWritebackMessages('))
  const frameWindow = {}
  const state = { pendingWriteback: { requestId: 'request-1', sourceRevision: 7 }, sourceRevision: 7, frame: { contentWindow: frameWindow } }
  const context = vm.createContext({
    WRITEBACK_RESULT: 'seslitab:smoosic-export-result',
    WRITEBACK_VERSION: Number(host.match(/const WRITEBACK_VERSION = (\d+)/)[1]),
    stateFor: () => state,
    sourceTransitionPending: () => false,
  })
  vm.runInContext(code, context)
  const root = { defaultView: { location: { origin: 'https://seslitab.test' } } }
  const data = { type: 'seslitab:smoosic-export-result', version: 2, requestId: 'request-1', sourceRevision: 7,
    musicXml: EXPORT_RAW_XML, paddingRestProvenance: { version: 1, sourceRevision: 7, rawNoteCount: 1, entries: [] } }
  const event = { origin: 'https://seslitab.test', source: frameWindow, data }
  assert.equal(context.validateWritebackMessage(root, event), data)
  for (const invalid of [
    { ...event, origin: 'https://other.test' }, { ...event, source: {} },
    { ...event, data: { ...data, version: 1 } },
    { ...event, data: { ...data, requestId: 'other-request' } },
    { ...event, data: { ...data, sourceRevision: 6 } },
    { ...event, data: { ...data, sourceRevision: '7' } },
  ]) assert.equal(context.validateWritebackMessage(root, invalid), null)
})

class HostElement {
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
    this.classList = {
      add: () => {},
      remove: () => {},
      toggle: () => {},
    }
  }

  set id(value) { this._id = value; this.root.nodes.set(value, this) }
  get id() { return this._id }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  hasAttribute(name) { return this.attributes.has(name) }
  removeAttribute(name) { this.attributes.delete(name) }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child }
  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]) }
  click() { for (const listener of this.listeners.get('click') ?? []) listener({ type: 'click' }) }
  dispatchEvent(event) { for (const listener of this.listeners.get(event.type) ?? []) listener(event); return true }
  set src(value) { this.setAttribute('src', value) }
  get src() { return this.getAttribute('src') }
}

const S15_SOURCE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note></measure></part></score-partwise>`
const S15_TWO_NOTE_XML = S15_SOURCE_XML.replace(
  '</note></measure>',
  '</note><note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note></measure>',
)

function staleSourceHost({
  sourceXml = '',
  candidateXml = '',
  holdExport = false,
  observeSources = false,
  secureIds = true,
  paddingRestProvenance = (xml, sourceRevision) => ({
    version: 1, sourceRevision, rawNoteCount: (xml.match(/<note\b/g) ?? []).length, entries: [],
  }),
} = {}) {
  const windowListeners = new Map()
  const root = {
    nodes: new Map(),
    postMessageCount: 0,
    correctionOverlayMessages: [],
    importRevisions: [],
    defaultView: {
      crypto: secureIds ? { randomUUID: () => 's15-test-id' } : {},
      location: { origin: 'https://seslitab.test' },
      DOMParser: SmoosicTestDOMParser,
      addEventListener(type, listener) { windowListeners.set(type, [...(windowListeners.get(type) ?? []), listener]) },
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
            eventCount: 1,
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
      const element = new HostElement(root, tagName)
      if (tagName === 'iframe') {
        const editorStatus = new HostElement(root, 'p')
        editorStatus.textContent = 'Yüklendi: s15-writeback.musicxml'
        editorStatus.setAttribute('data-loaded-file-name', 's15-writeback.musicxml')
        const editorInput = new HostElement(root, 'input')
        editorInput.dispatchEvent = () => {
          editorStatus.setAttribute('data-loaded-file-name', 's15-writeback.musicxml')
          editorStatus.textContent = 'Yüklendi: s15-writeback.musicxml'
          root.importRevisions.push(editorInput.dataset.seslitabImportRevision ?? null)
          return true
        }
        element.contentDocument = { getElementById(id) { return id === 'poc-status' ? editorStatus : (id === 'mobile-xml-input' ? editorInput : null) } }
        element.contentWindow = {
          File: class { constructor(parts, name) { this.parts = parts; this.name = name } },
          Event: class { constructor(type) { this.type = type } },
          postMessage(message) {
            if (message?.type === 'seslitab:smoosic-correction-overlay-request') {
              root.correctionOverlayMessages.push(message)
              queueMicrotask(() => {
                for (const listener of windowListeners.get('message') ?? []) listener({
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
              })
              return
            }
            assert.equal(message.type, 'seslitab:smoosic-export-request')
            assert.equal(message.version, 1, 'editor export requests remain protocol v1')
            root.postMessageCount += 1
            if (holdExport) return
            queueMicrotask(() => {
              for (const listener of windowListeners.get('message') ?? []) listener({
                origin: root.defaultView.location.origin,
                source: element.contentWindow,
                data: {
                  type: 'seslitab:smoosic-export-result', version: 2,
                  requestId: message.requestId, sourceRevision: message.sourceRevision,
                  musicXml: candidateXml,
                  paddingRestProvenance: paddingRestProvenance(candidateXml, message.sourceRevision),
                },
              })
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
  const tabs = root.createElement('div')
  tabs.className = 'input-tabs'
  const parent = root.createElement('div')
  const panel = root.createElement('div'); panel.id = 'tab-panel'; parent.appendChild(panel)
  const progress = root.createElement('div'); progress.id = 'progress-container'; progress.hidden = Boolean(sourceXml)
  const musicXmlProgress = root.createElement('div'); musicXmlProgress.id = 'musicxml-progress'; musicXmlProgress.hidden = true
  if (sourceXml) {
    const results = root.createElement('section'); results.id = 'results-section'; results.hidden = false
    const xmlOutput = root.createElement('pre'); xmlOutput.id = 'xml-output'; xmlOutput.textContent = sourceXml
    root.xmlOutput = xmlOutput
    const fileName = root.createElement('span'); fileName.id = 'musicxml-file-name'; fileName.textContent = 's15-writeback.musicxml'
  }
  if (observeSources) {
    root.defaultView.MutationObserver = class {
      constructor(callback) { root.sourceObserverCallback = callback }
      observe() {}
    }
    root.emitSourceMutation = (...records) => root.sourceObserverCallback?.(records)
  }
  return root
}

function installResultPublishingSurface(root) {
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
    if (root.getElementById(id)) continue
    const element = root.createElement('div')
    element.id = id
  }
}

async function settleWriteback() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

test('S15 host exposes one explicit apply control and secure request identity', () => {
  assert.match(host, /const APPLY_ID = 'smoosic-apply-btn'/)
  assert.match(host, /Düzenlemeyi SesliTab'a Uygula/)
  assert.match(host, /randomUUID/)
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
  assert.match(host, /state\.sourceRevision !== pending\.sourceRevision/)
  assert.match(host, /sourceTransitionPending\(root\)/)
})

test('S15 successful writeback republishes exact committed revision and retains authority', () => {
  assert.match(host, /applySmoosicProductWriteback/)
  assert.match(host, /applyRevalidatedMusicXmlRevision\(committed\.revision\.content, committed\.musicXml\)/)
  assert.match(host, /state\.authority = result\.authority/)
  assert.match(host, /state\.observedSourceXml = committed\.musicXml/)
  assert.match(host, /state\.authoritySourceXml === state\.observedSourceXml/)
  assert.match(host, /state\.authoritySourceName === state\.observedSourceName/)
})

test('S15 publish failure is retried without creating another immutable revision', () => {
  assert.match(host, /state\.pendingPublication = Object\.freeze/)
  assert.match(host, /state\.publishingWritebackXml/)
  assert.match(host, /if \(state\.pendingPublication\)/)
  assert.match(host, /retryPendingPublication\(root\)/)
})

test('S15 exposes typed stale-source and publish-failure outcomes without committing again', () => {
  assert.match(writeback, /STALE_SOURCE:\s*'STALE_SOURCE'/)
  assert.match(writeback, /PUBLISH_FAILED:\s*'PUBLISH_FAILED'/)
  assert.match(writeback, /export function createSmoosicWritebackOutcome\(/)
  assert.match(host, /createSmoosicWritebackOutcome\(SMOOSIC_WRITEBACK_STATUS\.STALE_SOURCE\)/)
  assert.match(host, /createSmoosicWritebackOutcome\(SMOOSIC_WRITEBACK_STATUS\.PUBLISH_FAILED, state\.pendingPublication\)/)
  assert.match(host, /return retryPendingPublication\(root\)/)
})

test('S15 rejects apply while a replacement source is pending without requesting or committing', async () => {
  const root = staleSourceHost()
  const previousDocument = globalThis.document
  globalThis.document = root
  const { ensureSmoosicEditorTab } = await import('../src/smoosicEditorTabUi.js')
  assert.ok(ensureSmoosicEditorTab(root))

  root.getElementById('smoosic-apply-btn').click()
  await new Promise((resolve) => setTimeout(resolve, 0))

  const status = root.getElementById('smoosic-editor-host-status')
  assert.equal(status.dataset.kind, 'error')
  assert.match(status.textContent, /Yeni eser hazırlanırken düzenleme uygulanamaz/)
  globalThis.document = previousDocument
})

test('SES-142 committed revision rebinds Smoosic source authority before correction overlay reapply', async () => {
  const candidateXml = S15_SOURCE_XML.replace('<step>C</step>', '<step>D</step>')
  const root = staleSourceHost({ sourceXml: S15_SOURCE_XML, candidateXml })
  installResultPublishingSurface(root)
  publishPackage3Notes(parseMusicXmlToNotes(S15_SOURCE_XML).notes)

  const previousDocument = globalThis.document
  globalThis.document = root
  try {
    const { ensureSmoosicEditorTab } = await import('../src/smoosicEditorTabUi.js')
    assert.ok(ensureSmoosicEditorTab(root))
    root.getElementById('smoosic-tab-btn').click()
    root.getElementById('smoosic-editor-frame').dispatchEvent({ type: 'load' })
    await settleWriteback()
    await settleWriteback()

    const initialReplaces = root.correctionOverlayMessages.filter((message) => message.action === 'replace')
    assert.ok(initialReplaces.length >= 1)
    const initialReplace = initialReplaces.at(-1)
    assert.equal(root.importRevisions.at(-1), String(initialReplace.sourceRevision))

    root.getElementById('smoosic-apply-btn').click()
    await settleWriteback()
    await settleWriteback()
    await settleWriteback()

    const replaceMessages = root.correctionOverlayMessages.filter((message) => message.action === 'replace')
    assert.ok(replaceMessages.length >= 2, 'new committed revision must receive a fresh overlay replace request')
    const reapplied = replaceMessages.at(-1)
    assert.ok(reapplied.sourceRevision > initialReplace.sourceRevision)
    assert.equal(root.importRevisions.at(-1), String(reapplied.sourceRevision))
    assert.ok(
      root.correctionOverlayMessages.some(
        (message) => message.action === 'clear' && message.sourceRevision === reapplied.sourceRevision,
      ),
      'stale overlay must be cleared for the new revision before reapply',
    )
    assert.equal(root.getElementById('xml-output').textContent, candidateXml)
    assert.match(
      root.getElementById('smoosic-editor-host-status').textContent,
      /Yeni sürüm doğrulandı/,
    )
  } finally {
    clearPackage3Notes()
    globalThis.document = previousDocument
  }
})

test('S15 returns a typed retryable publish failure after the immutable commit when result publication fails', async () => {
  const candidateXml = S15_SOURCE_XML.replace('<step>C</step>', '<step>D</step>')
  const root = staleSourceHost({ sourceXml: S15_SOURCE_XML, candidateXml })
  const parsed = parseMusicXmlToNotes(S15_SOURCE_XML)
  assert.equal(parsed.error, undefined)
  publishPackage3Notes(parsed.notes)

  const previousDocument = globalThis.document
  globalThis.document = root
  const { ensureSmoosicEditorTab } = await import('../src/smoosicEditorTabUi.js')
  assert.ok(ensureSmoosicEditorTab(root))
  root.getElementById('smoosic-tab-btn').click()
  root.getElementById('smoosic-editor-frame').dispatchEvent({ type: 'load' })
  await new Promise((resolve) => setTimeout(resolve, 0))

  root.getElementById('smoosic-apply-btn').click()
  await settleWriteback()

  const status = root.getElementById('smoosic-editor-host-status')
  assert.equal(status.dataset.kind, 'error')
  assert.match(status.textContent, /Yeni sürüm kaydedildi ancak ekran güncellenemedi/)

  root.getElementById('smoosic-apply-btn').click()
  await settleWriteback()
  assert.equal(status.dataset.kind, 'error')
  assert.equal(root.postMessageCount, 1)

  installResultPublishingSurface(root)
  root.getElementById('smoosic-apply-btn').click()
  await settleWriteback()
  assert.equal(status.dataset.kind, 'ready')
  assert.match(status.textContent, /Yeni sürüm doğrulandı/)
  assert.equal(root.postMessageCount, 1)
  assert.equal(root.getElementById('xml-output').textContent, candidateXml)
  clearPackage3Notes()
  globalThis.document = previousDocument
})

test('S15 rejects an in-flight export as STALE_SOURCE when source replacement starts', async () => {
  const candidateXml = S15_SOURCE_XML.replace('<step>C</step>', '<step>D</step>')
  const root = staleSourceHost({
    sourceXml: S15_SOURCE_XML,
    candidateXml,
    holdExport: true,
    observeSources: true,
  })
  publishPackage3Notes(parseMusicXmlToNotes(S15_SOURCE_XML).notes)

  const previousDocument = globalThis.document
  globalThis.document = root
  const { ensureSmoosicEditorTab } = await import('../src/smoosicEditorTabUi.js')
  ensureSmoosicEditorTab(root)
  root.getElementById('smoosic-tab-btn').click()
  root.getElementById('smoosic-editor-frame').dispatchEvent({ type: 'load' })
  await settleWriteback()

  root.getElementById('smoosic-apply-btn').click()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(root.postMessageCount, 1)
  root.getElementById('smoosic-editor-frame').isConnected = false
  root.getElementById('progress-container').hidden = false
  root.emitSourceMutation({ target: root.getElementById('progress-container') })
  await settleWriteback()

  const status = root.getElementById('smoosic-editor-host-status')
  assert.equal(status.dataset.kind, 'error')
  assert.match(status.textContent, /Kaynak değişti/)
  clearPackage3Notes()
  globalThis.document = previousDocument
})

test('S15 returns CONFLICT when secure request identity cannot be created', async () => {
  const root = staleSourceHost({
    sourceXml: S15_SOURCE_XML,
    candidateXml: S15_SOURCE_XML,
    secureIds: false,
  })
  publishPackage3Notes(parseMusicXmlToNotes(S15_SOURCE_XML).notes)

  const previousDocument = globalThis.document
  globalThis.document = root
  const { ensureSmoosicEditorTab } = await import('../src/smoosicEditorTabUi.js')
  ensureSmoosicEditorTab(root)
  root.getElementById('smoosic-apply-btn').click()
  await settleWriteback()

  const status = root.getElementById('smoosic-editor-host-status')
  assert.equal(status.dataset.kind, 'error')
  assert.match(status.textContent, /Güvenli düzenleme kimliği üretilemiyor/)
  assert.equal(root.postMessageCount, 0)
  clearPackage3Notes()
  globalThis.document = previousDocument
})

async function runHostWritebackCandidate(candidateXml, sourceXml = S15_SOURCE_XML, options = {}) {
  const root = staleSourceHost({ sourceXml, candidateXml, ...options })
  if (options.publish) installResultPublishingSurface(root)
  const parsed = parseMusicXmlToNotes(sourceXml)
  publishPackage3Notes(parsed.notes)
  const previousDocument = globalThis.document
  globalThis.document = root
  const { ensureSmoosicEditorTab } = await import('../src/smoosicEditorTabUi.js')
  ensureSmoosicEditorTab(root)
  root.getElementById('smoosic-tab-btn').click()
  root.getElementById('smoosic-editor-frame').dispatchEvent({ type: 'load' })
  await new Promise((resolve) => setTimeout(resolve, 0))
  root.getElementById('smoosic-apply-btn').click()
  await settleWriteback()
  clearPackage3Notes()
  globalThis.document = previousDocument
  return options.returnRoot ? root : root.getElementById('smoosic-editor-host-status').textContent
}

test('S15 missing, malformed and stale padding proof cannot publish a pitch edit', async () => {
  const candidateXml = S15_SOURCE_XML.replace('<step>C</step>', '<step>D</step>')
  for (const proof of [undefined, null, { version: 1, sourceRevision: 999, rawNoteCount: 1, entries: [] },
    { version: 2, sourceRevision: 0, rawNoteCount: 1, entries: [] }]) {
    const root = await runHostWritebackCandidate(candidateXml, S15_SOURCE_XML, {
      paddingRestProvenance: () => proof, publish: true, returnRoot: true,
    })
    assert.match(root.getElementById('smoosic-editor-host-status').textContent, /yapısal düzenleme/)
    assert.equal(root.xmlOutput.textContent, S15_SOURCE_XML)
  }
})

test('S15 forwards certified padding and the exact pending revision into canonical publication', async () => {
  const sourceXml = S15_TWO_NOTE_XML.replace('<pitch><step>D</step><octave>4</octave></pitch>', '<rest/>')
    .replaceAll('<duration>4</duration>', '<duration>1</duration>').replaceAll('<type>whole</type>', '<type>quarter</type>')
    .replace('</measure>', '<forward><duration>2</duration><voice>1</voice></forward></measure>')
  const rest = '<note><rest/><duration>2</duration><voice>1</voice><type>half</type></note>'
  const candidateXml = sourceXml.replace('<step>C</step>', '<step>G</step>')
    .replace('<forward><duration>2</duration><voice>1</voice></forward>', rest)
  const root = await runHostWritebackCandidate(candidateXml, sourceXml, {
    publish: true, returnRoot: true,
    paddingRestProvenance: (_xml, sourceRevision) => ({ version: 1, sourceRevision, rawNoteCount: 3,
      entries: [{ staffIndex: 0, measureIndex: 0, voiceIndex: 0, noteIndex: 2, rawNoteOrdinal: 2, noteIdentity: 'padding-1', durationTicks: 2 }] }),
  })
  assert.match(root.getElementById('smoosic-editor-host-status').textContent, /Yeni sürüm doğrulandı/)
  assert.equal((root.xmlOutput.textContent.match(/<rest\/>/g) ?? []).length, 1)
  assert.match(root.xmlOutput.textContent, /<forward><duration>2<\/duration><voice>1<\/voice><\/forward>/)
  assert.equal(parseMusicXmlToNotes(root.xmlOutput.textContent).notes[0].step, 'G')
  assert.equal(root.postMessageCount, 1)
})

test('S15 preserves canonical state for no-change, unsupported, and invalid candidates', async () => {
  assert.match(
    await runHostWritebackCandidate(S15_SOURCE_XML),
    /uygulanacak yeni bir müzikal değişiklik yok/,
  )
  assert.match(
    await runHostWritebackCandidate(
      S15_TWO_NOTE_XML.replace(/<note>[\s\S]*?<\/note>/, ''),
      S15_TWO_NOTE_XML,
    ),
    /yapısal düzenleme/,
  )
  assert.match(
    await runHostWritebackCandidate('<score-partwise>'),
    /Düzenleme doğrulanamadı/,
  )
})

test('S15 unsupported structural edit remains exportable instead of becoming canonical', () => {
  assert.match(host, /UNSUPPORTED_STRUCTURE/)
  assert.match(host, /MusicXML olarak kaydedebilirsiniz/)
  assert.doesNotMatch(host, /initStagePrDKeypadIntegrationUi/)
})


const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
const browserProof = readFileSync(new URL('../scripts/verifyS15SmoosicWritebackBrowser.js', import.meta.url), 'utf8')

test('S15 gesi-clean browser fixture retains the independently counted source contract', () => {
  const xml = readFileSync(new URL('./fixtures/real-omr/gesi-clean.xml', import.meta.url), 'utf8')
  assert.equal((xml.match(/<note\b/g) ?? []).length, 112)
  assert.equal((xml.match(/<pitch\b/g) ?? []).length, 104)
  assert.equal((xml.match(/<rest\b/g) ?? []).length, 8)
})

test('S15 real-browser proof is part of protected CI after source lifecycle acceptance', () => {
  const sourceLifecycleIndex = ci.indexOf('Verify S14 complete source lifecycle acceptance')
  const s15Index = ci.indexOf('Verify S15 Smoosic write-back in real browser')
  assert.ok(sourceLifecycleIndex >= 0)
  assert.ok(s15Index > sourceLifecycleIndex)
  assert.match(ci, /node scripts\/verifyS15SmoosicWritebackBrowser\.js/)
  assert.match(ci, /s15-smoosic-writeback/)
})

test('S15 browser negative candidates use correlated v2 results with revision-bound provenance', () => {
  assert.match(browserProof, /type: 'seslitab:smoosic-export-result',[\s\S]*version: 2,[\s\S]*paddingRestProvenance:/)
  assert.match(browserProof, /sourceRevision: request\.sourceRevision,[\s\S]*rawNoteCount:/)
})


test('S15 waits for native Smoosic pitch edits before exporting to SesliTab', () => {
  assert.match(editor, /let mobileEditPromise = Promise\.resolve\(\)/)
  assert.match(editor, /async function awaitEditorStable\(\)/)
  assert.match(editor, /await mobileEditPromise/)
  assert.match(editor, /function currentEditorMusicXmlText\(\)/)
  assert.match(editor, /async function waitForEditorMusicXmlMutation\(previousXml/)
  assert.match(
    editor,
    /const previousXml = currentEditorMusicXmlText\(\)[\s\S]*await view\.setPitches\(\[pitch\]\)[\s\S]*await waitForEditorMusicXmlMutation\(previousXml\)/,
  )
  assert.match(editor, /if \(!view\.tracker\?\.selections\?\.length\) \{[\s\S]*await view\.moveHome/)
  assert.match(
    editor,
    /async function handleSesliTabExportRequest\(event\)[\s\S]*await awaitEditorStable\(\)[\s\S]*createSesliTabWritebackExport\(/,
  )
  assert.match(
    editor,
    /async function exportMusicXml\(\)[\s\S]*await awaitEditorStable\(\)[\s\S]*serializeCurrentMusicXml\(\)/,
  )
})


test('S15 primes the Smoosic cursor after every accepted MusicXML load', () => {
  assert.match(
    editor,
    /await applicationInstance\.view\.changeScore\(score\)[\s\S]*await applicationInstance\.view\.moveHome\(\{[\s\S]*ctrlKey: true[\s\S]*shiftKey: false[\s\S]*altKey: false[\s\S]*\}\)/,
  )
})

test('Task 7 retires consumed padding immediately after explicit duration action', () => {
  assert.match(
    editor,
    /activeStructuralActionTracker\.recordDurationAction\([\s\S]*activePaddingRestTracker\?\.adoptRenderedScore\(view\.score,[\s\S]*authorizedDurationIdentities:[\s\S]*activeStructuralActionTracker\.authorizedDurationIdentitySet\(\)/,
  )
})

test('Task 7 Ctrl+Z restores padding provenance before structural action reconciliation', () => {
  assert.match(
    editor,
    /key\.toLowerCase\(\) === 'z'[\s\S]*activePaddingRestTracker\?\.adoptRenderedScore\(renderedScore,[\s\S]*authorizedDurationIdentities:[\s\S]*activeStructuralActionTracker\?\.authorizedDurationIdentitySet\(\)[\s\S]*activeStructuralActionTracker\?\.reconcileRenderedScore\(renderedScore\)/,
  )
})

test('S15 re-adopts rendered score with explicit structural duration identities before provenance export', () => {
  assert.match(
    editor,
    /function createSesliTabWritebackExport\(\{ score, sourceRevision, tracker, structuralTracker, actionId \}\)[\s\S]*structuralTracker\?\.reconcileRenderedScore\(score\)[\s\S]*authorizedDurationIdentities:[\s\S]*structuralTracker\?\.authorizedDurationIdentitySet\(\)[\s\S]*tracker\.createExportManifest\(/,
  )
})


test('Task 6 structural outcomes extend writeback status without changing S15 publication semantics', async () => {
  const {
    SMOOSIC_WRITEBACK_STATUS,
    createSmoosicWritebackOutcome,
  } = await import('../src/services/smoosicProductWriteback.js')

  assert.equal(SMOOSIC_WRITEBACK_STATUS.APPLIED, 'APPLIED')
  assert.equal(SMOOSIC_WRITEBACK_STATUS.APPLIED_STRUCTURAL, 'APPLIED_STRUCTURAL')
  for (const status of [
    'INVALID_ACTION_PROVENANCE',
    'AMBIGUOUS_IDENTITY',
    'CE_RUNTIME_UNAVAILABLE',
    'CE_CONTRACT_MISMATCH',
    'CE_PROJECTION_FAILED',
    'CE_REVALIDATION_FAILED',
    'CONFORMANCE_FAILED',
  ]) {
    assert.equal(SMOOSIC_WRITEBACK_STATUS[status], status)
  }

  const revision = Object.freeze({ revisionId: 'structural-revision-1' })
  const retried = createSmoosicWritebackOutcome(
    SMOOSIC_WRITEBACK_STATUS.APPLIED_STRUCTURAL,
    {
      revision,
      musicXml: '<score-partwise/>',
      retriedPublication: true,
    },
  )
  assert.deepEqual(retried, {
    status: 'APPLIED_STRUCTURAL',
    revision,
    musicXml: '<score-partwise/>',
    retriedPublication: true,
  })

  assert.match(host, /if \(state\.pendingPublication\)/)
  assert.match(host, /retryPendingPublication\(root\)/)
  assert.match(host, /publishCommittedRevision\(root, pendingPublication\)/)
  assert.match(host, /applyRevalidatedMusicXmlRevision\(committed\.revision\.content, committed\.musicXml\)/)
})


test('SES-141 read-only Smoosic assignment verifier accepts only the current editor export', async () => {
  const currentXml = S15_SOURCE_XML.replace('<step>C</step>', '<step>E</step>')
  const root = staleSourceHost({
    sourceXml: S15_SOURCE_XML,
    candidateXml: currentXml,
  })
  const previousDocument = globalThis.document
  globalThis.document = root
  try {
    const {
      ensureSmoosicEditorTab,
      verifySmoosicAssignmentMusicXml,
    } = await import('../src/smoosicEditorTabUi.js')

    assert.ok(ensureSmoosicEditorTab(root))
    root.getElementById('smoosic-tab-btn').click()
    root.getElementById('smoosic-editor-frame').dispatchEvent({ type: 'load' })
    await settleWriteback()

    assert.equal(
      await verifySmoosicAssignmentMusicXml(root, currentXml),
      true,
    )
    assert.equal(
      await verifySmoosicAssignmentMusicXml(root, S15_SOURCE_XML),
      false,
    )
    assert.equal(root.postMessageCount, 2)
    assert.equal(
      root.getElementById('xml-output').textContent,
      S15_SOURCE_XML,
      'assignment verification must not publish or mutate the SesliTab source',
    )
  } finally {
    globalThis.document = previousDocument
  }
})
