// Shared MusicXML security policy.
//
// This module is intentionally environment-independent:
// - no filesystem access
// - no network access
// - no DOM or browser globals
// - no external DTD resolution
//
// It performs lexical and structural XML validation before MusicXML reaches
// DOMParser or a backend provider completion boundary.

export const MAX_MUSIC_XML_SIZE_BYTES = 10 * 1024 * 1024

const MUSIC_XML_ROOTS = new Set([
  'score-partwise',
  'score-timewise',
])

const PREDEFINED_ENTITIES = new Set([
  'amp',
  'lt',
  'gt',
  'quot',
  'apos',
])

const XINCLUDE_NAMESPACE = 'http://www.w3.org/2001/XInclude'

function failure(code, message) {
  return {
    ok: false,
    code,
    message,
  }
}

function isXmlWhitespace(character) {
  return (
    character === ' ' ||
    character === '\t' ||
    character === '\n' ||
    character === '\r'
  )
}

function skipWhitespace(value, start) {
  let index = start

  while (index < value.length && isXmlWhitespace(value[index])) {
    index += 1
  }

  return index
}

function isNameStart(character) {
  return typeof character === 'string' && /[A-Za-z_:]/.test(character)
}

function isNameCharacter(character) {
  return typeof character === 'string' && /[A-Za-z0-9_.:-]/.test(character)
}

function readName(value, start) {
  if (!isNameStart(value[start])) return null

  let index = start + 1

  while (index < value.length && isNameCharacter(value[index])) {
    index += 1
  }

  return {
    name: value.slice(start, index),
    end: index,
  }
}

function isAllowedXmlCodePoint(codePoint) {
  return (
    codePoint === 0x09 ||
    codePoint === 0x0a ||
    codePoint === 0x0d ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  )
}

function validateXmlCharacters(value) {
  for (const character of value) {
    if (!isAllowedXmlCodePoint(character.codePointAt(0))) {
      return failure(
        'INVALID_XML_CHARACTER',
        'MusicXML geçersiz bir kontrol karakteri içeriyor.'
      )
    }
  }

  return { ok: true }
}

function utf8ByteLength(value) {
  let bytes = 0

  for (const character of value) {
    const codePoint = character.codePointAt(0)

    if (codePoint <= 0x7f) bytes += 1
    else if (codePoint <= 0x7ff) bytes += 2
    else if (codePoint <= 0xffff) bytes += 3
    else bytes += 4
  }

  return bytes
}

function validateNumericReference(token) {
  let codePoint

  if (/^#x[0-9A-Fa-f]+$/.test(token)) {
    codePoint = Number.parseInt(token.slice(2), 16)
  } else if (/^#[0-9]+$/.test(token)) {
    codePoint = Number.parseInt(token.slice(1), 10)
  } else {
    return false
  }

  return (
    Number.isFinite(codePoint) &&
    isAllowedXmlCodePoint(codePoint)
  )
}

function validateEntityReferences(value) {
  let index = 0

  while (index < value.length) {
    const ampersand = value.indexOf('&', index)

    if (ampersand === -1) return { ok: true }

    const semicolon = value.indexOf(';', ampersand + 1)

    if (semicolon === -1) {
      return failure(
        'INVALID_XML',
        'MusicXML içinde tamamlanmamış bir karakter başvurusu bulunuyor.'
      )
    }

    const token = value.slice(ampersand + 1, semicolon)

    if (
      !PREDEFINED_ENTITIES.has(token) &&
      !validateNumericReference(token)
    ) {
      return failure(
        'UNSAFE_XML_ENTITY',
        'MusicXML içinde özel veya güvenli olmayan bir entity başvurusu bulunuyor.'
      )
    }

    index = semicolon + 1
  }

  return { ok: true }
}

function findMarkupEnd(value, start, trackInternalSubset = false) {
  let quote = null
  let subsetDepth = 0

  for (let index = start; index < value.length; index += 1) {
    const character = value[index]

    if (quote !== null) {
      if (character === quote) quote = null
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      continue
    }

    if (trackInternalSubset) {
      if (character === '[') {
        subsetDepth += 1
        continue
      }

      if (character === ']') {
        subsetDepth -= 1

        if (subsetDepth < 0) return -1

        continue
      }
    }

    if (character === '>' && subsetDepth === 0) {
      return index
    }
  }

  return -1
}

