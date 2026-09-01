import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/stageS12MobileScoreToolsUi.js', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/stageS12MobileScoreTools.css', import.meta.url), 'utf8')
const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')

test('S12 adds an iPhone-safe pointerup path while preserving exact renderer identity', () => {
  assert.match(source, /addEventListener\('pointerup'/)
  assert.match(source, /hitTestScoreNote\(runtime, \{ clientX, clientY \}\)/)
  assert.match(source, /resolveCanonicalNoteFromScoreRef\(notes, rendererRef\)/)
  assert.match(source, /selectPackage3MeasureKey\(resolved\.measureKey\)/)
  assert.match(source, /selectPackage3NoteIndex\(resolved\.noteIndex/)
  assert.match(source, /rendererTarget: rendererRef/)
  assert.match(source, /interaction: 'score-pointerup'/)
  assert.match(source, /stopImmediatePropagation/)
})

test('S12 exposes only the four existing bounded S07 edit fields', () => {
  assert.match(source, /STAGE_E_EDIT_FIELD\.PITCH/)
  assert.match(source, /STAGE_E_EDIT_FIELD\.ACCIDENTAL/)
  assert.match(source, /STAGE_E_EDIT_FIELD\.OCTAVE/)
  assert.match(source, /STAGE_E_EDIT_FIELD\.DURATION/)
  assert.match(source, /stage-s07-\$\{field\}/)
  assert.doesNotMatch(source, /nearest[- ]?note|svg proximity|pitch label|inferPitch|guess/i)
})

test('S12 mobile presentation keeps 44px tools and opens the existing inspector as a bounded sheet', () => {
  assert.match(css, /\.stage-s12-note-tool[\s\S]*min-width:\s*44px/)
  assert.match(css, /\.stage-s12-note-tool[\s\S]*min-height:\s*44px/)
  assert.match(css, /position:\s*fixed/)
  assert.match(css, /data-stage-s12-tools-open='true'/)
  assert.match(css, /max-height:\s*min\(58dvh, 30rem\)/)
  assert.match(css, /env\(safe-area-inset-bottom\)/)
  assert.match(css, /\.stage-s04-mini-tuner \.tuner-display/)
  assert.match(css, /max-height:\s*min\(68dvh, 30rem\)/)
})

test('S12 stays presentation and interaction only and is wired after S11', () => {
  assert.doesNotMatch(source, /package12|shareAuthorization|Audiveris|OMR_PROVIDER|render\.yaml|Dockerfile|fetch\(|XMLHttpRequest|localStorage|sessionStorage/i)
  assert.doesNotMatch(source, /applyTeacherUiCorrection|undoTeacherUiRevision|approveTeacherUiCurrentRevision|verifyAndRerenderStageF/)
  assert.match(main, /stageS12MobileScoreTools\.css/)
  assert.match(main, /initStageS12MobileScoreToolsUi/)
  assert.ok(main.indexOf('initStageS12MobileScoreToolsUi(document)') > main.indexOf('initStageS11TeacherWorkflowUi(document)'))
  assert.ok(main.indexOf('initStageS12MobileScoreToolsUi(document)') < main.indexOf('initStageLShareUi(document)'))
})
