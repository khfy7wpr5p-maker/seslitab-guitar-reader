// SesliTab — Main application UI logic.
//
// Supports two input modes:
//   1. PDF upload → OMR → MusicXML → NoteObject[]
//   2. TAB paste → tabParser → NoteObject[]
//
// Both paths produce the same NoteObject[] that feeds:
//   - Rhythmic text output (Turkish)
//   - Rhythmic HTML output
//   - Note cards
//   - MusicXML raw output
//   - Voice playback (SpeechSynthesis)
//   - Rhythm playback (Web Audio API)
//
// Accessibility: all interactive elements have aria-labels, status messages
// use aria-live, keyboard navigation works throughout.

import { uploadAndAnalyze, pollAndDownload, cancelOmrJob, deleteOmrJob, downloadOmrProject } from './services/omrService.js'
import {
  parseTabToNotes, tabToSpokenText,
  notesToRhythmicText, notesToRhythmicHtml, notesToSummary,
  notesToSpokenText, notesToCardData,
  parseMusicXmlToNotes,
} from './services/musicEngine.js'
import {
  speakRhythmicText, stopSpeech, playRhythm, stopRhythm,
  isSpeechSupported, isAudioSupported,
} from './services/voiceService.js'
import { getOmrProviderName } from './providers/index.js'
import { normalizeTabInput } from '../tabParser.js'

// ── DOM helpers ──────────────────────────────────────────────

const $ = (id) => document.getElementById(id)
const ariaLive = $('aria-live-region')

function announce(msg) {
  ariaLive.textContent = msg
}

// ── State ────────────────────────────────────────────────────

let parsedNotes = null
let musicXmlString = null
let rhythmicTextString = null
let rhythmicHtmlString = null
let hasRhythmInfo = false
let isPlaying = false
let isSpeaking = false
let activeJobId = null
let abortController = null
let musicXmlDownloaded = false
let backendProvider = null

const SAMPLE_TAB = `e|---0---1---3---|
B|---1-----------|
G|---------------|
D|---------------|
A|---------------|
E|---------------|`

// ── Init ──────────────────────────────────────────────────────

function init() {
  $('provider-badge').textContent =
    getOmrProviderName().charAt(0).toUpperCase() + getOmrProviderName().slice(1) + ' Provider'

  // Input tabs (PDF / TAB)
  document.querySelectorAll('.input-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchInputTab(btn.dataset.tab))
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click() }
    })
  })

  // PDF drop zone
  const dropZone = $('drop-zone')
  dropZone.addEventListener('click', () => $('file-input').click())
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file-input').click() }
  })
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover') })
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'))
  dropZone.addEventListener('drop', handleDrop)
  $('file-input').addEventListener('change', handleFileSelect)
  $('remove-file').addEventListener('click', removeFile)
  $('upload-btn').addEventListener('click', handleUpload)
  $('cancel-btn').addEventListener('click', handleCancel)

  // TAB actions
  $('tab-convert-btn').addEventListener('click', handleTabConvert)
  $('tab-sample-btn').addEventListener('click', loadSampleTab)
  $('tab-clear-btn').addEventListener('click', clearTab)

  // Result tabs
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchResultTab(btn.dataset.tab))
  })

  // Copy & Reset
  $('copy-btn').addEventListener('click', copyRhythmicText)
  $('reset-btn').addEventListener('click', resetApp)

  // OMR project download
  const omrDlBtn = $('omr-download-btn')
  if (omrDlBtn) omrDlBtn.addEventListener('click', handleOmrDownload)

  // Voice playback
  $('voice-btn').addEventListener('click', toggleVoice)
  $('voice-stop-btn').addEventListener('click', stopVoice)
  $('speed-slider').addEventListener('input', updateSpeed)

  // Rhythm playback
  $('rhythm-btn').addEventListener('click', toggleRhythm)
  $('rhythm-stop-btn').addEventListener('click', stopRhythmPlayback)
  $('tempo-slider').addEventListener('input', updateTempo)

  // Browser support checks
  if (!isSpeechSupported()) {
    $('voice-btn').disabled = true
    $('voice-btn').setAttribute('aria-label', 'Tarayıcı sesli okuma desteklemiyor')
  }
  if (!isAudioSupported()) {
    $('rhythm-btn').disabled = true
    $('rhythm-btn').setAttribute('aria-label', 'Tarayıcı Web Audio API desteklemiyor')
  }
}

