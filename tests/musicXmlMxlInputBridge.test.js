import { test } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'

import { installMusicXmlMxlInputBridge } from '../src/musicXmlMxlInputBridge.js'

async function makeMxl(xml) {
  const zip = new JSZip()
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>')
  zip.file('score.musicxml', xml)
  return zip.generateAsync({ type: 'uint8array' })
}

function sourceFile(name, bytes) {
  return {
    name,
    size: bytes.byteLength,
    lastModified: 123,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    },
  }
}

class FakeFile {
  constructor(chunks, name, options = {}) {
    this.name = name
    this.type = options.type ?? ''
    this.lastModified = options.lastModified ?? 0
    this._text = chunks.join('')
    this.size = Buffer.byteLength(this._text)
  }
  async text() { return this._text }
}

class FakeDataTransfer {
  constructor() {
    this._files = []
    this.items = { add: (file) => this._files.push(file) }
  }
  get files() { return this._files }
}

class FakeInput {
  constructor(file) {
    this.tagName = 'INPUT'
    this.type = 'file'
    this.accept = '.xml,.musicxml,application/xml'
    this.files = [file]
    this.events = []
  }
  dispatchEvent(event) {
    this.events.push(event)
    return true
  }
}

class FakeRoot {
  constructor(input) {
    this.input = input
    this.listeners = new Map()
    this.documentElement = null
  }
  addEventListener(name, listener, capture) {
    this.listeners.set(name, { listener, capture })
  }
  querySelectorAll(selector) {
    return selector === 'input[type="file"]' ? [this.input] : []
  }
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('condition not reached')
}

test('GTAB-10A bridge exposes .mxl and normalizes it before existing change consumers', async () => {
  const xml = '<score-partwise version="4.0"><part-list/></score-partwise>'
  const bytes = await makeMxl(xml)
  const input = new FakeInput(sourceFile('lesson.mxl', bytes))
  const root = new FakeRoot(input)
  const oldFile = globalThis.File
  const oldDataTransfer = globalThis.DataTransfer
  const oldEvent = globalThis.Event
  try {
    globalThis.File = FakeFile
    globalThis.DataTransfer = FakeDataTransfer
    globalThis.Event = class { constructor(type, options = {}) { this.type = type; this.bubbles = options.bubbles === true } }

    assert.equal(installMusicXmlMxlInputBridge(root), true)
    assert.match(input.accept, /\.mxl/)
    const binding = root.listeners.get('change')
    assert.equal(binding.capture, true)

    let stopped = false
    binding.listener({
      target: input,
      preventDefault() {},
      stopImmediatePropagation() { stopped = true },
    })

    await waitFor(() => input.files?.[0]?.name === 'lesson.musicxml')
    assert.equal(stopped, true)
    assert.equal(await input.files[0].text(), xml)
    assert.equal(input.events.at(-1)?.type, 'change')
  } finally {
    globalThis.File = oldFile
    globalThis.DataTransfer = oldDataTransfer
    globalThis.Event = oldEvent
  }
})
