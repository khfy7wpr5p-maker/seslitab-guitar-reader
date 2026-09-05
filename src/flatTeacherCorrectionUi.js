import {
  createFlatEmbedSession,
  loadFlatEmbedSdk,
} from './services/flatEmbedBridge.js'

const stateByRoot = new WeakMap()

function isMusicXml(value) {
  const text = String(value || '').trim()
  return text.startsWith('<?xml') || text.startsWith('<score-partwise') || text.startsWith('<score-timewise')
}

export function readCurrentMusicXml(root = document) {
  const value = root.getElementById?.('xml-output')?.textContent ?? ''
  return isMusicXml(value) ? String(value).trim() : null
}

function setStatus(state, message, kind = 'info') {
  state.status.textContent = message
  state.status.dataset.kind = kind
}

function createPrototypeSurface(root) {
  const section = root.createElement('section')
  section.id = 'flat-teacher-correction'
  section.className = 'flat-teacher-correction'
  section.setAttribute('aria-labelledby', 'flat-teacher-correction-heading')

  const header = root.createElement('div')
  header.className = 'flat-teacher-correction__header'

  const heading = root.createElement('h3')
  heading.id = 'flat-teacher-correction-heading'
  heading.textContent = 'Flat ile düzelt'

  const badge = root.createElement('span')
  badge.className = 'flat-teacher-correction__badge'
  badge.textContent = 'Deneme'

  header.append(heading, badge)

  const actions = root.createElement('div')
  actions.className = 'flat-teacher-correction__actions'

  const openButton = root.createElement('button')
  openButton.id = 'flat-teacher-open-btn'
  openButton.type = 'button'
  openButton.className = 'btn btn-secondary'
  openButton.textContent = 'Flat’te aç'

  const exportButton = root.createElement('button')
  exportButton.id = 'flat-teacher-export-btn'
  exportButton.type = 'button'
  exportButton.className = 'btn btn-primary'
  exportButton.textContent = 'Düzeltilmiş XML’i al'
  exportButton.disabled = true

  actions.append(openButton, exportButton)

  const status = root.createElement('p')
  status.id = 'flat-teacher-status'
  status.className = 'flat-teacher-correction__status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.textContent = 'Önce PDF veya MusicXML açın.'

  const editorHost = root.createElement('div')
  editorHost.id = 'flat-teacher-editor-host'
  editorHost.className = 'flat-teacher-correction__editor'
  editorHost.hidden = true

  section.append(header, actions, status, editorHost)
  return { section, openButton, exportButton, status, editorHost }
}

function dispatchExport(root, musicXml) {
  const ViewCustomEvent = root.defaultView?.CustomEvent ?? globalThis.CustomEvent
  if (typeof ViewCustomEvent !== 'function' || typeof root.dispatchEvent !== 'function') return
  root.dispatchEvent(new ViewCustomEvent('seslitab:flat-musicxml-exported', {
    detail: {
      source: 'flat-embed-prototype',
      musicXml,
    },
  }))
}

export function getLastFlatMusicXml(root = document) {
  return stateByRoot.get(root)?.lastExportedMusicXml ?? null
}

export function initFlatTeacherCorrectionUi(root = document, options = {}) {
  if (!root || typeof root.getElementById !== 'function' || typeof root.createElement !== 'function') return false
  if (root.getElementById('flat-teacher-correction')) return true

  const workspace = root.getElementById('stage-s05-score-workspace')
  if (!workspace) return false

  const appId = String(options.appId ?? import.meta.env?.VITE_FLAT_EMBED_APP_ID ?? '').trim()
  const surface = createPrototypeSurface(root)
  workspace.appendChild(surface.section)

  const state = {
    ...surface,
    appId,
    session: null,
    lastExportedMusicXml: null,
  }
  stateByRoot.set(root, state)

  surface.openButton.addEventListener('click', async () => {
    const musicXml = readCurrentMusicXml(root)
    if (!musicXml) {
      setStatus(state, 'Önce PDF veya MusicXML açın.', 'warning')
      return
    }

    if (!state.appId) {
      setStatus(state, 'Flat bağlantısı hazır. Çalıştırmak için VITE_FLAT_EMBED_APP_ID gerekli.', 'warning')
      return
    }

    surface.openButton.disabled = true
    setStatus(state, 'Flat editörü açılıyor…')

    try {
      if (!state.session) {
        const EmbedCtor = options.EmbedCtor ?? await loadFlatEmbedSdk({
          root,
          win: root.defaultView ?? globalThis.window,
        })
        state.session = await createFlatEmbedSession(surface.editorHost, {
          appId: state.appId,
          EmbedCtor,
        })
      }

      await state.session.loadMusicXml(musicXml)
      surface.editorHost.hidden = false
      surface.exportButton.disabled = false
      setStatus(state, 'MusicXML Flat editöründe açıldı.', 'success')
    } catch (error) {
      surface.editorHost.hidden = true
      surface.exportButton.disabled = true
      setStatus(state, error?.message || 'Flat editörü açılamadı.', 'error')
    } finally {
      surface.openButton.disabled = false
    }
  })

  surface.exportButton.addEventListener('click', async () => {
    if (!state.session) return
    surface.exportButton.disabled = true
    setStatus(state, 'Düzeltilmiş MusicXML alınıyor…')

    try {
      const musicXml = await state.session.exportMusicXml()
      state.lastExportedMusicXml = musicXml
      dispatchExport(root, musicXml)
      setStatus(state, 'Düzeltilmiş MusicXML SesliTab’a geri alındı. Henüz mevcut revizyonun üzerine yazılmadı.', 'success')
    } catch (error) {
      setStatus(state, error?.message || 'Düzeltilmiş MusicXML alınamadı.', 'error')
    } finally {
      surface.exportButton.disabled = false
    }
  })

  return true
}