// ── Input tab switching ─────────────────────────────────────

function switchInputTab(tabName) {
  document.querySelectorAll('.input-tab-btn').forEach((btn) => {
    const active = btn.dataset.tab === tabName
    btn.classList.toggle('active', active)
    btn.setAttribute('aria-selected', active)
  })

  $('pdf-panel').hidden = tabName !== 'pdf'
  $('tab-panel').hidden = tabName !== 'tab'
  $('pdf-panel').classList.toggle('active', tabName === 'pdf')
  $('tab-panel').classList.toggle('active', tabName === 'tab')
}

// ── PDF handling ────────────────────────────────────────────

function handleDrop(e) {
  e.preventDefault()
  $('drop-zone').classList.remove('dragover')
  const file = e.dataTransfer.files[0]
  if (file) selectFile(file)
}

function handleFileSelect(e) {
  const file = e.target.files[0]
  if (file) selectFile(file)
}

function selectFile(file) {
  if (file.type !== 'application/pdf') {
    showPdfError('Sadece PDF dosyaları kabul edilir.')
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    showPdfError('Dosya boyutu 10 MB sınırını aşıyor.')
    return
  }

  $('file-name').textContent = file.name
  $('file-size').textContent = formatFileSize(file.size)
  $('drop-zone').hidden = true
  $('file-info').hidden = false
  $('upload-btn').disabled = false
  hidePdfError()
  announce('PDF yüklendi: ' + file.name)
}

function removeFile() {
  $('file-input').value = ''
  $('drop-zone').hidden = false
  $('file-info').hidden = true
  $('upload-btn').disabled = true
  hidePdfError()
}

// ── PDF upload & OMR ─────────────────────────────────────────

async function handleUpload() {
  const file = $('file-input').files[0]
  if (!file) return

  $('upload-btn').disabled = true
  $('cancel-btn').hidden = false
  $('progress-container').hidden = false
  $('progress-fill').style.width = '0%'
  $('progress-text').textContent = 'PDF yükleniyor.'
  hidePdfError()
  hideMockNotice()
  announce('Analiz başladı')

  abortController = new AbortController()
  musicXmlDownloaded = false

  try {
    // Step 1: Upload + analyze — returns { success, jobId }
    const uploadResult = await uploadAndAnalyze(file)
    if (!uploadResult.success || !uploadResult.jobId) {
      throw new Error(uploadResult.error || 'İş kimliği alınamadı.')
    }

    activeJobId = uploadResult.jobId
    backendProvider = uploadResult.provider || null
    $('progress-text').textContent = 'İşlem kuyruğa alındı.'
    announce('İşlem kuyruğa alındı')

    // Step 2: Poll until completed, then download MusicXML
    const result = await pollAndDownload(activeJobId, (status, progress) => {
      $('progress-fill').style.width = `${progress}%`
      const label = statusLabel(status)
      $('progress-text').textContent = `${label}`
      if (status === 'processing') $('progress-text').textContent = 'Nota verisi hazırlanıyor.'
      if (status === 'musicxml_created' || status === 'completed') $('progress-text').textContent = 'MusicXML alınıyor.'
    }, { signal: abortController.signal })

    if (!result.success || !result.musicXml) {
      throw new Error(result.error || 'MusicXML alınamadı.')
    }

    musicXmlDownloaded = true

    // Step 3: Parse MusicXML → NoteObject[]
    const parseResult = parseMusicXmlToNotes(result.musicXml)
    if (parseResult.error) {
      throw new Error(parseResult.error)
    }

    $('progress-text').textContent = 'Dönüştürme tamamlandı.'
    announce('Dönüştürme tamamlandı')
    if (backendProvider === 'mock') showMockNotice()
    showOmrDownloadButton()
    handleAnalysisResult(parseResult.notes, result.musicXml, true)
  } catch (err) {
    const msg = err.message || 'Dönüştürme başarısız oldu.'
    showPdfError(msg)
    announce(msg)
    $('progress-container').hidden = true
    $('upload-btn').disabled = false
  } finally {
    $('cancel-btn').hidden = true
    abortController = null
  }
}

