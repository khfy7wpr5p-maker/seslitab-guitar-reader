import assert from 'node:assert/strict'
import test from 'node:test'

async function loadPackageContract() {
  try {
    return await import('../src/services/studentPracticePackageV1.js')
  } catch {
    assert.fail('studentPracticePackageV1 module must exist')
  }
}

async function loadFingerprint() {
  try {
    return await import('../backend/delivery/integrity/packageFingerprint.js')
  } catch {
    assert.fail('packageFingerprint module must exist')
  }
}

function validInput(overrides = {}) {
  return {
    packageId: 'package-a',
    workId: 'work-a',
    title: 'Etüt',
    revisionId: 'revision-a',
    approvedAt: '2026-09-23T08:00:00Z',
    studentId: 'student-a',
    musicXml: '<score-partwise version="4.0"></score-partwise>',
    canonicalEvents: [],
    practice: {
      tempoBpm: 80,
      allowTempoChange: true,
    },
    ...overrides,
  }
}

function reorderObjectKeysDeep(value) {
  if (Array.isArray(value)) return value.map(reorderObjectKeysDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, child]) => [key, reorderObjectKeysDeep(child)]),
    )
  }
  return value
}

test('private SCORE package matches Student App PracticePackage v1 boundary', async () => {
  const {
    STUDENT_PRACTICE_PACKAGE_SCHEMA_VERSION,
    createStudentPrivatePracticePackageV1,
    validateStudentPracticePackageV1,
  } = await loadPackageContract()

  const pkg = createStudentPrivatePracticePackageV1(validInput())

  assert.equal(pkg.schemaVersion, STUDENT_PRACTICE_PACKAGE_SCHEMA_VERSION)
  assert.equal(pkg.schemaVersion, '1.0.0')
  assert.equal(pkg.publication.scope, 'student_private')
  assert.equal(pkg.publication.recipientStudentId, 'student-a')
  assert.equal(pkg.approvedRevision.revisionId, 'revision-a')
  assert.equal(pkg.approvedRevision.state, 'teacher_approved')
  assert.equal(pkg.content.score.format, 'musicxml')
  assert.equal(pkg.content.canonicalEvents.length, 0)
  assert.equal(Object.isFrozen(pkg), true)
  assert.equal(Object.isFrozen(pkg.approvedRevision), true)
  assert.equal(Object.isFrozen(pkg.publication), true)
  assert.equal(Object.isFrozen(pkg.content), true)
  assert.equal(Object.isFrozen(pkg.content.score), true)
  assert.equal(Object.isFrozen(pkg.content.canonicalEvents), true)
  assert.equal(validateStudentPracticePackageV1(pkg).ok, true)
})

test('PracticePackage validator rejects teacher-only/OMR fields and invalid private recipient/revision state', async () => {
  const {
    createStudentPrivatePracticePackageV1,
    validateStudentPracticePackageV1,
  } = await loadPackageContract()

  const pkg = structuredClone(
    createStudentPrivatePracticePackageV1(validInput()),
  )
  pkg.omr = { provider: 'audiveris' }
  assert.match(
    validateStudentPracticePackageV1(pkg).errors.join('\n'),
    /unsupported top-level field: omr/,
  )

  const missingRecipient = structuredClone(pkg)
  delete missingRecipient.omr
  delete missingRecipient.publication.recipientStudentId
  assert.match(
    validateStudentPracticePackageV1(missingRecipient).errors.join('\n'),
    /recipientStudentId/,
  )

  const unapproved = structuredClone(pkg)
  delete unapproved.omr
  unapproved.approvedRevision.state = 'teacher_corrected'
  assert.match(
    validateStudentPracticePackageV1(unapproved).errors.join('\n'),
    /teacher_approved/,
  )
})

