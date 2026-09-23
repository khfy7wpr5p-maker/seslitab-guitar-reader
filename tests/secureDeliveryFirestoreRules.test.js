import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test, { after, before } from 'node:test'

import {
  assertFails,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore'

const PROJECT_ID = 'demo-seslitab-td06'
const COLLECTIONS = Object.freeze([
  'identityMappings',
  'teacherStudentGrants',
  'privateAssignments',
  'assignmentLifecycle',
  'practicePackages',
  'deliveries',
])

const EMULATOR_AVAILABLE = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST &&
  process.env.FIREBASE_AUTH_EMULATOR_HOST,
)
const emulatorTest = EMULATOR_AVAILABLE
  ? test
  : test.skip

let env

before(async () => {
  if (!EMULATOR_AVAILABLE) return
  const rules = await readFile(
    new URL('../firestore.rules', import.meta.url),
    'utf8',
  )
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  })
})

after(async () => {
  await env?.cleanup()
})

async function assertDeniedForContext(context) {
  const db = context.firestore()
  for (const collectionName of COLLECTIONS) {
    const ref = doc(
      db,
      collectionName,
      'direct-client-probe',
    )
    await assertFails(getDoc(ref))
    await assertFails(
      setDoc(ref, {
        probe: true,
      }),
    )
  }
}

emulatorTest('unauthenticated direct Firestore clients cannot read or write TD-06 collections', async () => {
  assert.ok(env)
  await assertDeniedForContext(
    env.unauthenticatedContext(),
  )
})

emulatorTest('STUDENT-like direct Firestore client cannot read or write TD-06 collections', async () => {
  await assertDeniedForContext(
    env.authenticatedContext('student-provider-uid', {
      role: 'STUDENT',
    }),
  )
})

emulatorTest('TEACHER-like direct Firestore client cannot read or write TD-06 collections', async () => {
  await assertDeniedForContext(
    env.authenticatedContext('teacher-provider-uid', {
      role: 'TEACHER',
    }),
  )
})
