const TAB_ID = 'smoosic-tab-btn'
const PANEL_ID = 'smoosic-panel'
const FRAME_ID = 'smoosic-editor-frame'
const STATUS_ID = 'smoosic-editor-host-status'
const EDITOR_URL = '/smoosic-editor/index.html'
const READY_TIMEOUT_MS = 60000
const LOAD_TIMEOUT_MS = 45000

const states = new WeakMap()

function stateFor(root) {
  let state = states.get(root)
  if (!state) {
    state = {
      frame: null,
      frameReadyPromise: null,
      lastSourceXml: null,
      lastSourceName: 'seslitab-current.musicxml',
    }
    states.set(root, state)
  }
  return state
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function setHostStatus(root, text, kind = 'info') {
  const status = root.getElementById?.(STATUS_ID)
  if (!status) return
  status.textContent = text
  status.dataset.kind = kind
  status.hidden = !text
  status.setAttribute('role', kind === 'error' ? 'alert' : 'status')
  status.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite')
}

function currentMusicXml(root) {
  const results = root.getElementById?.('results-section')
  if (!results || results.hidden === true || results.hasAttribute?.('hidden')) return ''

  const text = String(root.getElementById?.('xml-output')?.textContent || '').trim()
  if (!text || !text.includes('<score-')) return ''
  return text
}

function currentSourceName(root) {
  const fileName = String(
    root.getElementById?.('musicxml-file-name')?.textContent
      || root.getElementById?.('file-name')?.textContent
      || 'seslitab-current.musicxml',
  ).trim()
  if (/\.(musicxml|mxml|xml)$/i.test(fileName)) return fileName
  return `${fileName || 'seslitab-current'}.musicxml`
}

function setTabActive(root, active) {
  const button = root.getElementById?.(TAB_ID)
  const panel = root.getElementById?.(PANEL_ID)
  if (!button || !panel) return false

  if (active) {
    for (const other of root.querySelectorAll?.('.input-tab-btn') ?? []) {
      const selected = other === button
      other.classList?.toggle?.('active', selected)
      other.setAttribute?.('aria-selected', selected ? 'true' : 'false')
    }
    for (const inputPanel of root.querySelectorAll?.('.input-panel') ?? []) {
      const selected = inputPanel === panel
      inputPanel.hidden = !selected
      inputPanel.classList?.toggle?.('active', selected)
    }
    root.getElementById?.('input-section')?.classList?.add?.('smoosic-editor-active')
  } else {
    button.classList?.remove?.('active')
    button.setAttribute?.('aria-selected', 'false')
    panel.hidden = true
    panel.classList?.remove?.('active')
    root.getElementById?.('input-section')?.classList?.remove?.('smoosic-editor-active')
  }
  return true
}

function bindOtherTabs(root) {
  for (const button of root.querySelectorAll?.('.input-tab-btn') ?? []) {
    if (button.id === TAB_ID || button.dataset?.smoosicHideBound === 'yes') continue
    button.dataset.smoosicHideBound = 'yes'
    button.addEventListener?.('click', () => setTabActive(root, false))
  }
}

function iframeStatus(frame) {
  try {
    return String(frame.contentDocument?.getElementById('poc-status')?.textContent || '')
  } catch {
    return ''
  }
}

async function waitForEditorReady(frame) {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    const status = iframeStatus(frame)
    if (status.startsWith('Başlatma hatası:') || status.startsWith('Hata:')) {
      throw new Error(status)
    }
    if (status.includes('Editör hazır') || status.startsWith('Yüklendi:')) return true
    await sleep(150)
  }
  throw new Error('Nota editörü zamanında hazır olmadı.')
}

async function waitForMusicXmlLoad(frame, expectedFileName) {
  const deadline = Date.now() + LOAD_TIMEOUT_MS
  while (Date.now() < deadline) {
    const status = iframeStatus(frame)
    if (status.startsWith('Yüklendi:') && status.includes(expectedFileName)) return status
    if (status.startsWith('XML hatası:') || status.startsWith('Hata:') || status.startsWith('Başlatma hatası:')) {
      throw new Error(status)
    }
    await sleep(120)
  }
  throw new Error(`MusicXML editöre zamanında yüklenmedi: ${expectedFileName}`)
}

function makeIframeFile(frame, xml, fileName) {
  const win = frame.contentWindow
  if (!win?.File) throw new Error('Editör dosya aktarım API’si kullanılamıyor.')
  return new win.File([xml], fileName, { type: 'application/vnd.recordare.musicxml+xml' })
}

function assignInputFile(frame, input, file) {
  const win = frame.contentWindow
  if (typeof win?.DataTransfer === 'function') {
    const transfer = new win.DataTransfer()
    transfer.items.add(file)
    input.files = transfer.files
    return
  }

  // Older browsers only need files[0] for the proven POC input handler.
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [file],
  })
}

