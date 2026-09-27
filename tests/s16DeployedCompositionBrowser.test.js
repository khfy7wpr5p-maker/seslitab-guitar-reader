import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(
  new URL('../scripts/verifyS16DeployedCompositionBrowser.js', import.meta.url),
)

test('failed deployed-composition probe removes stale PASS evidence before validation', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'seslitab-s16-stale-evidence-'))
  const evidencePath = join(root, 'artifacts', 's16-deployed-composition.json')
  await mkdir(dirname(evidencePath), { recursive: true })
  await writeFile(evidencePath, '{"result":"PASS"}\n', 'utf8')

  t.after(async () => {
    await rm(root, { recursive: true, force: true })
  })

  const env = { ...process.env }
  delete env.SESLITAB_PRODUCTION_URL
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    env,
    encoding: 'utf8',
  })

  assert.notEqual(result.status, 0)
  assert.equal(existsSync(evidencePath), false)
})
