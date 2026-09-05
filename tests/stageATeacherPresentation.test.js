import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  STAGE_A_TEACHER_COPY,
  simplifyTeacherApprovalSummary,
  simplifyTeacherRevisionSummary,
  simplifyTeacherStatus,
} from '../src/stageATeacherPresentation.js'

test('Stage A exposes simple teacher-facing action language', () => {
  assert.equal(STAGE_A_TEACHER_COPY.tab, 'Düzelt')
  assert.equal(STAGE_A_TEACHER_COPY.correctionSave, 'Düzeltmeyi Kaydet')
  assert.equal(STAGE_A_TEACHER_COPY.approve, 'Eseri Onayla')
  assert.equal(STAGE_A_TEACHER_COPY.undo, 'Geri Al')
  assert.equal(STAGE_A_TEACHER_COPY.details, 'Detaylar')

  const visibleCopy = Object.values(STAGE_A_TEACHER_COPY).join(' ')
  assert.doesNotMatch(visibleCopy, /revision id|history id|exact revision|immutable revision|actor/i)
})

test('Stage A removes exact revision identifiers from the primary summary', () => {
  assert.equal(
    simplifyTeacherRevisionSummary('Geçerli sürüm: revision-123. Tür: corrected. Toplam sürüm: 4.'),
    'Düzeltme geçmişi: 4 kayıt.',
  )
  assert.equal(
    simplifyTeacherApprovalSummary('Bu exact sürüm öğretmen tarafından onaylandı. Onay kaydı: approval-123. Bu, kalite kapısı veya paylaşım izni değildir.'),
    'Eserin mevcut sürümü öğretmen tarafından onaylandı.',
  )
  assert.equal(
    simplifyTeacherApprovalSummary('Bu exact sürüm için uygulanabilir öğretmen onayı yok.'),
    'Eser henüz onaylanmadı.',
  )
})

test('Stage A maps technical runtime wording to bounded user language without changing meaning', () => {
  assert.equal(simplifyTeacherStatus('Öğretmen kayıt etiketi gereklidir.'), 'Kayıt adı gereklidir.')
  assert.match(
    simplifyTeacherStatus('Düzeltme yeni immutable sürüm olarak kaydedildi. Önceki sürüm değiştirilmedi.'),
    /Düzeltme kaydedildi.*Önceki kayıt korunuyor/i,
  )
  assert.match(
    simplifyTeacherStatus('Geçerli exact sürüm için öğretmen onayı kaydedildi.'),
    /öğrenciye gönderim izni değildir/i,
  )
})

test('Stage A presentation layer remains reusable but is retired from the S14 production entry', () => {
  const ui = readFileSync(new URL('../src/stageATeacherPresentation.js', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/stageATeacherPresentation.css', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8')

  assert.doesNotMatch(ui, /Audiveris|omrService|gatewayProvider|teacherWorkspaceModel|fetch\(|localStorage|indexedDB/i)
  assert.doesNotMatch(ui, /innerHTML\s*=/)
  assert.match(ui, /createElement\('details'\)/)
  assert.match(ui, /createElement\('summary'\)/)
  assert.match(css, /min-height:\s*44px/)
  assert.match(css, /:focus-visible/)
  assert.match(css, /@media\s*\(max-width:\s*640px\)/)
  assert.doesNotMatch(main, /stageATeacherPresentation\.css/)
  assert.doesNotMatch(main, /stageATeacherPresentation\.js/)
  assert.match(main, /initSmoosicEditorTab\(document\)/)
})
