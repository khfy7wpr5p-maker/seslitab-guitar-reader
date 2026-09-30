import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const uiPath = '../src/teacherHomeworkUi.js'

test('SES-119 unified homework UI owns presentation only and contains no provider or package authority', () => {
  const source = readFileSync(
    new URL(uiPath, import.meta.url),
    'utf8',
  )

  assert.doesNotMatch(
    source,
    /firebase-admin|from\s+['"]firebase(?:\/|['"])|firestore|localStorage|sessionStorage|indexedDB|Authorization\s*:|Bearer\s|fetch\s*\(|XMLHttpRequest|WebSocket|node:crypto|createHash\s*\(/i,
  )
  assert.doesNotMatch(
    source,
    /createScorePracticePackageFromFinalMusicXml|createStudentPrivatePracticePackageV1|createStudentPrivateChordBoardPackageV1|createTeacherAssignmentDeliveryOrchestrator|sourceNotes/i,
  )
  assert.doesNotMatch(
    source,
    /Nota Görünümü|mountTeacherScoreAssignmentUi|mountTeacherChordBoardAssignmentUi/i,
  )
})

test('SES-119 production entry keeps authenticated assignment composition as the only mount authority', () => {
  const main = readFileSync(
    new URL('../main.js', import.meta.url),
    'utf8',
  )

  assert.match(
    main,
    /mountTeacherAssignmentProduction/,
  )
  assert.doesNotMatch(
    main,
    /mountTeacherHomeworkUi|from\s+['"].*teacherHomeworkUi\.js['"]/,
  )
})

test('SES-119 visible copy never exposes prepare/deliver transport vocabulary', () => {
  const source = readFileSync(
    new URL(uiPath, import.meta.url),
    'utf8',
  )

  for (const visibleCopy of [
    'Ödev Gönder',
    'Nota',
    'Akor',
    'Öğrenciler',
    'Öğretmen notu',
    'Öğrenciye Gönder',
    'Gönderildi.',
    'Gönderilemedi. Tekrar deneyin.',
  ]) {
    assert.match(source, new RegExp(visibleCopy))
  }

  assert.doesNotMatch(
    source,
    /textContent\s*=\s*['"][^'"]*(prepare|deliver|güvenli teslimat)[^'"]*['"]/i,
  )
})
