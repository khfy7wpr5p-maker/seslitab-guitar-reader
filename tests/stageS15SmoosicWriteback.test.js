import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import '../scripts/runOmrQualityReport.js'
import { parseMusicXmlToNotes } from '../src/services/musicEngine.js'
import { publishPackage3Notes, clearPackage3Notes } from '../package3MeasureBridge.js'

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

function staleSourceHost({ sourceXml = '', candidateXml = '' } = {}) {
  const windowListeners = new Map()
  const root = {
    nodes: new Map(),
    defaultView: {
      crypto: { randomUUID: () => 's15-test-id' },
      location: { origin: 'https://seslitab.test' },
      DOMParser: class ProductDOMParser extends globalThis.DOMParser {
        parseFromString(xml, type) {
          const document = super.parseFromString(xml, type)
          document.documentElement = document.children?.[0] ?? null
          return document
        }
      },
      addEventListener(type, listener) { windowListeners.set(type, [...(windowListeners.get(type) ?? []), listener]) },
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
          return true
        }
        element.contentDocument = { getElementById(id) { return id === 'poc-status' ? editorStatus : (id === 'mobile-xml-input' ? editorInput : null) } }
        element.contentWindow = {
          File: class { constructor(parts, name) { this.parts = parts; this.name = name } },
          Event: class { constructor(type) { this.type = type } },
          postMessage(message) {
            queueMicrotask(() => {
              for (const listener of windowListeners.get('message') ?? []) listener({
                origin: root.defaultView.location.origin,
                source: element.contentWindow,
                data: {
                  type: 'seslitab:smoosic-export-result', version: 1,
                  requestId: message.requestId, sourceRevision: message.sourceRevision,
                  musicXml: candidateXml,
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
  return root
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
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))

  const status = root.getElementById('smoosic-editor-host-status')
  assert.equal(status.dataset.kind, 'error')
  assert.match(status.textContent, /Yeni sürüm kaydedildi ancak ekran güncellenemedi/)
  clearPackage3Notes()
  globalThis.document = previousDocument
})

async function runHostWritebackCandidate(candidateXml, sourceXml = S15_SOURCE_XML) {
  const root = staleSourceHost({ sourceXml, candidateXml })
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
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
  clearPackage3Notes()
  globalThis.document = previousDocument
  return root.getElementById('smoosic-editor-host-status').textContent
}

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

test('S15 real-browser proof is part of protected CI after source lifecycle acceptance', () => {
  const sourceLifecycleIndex = ci.indexOf('Verify S14 complete source lifecycle acceptance')
  const s15Index = ci.indexOf('Verify S15 Smoosic write-back in real browser')
  assert.ok(sourceLifecycleIndex >= 0)
  assert.ok(s15Index > sourceLifecycleIndex)
  assert.match(ci, /node scripts\/verifyS15SmoosicWritebackBrowser\.js/)
  assert.match(ci, /s15-smoosic-writeback/)
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
    /async function handleSesliTabExportRequest\(event\)[\s\S]*await awaitEditorStable\(\)[\s\S]*serializeCurrentMusicXml\(\)/,
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
