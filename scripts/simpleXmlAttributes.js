// Shared Node-only helper for the repository's tiny diagnostic MiniDOM shims.
// Production/browser MusicXML parsing is intentionally not routed through this code.

function isAttributeNameChar(char) {
  if (char === '-') return true
  if (typeof char !== 'string' || char.length !== 1) return false
  const code = char.charCodeAt(0)
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
}

function isWhitespaceChar(char) {
  return typeof char === 'string' && char.length > 0 && char.trim() === ''
}

export function parseDoubleQuotedXmlAttributes(value) {
  const source = String(value ?? '')
  const attrs = {}
  let cursor = 0

  while (cursor < source.length) {
    while (cursor < source.length && !isAttributeNameChar(source[cursor])) cursor += 1
    if (cursor >= source.length) break

    const nameStart = cursor
    while (cursor < source.length && isAttributeNameChar(source[cursor])) cursor += 1
    const name = source.slice(nameStart, cursor)

    while (cursor < source.length && isWhitespaceChar(source[cursor])) cursor += 1
    if (source[cursor] !== '=') continue
    cursor += 1

    while (cursor < source.length && isWhitespaceChar(source[cursor])) cursor += 1
    if (source[cursor] !== '"') continue
    cursor += 1

    const valueStart = cursor
    while (cursor < source.length && source[cursor] !== '"') cursor += 1
    if (cursor >= source.length) break

    attrs[name] = source.slice(valueStart, cursor)
    cursor += 1
  }

  return attrs
}