function parseStartTag(content) {
  let index = skipWhitespace(content, 0)
  const nameResult = readName(content, index)

  if (!nameResult) {
    return failure(
      'INVALID_XML',
      'MusicXML başlangıç etiketi geçersiz.'
    )
  }

  const name = nameResult.name
  const attributes = new Map()
  let selfClosing = false
  index = nameResult.end

  while (index < content.length) {
    index = skipWhitespace(content, index)

    if (index >= content.length) break

    if (content[index] === '/') {
      index = skipWhitespace(content, index + 1)

      if (index !== content.length) {
        return failure(
          'INVALID_XML',
          'MusicXML kendiliğinden kapanan etiketi geçersiz.'
        )
      }

      selfClosing = true
      break
    }

    const attributeResult = readName(content, index)

    if (!attributeResult) {
      return failure(
        'INVALID_XML',
        'MusicXML etiketindeki öznitelik yapısı geçersiz.'
      )
    }

    const attributeName = attributeResult.name

    if (attributes.has(attributeName)) {
      return failure(
        'INVALID_XML',
        'MusicXML etiketinde yinelenen bir öznitelik bulunuyor.'
      )
    }

    index = skipWhitespace(content, attributeResult.end)

    if (content[index] !== '=') {
      return failure(
        'INVALID_XML',
        'MusicXML özniteliğinde eşittir işareti eksik.'
      )
    }

    index = skipWhitespace(content, index + 1)

    const quote = content[index]

    if (quote !== '"' && quote !== "'") {
      return failure(
        'INVALID_XML',
        'MusicXML öznitelik değeri tırnak içinde değil.'
      )
    }

    const valueStart = index + 1
    const valueEnd = content.indexOf(quote, valueStart)

    if (valueEnd === -1) {
      return failure(
        'INVALID_XML',
        'MusicXML öznitelik değeri tamamlanmamış.'
      )
    }

    const attributeValue = content.slice(valueStart, valueEnd)

    if (attributeValue.includes('<')) {
      return failure(
        'INVALID_XML',
        'MusicXML öznitelik değeri geçersiz.'
      )
    }

    const entityResult = validateEntityReferences(attributeValue)

    if (!entityResult.ok) return entityResult

    attributes.set(attributeName, attributeValue)
    index = valueEnd + 1
  }

  return {
    ok: true,
    name,
    attributes,
    selfClosing,
  }
}

function parseEndTag(content) {
  let index = skipWhitespace(content, 0)
  const nameResult = readName(content, index)

  if (!nameResult) {
    return failure(
      'INVALID_XML',
      'MusicXML kapanış etiketi geçersiz.'
    )
  }

  index = skipWhitespace(content, nameResult.end)

  if (index !== content.length) {
    return failure(
      'INVALID_XML',
      'MusicXML kapanış etiketi geçersiz içerik taşıyor.'
    )
  }

  return {
    ok: true,
    name: nameResult.name,
  }
}

function parseStandardMusicXmlDoctype(value) {
  if (value.includes('[') || value.includes(']')) {
    return failure(
      'UNSAFE_XML_DOCTYPE',
      'MusicXML iç DTD alt kümesi içeremez.'
    )
  }

  const match = value.match(
    /^<!DOCTYPE\s+([A-Za-z_:][A-Za-z0-9_.:-]*)\s+PUBLIC\s+(?:"([^"]*)"|'([^']*)')\s+(?:"([^"]*)"|'([^']*)')\s*>$/s
  )

  if (!match) {
    return failure(
      'UNSAFE_XML_DOCTYPE',
      'MusicXML yalnızca standart Recordare PUBLIC doctype kullanabilir.'
    )
  }

  const rootName = match[1]
  const publicId = match[2] ?? match[3]
  const systemId = match[4] ?? match[5]

  if (!MUSIC_XML_ROOTS.has(rootName)) {
    return failure(
      'UNSAFE_XML_DOCTYPE',
      'MusicXML doctype kökü desteklenmiyor.'
    )
  }

  const documentKind =
    rootName === 'score-partwise'
      ? 'Partwise'
      : 'Timewise'

  const dtdFile =
    rootName === 'score-partwise'
      ? 'partwise.dtd'
      : 'timewise.dtd'

  const publicIdPattern = new RegExp(
    `^-//Recordare//DTD MusicXML (?:1\\.0|1\\.1|2\\.0|3\\.0|3\\.1|4\\.0\\.3|4\\.0) ${documentKind}//EN$`
  )

  const systemIdPattern = new RegExp(
    `^https?://www\\.musicxml\\.org/dtds/${dtdFile.replace('.', '\\.')}$`
  )

  if (
    !publicIdPattern.test(publicId) ||
    !systemIdPattern.test(systemId)
  ) {
    return failure(
      'UNSAFE_XML_DOCTYPE',
      'MusicXML doctype tanımlayıcıları standart Recordare değerleriyle eşleşmiyor.'
    )
  }

  return {
    ok: true,
    rootName,
  }
}

