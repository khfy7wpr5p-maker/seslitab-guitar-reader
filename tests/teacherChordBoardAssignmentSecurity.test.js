import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const browserTd07Sources = [
  '../src/services/teacherChordBoardAssignmentController.js',
  '../src/teacherChordBoardAssignmentUi.js',
]

test('TD-07 teacher chord UI contains no Firebase Admin token persistence or Student App integration', () => {
  for (const path of browserTd07Sources) {
    const source = readFileSync(
      new URL(path, import.meta.url),
      'utf8',
    )

    assert.doesNotMatch(
      source,
      /firebase-admin|adminCredential|localStorage|sessionStorage|indexedDB|st-student-app|student-app|Bearer\s|Authorization\s*:/i,
      path,
    )
    assert.doesNotMatch(
      source,
      /node:crypto|createHash\s*\(/i,
      path,
    )
  }
})

test('TD-07 Akor Ata remains explicit-mount and is not wired into production shell', () => {
  for (const path of [
    '../main.js',
    '../src/app.js',
    '../src/appShell.js',
  ]) {
    const source = readFileSync(
      new URL(path, import.meta.url),
      'utf8',
    )

    assert.doesNotMatch(
      source,
      /teacherChordBoardAssignmentUi|mountTeacherChordBoardAssignmentUi|teacher-chord-board-assignment/i,
      path,
    )
  }
})

test('TD-07 does not add teacher transfer controls to the standalone Chord Board source', () => {
  const uiSource = readFileSync(
    new URL(
      '../src/teacherChordBoardAssignmentUi.js',
      import.meta.url,
    ),
    'utf8',
  )

  assert.doesNotMatch(
    uiSource,
    /SesliTab.?a aktar|st-guitar-chord-board|window\.open|postMessage/i,
  )
})

test('TD-07 durable authority modules do not persist voicingIndex', () => {
  for (const path of [
    '../src/services/chordBoardAssignmentSourceBinding.js',
    '../src/services/privateAssignment.js',
    '../src/services/studentChordBoardPackageV1.js',
    '../src/services/teacherChordBoardAssignmentRepository.js',
  ]) {
    const source = readFileSync(
      new URL(path, import.meta.url),
      'utf8',
    )
    assert.doesNotMatch(
      source,
      /voicingIndex/,
      path,
    )
  }
})
