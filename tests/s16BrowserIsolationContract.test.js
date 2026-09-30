import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
const unitGuardPath = resolve('tests', 's16ReadOnlyRequestGuard.test.js')
const browserGuardPath = resolve('browser-tests', 's16ReadOnlyRequestGuard.browser.test.mjs')
const ciPath = resolve('.github', 'workflows', 'ci.yml')

test('S16 real-browser guard is isolated from the parallel unit-test pool', () => {
  assert.equal(
    packageJson.scripts?.['test:s16:browser'],
    'node --test --test-concurrency=1 browser-tests/s16ReadOnlyRequestGuard.browser.test.mjs',
  )

  assert.equal(existsSync(browserGuardPath), true, 'dedicated S16 browser test must exist')

  const unitGuard = readFileSync(unitGuardPath, 'utf8')
  assert.doesNotMatch(unitGuard, /runBrowserProbe|chromeBinary|spawnSync|createServer/)

  const ci = readFileSync(ciPath, 'utf8')
  const unitStep = ci.indexOf('run: npm test')
  const browserStep = ci.indexOf('run: npm run test:s16:browser')
  assert.notEqual(unitStep, -1, 'unit test step must exist')
  assert.ok(browserStep > unitStep, 'serialized S16 browser step must run after unit tests')
})
