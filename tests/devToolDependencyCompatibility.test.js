import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'

const require = createRequire(import.meta.url)
const firebaseRequire = createRequire(require.resolve('firebase-tools/package.json'))

test('Firebase rules watcher observes literal rules-file changes and closes cleanly', { timeout: 10000 }, async () => {
  const chokidar = firebaseRequire('chokidar')
  const directory = await mkdtemp(join(tmpdir(), 'seslitab-rules-watcher-'))
  const rules = join(directory, 'firestore.rules')
  await writeFile(rules, 'initial rules')
  const watcher = chokidar.watch(rules, { persistent: true, ignoreInitial: true })
  try {
    await once(watcher, 'ready')
    const changed = once(watcher, 'change')
    await writeFile(rules, 'updated rules')
    const [changedPath] = await changed
    assert.equal(changedPath, rules)
    assert.ok(new chokidar.FSWatcher() instanceof chokidar.FSWatcher)
  } finally {
    await watcher.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('FTP override retains the CommonJS Client and directory parser used by get-uri', () => {
  const ftp = firebaseRequire('basic-ftp')
  const client = new ftp.Client()
  try {
    for (const method of ['access', 'lastMod', 'list', 'downloadTo', 'close']) {
      assert.equal(typeof client[method], 'function', method)
    }
    const listing = ftp.parseList('-rw-r--r-- 1 owner group 42 Jan 01 2026 score.xml\r\n')
    assert.equal(listing.length, 1)
    assert.equal(listing[0].name, 'score.xml')
    assert.equal(listing[0].size, 42)
    assert.equal(typeof firebaseRequire('get-uri').getUri, 'function')
  } finally {
    client.close()
  }
})
