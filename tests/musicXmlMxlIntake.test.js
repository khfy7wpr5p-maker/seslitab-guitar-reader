import { test } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'

import {
  readMusicXmlSourceFile,
  validateMusicXmlFile,
} from '../src/services/musicXmlFile.js'

function fileFromBytes(name, bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return {
    name,
    size: view.byteLength,
    type: 'application/vnd.recordare.musicxml',
    async arrayBuffer() {
      return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
    },
  }
}

async function makeMxl({ rootPath = 'score.musicxml', xml = '<score-partwise version="4.0"><part-list/></score-partwise>' } = {}) {
  const zip = new JSZip()
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?><container><rootfiles><rootfile full-path="${rootPath}" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>`,
  )
  zip.file(rootPath, xml)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

test('GTAB-10A accepts .mxl at the shared MusicXML file boundary', () => {
  assert.equal(
    validateMusicXmlFile({ name: 'score.MXL', size: 4096, type: 'application/vnd.recordare.musicxml' }),
    null,
  )
})

test('GTAB-10A extracts the container-declared MusicXML root from .mxl', async () => {
  const xml = '<score-partwise version="4.0"><part-list/><part id="P1"/></score-partwise>'
  const bytes = await makeMxl({ rootPath: 'scores/main.musicxml', xml })

  const result = await readMusicXmlSourceFile(fileFromBytes('lesson.mxl', bytes))

  assert.equal(result.xmlText, xml)
  assert.equal(result.sourceName, 'lesson.mxl')
  assert.equal(result.containerKind, 'mxl')
  assert.equal(result.rootFile, 'scores/main.musicxml')
})

test('GTAB-10A rejects ambiguous MXL archives when container.xml does not select a root', async () => {
  const zip = new JSZip()
  zip.file('a.musicxml', '<score-partwise/>')
  zip.file('b.xml', '<score-partwise/>')
  const bytes = await zip.generateAsync({ type: 'uint8array' })

  await assert.rejects(
    () => readMusicXmlSourceFile(fileFromBytes('ambiguous.mxl', bytes)),
    /birden fazla MusicXML adayı/i,
  )
})

test('GTAB-10A rejects archive entries whose original path escapes the archive root', async () => {
  const zip = new JSZip()
  zip.file('../score.musicxml', '<score-partwise/>')
  const bytes = await zip.generateAsync({ type: 'uint8array' })

  await assert.rejects(
    () => readMusicXmlSourceFile(fileFromBytes('unsafe.mxl', bytes)),
    /güvenli olmayan dosya yolu/i,
  )
})
