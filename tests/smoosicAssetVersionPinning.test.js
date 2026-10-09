import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const prepareScript = readFileSync(
  new URL('../scripts/prepareSmoosicEditor.js', import.meta.url),
  'utf8',
)
const packageJson = JSON.parse(readFileSync(
  new URL('../experiments/smoosic-mobile/package.json', import.meta.url),
  'utf8',
))

test('SMENU-01 does not mix pinned Smoosic JS with unversioned upstream styles', () => {
  assert.equal(packageJson.dependencies.smoosic, '1.0.44')
  assert.doesNotMatch(
    prepareScript,
    /https:\/\/smoosic\.github\.io\/Smoosic\/src\/styles\//,
    'production Smoosic styles must not drift independently from pinned JS 1.0.44',
  )
})
