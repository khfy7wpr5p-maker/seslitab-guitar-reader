import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const td03Sources = [
  '../src/services/poolPublicationRecord.js',
  '../src/services/teacherPoolRepository.js',
  '../src/services/teacherPoolPublishingService.js',
  '../src/services/teacherPoolPublishingController.js',
  '../src/teacherPoolPublishingUi.js',
]

test('TD-03 source contains no persistence/network/browser-admin provider implementation', () => {
  for (const path of td03Sources) {
    const source = readFileSync(
      new URL(path, import.meta.url),
      'utf8',
    )

    assert.doesNotMatch(
      source,
      /firebase|adminCredential|listUsers\s*\(|fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|firestore|database|bearer|token/i,
      path,
    )
  }
})

test('TD-03 does not production-mount teacher Pool UI', () => {
  const main = readFileSync(
    new URL('../main.js', import.meta.url),
    'utf8',
  )
  const shell = readFileSync(
    new URL('../src/appShell.js', import.meta.url),
    'utf8',
  )

  assert.doesNotMatch(
    main,
    /teacherPoolPublishingUi|mountTeacherPoolPublishingUi/,
  )
  assert.doesNotMatch(
    shell,
    /teacherPool|Havuza Gönder|id:\s*['"]teacher['"]/i,
  )
})

test('TD-03 publishing service remains independent of SCORE and Stage L delivery', () => {
  const service = readFileSync(
    new URL(
      '../src/services/teacherPoolPublishingService.js',
      import.meta.url,
    ),
    'utf8',
  )

  assert.doesNotMatch(
    service,
    /stageL|teacherShareAuthorization|teacherShareEligibility|scoreAssignmentSourceBinding|privateAssignment|practicePackage|musicXml/i,
  )
})

test('TD-03 UI is explicit-mount only and has no module-level auto-init hook', () => {
  const source = readFileSync(
    new URL('../src/teacherPoolPublishingUi.js', import.meta.url),
    'utf8',
  )

  assert.match(
    source,
    /export function mountTeacherPoolPublishingUi/,
  )
  assert.doesNotMatch(
    source,
    /DOMContentLoaded|initTeacherPoolPublishingUi\s*\(|mountTeacherPoolPublishingUi\s*\(\s*document/i,
  )
})

test('TD-03 scoped CSS does not modify global app shell selectors', () => {
  const source = readFileSync(
    new URL('../src/teacherPoolPublishingUi.css', import.meta.url),
    'utf8',
  )

  const selectors = source
    .split('{')
    .slice(0, -1)
    .map((chunk) => chunk.split('}').at(-1).trim())
    .filter(Boolean)

  for (const selector of selectors) {
    assert.match(selector, /^\.teacher-pool-publishing/)
  }
})
