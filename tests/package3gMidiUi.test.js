import test from 'node:test'
import assert from 'node:assert/strict'

import {
  clearPackage3Notes,
  publishPackage3Notes,
} from '../package3MeasureBridge.js'
import {
  downloadMidiArtifact,
  initMeasureControls,
  runMidiExport,
} from '../src/package3Ui.js'

function note(overrides = {}) {
  return {
    measureKey: '0:0',
    measureNumber: 1,
    measureIndex: 0,
    partIndex: 0,
    partId: 'P1',
    startBeat: 0,
    beats: 4,
    duration: 'whole',
    midi: 60,
    frequency: 261.63,
    noteName: 'Do',
    ...overrides,
  }
}

class FakeElement {
  constructor(root, tagName) {
    this.root = root
    this.tagName = tagName
    this.children = []
    this.attributes = new Map()
    this.listeners = new Map()
    this.hidden = false
    this.disabled = false
    this.className = ''
    this.textContent = ''
    this.type = ''
    this.value = ''
    this.href = ''
    this.download = ''
    this._id = ''
    this.clickCount = 0
  }
  set id(value) { this._id = value; if (value) this.root.nodes.set(value, this) }
  get id() { return this._id }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  appendChild(child) { this.children.push(child); return child }
  replaceChildren(...children) { this.children = [...children] }
  insertBefore(child, before) {
    const index = this.children.indexOf(before)
    if (index < 0) this.children.push(child)
    else this.children.splice(index, 0, child)
    return child
  }
  addEventListener(name, listener, options = false) {
    const list = this.listeners.get(name) ?? []
    list.push({ listener, options })
    this.listeners.set(name, list)
  }
  click() {
    this.clickCount += 1
    for (const { listener } of this.listeners.get('click') ?? []) listener({ type: 'click' })
  }
}

function fakeDocument() {
  const root = {
    nodes: new Map(),
    createdAnchors: [],
    createElement(tagName) {
      const element = new FakeElement(root, tagName)
      if (tagName === 'a') root.createdAnchors.push(element)
      return element
    },
    getElementById(id) { return root.nodes.get(id) ?? null },
  }
  const tab = root.createElement('div'); tab.id = 'tab-html'
  const output = root.createElement('div'); output.id = 'rhythmic-html-output'; tab.appendChild(output)
  const live = root.createElement('div'); live.id = 'aria-live-region'
  const reset = root.createElement('button'); reset.id = 'reset-btn'
  const voice = root.createElement('button'); voice.id = 'voice-btn'
  const rhythm = root.createElement('button'); rhythm.id = 'rhythm-btn'
  const speed = root.createElement('input'); speed.id = 'speed-slider'; speed.value = '1'
  const tempo = root.createElement('input'); tempo.id = 'tempo-slider'; tempo.value = '96'
  return { root, live }
}

test('Package 3G exposes an accessible full-score MIDI export button only when canonical measures exist', () => {
  clearPackage3Notes()
  const { root } = fakeDocument()
  assert.equal(initMeasureControls(root), true)

  const midi = root.getElementById('midi-export')
  assert.ok(midi)
  assert.equal(midi.type, 'button')
  assert.equal(midi.textContent, '⬇ MIDI indir')
  assert.equal(midi.getAttribute('aria-label'), 'Doğrulanmış müziği MIDI dosyası olarak indir')
  assert.equal(midi.disabled, true)

  publishPackage3Notes([note()])
  assert.equal(midi.disabled, false)

  clearPackage3Notes()
  assert.equal(midi.disabled, true)
})

test('Package 3G UI passes the exact published full array and current tempo to the gated artifact adapter', () => {
  clearPackage3Notes()
  const { root, live } = fakeDocument()
  initMeasureControls(root)
  const notes = [note()]
  publishPackage3Notes(notes)

  let receivedNotes = null
  let receivedOptions = null
  let downloadedArtifact = null
  const artifact = Object.freeze({
    bytes: new Uint8Array([1, 2, 3]),
    fileName: 'seslitab.mid',
    mimeType: 'audio/midi',
  })

  const ok = runMidiExport(root, {
    createGatedMidiArtifact(value, options) {
      receivedNotes = value
      receivedOptions = options
      return { ok: true, artifact }
    },
    downloadMidiArtifact(value) {
      downloadedArtifact = value
      return true
    },
  })

  assert.equal(ok, true)
  assert.equal(receivedNotes, notes)
  assert.equal(receivedOptions.tempo, 96)
  assert.equal(receivedOptions.sourceName, 'seslitab')
  assert.equal(downloadedArtifact, artifact)
  assert.equal(live.textContent, 'MIDI dosyası hazırlandı.')
})

test('Package 3G UI never downloads when the quality gate refuses export', () => {
  clearPackage3Notes()
  const { root, live } = fakeDocument()
  initMeasureControls(root)
  publishPackage3Notes([note()])

  let downloadCalls = 0
  const ok = runMidiExport(root, {
    createGatedMidiArtifact: () => ({
      ok: false,
      artifact: null,
      message: 'MIDI dosyası oluşturulamadı: nota verisi henüz doğrulanmadı.',
    }),
    downloadMidiArtifact() {
      downloadCalls += 1
      return true
    },
  })

  assert.equal(ok, false)
  assert.equal(downloadCalls, 0)
  assert.match(live.textContent, /henüz doğrulanmadı/)
})

test('Package 3G browser download uses one object URL and always revokes it', () => {
  const { root } = fakeDocument()
  const created = []
  const revoked = []
  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts
      this.type = options.type
    }
  }
  const URLApi = {
    createObjectURL(blob) {
      created.push(blob)
      return 'blob:seslitab-midi'
    },
    revokeObjectURL(url) { revoked.push(url) },
  }

  const artifact = {
    bytes: new Uint8Array([0x4d, 0x54, 0x68, 0x64]),
    fileName: 'ders.mid',
    mimeType: 'audio/midi',
  }
  assert.equal(downloadMidiArtifact(artifact, { Blob: FakeBlob, URL: URLApi, document: root }), true)
  assert.equal(created.length, 1)
  assert.deepEqual(revoked, ['blob:seslitab-midi'])
  assert.equal(root.createdAnchors.length, 1)
  assert.equal(root.createdAnchors[0].href, 'blob:seslitab-midi')
  assert.equal(root.createdAnchors[0].download, 'ders.mid')
  assert.equal(root.createdAnchors[0].clickCount, 1)
})

test('Package 3G browser download fails closed without required browser APIs', () => {
  const artifact = {
    bytes: new Uint8Array([1]),
    fileName: 'ders.mid',
    mimeType: 'audio/midi',
  }
  assert.equal(downloadMidiArtifact(artifact, { Blob: null, URL: {}, document: null }), false)
  assert.equal(downloadMidiArtifact({ ...artifact, bytes: [] }, {}), false)
})
