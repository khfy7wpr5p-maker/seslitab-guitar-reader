import JSZip from 'jszip'

// Browser-side MusicXML file validation and secure intake helpers.

export const MAX_MUSIC_XML_FILE_SIZE = 10 * 1024 * 1024

const MUSIC_XML_EXTENSIONS = ['.xml', '.musicxml', '.mxl']
const MXL_CONTAINER_PATH = 'META-INF/CONTAINER.XML'

function stripTrailingDotsAndWhitespace(value) {
  let end = value.length
  while (end > 0) {
    const char = value[end - 1]
    if (char !== '.' && char.trim() !== '') break
    end -= 1
  }
  return value.slice(0, end)
}

function fileExtension(name) {
  const lower = String(name || '').toLowerCase()
  return MUSIC_XML_EXTENSIONS.find((extension) => lower.endsWith(extension)) ?? null
}

function archivePathIsSafe(value) {
  const path = String(value || '').replace(/\\/g, '/')
  if (!path || path.startsWith('/') || /^[a-z]:\//i.test(path)) return false
  if (path.includes('..')) return false
  return true
}

function readBlobWithFileReader(file, mode) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader !== 'function') {
      reject(new Error('MusicXML dosyası okunamadı.'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('MusicXML dosyası okunamadı.'))
    if (mode === 'arrayBuffer') reader.readAsArrayBuffer(file)
    else reader.readAsText(file, 'UTF-8')
  })
}

async function readFileText(file) {
  if (typeof file?.text === 'function') return String(await file.text())
  const value = await readBlobWithFileReader(file, 'text')
  return String(value || '')
}

async function readFileArrayBuffer(file) {
  if (typeof file?.arrayBuffer === 'function') return file.arrayBuffer()
  const value = await readBlobWithFileReader(file, 'arrayBuffer')
  if (!(value instanceof ArrayBuffer)) throw new Error('MusicXML dosyası okunamadı.')
  return value
}

function readZipEntryTextBounded(entry, maxBytes = MAX_MUSIC_XML_FILE_SIZE) {
  return new Promise((resolve, reject) => {
    const decoder = new TextDecoder('utf-8')
    const stream = entry.internalStream('uint8array')
    let total = 0
    let text = ''
    let settled = false

    const fail = (error) => {
      if (settled) return
      settled = true
      stream.pause?.()
      reject(error)
    }

    stream.on('data', (chunk) => {
      if (settled) return
      total += chunk.byteLength
      if (total > maxBytes) {
        fail(new Error('.mxl içindeki MusicXML 10 MB sınırını aşıyor.'))
        return
      }
      text += decoder.decode(chunk, { stream: true })
    })
    stream.on('error', () => fail(new Error('Geçersiz .mxl arşivi.')))
    stream.on('end', () => {
      if (settled) return
      settled = true
      text += decoder.decode()
      resolve(text)
    })
    stream.resume()
  })
}