function resetIframeStatusForTransfer(frame, fileName) {
  const status = frame.contentDocument?.getElementById('poc-status')
  if (status) status.textContent = `SesliTab aktarımı: ${fileName}`
}

async function loadSourceIntoEditor(root, frame) {
  const state = stateFor(root)
  const xml = currentMusicXml(root)
  if (!xml) {
    state.lastSourceXml = null
    state.lastSourceName = 'seslitab-current.musicxml'
    setHostStatus(root, 'Önce PDF veya MusicXML açın. Editör şu an boş eserle hazır.', 'info')
    return false
  }
  if (state.lastSourceXml === xml) {
    setHostStatus(root, '', 'ready')
    return true
  }

  await waitForEditorReady(frame)
  const doc = frame.contentDocument
  const input = doc?.getElementById('mobile-xml-input')
  if (!input) throw new Error('Nota editörünün MusicXML giriş alanı bulunamadı.')

  const fileName = currentSourceName(root)
  const file = makeIframeFile(frame, xml, fileName)
  assignInputFile(frame, input, file)
  resetIframeStatusForTransfer(frame, fileName)
  setHostStatus(root, 'Eser Nota Düzenle alanına aktarılıyor…', 'loading')
  input.dispatchEvent(new frame.contentWindow.Event('change', { bubbles: true }))
  await waitForMusicXmlLoad(frame, fileName)

  state.lastSourceXml = xml
  state.lastSourceName = fileName
  setHostStatus(root, '', 'ready')
  return true
}

function ensureFrame(root, panel) {
  const state = stateFor(root)
  if (state.frame?.isConnected) return state.frame

  const frame = root.createElement('iframe')
  frame.id = FRAME_ID
  frame.className = 'smoosic-editor-frame'
  frame.title = 'Nota Düzenle'
  frame.setAttribute('allow', 'autoplay')
  frame.setAttribute('loading', 'eager')
  panel.appendChild(frame)
  state.frame = frame
  return frame
}

async function activateEditor(root) {
  setTabActive(root, true)
  const panel = root.getElementById?.(PANEL_ID)
  if (!panel) return false
  const frame = ensureFrame(root, panel)
  const state = stateFor(root)

  try {
    if (!frame.getAttribute('src')) {
      setHostStatus(root, 'Nota editörü yükleniyor…', 'loading')
      state.frameReadyPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Nota editörü sayfası yüklenemedi.')), READY_TIMEOUT_MS)
        frame.addEventListener('load', () => {
          clearTimeout(timeout)
          resolve(true)
        }, { once: true })
      })
      frame.src = EDITOR_URL
    }
    if (state.frameReadyPromise) await state.frameReadyPromise
    await waitForEditorReady(frame)
    await loadSourceIntoEditor(root, frame)
    return true
  } catch (error) {
    console.error(error)
    setHostStatus(root, error?.message || 'Nota editörü açılamadı.', 'error')
    return false
  }
}

export function ensureSmoosicEditorTab(root = document) {
  if (!root?.getElementById || !root?.createElement) return null
  const existing = root.getElementById(TAB_ID)
  if (existing) return root.getElementById(PANEL_ID)

  const tabList = root.querySelector?.('.input-tabs')
  const tabPanel = root.getElementById('tab-panel')
  const panelParent = tabPanel?.parentElement
  if (!tabList || !panelParent) return null

  const button = root.createElement('button')
  button.id = TAB_ID
  button.type = 'button'
  button.className = 'input-tab-btn'
  button.textContent = 'Nota Düzenle'
  button.dataset.tab = 'smoosic-editor'
  button.setAttribute('role', 'tab')
  button.setAttribute('aria-selected', 'false')
  button.setAttribute('aria-controls', PANEL_ID)
  tabList.appendChild(button)

  const panel = root.createElement('div')
  panel.id = PANEL_ID
  panel.className = 'input-panel smoosic-editor-panel'
  panel.hidden = true
  panel.setAttribute('role', 'tabpanel')
  panel.setAttribute('aria-labelledby', TAB_ID)

  const status = root.createElement('p')
  status.id = STATUS_ID
  status.className = 'smoosic-editor-host-status'
  status.hidden = true
  panel.appendChild(status)

  panelParent.appendChild(panel)
  button.addEventListener('click', () => { void activateEditor(root) })
  bindOtherTabs(root)
  return panel
}

export function initSmoosicEditorTab(root = document) {
  const init = () => ensureSmoosicEditorTab(root)
  if (root?.readyState === 'loading') {
    root.addEventListener?.('DOMContentLoaded', init, { once: true })
    return true
  }
  return Boolean(init())
}
