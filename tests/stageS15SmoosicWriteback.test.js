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