async function handleCancel() {
  if (!activeJobId) return
  if (abortController) abortController.abort()
  $('cancel-btn').disabled = true
  $('progress-text').textContent = 'İptal ediliyor...'
  announce('İşlem iptal ediliyor')
  try {
    await cancelOmrJob(activeJobId)
  } catch {}
  showPdfError('İşlem iptal edildi.')
  $('progress-container').hidden = true
  $('upload-btn').disabled = false
  $('cancel-btn').hidden = true
  $('cancel-btn').disabled = false
  activeJobId = null
}

function statusLabel(status) {
  const labels = {
    uploaded: 'Yüklendi',
    queued: 'Kuyrukta',
    processing: 'İşleniyor',
    musicxml_created: 'MusicXML hazır',
    completed: 'Tamamlandı',
    failed: 'Başarısız',
    canceled: 'İptal edildi',
  }
  return labels[status] || 'İşleniyor'
}

// ── TAB handling ────────────────────────────────────────────

function handleTabConvert() {
  const rawText = $('tab-textarea').value
  if (!rawText || !rawText.trim()) {
    showTabError('TAB metni boş. Lütfen gitar TAB metni yapıştırın.')
    return
  }

  // Safe normalization: line endings, trailing spaces, block detection, x2/x3 stripping.
  const { normalized, blocks, error } = normalizeTabInput(rawText)
  if (error) {
    showTabError(error)
    announce('TAB analizi başarısız')
    return
  }

  // Update the textarea with the normalized text so the user sees clean lines.
  if (normalized !== rawText) {
    $('tab-textarea').value = normalized
  }

  hideTabError()
  announce('TAB analizi başladı: ' + blocks.length + ' blok bulundu')

  const { notes, hasRhythm } = parseTabToNotes(normalized)
  if (notes.length === 0) {
    showTabError('TAB metni okunamadı. Geçerli bir gitar TAB metni yapıştırın.')
    announce('Analiz başarısız')
    return
  }

  announce('TAB analiz edildi: ' + notes.length + ' nota')
  handleAnalysisResult(notes, null, hasRhythm)
}

function loadSampleTab() {
  $('tab-textarea').value = SAMPLE_TAB
  announce('Örnek TAB yüklendi')
}

function clearTab() {
  $('tab-textarea').value = ''
  hideTabError()
  announce('TAB metni temizlendi')
}

// ── Shared result handling ──────────────────────────────────

function handleAnalysisResult(notes, xmlString, hasRhythm) {
  parsedNotes = notes
  hasRhythmInfo = hasRhythm

  // Generate text outputs
  rhythmicTextString = notesToRhythmicText(notes)
  rhythmicHtmlString = notesToRhythmicHtml(notes)
  const summary = notesToSummary(notes)

  // Display
  $('rhythmic-output').textContent = rhythmicTextString
  $('rhythmic-html-output').innerHTML = rhythmicHtmlString
  $('notes-summary').textContent = summary

  // Note cards
  renderNoteCards(notesToCardData(notes))

  // MusicXML (if from PDF)
  if (xmlString) {
    musicXmlString = xmlString
    $('xml-output').textContent = xmlString
  } else {
    // TAB mode — no MusicXML
    musicXmlString = '(TAB modunda MusicXML çıktısı yoktur)'
    $('xml-output').textContent = musicXmlString
  }

  // Rhythm warning
  if (!hasRhythm) {
    const warning = 'Ritim bilgisi bulunamadı. Varsayılan olarak her nota bir vuruş kabul edildi.'
    $('rhythm-warning').hidden = false
    $('rhythm-warning').textContent = warning
    $('rhythm-warning-html').hidden = false
    $('rhythm-warning-html').textContent = warning
  } else {
    $('rhythm-warning').hidden = true
    $('rhythm-warning-html').hidden = true
  }

  // Show result sections
  $('progress-container').hidden = true
  $('results-section').hidden = false
  $('voice-section').hidden = false
  $('rhythm-section').hidden = false

  // Scroll to results
  setTimeout(() => {
    $('results-section').scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 300)
}

// ── Result tab switching ────────────────────────────────────

function switchResultTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const active = btn.dataset.tab === tabName
    btn.classList.toggle('active', active)
    btn.setAttribute('aria-selected', active)
  })

  $('tab-rhythmic').hidden = tabName !== 'rhythmic'
  $('tab-html').hidden = tabName !== 'html'
  $('tab-notes').hidden = tabName !== 'notes'
  $('tab-xml').hidden = tabName !== 'xml'
}

