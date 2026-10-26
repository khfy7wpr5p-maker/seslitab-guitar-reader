import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

const html = readFileSync(
  new URL('../index.html', import.meta.url),
  'utf8',
)
const main = readFileSync(
  new URL('../main.js', import.meta.url),
  'utf8',
)

test('SES-146 keeps teacher auth controls separate from the Assignment Composer host', () => {
  assert.match(
    html,
    /id="teacher-auth-session-host"/,
  )
  assert.match(
    html,
    /id="teacher-assignment-composer-host"/,
  )
  assert.ok(
    html.indexOf(
      'id="teacher-auth-session-host"',
    ) <
      html.indexOf(
        'id="teacher-assignment-composer-host"',
      ),
  )
})

test('SES-146 production entry uses the session controller instead of one-shot signed-in bootstrap', () => {
  assert.match(
    main,
    /createTeacherAuthSessionController/,
  )
  assert.match(
    main,
    /mountTeacherAuthSessionUi/,
  )
  assert.match(
    main,
    /mountTeacherAssignmentProduction/,
  )
  assert.doesNotMatch(
    main,
    /console\.(?:log|debug|info|warn|error).*token/i,
  )
  assert.doesNotMatch(
    main,
    /localStorage|sessionStorage/,
  )
})
