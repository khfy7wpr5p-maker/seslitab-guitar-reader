import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const expressRequire = createRequire(require.resolve('express'))
const firebaseRequire = createRequire(require.resolve('firebase-tools/package.json'))

test('Express JSON consumer drains trailing compressed bytes and keeps serving requests', () => {
  const child = spawnSync(process.execPath, [
    fileURLToPath(new URL('./support/compressedJsonSecurityProbe.mjs', import.meta.url)),
    expressRequire.resolve('body-parser'),
  ], { encoding: 'utf8', timeout: 8000 })
  assert.equal(child.error, undefined)
  assert.equal(child.status, 0, child.stderr)
  assert.match(child.stdout, /server healthy/)
})

test('Firebase Zod consumer bounds oversized collection validation and preserves ordinary schemas', () => {
  const { z } = firebaseRequire('zod')
  const schema = z.array(z.number()).max(4)
  assert.deepEqual(schema.parse([1, 2, 3]), [1, 2, 3])
  const result = schema.safeParse(Array(2000).fill('invalid'))
  assert.equal(result.success, false)
  assert.equal(result.error.issues.length, 1)
  assert.equal(result.error.issues[0].code, 'too_big')
})

test('AJV URI consumer preserves ordinary resolution without promoting encoded schemes', () => {
  const ajvRequire = createRequire(firebaseRequire.resolve('ajv'))
  const uri = ajvRequire('fast-uri')
  assert.equal(uri.resolve('https://example.test/scores/', '../piece.xml'), 'https://example.test/piece.xml')
  assert.doesNotMatch(uri.normalize('%6Aavascript:alert(1)'), /^javascript:/i)
  assert.notEqual(uri.parse('%6Aavascript:alert(1)').scheme, 'javascript')
})
