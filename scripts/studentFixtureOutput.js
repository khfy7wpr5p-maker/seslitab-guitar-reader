import { lstat, realpath, open } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const teacherCheckout = fileURLToPath(new URL('..', import.meta.url))
const RELATIVE_OUTPUT = '../student-app/browser-tests/support/td-prod-10-generated-fixture.mjs'

export async function writeStudentFixture(requestedPath, source, checkout = teacherCheckout) {
  const trustedCheckout = await realpath(checkout)
  const sibling = join(dirname(trustedCheckout), 'student-app')
  const target = join(sibling, 'browser-tests', 'support', 'td-prod-10-generated-fixture.mjs')
  // User input authorizes this single fixed destination; it never becomes the write path.
  if (requestedPath !== RELATIVE_OUTPUT && requestedPath !== target) throw new Error('TD-PROD-10 output path is not the fixed sibling fixture')
  for (const directory of [dirname(trustedCheckout), sibling, join(sibling, 'browser-tests'), join(sibling, 'browser-tests', 'support')]) {
    const stat = await lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o022) !== 0 ||
        (process.getuid && stat.uid !== process.getuid()) || await realpath(directory) !== resolve(directory)) {
      throw new Error('TD-PROD-10 output directory is not a trusted checkout directory')
    }
  }
  if (!Number.isInteger(constants.O_NOFOLLOW)) throw new Error('TD-PROD-10 no-follow file writes are unavailable')
  const handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW, 0o600)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o022) !== 0 || (process.getuid && stat.uid !== process.getuid())) {
      throw new Error('TD-PROD-10 output file is not a private regular fixture')
    }
    await handle.truncate(0)
    await handle.writeFile(source, 'utf8')
  } finally { await handle.close() }
}