function validateExternalInclusion(name, attributes) {
  const lowerName = name.toLowerCase()
  const localName = lowerName.includes(':')
    ? lowerName.slice(lowerName.lastIndexOf(':') + 1)
    : lowerName

  for (const [attributeName, attributeValue] of attributes) {
    const lowerAttributeName = attributeName.toLowerCase()

    if (
      lowerAttributeName === 'xmlns' ||
      lowerAttributeName.startsWith('xmlns:')
    ) {
      if (attributeValue.trim() === XINCLUDE_NAMESPACE) {
        return failure(
          'UNSAFE_XML_INCLUDE',
          'MusicXML XInclude yapısı içeremez.'
        )
      }
    }
  }

  if (
    localName === 'include' &&
    (
      lowerName.includes(':') ||
      attributes.has('href')
    )
  ) {
    return failure(
      'UNSAFE_XML_INCLUDE',
      'MusicXML dış içerik ekleme yapısı içeremez.'
    )
  }

  return { ok: true }
}

function scanXmlDocument(source) {
  const stack = []
  let index = 0
  let rootName = null
  let rootClosed = false
  let xmlDeclarationSeen = false
  let doctype = null

  if (source.charCodeAt(0) === 0xfeff) {
    index = 1
  }

  while (index < source.length) {
    const nextMarkup = source.indexOf('<', index)

    if (nextMarkup === -1) {
      const text = source.slice(index)
      const entityResult = validateEntityReferences(text)

      if (!entityResult.ok) return entityResult

      if (stack.length === 0 && text.trim() !== '') {
        return failure(
          'INVALID_XML',
          'MusicXML kök elementi dışında geçersiz metin içeriyor.'
        )
      }

      index = source.length
      break
    }

    if (nextMarkup > index) {
      const text = source.slice(index, nextMarkup)
      const entityResult = validateEntityReferences(text)

      if (!entityResult.ok) return entityResult

      if (stack.length === 0 && text.trim() !== '') {
        return failure(
          'INVALID_XML',
          'MusicXML kök elementi dışında geçersiz metin içeriyor.'
        )
      }
    }

    index = nextMarkup

    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4)

      if (end === -1) {
        return failure(
          'INVALID_XML',
          'MusicXML açıklama bölümü tamamlanmamış.'
        )
      }

      const comment = source.slice(index + 4, end)

      if (comment.includes('--')) {
        return failure(
          'INVALID_XML',
          'MusicXML açıklama bölümü geçersiz.'
        )
      }

      index = end + 3
      continue
    }

    if (source.startsWith('<![CDATA[', index)) {
      if (stack.length === 0) {
        return failure(
          'INVALID_XML',
          'CDATA bölümü MusicXML kök elementi dışında kullanılamaz.'
        )
      }

      const end = source.indexOf(']]>', index + 9)

      if (end === -1) {
        return failure(
          'INVALID_XML',
          'MusicXML CDATA bölümü tamamlanmamış.'
        )
      }

      index = end + 3
      continue
    }

    if (source.startsWith('<?', index)) {
      const end = source.indexOf('?>', index + 2)

      if (end === -1) {
        return failure(
          'INVALID_XML',
          'MusicXML işlem talimatı tamamlanmamış.'
        )
      }

      const body = source.slice(index + 2, end).trim()
      const target = readName(body, 0)

      if (
        !target ||
        target.name !== 'xml' ||
        xmlDeclarationSeen ||
        rootName !== null ||
        doctype !== null
      ) {
        return failure(
          'UNSAFE_XML_PROCESSING_INSTRUCTION',
          'MusicXML güvenli olmayan bir işlem talimatı içeriyor.'
        )
      }

      xmlDeclarationSeen = true
      index = end + 2
      continue
    }

    if (source.startsWith('<!DOCTYPE', index)) {
      if (rootName !== null || doctype !== null) {
        return failure(
          'UNSAFE_XML_DOCTYPE',
          'MusicXML doctype bildirimi geçersiz konumda.'
        )
      }

      const end = findMarkupEnd(source, index + 9, true)

      if (end === -1) {
        return failure(
          'INVALID_XML',
          'MusicXML doctype bildirimi tamamlanmamış.'
        )
      }

      const doctypeText = source.slice(index, end + 1)
      const parsedDoctype =
        parseStandardMusicXmlDoctype(doctypeText)

      if (!parsedDoctype.ok) return parsedDoctype

      doctype = {
        rootName: parsedDoctype.rootName,
        start: index,
        end: end + 1,
      }

      index = end + 1
      continue
    }

    if (source.startsWith('</', index)) {
      const end = findMarkupEnd(source, index + 2)

      if (end === -1) {
        return failure(
          'INVALID_XML',
          'MusicXML kapanış etiketi tamamlanmamış.'
        )
      }

      const parsedEndTag = parseEndTag(
        source.slice(index + 2, end)
      )

      if (!parsedEndTag.ok) return parsedEndTag

      if (stack.length === 0) {
        return failure(
          'INVALID_XML',
          'MusicXML beklenmeyen bir kapanış etiketi içeriyor.'
        )
      }

      const expectedName = stack.pop()

      if (parsedEndTag.name !== expectedName) {
        return failure(
          'INVALID_XML',
          'MusicXML etiketleri doğru sırada kapanmıyor.'
        )
      }

      if (stack.length === 0) {
        rootClosed = true
      }

      index = end + 1
      continue
    }

    if (source.startsWith('<!', index)) {
      return failure(
        'UNSAFE_XML_DECLARATION',
        'MusicXML güvenli olmayan bir bildirim içeriyor.'
      )
    }

    const end = findMarkupEnd(source, index + 1)

    if (end === -1) {
      return failure(
        'INVALID_XML',
        'MusicXML başlangıç etiketi tamamlanmamış.'
      )
    }

    const parsedStartTag = parseStartTag(
      source.slice(index + 1, end)
    )

    if (!parsedStartTag.ok) return parsedStartTag

    const inclusionResult = validateExternalInclusion(
      parsedStartTag.name,
      parsedStartTag.attributes
    )

    if (!inclusionResult.ok) return inclusionResult

    if (stack.length === 0) {
      if (rootName !== null && rootClosed) {
        return failure(
          'INVALID_XML',
          'MusicXML birden fazla kök elementi içeriyor.'
        )
      }

      rootName = parsedStartTag.name

      if (!MUSIC_XML_ROOTS.has(rootName)) {
        return failure(
          'NON_MUSICXML',
          'Belgenin gerçek kök elementi MusicXML değil.'
        )
      }

      if (
        doctype !== null &&
        doctype.rootName !== rootName
      ) {
        return failure(
          'UNSAFE_XML_DOCTYPE',
          'MusicXML doctype ile gerçek kök elementi eşleşmiyor.'
        )
      }
    }

    if (parsedStartTag.selfClosing) {
      if (stack.length === 0) rootClosed = true
    } else {
      stack.push(parsedStartTag.name)
    }

    index = end + 1
  }

  if (stack.length !== 0 || !rootClosed) {
    return failure(
      'INVALID_XML',
      'MusicXML etiket yapısı tamamlanmamış.'
    )
  }

  if (rootName === null) {
    return failure(
      'NON_MUSICXML',
      'MusicXML kök elementi bulunamadı.'
    )
  }

  return {
    ok: true,
    rootName,
    doctype,
  }
}

