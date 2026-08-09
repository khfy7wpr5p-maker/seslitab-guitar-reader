import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { parseMusicXml } from '../musicXmlParser.js'
import { createNote } from '../noteTheory.js'
import { generateTurkishRhythmicSpokenText } from '../rhythmicTextGenerator.js'

class MiniElement {
  constructor(tag, attrs, parent) {
    this.tag = tag
    this.attrs = attrs || {}
    this.children = []
    this.parent = parent
    this._text = ''
  }

  getAttribute(name) {
    return this.attrs[name] || null
  }

  get textContent() {
    if (this.children.length === 0) return this._text
    return this.children.map((child) => child.textContent).join('')
  }

  querySelector(selector) {
    return this._findAll(selector)[0] || null
  }

  querySelectorAll(selector) {
    return this._findAll(selector)
  }

  _findAll(selector, acc = []) {
    const target = selector.trim().split(/\s+|>/).filter(Boolean).at(-1)

    for (const child of this.children) {
      if (child.tag === target) acc.push(child)
      child._findAll(selector, acc)
    }

    return acc
  }
}

class MiniDocument extends MiniElement {
  constructor() {
    super('#document', {}, null)
  }
}

class MiniDOMParser {
  parseFromString(xml) {
    const doc = new MiniDocument()
    const stack = [doc]
    const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[a-zA-Z-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g
    let match

    while ((match = tagRe.exec(xml)) !== null) {
      if (match[4] !== undefined) {
        if (match[4].trim()) stack[stack.length - 1]._text += match[4]
        continue
      }

      const isClose = match[0][1] === '/'
      const tag = match[1]
      const attrStr = match[2] || ''
      const selfClose = match[3] === '/'

      if (isClose) {
        if (stack.length > 1) stack.pop()
        continue
      }

      const attrs = {}
      const attrRe = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g
      let attrMatch

      while ((attrMatch = attrRe.exec(attrStr)) !== null) {
        attrs[attrMatch[1]] = attrMatch[2]
      }

      const element = new MiniElement(tag, attrs, stack[stack.length - 1])
      stack[stack.length - 1].children.push(element)

      if (!selfClose) stack.push(element)
    }

    return doc
  }
}

globalThis.DOMParser = MiniDOMParser

const GOLDEN_DIR = new URL(
  './fixtures/golden-reference/plan0-safe-baseline-outputs/',
  import.meta.url
)
const SOURCE_MUSIC_XML = new URL(
  './fixtures/golden-reference/plan0-cc0-4measure/plan0-cc0-4measure-expected.musicxml',
  import.meta.url
)
const STRING_NUMBER = {
  e: 1,
  B: 2,
  G: 3,
  D: 4,
  A: 5,
  E: 6,
}

function readGolden(name) {
  return readFileSync(new URL(name, GOLDEN_DIR), 'utf8')
}

function parseApprovedSource() {
  const xml = readFileSync(SOURCE_MUSIC_XML, 'utf8')
  const parsed = parseMusicXml(xml)

  assert.equal(parsed.error, undefined)
  assert.equal(parsed.notes.length, 16)

  return parsed.notes
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

test('Plan 0 golden-output manifest protects the approved expected files', () => {
  const manifest = readGolden('sha256.txt')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))

  assert.equal(manifest.length, 2)

  for (const line of manifest) {
    const match = line.match(/^([0-9a-f]{64})\s{2}(.+)$/)
    assert.ok(match, `invalid manifest line: ${line}`)

    const [, expectedHash, fileName] = match
    const bytes = readFileSync(new URL(fileName, GOLDEN_DIR))

    assert.equal(sha256(bytes), expectedHash, `${fileName} SHA-256 mismatch`)
  }
})

test('Plan 0 approved Turkish TTS golden output is unchanged', () => {
  const notes = parseApprovedSource().map((note) =>
    createNote({
      stringLetter: note.string,
      fret: note.fret,
      noteName: note.noteName,
      midi: note.midi,
      frequency: note.frequency,
      duration: note.duration,
      beats: note.beats,
      measureNumber: note.measure,
    })
  )

  const actual = generateTurkishRhythmicSpokenText(notes)
  const expected = readGolden('expected-tts.txt').trimEnd()

  assert.equal(actual, expected)
})

test('Plan 0 approved Guitar TAB position golden output is unchanged', () => {
  const actual = parseApprovedSource().map((note) => ({
    measure: note.measure,
    pitch: `${note.step}${note.octave}`,
    string: STRING_NUMBER[note.string],
    fret: note.fret,
  }))
  const expected = JSON.parse(readGolden('expected-guitar-tab.json'))

  assert.deepEqual(actual, expected)
})
