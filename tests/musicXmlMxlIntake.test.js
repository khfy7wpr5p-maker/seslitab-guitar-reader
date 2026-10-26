import { test } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'

import {
  MAX_MUSIC_XML_FILE_SIZE,
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

function plainFile(name, text) {
  return {
    name,
    size: Buffer.byteLength(text),
    type: 'application/vnd.recordare.musicxml+xml',
    async text() { return text },
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

async function withGlobal(name, value, callback) {
  const previous = globalThis[name]
  try {
    globalThis[name] = value
    return await callback()
  } finally {
    if (previous === undefined) delete globalThis[name]
    else globalThis[name] = previous
  }
}

test('GTAB-10A accepts .mxl at the shared MusicXML file boundary', () => {
  assert.equal(
    validateMusicXmlFile({ name: 'score.MXL', size: 4096, type: 'application/vnd.recordare.musicxml' }),
    null,
  )
})

test('GTAB-10A preserves the existing plain .xml/.musicxml intake path', async () => {
  const xml = '<score-partwise version="4.0"><part-list/></score-partwise>'
  const result = await readMusicXmlSourceFile(plainFile('lesson.musicxml', xml))

  assert.equal(result.xmlText, xml)
  assert.equal(result.sourceName, 'lesson.musicxml')
  assert.equal(result.containerKind, 'plain')
  assert.equal(result.rootFile, null)
})

test('GTAB-10A rejects empty plain MusicXML after reading', async () => {
  await assert.rejects(
    () => readMusicXmlSourceFile(plainFile('empty.xml', '   \n')),
    /MusicXML dosyası boş/i,
  )
})

test('GTAB-10A reads plain MusicXML through FileReader when File.text is unavailable', async () => {
  const xml = '<score-partwise version="4.0"/>'
  class FakeFileReader {
    readAsText(file, encoding) {
      assert.equal(encoding, 'UTF-8')
      this.result = file.payload
      queueMicrotask(() => this.onload())
    }
  }

  await withGlobal('FileReader', FakeFileReader, async () => {
    const result = await readMusicXmlSourceFile({
      name: 'fallback.xml',
      size: Buffer.byteLength(xml),
      payload: xml,
    })
    assert.equal(result.xmlText, xml)
  })
})

test('GTAB-10A reports a controlled read error when FileReader fallback fails', async () => {
  class FailingFileReader {
    readAsText() { queueMicrotask(() => this.onerror()) }
  }

  await withGlobal('FileReader', FailingFileReader, async () => {
    await assert.rejects(
      () => readMusicXmlSourceFile({ name: 'failed.xml', size: 8 }),
      /MusicXML dosyası okunamadı/i,
    )
  })
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

test('GTAB-10A reads .mxl through FileReader when File.arrayBuffer is unavailable', async () => {
  const xml = '<score-partwise version="4.0"><part-list/></score-partwise>'
  const bytes = await makeMxl({ xml })
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)

  class FakeFileReader {
    readAsArrayBuffer(file) {
      this.result = file.payload
      queueMicrotask(() => this.onload())
    }
  }

  await withGlobal('FileReader', FakeFileReader, async () => {
    const result = await readMusicXmlSourceFile({
      name: 'fallback.mxl',
      size: bytes.byteLength,
      payload: buffer,
    })
    assert.equal(result.xmlText, xml)
    assert.equal(result.containerKind, 'mxl')
  })
})

test('GTAB-10A rejects invalid ZIP bytes', async () => {
  const bytes = new TextEncoder().encode('not-a-zip')
  await assert.rejects(
    () => readMusicXmlSourceFile(fileFromBytes('broken.mxl', bytes)),
    /Geçersiz \.mxl arşivi/i,
  )
})

test('GTAB-10A rejects an empty MXL archive', async () => {
  const bytes = await new JSZip().generateAsync({ type: 'uint8array' })
  await assert.rejects(
    () => readMusicXmlSourceFile(fileFromBytes('empty.mxl', bytes)),
    /arşivi boş veya geçersiz/i,
  )
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

test('GTAB-10A falls back to the single MusicXML entry when container.xml is absent', async () => {
  const zip = new JSZip()
  zip.file('scores/only.musicxml', '<score-partwise version="4.0"/>')
  zip.file('README.txt', 'metadata')
  const bytes = await zip.generateAsync({ type: 'uint8array' })

  const result = await readMusicXmlSourceFile(fileFromBytes('single.mxl', bytes))
  assert.equal(result.rootFile, 'scores/only.musicxml')
  assert.match(result.xmlText, /score-partwise/)
})

test('GTAB-10A rejects MXL archives with no MusicXML candidate', async () => {
  const zip = new JSZip()
  zip.file('README.txt', 'metadata')
  const bytes = await zip.generateAsync({ type: 'uint8array' })

  await assert.rejects(
    () => readMusicXmlSourceFile(fileFromBytes('missing.mxl', bytes)),
    /MusicXML dosyası bulunamadı/i,
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

test('GTAB-10A rejects an unsafe root path declared by container.xml', async () => {
  const zip = new JSZip()
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0"?><container><rootfiles><rootfile full-path="../score.musicxml"/></rootfiles></container>',
  )
  zip.file('score.musicxml', '<score-partwise/>')
  const bytes = await zip.generateAsync({ type: 'uint8array' })

  await assert.rejects(
    () => readMusicXmlSourceFile(fileFromBytes('unsafe-root.mxl', bytes)),
    /container\.xml güvenli olmayan/i,
  )
})

test('GTAB-10A rejects a container-declared root that is missing instead of silently substituting another score', async () => {
  const zip = new JSZip()
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0"?><container><rootfiles><rootfile full-path="missing.musicxml"/></rootfiles></container>',
  )
  zip.file('other.musicxml', '<score-partwise/>')
  const bytes = await zip.generateAsync({ type: 'uint8array' })

  await assert.rejects(
    () => readMusicXmlSourceFile(fileFromBytes('missing-root.mxl', bytes)),
    /container\.xml.*MusicXML.*bulunamadı/i,
  )
})

test('GTAB-10A rejects an empty MusicXML root inside MXL', async () => {
  const bytes = await makeMxl({ xml: '   \n' })
  await assert.rejects(
    () => readMusicXmlSourceFile(fileFromBytes('empty-root.mxl', bytes)),
    /MusicXML boş/i,
  )
})

test('GTAB-10A enforces the decompressed 10 MB MusicXML limit', async () => {
  const xml = 'x'.repeat(MAX_MUSIC_XML_FILE_SIZE + 1)
  const bytes = await makeMxl({ xml })
  assert.ok(bytes.byteLength < MAX_MUSIC_XML_FILE_SIZE, 'fixture must remain compressed below upload limit')

  await assert.rejects(
    () => readMusicXmlSourceFile(fileFromBytes('oversized-root.mxl', bytes)),
    /MusicXML 10 MB sınırını aşıyor/i,
  )
})

test('GTAB-10A keeps validation fail-closed for invalid name, size and unsupported extension', () => {
  assert.match(validateMusicXmlFile(null), /Lütfen/i)
  assert.match(validateMusicXmlFile({ name: 'score.txt', size: 1 }), /Yalnızca/i)
  assert.match(validateMusicXmlFile({ name: 'score.xml', size: 0 }), /boş/i)
  assert.match(
    validateMusicXmlFile({ name: 'score.xml', size: MAX_MUSIC_XML_FILE_SIZE + 1 }),
    /10 MB/i,
  )
})

test('GTAB-10B rejects an invalid upload before reading any bytes', async () => {
  const reads = []
  const invalid = {
    name: 'lesson.txt',
    size: 12,
    async text() { reads.push('text'); throw new Error('invalid file reached text reader') },
    async arrayBuffer() { reads.push('arrayBuffer'); throw new Error('invalid file reached binary reader') },
  }

  await assert.rejects(() => readMusicXmlSourceFile(invalid), /Yalnızca/u)
  assert.deepEqual(reads, [])
})
