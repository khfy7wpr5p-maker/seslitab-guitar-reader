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

function sourceFile(name, bytes, options = {}) {
  return {
    name,
    size: bytes.byteLength,
    lastModified: options.lastModified,
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
  constructor(file, options = {}) {
    this.tagName = options.tagName ?? 'INPUT'
    this.type = options.type ?? 'file'
    this.accept = options.accept ?? '.xml,.musicxml,application/xml'
    this.files = file ? [file] : []
    this.events = []
    this.id = options.id ?? 'musicxml-input'
  }
  dispatchEvent(event) {
    this.events.push(event)
    return true
  }
  querySelectorAll() { return [] }
}

class FakeRoot {
  constructor(input, options = {}) {
    this.input = input
    this.listeners = new Map()
    this.documentElement = options.documentElement ?? null
  }
  addEventListener(name, listener, capture) {
    this.listeners.set(name, { listener, capture })
  }
  querySelectorAll(selector) {
    return selector === 'input[type="file"]' && this.input ? [this.input] : []
  }
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('condition not reached')
}

async function withGlobals(values, callback) {
  const previous = new Map()
  try {
    for (const [name, value] of Object.entries(values)) {
      previous.set(name, globalThis[name])
      if (value === undefined) delete globalThis[name]
      else globalThis[name] = value
    }
    return await callback()
  } finally {
    for (const [name, value] of previous.entries()) {
      if (value === undefined) delete globalThis[name]
      else globalThis[name] = value
    }
  }
}

function fakeEventClass() {
  return class {
    constructor(type, options = {}) {
      this.type = type
      this.bubbles = options.bubbles === true
    }
  }
}

function fakeCustomEventClass() {
  return class {
    constructor(type, options = {}) {
      this.type = type
      this.bubbles = options.bubbles === true
      this.detail = options.detail
    }
  }
}

test('GTAB-10A bridge exposes .mxl and normalizes it before existing change consumers', async () => {
  const xml = '<score-partwise version="4.0"><part-list/></score-partwise>'
  const bytes = await makeMxl(xml)
  const input = new FakeInput(sourceFile('lesson.mxl', bytes, { lastModified: 123 }))
  const root = new FakeRoot(input)

  await withGlobals({
    File: FakeFile,
    DataTransfer: FakeDataTransfer,
    Event: fakeEventClass(),
  }, async () => {
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
    assert.equal(input.files[0].lastModified, 123)
    assert.equal(input.events.at(-1)?.type, 'change')

    const acceptAfterFirstInstall = input.accept
    assert.equal(installMusicXmlMxlInputBridge(root), true)
    assert.equal(input.accept, acceptAfterFirstInstall, 'idempotent install must not duplicate .mxl accept tokens')

    let normalizedStopped = false
    binding.listener({
      target: input,
      stopImmediatePropagation() { normalizedStopped = true },
    })
    assert.equal(normalizedStopped, false, 'normalized MusicXML must continue through existing consumers')
  })
})

test('GTAB-10A bridge leaves plain MusicXML and empty selections on the existing change path', () => {
  const input = new FakeInput({ name: 'lesson.musicxml', size: 12 })
  const root = new FakeRoot(input)
  assert.equal(installMusicXmlMxlInputBridge(root), true)
  const binding = root.listeners.get('change')

  let stopped = false
  binding.listener({ target: input, stopImmediatePropagation() { stopped = true } })
  assert.equal(stopped, false)

  input.files = []
  binding.listener({ target: input, stopImmediatePropagation() { stopped = true } })
  assert.equal(stopped, false)
})

test('GTAB-10A bridge ignores non-MusicXML inputs and invalid roots', () => {
  assert.equal(installMusicXmlMxlInputBridge(null), false)
  assert.equal(installMusicXmlMxlInputBridge({}), false)

  const input = new FakeInput(null, { accept: 'image/png' })
  const root = new FakeRoot(input)
  assert.equal(installMusicXmlMxlInputBridge(root), true)
  assert.equal(input.accept, 'image/png')

  let stopped = false
  root.listeners.get('change').listener({
    target: input,
    stopImmediatePropagation() { stopped = true },
  })
  assert.equal(stopped, false)
})

test('GTAB-10A bridge publishes a controlled error when the browser File API is unavailable', async () => {
  const bytes = await makeMxl('<score-partwise version="4.0"/>')
  const input = new FakeInput(sourceFile('lesson.mxl', bytes), { id: 'teacher-source' })
  const root = new FakeRoot(input)

  await withGlobals({
    File: undefined,
    DataTransfer: FakeDataTransfer,
    CustomEvent: fakeCustomEventClass(),
  }, async () => {
    installMusicXmlMxlInputBridge(root)
    root.listeners.get('change').listener({
      target: input,
      preventDefault() {},
      stopImmediatePropagation() {},
    })

    await waitFor(() => input.events.some((event) => event.type === 'seslitab:mxl-intake-error'))
    const errorEvent = input.events.find((event) => event.type === 'seslitab:mxl-intake-error')
    assert.equal(errorEvent.detail.inputId, 'teacher-source')
    assert.match(errorEvent.detail.message, /File API/i)
  })
})

test('GTAB-10A bridge publishes a controlled error when DataTransfer is unavailable', async () => {
  const bytes = await makeMxl('<score-partwise version="4.0"/>')
  const input = new FakeInput(sourceFile('lesson.mxl', bytes))
  const root = new FakeRoot(input)

  await withGlobals({
    File: FakeFile,
    DataTransfer: undefined,
    CustomEvent: fakeCustomEventClass(),
  }, async () => {
    installMusicXmlMxlInputBridge(root)
    root.listeners.get('change').listener({
      target: input,
      preventDefault() {},
      stopImmediatePropagation() {},
    })

    await waitFor(() => input.events.some((event) => event.type === 'seslitab:mxl-intake-error'))
    const errorEvent = input.events.find((event) => event.type === 'seslitab:mxl-intake-error')
    assert.match(errorEvent.detail.message, /aktaramıyor/i)
  })
})

test('GTAB-10A bridge enhances MusicXML inputs added later through MutationObserver', async () => {
  const existing = new FakeInput(null)
  const documentElement = {}
  const root = new FakeRoot(existing, { documentElement })
  let observerCallback = null
  let observedTarget = null
  let observedOptions = null

  class FakeMutationObserver {
    constructor(callback) { observerCallback = callback }
    observe(target, options) {
      observedTarget = target
      observedOptions = options
    }
  }

  await withGlobals({ MutationObserver: FakeMutationObserver }, async () => {
    assert.equal(installMusicXmlMxlInputBridge(root), true)
    assert.equal(observedTarget, documentElement)
    assert.deepEqual(observedOptions, { childList: true, subtree: true })

    const direct = new FakeInput(null)
    const nested = new FakeInput(null)
    const wrapper = {
      tagName: 'DIV',
      querySelectorAll(selector) {
        return selector === 'input[type="file"]' ? [nested] : []
      },
    }

    observerCallback([{ addedNodes: [direct, wrapper] }])
    assert.match(direct.accept, /\.mxl/)
    assert.match(nested.accept, /\.mxl/)
  })
})
