// E2E MusicXML validation script.
// Reads a downloaded MusicXML file, runs it through the real SesliTab
// parser (musicXmlParser.js — same export used by the frontend), and
// asserts at least one measure and one parsed note.
//
// Usage: node scripts/validateE2eMusicXml.mjs /path/to/output.musicxml
//
// DOMParser is a browser API. The existing test suite polyfills it with
// a MiniDOMParser shim (tests/frontendGateway.test.js). We reuse the same
// approach here so we exercise the real parser without modifying it.

import { readFileSync } from 'node:fs'
import { parseMusicXml } from '../musicXmlParser.js'
import { parseDoubleQuotedXmlAttributes } from './simpleXmlAttributes.js'

// ── DOMParser polyfill (mirrors tests/frontendGateway.test.js) ──────

class MiniElement {
  constructor(tag, attrs, parent) {
    this.tag = tag
    this.attrs = attrs || {}
    this.children = []
    this.parent = parent
    this._text = ''
  }
  getAttribute(name) { return this.attrs[name] || null }
  get textContent() {
    if (this.children.length === 0) return this._text
    return this.children.map((c) => c.textContent).join('')
  }
  querySelector(sel) { return this._findAll(sel)[0] || null }
  querySelectorAll(sel) { return this._findAll(sel) }
  _findAll(sel, acc = []) {
    for (const c of this.children) {
      if (c.tag === sel) acc.push(c)
      c._findAll(sel, acc)
    }
    return acc
  }
}

class MiniDocument extends MiniElement {
  constructor() { super('#document', {}, null) }
}

class MiniDOMParser {
  parseFromString(xml) {
    const doc = new MiniDocument()
    const stack = [doc]
    const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[a-zA-Z-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g
    let m
    while ((m = tagRe.exec(xml)) !== null) {
      if (m[4] !== undefined) {
        if (m[4].trim()) stack[stack.length - 1]._text += m[4]
        continue
      }
      const isClose = m[0][1] === '/'
      const tag = m[1]
      const attrStr = m[2] || ''
      const selfClose = m[3] === '/'
      if (isClose) { stack.pop(); continue }
      const attrs = parseDoubleQuotedXmlAttributes(attrStr)
      const el = new MiniElement(tag, attrs, stack[stack.length - 1])
      stack[stack.length - 1].children.push(el)
      if (!selfClose) stack.push(el)
    }
    return doc
  }
}

globalThis.DOMParser = MiniDOMParser

// ── Main ──────────────────────────────────────────────────────────

const filePath = process.argv[2]
if (!filePath) {
  console.error('Kullanım: node scripts/validateE2eMusicXml.mjs <file-path>')
  process.exit(2)
}

let xml
try {
  xml = readFileSync(filePath, 'utf8')
} catch (err) {
  console.error(`Dosya okunamadı: ${filePath}: ${err.message}`)
  process.exit(2)
}

if (!xml || !xml.trim()) {
  console.error('MusicXML dosyası boş.')
  process.exit(1)
}

// Basic structural checks (do not replace the real parser).
const measureCount = (xml.match(/<measure /g) || []).length
const noteCount = (xml.match(/<note /g) || []).length
const hasRoot = xml.includes('<score-partwise') || xml.includes('<score-timewise')

console.log(`Yapısal kontrol: root=${hasRoot ? 'evet' : 'hayır'}, measure=${measureCount}, note=${noteCount}`)

if (!hasRoot) {
  console.error('HATA: score-partwise veya score-timewise kök elementi bulunamadı.')
  process.exit(1)
}
if (measureCount < 1) {
  console.error('HATA: En az bir measure gerekli.')
  process.exit(1)
}
if (noteCount < 1) {
  console.error('HATA: En az bir note gerekli.')
  process.exit(1)
}

// Run the real parser.
let result
try {
  result = parseMusicXml(xml)
} catch (err) {
  console.error(`Parser istisnası: ${err.message}`)
  process.exit(1)
}

if (result.error) {
  console.error(`Parser hatası: ${result.error}`)
  process.exit(1)
}

const parsedNotes = result.notes || []
const parsedRestCount = parsedNotes.filter((note) => note.isRest).length
const parsedPitchedNoteCount = parsedNotes.length - parsedRestCount
console.log(`Parser sonucu: ${parsedNotes.length} nota ayrıştırıldı.`)
console.log(`Parser ayrıntısı: ${parsedPitchedNoteCount} perdeli nota, ${parsedRestCount} sus.`)

if (parsedNotes.length < 1) {
  console.error('HATA: Parser en az bir nota döndürmedi.')
  process.exit(1)
}

console.log('Doğrulama başarılı.')
