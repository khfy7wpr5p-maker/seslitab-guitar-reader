// Browser-side MusicXML file validation helpers.

export const MAX_MUSIC_XML_FILE_SIZE = 10 * 1024 * 1024

const MUSIC_XML_EXTENSIONS = ['.xml', '.musicxml']

function stripTrailingDotsAndWhitespace(value) {
  let end = value.length
  while (end > 0) {
    const char = value[end - 1]
    if (char !== '.' && char.trim() !== '') break
    end -= 1
  }
  return value.slice(0, end)
}

export function validateMusicXmlFile(file) {
  if (!file) return 'Lütfen bir MusicXML dosyası seçin.'

  const name = String(file.name || '').toLowerCase()
  const hasSupportedExtension = MUSIC_XML_EXTENSIONS.some((extension) => name.endsWith(extension))

  // Windows and older browsers can report XML as text/plain or with no MIME
  // type, so the extension is the reliable browser-side filter. The parser
  // still validates the actual XML content before rendering.
  if (!hasSupportedExtension) {
    return 'Yalnızca .xml veya .musicxml dosyaları kabul edilir.'
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return 'MusicXML dosyası boş.'
  }
  if (file.size > MAX_MUSIC_XML_FILE_SIZE) {
    return 'Dosya boyutu 10 MB sınırını aşıyor.'
  }
  return null
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
  const baseName = fileName.replace(/\.(?:musicxml|xml|pdf)$/i, '')
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
