import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