function resolveMxlRootPath(containerXml) {
  const match = /<rootfile\b[^>]*\bfull-path\s*=\s*(["'])(.*?)\1/i.exec(containerXml)
  return match?.[2] ?? null
}

async function extractMxlMusicXml(file) {
  let zip
  try {
    zip = await JSZip.loadAsync(await readFileArrayBuffer(file), { checkCRC32: true })
  } catch {
    throw new Error('Geçersiz .mxl arşivi.')
  }

  const entries = Object.values(zip.files).filter((entry) => !entry.dir)
  if (entries.length === 0) throw new Error('.mxl arşivi boş veya geçersiz.')

  for (const entry of entries) {
    const originalName = entry.unsafeOriginalName ?? entry.name
    if (!archivePathIsSafe(originalName)) {
      throw new Error('.mxl arşivinde güvenli olmayan dosya yolu bulundu.')
    }
  }

  const containerEntry = entries.find((entry) => entry.name.toUpperCase() === MXL_CONTAINER_PATH)
  let rootFile = null

  if (containerEntry) {
    const containerXml = await readZipEntryTextBounded(containerEntry)
    const candidate = resolveMxlRootPath(containerXml)
    if (candidate) {
      if (!archivePathIsSafe(candidate)) {
        throw new Error('.mxl container.xml güvenli olmayan bir MusicXML yolu içeriyor.')
      }
      const rootEntry = zip.file(candidate)
      if (!rootEntry || rootEntry.dir) {
        throw new Error('.mxl container.xml tarafından belirtilen MusicXML bulunamadı.')
      }
      rootFile = candidate
    }
  }

  if (!rootFile) {
    const candidates = entries
      .filter((entry) => entry.name.toUpperCase() !== MXL_CONTAINER_PATH)
      .map((entry) => entry.name)
      .filter((name) => /\.(?:musicxml|xml)$/i.test(name))

    if (candidates.length === 0) throw new Error('.mxl arşivinde MusicXML dosyası bulunamadı.')
    if (candidates.length > 1) throw new Error('.mxl arşivinde birden fazla MusicXML adayı var.')
    rootFile = candidates[0]
  }

  const rootEntry = zip.file(rootFile)
  if (!rootEntry || rootEntry.dir) throw new Error('.mxl içindeki MusicXML bulunamadı.')
  const xmlText = await readZipEntryTextBounded(rootEntry)
  if (!xmlText.trim()) throw new Error('.mxl içindeki MusicXML boş.')

  return { xmlText, rootFile }
}

export function validateMusicXmlFile(file) {
  if (!file) return 'Lütfen bir MusicXML dosyası seçin.'

  const hasSupportedExtension = Boolean(fileExtension(file.name))

  // Windows and older browsers can report XML as text/plain or with no MIME
  // type, so the extension is the reliable browser-side filter. The parser
  // still validates the actual XML content before rendering.
  if (!hasSupportedExtension) {
    return 'Yalnızca .xml, .musicxml veya .mxl dosyaları kabul edilir.'
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return 'MusicXML dosyası boş.'
  }
  if (file.size > MAX_MUSIC_XML_FILE_SIZE) {
    return 'Dosya boyutu 10 MB sınırını aşıyor.'
  }
  return null
}

export async function readMusicXmlSourceFile(file) {
  const validation = validateMusicXmlFile(file)
  if (validation) throw new Error(validation)

  const extension = fileExtension(file.name)
  const sourceName = typeof file.name === 'string' && file.name ? file.name : 'MusicXML'
  if (extension === '.mxl') {
    const extracted = await extractMxlMusicXml(file)
    return Object.freeze({
      xmlText: extracted.xmlText,
      sourceName,
      containerKind: 'mxl',
      rootFile: extracted.rootFile,
    })
  }

  const xmlText = await readFileText(file)
  if (!xmlText.trim()) throw new Error('MusicXML dosyası boş.')
  return Object.freeze({
    xmlText,
    sourceName,
    containerKind: 'plain',
    rootFile: null,
  })
}

export function musicXmlHasRhythm(notes) {
  return Array.isArray(notes) && notes.some((note) => {
    const beats = Number(note?.beats)
    return Number.isFinite(beats) && beats > 0
  })
}

export function buildMusicXmlDownloadName(sourceName) {
  const fileName = String(sourceName || '')
    .split(/[\\/]/)
    .pop()
    .trim()
  const baseName = fileName.replace(/\.(?:musicxml|xml|mxl|pdf)$/i, '')
  const windowsSafeName = stripTrailingDotsAndWhitespace(
    baseName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
  ).trim()

  return `${windowsSafeName || 'seslitab'}.musicxml`
}

export function createMusicXmlDownloadBlob(xmlString) {
  if (typeof xmlString !== 'string' || !xmlString.trim()) {
    throw new Error('İndirilecek MusicXML verisi bulunamadı.')
  }

  return new Blob(
    [xmlString],
    { type: 'application/vnd.recordare.musicxml+xml;charset=utf-8' }
  )
}