export function inspectMusicXml(
  input,
  options = {}
) {
  const maxBytes =
    Number.isFinite(options.maxBytes) &&
    options.maxBytes > 0
      ? options.maxBytes
      : MAX_MUSIC_XML_SIZE_BYTES

  if (typeof input !== 'string') {
    return failure(
      'INVALID_XML',
      'MusicXML içeriği metin biçiminde değil.'
    )
  }

  if (input.trim() === '') {
    return failure(
      'EMPTY_RESPONSE',
      'MusicXML içeriği boş.'
    )
  }

  if (utf8ByteLength(input) > maxBytes) {
    return failure(
      'MUSICXML_TOO_LARGE',
      'MusicXML içeriği 10 MB sınırını aşıyor.'
    )
  }

  const characterResult = validateXmlCharacters(input)

  if (!characterResult.ok) return characterResult

  const leading = input.trimStart()

  if (
    /^(?:<\?xml[\s\S]*?\?>\s*)?<html[\s>]/i.test(leading)
  ) {
    return failure(
      'HTML_RESPONSE',
      'MusicXML yerine HTML içeriği alındı.'
    )
  }

  if (
    leading.startsWith('{') ||
    leading.startsWith('[')
  ) {
    return failure(
      'JSON_RESPONSE',
      'MusicXML yerine JSON içeriği alındı.'
    )
  }

  if (!leading.startsWith('<')) {
    return failure(
      'INVALID_XML',
      'Geçersiz MusicXML formatı.'
    )
  }

  const scanResult = scanXmlDocument(input)

  if (!scanResult.ok) return scanResult

  const xmlForParsing =
    scanResult.doctype === null
      ? input
      : (
          input.slice(0, scanResult.doctype.start) +
          input.slice(scanResult.doctype.end)
        )

  return {
    ok: true,
    rootName: scanResult.rootName,
    xmlForParsing,
  }
}