test('PracticePackage validator requires MusicXML text and canonicalEvents array', async () => {
  const {
    createStudentPrivatePracticePackageV1,
    validateStudentPracticePackageV1,
  } = await loadPackageContract()

  const pkg = structuredClone(
    createStudentPrivatePracticePackageV1(validInput()),
  )
  pkg.content.score.data = ''
  pkg.content.canonicalEvents = null

  const result = validateStudentPracticePackageV1(pkg)
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /score\.data/)
  assert.match(result.errors.join('\n'), /canonicalEvents/)
})

test('fingerprint is stable across object insertion order and changes with package content', async () => {
  const {
    createStudentPrivatePracticePackageV1,
  } = await loadPackageContract()
  const {
    canonicalPackageJson,
    fingerprintPracticePackage,
  } = await loadFingerprint()

  const a = createStudentPrivatePracticePackageV1(validInput())
  const b = reorderObjectKeysDeep(structuredClone(a))

  assert.equal(canonicalPackageJson(a), canonicalPackageJson(b))
  const first = fingerprintPracticePackage(a)
  const second = fingerprintPracticePackage(b)
  assert.match(first, /^[a-f0-9]{64}$/)
  assert.equal(first, second)

  const changed = structuredClone(a)
  changed.content.score.data += '<!-- changed -->'
  assert.notEqual(
    fingerprintPracticePackage(a),
    fingerprintPracticePackage(changed),
  )
})

test('canonical package JSON rejects undefined, non-finite numbers and cycles', async () => {
  const { canonicalPackageJson } = await loadFingerprint()

  assert.throws(
    () => canonicalPackageJson({ a: undefined }),
    /unsupported|undefined/i,
  )
  assert.throws(
    () => canonicalPackageJson({ a: Number.POSITIVE_INFINITY }),
    /finite|number/i,
  )
  const cyclic = {}
  cyclic.self = cyclic
  assert.throws(
    () => canonicalPackageJson(cyclic),
    /cycle|cyclic/i,
  )
})


test('canonical package JSON uses locale-aware alphabetical key ordering', async () => {
  const { canonicalPackageJson } = await loadFingerprint()

  assert.equal(
    canonicalPackageJson({
      z: 1,
      ä: 2,
      a: 3,
    }),
    '{"a":3,"ä":2,"z":1}',
  )
})


test('private SCORE package carries exact optional guitar TAB MusicXML', async () => {
  const {
    createStudentPrivatePracticePackageV1,
    validateStudentPracticePackageV1,
  } = await loadPackageContract()

  const tabXml =
    '<score-partwise version="4.0"><part-list/></score-partwise>'
  const pkg =
    createStudentPrivatePracticePackageV1(
      validInput({
        guitarTabMusicXml: tabXml,
      }),
    )

  assert.deepEqual(
    pkg.content.guitarTab,
    {
      format: 'musicxml',
      data: tabXml,
    },
  )
  assert.equal(
    Object.isFrozen(pkg.content.guitarTab),
    true,
  )
  assert.equal(
    validateStudentPracticePackageV1(pkg).ok,
    true,
  )
})

test('TAB MusicXML remains optional and malformed TAB payloads fail closed', async () => {
  const {
    createStudentPrivatePracticePackageV1,
    validateStudentPracticePackageV1,
  } = await loadPackageContract()

  const withoutTab =
    createStudentPrivatePracticePackageV1(
      validInput(),
    )
  assert.equal(
    withoutTab.content.guitarTab,
    null,
  )

  for (const guitarTab of [
    { format: 'ascii', data: '0-1-2' },
    { format: 'musicxml', data: '' },
    {
      format: 'musicxml',
      data: '<score-partwise/>',
      extra: true,
    },
  ]) {
    const raw = structuredClone(
      withoutTab,
    )
    raw.content.guitarTab =
      guitarTab
    const result =
      validateStudentPracticePackageV1(
        raw,
      )
    assert.equal(result.ok, false)
    assert.match(
      result.errors.join('\n'),
      /guitarTab/i,
    )
  }
})
