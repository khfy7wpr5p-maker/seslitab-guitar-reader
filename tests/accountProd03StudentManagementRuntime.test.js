import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const main = await readFile(
  new URL('../main.js', import.meta.url),
  'utf8',
)
const html = await readFile(
  new URL('../index.html', import.meta.url),
  'utf8',
)
const authController = await readFile(
  new URL('../src/teacherAuthSessionController.js', import.meta.url),
  'utf8',
)
const envExample = await readFile(
  new URL('../.env.example', import.meta.url),
  'utf8',
)

test('Gate 6 production page exposes a dedicated Student Management host', () => {
  assert.match(html, /id="teacher-student-management-host"/)
})

test('Gate 6 production entry mounts Student Management from the approved Account Service endpoint', () => {
  assert.match(
    main,
    /mountTeacherStudentManagementProduction/,
  )
  assert.match(
    main,
    /VITE_SESLITAB_ACCOUNT_SERVICE_API_URL/,
  )
  assert.match(
    main,
    /teacher-student-management-host/,
  )
  assert.match(
    main,
    /getIdToken:\s*connection\.getIdToken/,
  )
})

test('authenticated teacher connection preserves the request-time ID-token seam for Student Management', () => {
  assert.match(
    authController,
    /getIdToken:\s*result\.getIdToken/,
  )
})

test('SesliTab environment contract names the Account Service production endpoint without embedding credentials', () => {
  assert.match(
    envExample,
    /^VITE_SESLITAB_ACCOUNT_SERVICE_API_URL=$/m,
  )
})
