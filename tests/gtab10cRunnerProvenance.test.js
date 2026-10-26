import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('real qualification runner rejects stale workflow SHA before dependencies and ignores PATH-shadow git', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'gtab10c-git-shadow-'))
  try {
    const marker = path.join(directory, 'executed')
    const executable = path.join(directory, 'git')
    writeFileSync(executable, `#!/bin/sh\nprintf forged > '${marker}'\nprintf '%040d\\n' 0\n`)
    chmodSync(executable, 0o755)
    const env = { ...process.env, PATH: directory + ':' + process.env.PATH,
      GTAB_EDITOR_ROOT: process.cwd(), SEMANTIC_ENGINE_ROOT: process.cwd(), GITHUB_SHA: 'a'.repeat(40) }
    const unsafe = spawnSync('git', ['rev-parse', 'HEAD'], { env })
    assert.equal(unsafe.status, 0)
    assert.equal(existsSync(marker), true)
    rmSync(marker)
    const result = spawnSync(process.execPath, ['scripts/verifyGtab10cSemanticParity.js'], { env, encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /SesliTab provenance must match actual checkout HEAD/)
    assert.equal(existsSync(marker), false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
