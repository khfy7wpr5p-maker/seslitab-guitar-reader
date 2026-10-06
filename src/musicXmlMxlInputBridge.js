import { readMusicXmlSourceFile } from './services/musicXmlFile.js'

const boundRoots = new WeakSet()
const normalizedFiles = new WeakSet()
const MXL_EXTENSION = /\.mxl$/i
const MUSIC_XML_ACCEPT_TOKENS = ['.xml', '.musicxml', 'musicxml', 'application/xml', 'text/xml']
const MXL_ACCEPT = '.mxl,application/vnd.recordare.musicxml'

function isMusicXmlFileInput(element) {
  if (!element || String(element.tagName || '').toLowerCase() !== 'input') return false
  if (String(element.type || '').toLowerCase() !== 'file') return false
  const accept = String(element.accept || '').toLowerCase()
  return MUSIC_XML_ACCEPT_TOKENS.some((token) => accept.includes(token))
}

function ensureMxlAccept(input) {
  if (!isMusicXmlFileInput(input)) return false
  const accept = String(input.accept || '')
  if (!accept.toLowerCase().includes('.mxl')) {
    input.accept = accept ? `${accept},${MXL_ACCEPT}` : MXL_ACCEPT
  }
  return true
}

function normalizeMxlFilename(name) {
  const value = typeof name === 'string' && name.trim() ? name.trim() : 'score.mxl'
  return value.replace(MXL_EXTENSION, '.musicxml')
}

function createNormalizedFile(sourceFile, xmlText) {
  if (typeof File !== 'function') throw new Error('Tarayıcı MusicXML File API desteği sunmuyor.')
  const file = new File(
    [xmlText],
    normalizeMxlFilename(sourceFile?.name),
    { type: 'application/vnd.recordare.musicxml+xml', lastModified: sourceFile?.lastModified ?? Date.now() },
  )
  normalizedFiles.add(file)
  return file
}

function replaceInputFile(input, file) {
  if (typeof DataTransfer !== 'function') {
    throw new Error('Tarayıcı .mxl dosyasını mevcut MusicXML akışına aktaramıyor.')
  }
  const transfer = new DataTransfer()
  transfer.items.add(file)
  input.files = transfer.files
}

function publishError(input, error) {
  const detail = Object.freeze({
    inputId: input?.id ?? null,
    message: error?.message || '.mxl dosyası açılamadı.',
  })
  if (typeof CustomEvent === 'function' && typeof input?.dispatchEvent === 'function') {
    input.dispatchEvent(new CustomEvent('seslitab:mxl-intake-error', { bubbles: true, detail }))
  }
}

async function normalizeSelectedMxl(input, sourceFile) {
  const result = await readMusicXmlSourceFile(sourceFile)
  const normalizedFile = createNormalizedFile(sourceFile, result.xmlText)
  replaceInputFile(input, normalizedFile)
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function onChange(event) {
  const input = event?.target
  if (!isMusicXmlFileInput(input)) return
  ensureMxlAccept(input)
  const file = input.files?.[0]
  if (!file || normalizedFiles.has(file) || !MXL_EXTENSION.test(String(file.name || ''))) return

  // Stop existing consumers from reading ZIP bytes as if they were plain XML.
  event.preventDefault?.()
  event.stopImmediatePropagation?.()
  void normalizeSelectedMxl(input, file).catch((error) => publishError(input, error))
}

function enhanceExistingInputs(root) {
  const inputs = root?.querySelectorAll?.('input[type="file"]') ?? []
  for (const input of inputs) ensureMxlAccept(input)
}

function observeFutureInputs(root) {
  if (typeof MutationObserver !== 'function' || !root?.documentElement) return null
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes ?? []) {
        if (isMusicXmlFileInput(node)) ensureMxlAccept(node)
        const nested = node?.querySelectorAll?.('input[type="file"]') ?? []
        for (const input of nested) ensureMxlAccept(input)
      }
    }
  })
  observer.observe(root.documentElement, { childList: true, subtree: true })
  return observer
}

export function installMusicXmlMxlInputBridge(root = document) {
  if (!root || typeof root.addEventListener !== 'function') return false
  if (boundRoots.has(root)) return true
  enhanceExistingInputs(root)
  root.addEventListener('change', onChange, true)
  observeFutureInputs(root)
  boundRoots.add(root)
  return true
}
