import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')
const host = readFileSync(new URL('../src/smoosicEditorTabUi.js', import.meta.url), 'utf8')
const prepare = readFileSync(new URL('../scripts/prepareSmoosicEditor.js', import.meta.url), 'utf8')
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('S14 makes Nota Düzenle the lazy same-origin Smoosic entry point', () => {
  assert.match(host, /button\.textContent = 'Nota Düzenle'/)
  assert.match(host, /const EDITOR_URL = '\/smoosic-editor\/index\.html'/)
  assert.match(host, /if \(!frame\.getAttribute\('src'\)\)/)
  assert.match(host, /root\.getElementById\?\.\('xml-output'\)/)
  assert.match(host, /mobile-xml-input/)
  assert.match(host, /DataTransfer/)
})

test('S14 ignores reset-hidden stale XML and requires the newly dispatched filename', () => {
  assert.match(host, /root\.getElementById\?\.\('results-section'\)/)
  assert.match(host, /results\.hidden === true/)
  assert.match(host, /results\.hasAttribute\?\.\('hidden'\)/)
  assert.match(host, /resetIframeStatusForTransfer\(frame, fileName\)/)
  assert.match(host, /waitForMusicXmlLoad\(frame, fileName\)/)
  assert.match(host, /status\.startsWith\('Yüklendi:'\) && status\.includes\(expectedFileName\)/)
})

test('S14 tracks the active source lifecycle and refreshes an already-created editor', () => {
  assert.match(host, /function sourceTransitionPending\(root\)/)
  assert.match(host, /'progress-container', 'musicxml-progress'/)
  assert.match(host, /function refreshObservedSource\(root, \{ xmlChanged = false, allowInitial = false \} = \{\}\)/)
  assert.match(host, /state\.sourceRevision \+= 1/)
  assert.match(host, /function bindSourceLifecycle\(root\)/)
  assert.match(host, /MutationObserver/)
  assert.match(host, /root\.getElementById\?\.\('xml-output'\)/)
  assert.match(host, /void enqueueEditorSync\(root\)/)
  assert.match(host, /targetRevision !== state\.sourceRevision/)
  assert.match(host, /frame\.hidden = true/)
  assert.match(host, /Yeni eser hazırlanıyor…/)
})

test('S14 promotes only accepted XML changes and retains the last accepted source after replacement failure', () => {
  assert.match(host, /function acceptedSource\(root\)/)
  assert.match(host, /sourceObservationInitialized/)
  assert.match(host, /if \(!allowInitial && !xmlChanged\)/)
  assert.match(host, /replacement failed or was cancelled/)
  assert.match(host, /keep the last accepted source/i)
  assert.match(host, /const xmlChanged = records\.some/)
  assert.match(host, /refreshObservedSource\(root, \{ xmlChanged \}\)/)
  assert.match(host, /refreshObservedSource\(root, \{ allowInitial: true \}\)/)
})

test('S14 does not start the retired teacher score workspace or keypad presentation', () => {
  for (const retired of [
    'reviewInspectorUi.js',
    'package8TeacherUi.js',
    'stageEVisualNoteEditorUi.js',
    'stageFRevisionLifecycleUi.js',
    'scoreViewUi.js',
    'stageS05ScoreWorkspaceUi.js',
    'stageS07InlineTeacherInspectorUi.js',
    'stagePrDKeypadIntegrationUi.js',
    'stageIInstrumentProductUi.js',
    'stageS10EducationalChordsUi.js',
    'stageLShareUi.js',
  ]) {
    assert.doesNotMatch(main, new RegExp(retired.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }

  assert.match(main, /import '\.\/src\/package4Ui\.js'/)
  assert.match(main, /import '\.\/src\/package5Ui\.js'/)
  assert.match(main, /initSmoosicEditorTab\(document\)/)
})

test('S14 production build packages the proven POC without corpus UI', () => {
  assert.match(pkg.scripts['smoosic:prepare'], /experiments\/smoosic-mobile/)
  assert.match(pkg.scripts.build, /npm run smoosic:prepare/)
  assert.match(prepare, /smoosic-editor/)
  assert.match(prepare, /mobile\.js/)
  assert.doesNotMatch(prepare, /corpus-stress\.js/)
  assert.doesNotMatch(prepare, /Corpus Test/)
})
