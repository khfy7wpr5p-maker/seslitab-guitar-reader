import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/stageS12MobileScoreToolsUi.js', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/stageS12MobileScoreTools.css', import.meta.url), 'utf8')
const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')

test('S12 note palette reuses exact Package 3/S06 selection instead of adding another hit-test path', () => {
  assert.match(source, /subscribePackage3Measures/)
  assert.match(source, /snapshot\?\.selectedNoteIdentity/)
  assert.match(source, /snapshot\?\.selectedNoteIndex/)
  assert.doesNotMatch(source, /hitTestScoreNote|resolveCanonicalNoteFromScoreRef|pointerup|touchend|elementFromPoint/i)
})

test('S12 note palette exposes only the four existing bounded S07 edit fields', () => {
  assert.match(source, /STAGE_E_EDIT_FIELD\.PITCH/)
  assert.match(source, /STAGE_E_EDIT_FIELD\.ACCIDENTAL/)
  assert.match(source, /STAGE_E_EDIT_FIELD\.OCTAVE/)
  assert.match(source, /STAGE_E_EDIT_FIELD\.DURATION/)
  assert.match(source, /stage-s07-\$\{field\}/)
  assert.doesNotMatch(source, /nearest[- ]?note|svg proximity|pitch label|inferPitch|findNearest|distanceTo|Math\.hypot/i)
})

test('S12 mobile presentation keeps a 44px right palette and bounded correction sheet', () => {
  assert.match(css, /\.stage-s12-note-tool[\s\S]*min-width:\s*44px/)
  assert.match(css, /\.stage-s12-note-tool[\s\S]*min-height:\s*44px/)
  assert.match(css, /right:\s*max\(0\.4rem, env\(safe-area-inset-right\)\)/)
  assert.match(css, /data-stage-s12-tools-open='true'/)
  assert.match(css, /max-height:\s*min\(58dvh, 30rem\)/)
  assert.match(css, /env\(safe-area-inset-bottom\)/)
})

test('S12 palette is presentation-only and composes after mobile acceptance and S11', () => {
  assert.doesNotMatch(source, /package12|shareAuthorization|Audiveris|OMR_PROVIDER|render\.yaml|Dockerfile|fetch\(|XMLHttpRequest|localStorage|sessionStorage/i)
  assert.doesNotMatch(source, /applyTeacherUiCorrection|undoTeacherUiRevision|approveTeacherUiCurrentRevision|verifyAndRerenderStageF/)
  assert.match(main, /stageS12MobileProductionAcceptance\.css/)
  assert.match(main, /stageS12MobileScoreTools\.css/)
  assert.match(main, /initStageS12MobileProductionAcceptanceUi/)
  assert.match(main, /initStageS12MobileScoreToolsUi/)
  assert.ok(main.indexOf('initStageS12MobileScoreToolsUi(document)') > main.indexOf('initStageS11TeacherWorkflowUi(document)'))
  assert.ok(main.indexOf('initStageS12MobileScoreToolsUi(document)') < main.indexOf('initStageLShareUi(document)'))
})
