import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { isStageS12RendererStartupFailure } from '../src/stageS12RendererSessionRecoveryUi.js'

const source = readFileSync(new URL('../src/stageS12RendererSessionRecoveryUi.js', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/stageS12RendererSessionRecovery.css', import.meta.url), 'utf8')
const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')

test('S12 recognizes only the bounded renderer startup failure state', () => {
  assert.equal(isStageS12RendererStartupFailure('Görsel nota renderer başlatılamadı. Yeniden deneyebilirsiniz.'), true)
  assert.equal(isStageS12RendererStartupFailure('Görsel nota hazır. Notaya dokunabilirsiniz.'), false)
  assert.equal(isStageS12RendererStartupFailure('Görsel nota oluşturulamadı: fixture'), false)
})

test('S12 recovery retries only the existing score view from current in-session MusicXML', () => {
  assert.match(source, /import \{ activateScoreView \} from '.\/scoreViewUi\.js'/)
  assert.match(source, /const musicxml = currentMusicXml\(root\)/)
  assert.match(source, /const pending = activateScoreView\(root\)/)
  assert.match(source, /const restored = await pending/)
  assert.match(source, /Nota ekranını yeniden başlat/)
  assert.match(source, /PDF ve işlenmiş nota verisi korunuyor/)
  assert.doesNotMatch(source, /location\.reload|window\.location|history\.go|fetch\(|XMLHttpRequest/)
})

test('S12 recovery preserves the users selected legacy result tab around score activation', () => {
  assert.match(source, /function snapshotResultTabs\(root\)/)
  assert.match(source, /function restoreResultTabs\(snapshot\)/)
  assert.match(source, /const tabs = snapshotResultTabs\(root\)/)
  const firstRestore = source.indexOf('restoreResultTabs(tabs)', source.indexOf('const pending = activateScoreView(root)'))
  const awaitPending = source.indexOf('const restored = await pending')
  const finalRestore = source.lastIndexOf('restoreResultTabs(tabs)')
  assert.ok(firstRestore > -1)
  assert.ok(awaitPending > firstRestore)
  assert.ok(finalRestore > awaitPending)
})

test('S12 recovery does not re-run OMR or change musical/revision/share authority', () => {
  assert.doesNotMatch(source, /Audiveris|OMR_PROVIDER|gatewayProvider|render\.yaml|Dockerfile|package12|shareAuthorization|applyTeacherUiCorrection|approveTeacherUiCurrentRevision/i)
  assert.doesNotMatch(source, /nearest[- ]?note|pitch[- ]?label|elementFromPoint|querySelectorAll\([^)]*svg/i)
})

test('S12 recovery provides one bounded automatic retry plus a visible manual 44px retry control', () => {
  assert.match(source, /AUTO_RETRY_DELAY_MS = 350/)
  assert.match(source, /state\.autoRetryUsed = true/)
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
