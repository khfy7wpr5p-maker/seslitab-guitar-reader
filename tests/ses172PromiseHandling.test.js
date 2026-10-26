import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

test('qualification entry awaits test runner completion and propagates runner rejection', async () => {
  const source = await readFile(new URL('../qualification/td-prod-10/student-app-e2e.spec.mjs', import.meta.url), 'utf8')
  const entry = source.slice(source.indexOf('\nawait test('))
  assert.ok(entry.startsWith('\nawait test('))
  const execute = new AsyncFunction('test', entry)
  let release
  let completed = false
  const pending = execute(() => new Promise((resolve) => { release = resolve })).then(() => { completed = true })
  await Promise.resolve()
  assert.equal(completed, false, 'runner must not exit while qualification test is pending')
  release()
  await pending
  assert.equal(completed, true)
  await assert.rejects(execute(() => Promise.reject(new Error('qualification browser failed'))), /qualification browser failed/)
})

test('actual corpus DOM change handles early Promise rejection and restores UI', async () => {
  const source = await readFile(new URL('../experiments/smoosic-mobile/src/corpus-stress.js', import.meta.url), 'utf8')
  let change
  let disabled = false
  let rejectedOnce = false
  const status = { textContent: '' }
  const button = { addEventListener() {}, get disabled() { return disabled }, set disabled(value) {
    if (value && !rejectedOnce) { rejectedOnce = true; throw new Error('early UI failure') }
    disabled = value
  } }
  const input = { files: [{}], addEventListener(_name, callback) { change = callback } }
  const errors = []
  runInNewContext(source, { require: () => ({}), console: { error: (...args) => errors.push(args) },
    document: { getElementById: (id) => ({ 'mobile-corpus-test': button, 'mobile-corpus-input': input, 'poc-status': status })[id],
      addEventListener: (_name, ready) => ready() }, setTimeout, Uint8Array })
  change()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(disabled, false)
  assert.equal(status.textContent, 'Corpus hatası: işlem tamamlanamadı')
  assert.deepEqual(errors, [['Corpus stres testi tamamlanamadı']])
})
