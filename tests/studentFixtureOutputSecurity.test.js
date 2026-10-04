import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, symlink, link, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeStudentFixture } from '../scripts/studentFixtureOutput.js'

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'student-fixture-boundary-'))
  const teacher = join(root, 'teacher')
  const support = join(root, 'student-app/browser-tests/support')
  await mkdir(teacher); await mkdir(support, { recursive: true })
  t.after(() => rm(root, { recursive: true, force: true }))
  return { root, teacher, support, target: join(support, 'td-prod-10-generated-fixture.mjs') }
}
test('legitimate sibling checkout receives only the fixed qualification fixture', async (t) => {
  const w = await workspace(t)
  await writeStudentFixture('../student-app/browser-tests/support/td-prod-10-generated-fixture.mjs', 'export const fixture = 1', w.teacher)
  assert.equal(await readFile(w.target, 'utf8'), 'export const fixture = 1')
  await writeStudentFixture(w.target, 'export const fixture = 2', w.teacher)
  assert.equal(await readFile(w.target, 'utf8'), 'export const fixture = 2')
})
for (const input of ['/tmp/arbitrary.mjs', '../student-app/../../arbitrary.mjs', '../student-app/browser-tests/support/other.mjs', '../student-app/browser-tests/support/td-prod-10-generated-fixture.mjs\n']) {
  test(`rejects arbitrary/traversal input ${JSON.stringify(input)}`, async (t) => {
    const w = await workspace(t)
    await assert.rejects(writeStudentFixture(input, 'bad', w.teacher), /output path/)
  })
}
for (const attack of ['file-symlink', 'parent-symlink', 'hardlink']) {
  test(`rejects ${attack} without changing an outside file`, async (t) => {
    const w = await workspace(t)
    const outside = join(w.root, 'private-data')
    await writeFile(outside, 'preserve')
    if (attack === 'file-symlink') await symlink(outside, w.target)
    if (attack === 'hardlink') await link(outside, w.target)
    if (attack === 'parent-symlink') {
      await rm(w.support, { recursive: true }); await mkdir(join(w.root, 'outside-dir'))
      await symlink(join(w.root, 'outside-dir'), w.support)
    }
    await assert.rejects(writeStudentFixture(w.target, 'bad', w.teacher))
    assert.equal(await readFile(outside, 'utf8'), 'preserve')
  })
}
