import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VALIDATOR = path.join(ROOT, 'scripts/validateE2eMusicXml.mjs')

function pitchedNote(step, octave, x) {
  return `      <note default-x="${x}">
        <pitch>
          <step>${step}</step>
          <octave>${octave}</octave>
        </pitch>
        <duration>2</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>`
}

test('pretty-printed MusicXML preserves exact 8 pitched notes and 1 rest', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1">
      <part-name>CC0 regression exercise</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
        </time>
      </attributes>
${pitchedNote('C', 4, 40)}
${pitchedNote('D', 4, 80)}
${pitchedNote('E', 4, 120)}
${pitchedNote('F', 4, 160)}
      <backup>
        <duration>8</duration>
      </backup>
      <forward>
        <duration>6</duration>
        <voice>2</voice>
        <staff>1</staff>
      </forward>
      <note default-x="163">
        <rest/>
        <duration>1</duration>
        <voice>2</voice>
        <type>eighth</type>
        <staff>1</staff>
      </note>
    </measure>
    <measure number="2">
${pitchedNote('G', 4, 40)}
${pitchedNote('F', 4, 80)}
${pitchedNote('E', 4, 120)}
${pitchedNote('D', 4, 160)}
    </measure>
  </part>
</score-partwise>
`
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'seslitab-e2e-musicxml-'))
  const inputPath = path.join(tempRoot, 'pretty-printed.musicxml')

  try {
    writeFileSync(inputPath, xml, 'utf8')
    const output = execFileSync(process.execPath, [VALIDATOR, inputPath], {
      cwd: ROOT,
      encoding: 'utf8',
    })

    assert.match(output, /Yapısal kontrol: root=evet, measure=2, note=9/)
    assert.match(output, /Parser sonucu: 9 nota ayrıştırıldı\./)
    assert.match(output, /Parser ayrıntısı: 8 perdeli nota, 1 sus\./)
    assert.doesNotMatch(output, /Parser sonucu: 13\b/)
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
})
