import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import test from 'node:test'
import { qualifyGtab10cSemanticParity } from '../src/qualification/gtab10cSemanticParity.js'

const root = new URL('../', import.meta.url)
const fixtureId = 'musescore-like-multipart-meter-tie-accidentals'
const oracle = JSON.parse(await readFile(new URL(`artifacts/gtab10c-semantic-parity/${fixtureId}.snapshots.json`, root)))
const { report } = JSON.parse(await readFile(new URL(`artifacts/gtab10c-semantic-parity/${fixtureId}.report.json`, root)))
const input = {
  fixtureId,
  sourceBytes: await readFile(new URL('tests/fixtures/gtab10c/musescore-like-multipart-source.musicxml', root)),
  derivedBytes: await readFile(new URL(`artifacts/gtab10c-semantic-parity/derived/${fixtureId}.musicxml`, root)),
  expectedSesliTabCommit: report.provenance.sesliTabCommit,
  oracleEvidence: oracle,
  sourceSnapshot: oracle.sourceSnapshot,
  derivedSnapshot: oracle.derivedSnapshot,
  tabPositions: oracle.tabPositions,
  targetSelection: report.provenance.targetSelection,
  provenance: report.provenance,
}

test('actual pinned oracle graph retains original identities and rejects corrupt endpoints', () => {
  assert.equal(qualifyGtab10cSemanticParity(input).status, 'PASS')
  assert.equal(oracle.readViews.derived.policy, 'gtab10c-note-id-part-lane-read-view-v3')
  for (const note of oracle.derivedSnapshot.notes) {
    assert.equal(note.voice, 1)
    assert.ok(note.staff === 1 || note.staff === 2)
    const row = oracle.readViews.derived.mapping.find(row => row.readViewId === note.source_id)
    assert.equal(note.part_id, row.partId)
    assert.equal(note.staff, row.originalStaff)
  }
  const renamed = structuredClone(input)
  for (const snapshot of [renamed.sourceSnapshot, renamed.derivedSnapshot]) {
    const rename = new Map(snapshot.notes.map((note, index) => [note.source_id, `renamed-${index}`]))
    for (const note of snapshot.notes) {
      note.source_id = rename.get(note.source_id)
      for (const field of ['tie_prev', 'tie_next']) if (note[field]) note[field] = rename.get(note[field])
    }
    if (snapshot === renamed.derivedSnapshot) {
      for (const position of renamed.tabPositions) {
        for (const field of ['tie_prev', 'tie_next']) if (position[field]) position[field] = rename.get(position[field])
      }
    }
  }
  assert.equal(qualifyGtab10cSemanticParity(renamed).status, 'PASS')
  for (const corrupt of [
    (value, a) => { a.tie_next = 'dangling' },
    (value, a) => { value.derivedSnapshot.notes.find(n => n.source_id === a.tie_next).tie_prev = null },
    (value, a) => { a.tie_next = value.derivedSnapshot.notes.find(n => n.staff === 2 && n.tie_prev).source_id },
    (value, a) => { a.tie_next = value.derivedSnapshot.notes.find(n => n.staff === 1 && n.pitch_midi === 65).source_id },
    (value) => { for (const note of value.derivedSnapshot.notes.filter(n => n.staff === 1)) { note.tie_next = null; note.tie_prev = null } },
  ]) {
    const value = structuredClone(input)
    const start = value.derivedSnapshot.notes.find(n => n.staff === 1 && n.tie_next)
    corrupt(value, start)
    assert.notEqual(qualifyGtab10cSemanticParity(value).status, 'PASS')
  }
})


test('real pinned multi-staff keys retain raw evidence and cannot qualify missing staff bindings', async () => {
  const editor = await import(pathToFileURL(path.join(process.env.GTAB_EDITOR_ROOT, 'src/index.js')).href)
  const selected = { partId: 'P1', partIndex: 0, staff: 2, voice: 1 }
  const note = staff => `<note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>${staff}</staff></note>`
  const xml = `<score-partwise><part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><key number="1"><fifths>3</fifths><mode>major</mode></key><key number="2"><fifths>0</fifths><mode>major</mode></key><time><beats>1</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>G</sign><line>2</line></clef></attributes>${note(1)}<backup><duration>4</duration></backup>${note(2)}</measure></part></score-partwise>`
  const session = editor.createSourceSession(xml, { targetSelection: selected })
  const document = editor.createTabAssignmentDocument(session)
  document.assignPosition(session.events[0].sourceEventId, { string: 1, fret: 0 })
  const exported = editor.serializeGuitarTabMusicXml({ sourceSession: session, document })
  assert.match(exported, /<key number="1"><fifths>0<\/fifths><mode>major<\/mode><\/key>/)
  const sourcePath = fileURLToPath(new URL('artifacts/gtab10c-semantic-parity/key-staff-source.musicxml', root))
  await writeFile(sourcePath, xml)
  for (const [name, derivedXml] of [
    ['selected', exported],
    ['wrong', exported.replace('<fifths>0</fifths>', '<fifths>3</fifths>')],
    ['leaked', exported.replace('</key>', '</key><key number="2"><fifths>3</fifths><mode>major</mode></key>')],
  ]) {
    const derivedPath = fileURLToPath(new URL(`artifacts/gtab10c-semantic-parity/key-staff-${name}.musicxml`, root))
    const outputPath = fileURLToPath(new URL(`artifacts/gtab10c-semantic-parity/key-staff-${name}.json`, root))
    await writeFile(derivedPath, derivedXml)
    execFileSync(process.env.GTAB10C_PYTHON, [fileURLToPath(new URL('scripts/gtab10cSemanticOracle.py', root)), sourcePath, derivedPath, outputPath], { env: { ...process.env, PYTHONPATH: path.join(process.env.SEMANTIC_ENGINE_ROOT, 'src') } })
    const actual = JSON.parse(await readFile(outputPath))
    assert.deepEqual(actual.keySignatureCoverage.source[0].rawKeyStaffNumbers, ['1', '2'])
    assert.ok(actual.sourceSnapshot.key_signatures.every(row => !Object.hasOwn(row, 'staff')))
    const result = qualifyGtab10cSemanticParity({ ...input, sourceBytes: xml, derivedBytes: derivedXml,
      sourceSnapshot: actual.sourceSnapshot, derivedSnapshot: actual.derivedSnapshot, tabPositions: actual.tabPositions,
      oracleEvidence: actual, targetSelection: selected, provenance: { ...input.provenance,
        sourceSha256: actual.sourceSha256, derivedSha256: actual.derivedSha256, targetSelection: selected } })
    assert.equal(result.status, 'UNSUPPORTED', name)
    assert.equal(result.diagnostics[0].cause, 'KEY_SIGNATURE_STAFF_CONTEXT', name)
    assert.equal(await readFile(sourcePath, 'utf8'), xml)
    assert.equal(await readFile(derivedPath, 'utf8'), derivedXml)
  }
})