// ── Note cards ──────────────────────────────────────────────

function renderNoteCards(cards) {
  const grid = $('notes-output')
  grid.innerHTML = ''
  cards.forEach((card, i) => {
    const div = document.createElement('div')
    div.className = 'note-card'
    div.id = `note-${i}`
    div.setAttribute('role', 'listitem')
    div.setAttribute('aria-label', `${card.pitch} notası, ${card.type}`)

    div.innerHTML = `
      <div class="note-pitch">${card.pitch}</div>
      <div class="note-type">${card.type}</div>
      ${card.string ? `<div class="note-string">tel ${card.stringNum}, perde ${card.fret}</div>` : ''}
    `
    grid.appendChild(div)
  })
}

// ── Copy & Reset ─────────────────────────────────────────────

async function copyRhythmicText() {
  try {
    await navigator.clipboard.writeText(rhythmicTextString)
    announce('Ritmik metin kopyalandı')
    const btn = $('copy-btn')
    btn.textContent = '✓ Kopyalandı'
    setTimeout(() => {
      btn.innerHTML = '<span class="btn-icon-text" aria-hidden="true">📋 Kopyala</span>'
    }, 2000)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = rhythmicTextString
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
}

function resetApp() {
  if (abortController) abortController.abort()
  if (activeJobId && !musicXmlDownloaded) {
    cancelOmrJob(activeJobId).catch(() => {})
    deleteOmrJob(activeJobId).catch(() => {})
  } else if (activeJobId && musicXmlDownloaded) {
    deleteOmrJob(activeJobId).catch(() => {})
  }
  parsedNotes = null
  musicXmlString = null
  rhythmicTextString = null
  rhythmicHtmlString = null
  activeJobId = null
  abortController = null
  musicXmlDownloaded = false

  $('file-input').value = ''
  $('drop-zone').hidden = false
  $('file-info').hidden = true
  $('upload-btn').disabled = true
  $('progress-container').hidden = true
  $('cancel-btn').hidden = true
  $('tab-textarea').value = ''
  $('results-section').hidden = true
  $('voice-section').hidden = true
  $('rhythm-section').hidden = true

  stopSpeech()
  stopRhythm()
  isPlaying = false
  isSpeaking = false
  resetPlaybackButtons()

  hidePdfError()
  hideTabError()
  hideMockNotice()
  hideOmrDownloadButton()
  announce('Uygulama sıfırlandı')
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ── Voice playback ─────────────────────────────────────────

async function toggleVoice() {
  if (isSpeaking) { stopVoice(); return }

  if (isPlaying) stopRhythmPlayback()

  isSpeaking = true
  $('voice-btn').classList.add('playing')
  $('voice-btn').querySelector('.btn-icon-text').textContent = '⏸ Duraklat'
  $('voice-stop-btn').disabled = false
  $('voice-status').hidden = false
  $('voice-status').textContent = 'Sesli okuma başladı...'
  announce('Sesli okuma başladı')

  try {
    const speed = parseFloat($('speed-slider').value)
    const spokenText = notesToSpokenText(parsedNotes)
    await speakRhythmicText(spokenText, speed)
  } catch (err) {
    $('voice-status').textContent = 'Hata: ' + err.message
    announce('Sesli okuma hatası')
  }

  isSpeaking = false
  resetVoiceButtons()
  $('voice-status').textContent = 'Sesli okuma tamamlandı.'
  announce('Sesli okuma tamamlandı')
}

function stopVoice() {
  stopSpeech()
  isSpeaking = false
  resetVoiceButtons()
  $('voice-status').hidden = true
  announce('Sesli okuma durduruldu')
}

function resetVoiceButtons() {
  $('voice-btn').classList.remove('playing')
  $('voice-btn').querySelector('.btn-icon-text').textContent = '🔊 Sesli Oku'
  $('voice-stop-btn').disabled = true
}

// ── Rhythm playback ────────────────────────────────────────

async function toggleRhythm() {
  if (isPlaying) { stopRhythmPlayback(); return }

  if (isSpeaking) stopVoice()

  isPlaying = true
  $('rhythm-btn').classList.add('playing')
  $('rhythm-btn').querySelector('.btn-icon-text').textContent = '⏸ Duraklat'
  $('rhythm-stop-btn').disabled = false
  $('rhythm-status').hidden = false
  $('rhythm-status').textContent = 'Ritmik çalma başladı...'
  announce('Ritmik çalma başladı')

  const tempo = parseFloat($('tempo-slider').value)
  const speed = 120 / tempo // Convert tempo to speed multiplier

  await playRhythm(parsedNotes, speed, (note, i) => {
    document.querySelectorAll('.note-card.playing').forEach((c) => c.classList.remove('playing'))
    const card = $(`note-${i}`)
    if (card) card.classList.add('playing')
  })

  isPlaying = false
  resetRhythmButtons()
  $('rhythm-status').textContent = 'Ritmik çalma tamamlandı.'
  announce('Ritmik çalma tamamlandı')
  document.querySelectorAll('.note-card.playing').forEach((c) => c.classList.remove('playing'))
}

function stopRhythmPlayback() {
  stopRhythm()
  isPlaying = false
  resetRhythmButtons()
  $('rhythm-status').hidden = true
  announce('Ritmik çalma durduruldu')
  document.querySelectorAll('.note-card.playing').forEach((c) => c.classList.remove('playing'))
}

function resetRhythmButtons() {
  $('rhythm-btn').classList.remove('playing')
  $('rhythm-btn').querySelector('.btn-icon-text').textContent = '🎵 Notaları Çal'
  $('rhythm-stop-btn').disabled = true
}

function resetPlaybackButtons() {
  resetVoiceButtons()
  resetRhythmButtons()
  $('voice-status').hidden = true
  $('rhythm-status').hidden = true
}

// ── Speed & tempo controls ──────────────────────────────────

function updateSpeed() {
  const speed = parseFloat($('speed-slider').value)
  $('speed-value').textContent = speed.toFixed(1) + 'x'
}

function updateTempo() {
  const tempo = parseFloat($('tempo-slider').value)
  $('tempo-value').textContent = Math.round(tempo) + ' BPM'
}

// ── Error helpers ───────────────────────────────────────────

function showPdfError(msg) { $('upload-error').textContent = msg; $('upload-error').hidden = false }
function hidePdfError() { $('upload-error').hidden = true }
function showTabError(msg) { $('tab-error').textContent = msg; $('tab-error').hidden = false }
function hideTabError() { $('tab-error').hidden = true }

function showMockNotice() {
  const el = $('mock-notice')
  if (!el) return
  el.textContent = 'Demo OMR kullanılıyor. Gösterilen nota sonucu yüklenen PDF\'den tanınmamıştır.'
  el.hidden = false
}
function hideMockNotice() {
  const el = $('mock-notice')
  if (!el) return
  el.hidden = true
}

// ── OMR project download ──────────────────────────────────────

function showOmrDownloadButton() {
  const btn = $('omr-download-btn')
  if (!btn) return
  if (backendProvider !== 'audiveris' || !activeJobId) { btn.hidden = true; return }
  btn.hidden = false
  const status = $('omr-download-status')
  if (status) status.hidden = true
}

function hideOmrDownloadButton() {
  const btn = $('omr-download-btn')
  if (btn) btn.hidden = true
  const status = $('omr-download-status')
  if (status) { status.hidden = true; status.textContent = '' }
}

async function handleOmrDownload() {
  const btn = $('omr-download-btn')
  const status = $('omr-download-status')
  if (!btn || !activeJobId) return

  btn.disabled = true
  if (status) { status.hidden = false; status.textContent = 'OMR projesi indiriliyor…' }
  announce('OMR projesi indiriliyor')

  try {
    const result = await downloadOmrProject(activeJobId)
    if (!result.success) {
      if (status) status.textContent = 'OMR projesi indirilemedi.'
      announce('OMR projesi indirilemedi')
      return
    }
    const url = URL.createObjectURL(result.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'project.omr'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    if (status) status.textContent = 'OMR projesi indirildi.'
    announce('OMR projesi indirildi')
  } catch (err) {
    if (status) status.textContent = 'OMR projesi indirilemedi.'
    announce('OMR projesi indirilemedi')
  } finally {
    btn.disabled = false
  }
}

// ── Utilities ──────────────────────────────────────────────

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// ── Start ───────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init)
