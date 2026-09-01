import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  isStageS12RendererStartupFailure,
} from '../src/stageS12RendererSessionRecoveryUi.js'

const source = readFileSync(new URL('../src/stageS12RendererSessionRecoveryUi.js', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/stageS12RendererSessionRecovery.css', import.meta.url), 'utf8')
const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')

test('S12/STI-15 recognizes only the bounded renderer startup failure state', () => {
  assert.equal(isStageS12RendererStartupFailure('Görsel nota renderer başlatılamadı. Yeniden deneyebilirsiniz.'), true)
  assert.equal(isStageS12RendererStartupFailure('Görsel nota hazır. Notaya dokunabilirsiniz.'), false)
  assert.equal(isStageS12RendererStartupFailure('Görsel nota oluşturulamadı: fixture'), false)
})

test('STI-15 recovery prefers current immutable product MusicXML and fails closed instead of showing source for a corrected revision', () => {
  assert.match(source, /resolvePrDProductMusicXml/)
  assert.match(source, /resolveStageS15RecoveryMusicXml/)
  assert.match(source, /current-product-revision-musicxml-unavailable/)
  assert.match(source, /automaticRoot && source/)
  assert.match(source, /activateRecoveryMusicXml\(root, recovery\.musicXml\)/)
  assert.match(source, /output\.textContent = musicXml/)
  assert.match(source, /output\.textContent = original/)
  assert.match(source, /Nota ekranını yeniden başlat/)
  assert.doesNotMatch(source, /location\.reload|window\.location|history\.go|fetch\(|XMLHttpRequest/)
})

test('STI-15 recovery preserves the users selected legacy result tab around score activation', () => {
  assert.match(source, /function snapshotResultTabs\(root\)/)
  assert.match(source, /function restoreResultTabs\(snapshot\)/)
  assert.match(source, /const tabs = snapshotResultTabs\(root\)/)
  const pending = source.indexOf('const pending = activateRecoveryMusicXml(root, recovery.musicXml)')
  const firstRestore = source.indexOf('restoreResultTabs(tabs)', pending)
  const awaitPending = source.indexOf('const restored = await pending')
  const finalRestore = source.lastIndexOf('restoreResultTabs(tabs)')
  assert.ok(pending > -1)
  assert.ok(firstRestore > pending)
  assert.ok(awaitPending > firstRestore)
  assert.ok(finalRestore > awaitPending)
})

test('STI-15 recovery rebinds the replaced renderer and keeps only an exact surviving selection highlight', () => {
  assert.match(source, /bindStagePrBEditorSelection\(root\)/)
  assert.match(source, /syncStageS06RevisionBinding\(root\)/)
  assert.match(source, /syncStageS07VerifiedSelectionProjection\(root\)/)
  assert.match(source, /syncScoreNoteHighlight\(root, snapshot\)/)
  assert.match(source, /if \(!highlighted\) clearPackage3NoteSelection\(\)/)
})

test('S12/STI-15 recovery does not re-run OMR or change musical/revision/share authority', () => {
  assert.doesNotMatch(source, /Audiveris|OMR_PROVIDER|gatewayProvider|render\.yaml|Dockerfile|package12|shareAuthorization|applyTeacherUiCorrection|approveTeacherUiCurrentRevision/i)
  assert.doesNotMatch(source, /nearest[- ]?note|pitch[- ]?label|elementFromPoint|querySelectorAll\([^)]*svg/i)
})

test('STI-15 recovery coalesces observer bursts and provides one bounded automatic retry plus a 44px manual control', () => {
  assert.match(source, /AUTO_RETRY_DELAY_MS = 350/)
  assert.match(source, /state\.autoRetryUsed = true/)
  assert.match(source, /state\.syncScheduled/)
  assert.match(source, /queueMicrotask/)
  assert.match(source, /if \(state\.retrying \|\| state\.syncScheduled\) return false/)
  assert.match(source, /setTimeout\(/)
  assert.match(source, /button\.hidden = false/)
  assert.match(css, /min-height:\s*44px/)
  assert.match(css, /max-width:\s*760px/)
})

test('main wires renderer recovery after mobile production acceptance and before mobile score tools', () => {
  assert.match(main, /stageS12RendererSessionRecovery\.css/)
  assert.match(main, /initStageS12RendererSessionRecoveryUi/)
  assert.ok(main.indexOf('initStageS12RendererSessionRecoveryUi(document)') > main.indexOf('initStageS12MobileProductionAcceptanceUi(document)'))
  assert.ok(main.indexOf('initStageS12RendererSessionRecoveryUi(document)') < main.indexOf('initStageS12MobileScoreToolsUi(document)'))
})
