import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  createStudentPrivatePracticePackageV1,
  restoreStudentPracticePackageV1,
} from '../src/services/studentPracticePackageV1.js'

const FORBIDDEN_SOLVER_PATTERN = /guitarBasicPositionPolicy|guitarPositionResolver|lowest-fret-v1|generated-basic|musicxml-to-guitar-tab-engine|alphatab/iu

test('GTAB-04 handoff and composer never depend on generated-basic or external TAB solvers', async () => {
  for (const relative of [
    '../src/services/editorGuitarTabHandoff.js',
    '../src/services/teacherAssignmentComposerService.js',
  ]) {
    const source = await readFile(new URL(relative, import.meta.url), 'utf8')
    assert.doesNotMatch(source, FORBIDDEN_SOLVER_PATTERN, relative)
  }
})

test('GTAB-04 PracticePackage restore preserves teacher TAB bytes exactly', () => {
  const scoreXml = '<score-partwise version="4.0"><part-list/></score-partwise>'
  const tabXml = '<?xml version="1.0"?><score-partwise version="4.0"><part-list/><!-- exact teacher TAB: string 2 fret 11 --></score-partwise>'
  const pkg = createStudentPrivatePracticePackageV1({
    packageId: 'gtab-package',
    workId: 'gtab-work',
    title: 'GTAB Etüt',
    revisionId: 'gtab-revision',
    approvedAt: '2026-10-04T10:00:00Z',
    studentId: 'student-a',
    musicXml: scoreXml,
    guitarTabMusicXml: tabXml,
    canonicalEvents: [],
    practice: {},
  })

  const restored = restoreStudentPracticePackageV1(structuredClone(pkg))
  assert.equal(restored.content.score.data, scoreXml)
  assert.equal(restored.content.guitarTab.format, 'musicxml')
  assert.equal(restored.content.guitarTab.data, tabXml)
})
