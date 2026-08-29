import {
  DEFAULT_REFERENCE_A4_HZ,
  MAX_REFERENCE_A4_HZ,
  MIN_REFERENCE_A4_HZ,
  TUNER_DETECTION_STATE,
  analyzeChromaticTunerFrame,
  evaluateTuningCents,
  frequencyToChromaticPitch,
} from '../chromaticTunerEngine.js'

const ANALYSIS_INTERVAL_MS = 70
const ANNOUNCEMENT_INTERVAL_MS = 900
const FFT_SIZE = 8192
const SMOOTHING_ALPHA = 0.35

let tunerSession = null

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function formatCents(cents) {
  const rounded = Math.round(cents * 10) / 10
  if (Math.abs(rounded) < 0.05) return '0.0'
  return rounded > 0 ? `+${rounded.toFixed(1)}` : rounded.toFixed(1)
}

function parseReference(value) {
  const numeric = Number(String(value).trim().replace(',', '.'))
  if (!Number.isFinite(numeric) || numeric < MIN_REFERENCE_A4_HZ || numeric > MAX_REFERENCE_A4_HZ) return null
  return Math.round(numeric * 10) / 10
}

function createMarkup() {
  const section = document.createElement('section')
  section.className = 'card tuner-card'
  section.id = 'chromatic-tuner-section'
  section.setAttribute('aria-labelledby', 'chromatic-tuner-heading')
  section.innerHTML = `
    <div class="card-header tuner-header">
      <div>
        <h2 id="chromatic-tuner-heading">Kromatik Akort Cihazı</h2>
        <p class="tuner-subtitle">Tüm 12 kromatik sesi algılar. Mikrofon sesi yalnızca bu cihazda analiz edilir.</p>
      </div>
      <span class="tuner-badge" aria-label="Kromatik tuner">12 ses · kromatik</span>
    </div>
    <div class="card-body tuner-body">
      <div class="tuner-controls" aria-label="Akort cihazı kontrolleri">
        <button class="btn btn-primary" id="tuner-start-btn" type="button">Mikrofonu Başlat</button>
        <button class="btn btn-secondary" id="tuner-stop-btn" type="button" disabled>Durdur</button>
        <label class="tuner-calibration" for="tuner-reference-a4">
          <span>La4 kalibrasyonu</span>
          <span class="tuner-reference-wrap">
            <input id="tuner-reference-a4" type="number" min="${MIN_REFERENCE_A4_HZ}" max="${MAX_REFERENCE_A4_HZ}" step="0.1" value="${DEFAULT_REFERENCE_A4_HZ}" inputmode="decimal" />
            <span aria-hidden="true">Hz</span>
          </span>
        </label>
      </div>

      <div class="tuner-display" id="tuner-display" data-state="idle">
        <div class="tuner-note" id="tuner-note">—</div>
        <div class="tuner-octave" id="tuner-octave"></div>
        <div class="tuner-direction" id="tuner-direction">Mikrofon kapalı</div>
        <div class="tuner-readout" aria-label="Akort ölçümleri">
          <span><strong id="tuner-frequency">—</strong> Hz</span>
          <span><strong id="tuner-cents">—</strong> cent</span>
        </div>
        <meter id="tuner-meter" class="tuner-meter" min="-50" max="50" low="-5" high="5" optimum="0" value="0" aria-label="Akort sapması, eksi 50 cent pes ile artı 50 cent tiz arası"></meter>
        <div class="tuner-scale" aria-hidden="true"><span>−50 pes</span><span>0</span><span>+50 tiz</span></div>
      </div>

      <p class="tuner-help" id="tuner-help">Hedef: 0 cent. ±2 cent “akortta”, ±5 cent “çok yakın” olarak değerlendirilir.</p>
      <div id="tuner-status" class="playback-status tuner-status" role="status" aria-live="polite" aria-atomic="true">Akort cihazı hazır.</div>
      <div id="tuner-error" class="error-message" role="alert" hidden></div>
    </div>
  `
  return section
}

function getElements(section) {
  return {
    section,
    start: section.querySelector('#tuner-start-btn'),
    stop: section.querySelector('#tuner-stop-btn'),
    reference: section.querySelector('#tuner-reference-a4'),
    display: section.querySelector('#tuner-display'),
    note: section.querySelector('#tuner-note'),
    octave: section.querySelector('#tuner-octave'),
    direction: section.querySelector('#tuner-direction'),
    frequency: section.querySelector('#tuner-frequency'),
    cents: section.querySelector('#tuner-cents'),
    meter: section.querySelector('#tuner-meter'),
    status: section.querySelector('#tuner-status'),
    error: section.querySelector('#tuner-error'),
  }
}

function setError(elements, message = '') {
  if (!message) {
    elements.error.hidden = true
    elements.error.textContent = ''
    return
  }
  elements.error.hidden = false
  elements.error.textContent = message
}

function resetDisplay(elements, text = 'Ses bekleniyor') {
  elements.display.dataset.state = 'waiting'
  elements.note.textContent = '—'
  elements.octave.textContent = ''
  elements.direction.textContent = text
  elements.frequency.textContent = '—'
  elements.cents.textContent = '—'
  elements.meter.value = 0
}

function buildAnnouncement(pitch, guidance) {
  const deviation = Math.abs(pitch.cents) <= 0.05
    ? 'tam merkezde'
    : `${Math.abs(pitch.cents).toFixed(1)} cent ${pitch.cents < 0 ? 'pes' : 'tiz'}`
  return `${pitch.turkishName} ${pitch.octave}. ${guidance.label}. ${deviation}.`
}

function shouldAnnounce(session, pitch, guidance, now) {
  if (now - session.lastAnnouncementAt < ANNOUNCEMENT_INTERVAL_MS) return false
  const key = `${pitch.midi}:${guidance.state}:${Math.round(pitch.cents / 3)}`
  if (session.lastAnnouncementKey === key) return false
  session.lastAnnouncementKey = key
  session.lastAnnouncementAt = now
  return true
}

function renderDetected(elements, session, pitch, confidence, now) {
  const guidance = evaluateTuningCents(pitch.cents)
  if (!guidance) return

  elements.display.dataset.state = guidance.state
  elements.note.textContent = pitch.displayName
  elements.octave.textContent = `Oktav ${pitch.octave}`
  elements.direction.textContent = guidance.label
  elements.frequency.textContent = pitch.frequencyHz.toFixed(2)
  elements.cents.textContent = formatCents(pitch.cents)
  elements.meter.value = clamp(pitch.cents, -50, 50)
  elements.meter.setAttribute('aria-valuetext', `${formatCents(pitch.cents)} cent; ${guidance.label}`)

  if (shouldAnnounce(session, pitch, guidance, now)) {
    elements.status.textContent = buildAnnouncement(pitch, guidance)
  }

  session.lastConfidence = confidence
}

function stabilizePitch(session, rawPitch) {
  if (session.stableMidi !== rawPitch.midi || !Number.isFinite(session.stableFrequency)) {
    session.stableMidi = rawPitch.midi
    session.stableFrequency = rawPitch.frequencyHz
  } else {
    session.stableFrequency = (session.stableFrequency * (1 - SMOOTHING_ALPHA)) + (rawPitch.frequencyHz * SMOOTHING_ALPHA)
  }
  return frequencyToChromaticPitch(session.stableFrequency, session.referenceA4)
}

function runFrame(session, timestamp) {
  if (tunerSession !== session || session.stopped) return
  session.rafId = window.requestAnimationFrame((nextTimestamp) => runFrame(session, nextTimestamp))
  if (timestamp - session.lastAnalysisAt < ANALYSIS_INTERVAL_MS) return
  session.lastAnalysisAt = timestamp

  session.analyser.getFloatTimeDomainData(session.buffer)
  const result = analyzeChromaticTunerFrame(session.buffer, session.audioContext.sampleRate, {
    referenceA4: session.referenceA4,
    minHz: 40,
    maxHz: 2000,
    threshold: 0.12,
    minConfidence: 0.72,
    minRms: 0.004,
  })

  if (result.state === TUNER_DETECTION_STATE.DETECTED) {
    session.lastSignalAt = timestamp
    const stablePitch = stabilizePitch(session, result.pitch)
    if (stablePitch) renderDetected(session.elements, session, stablePitch, result.detection.confidence, timestamp)
    return
  }

  session.stableMidi = null
  session.stableFrequency = null
  if (timestamp - session.lastSignalAt > 450) {
    resetDisplay(session.elements, result.state === TUNER_DETECTION_STATE.NO_SIGNAL ? 'Ses bekleniyor' : 'Kararlı bir ses bekleniyor')
  }
}

async function stopTuner(reason = 'Akort cihazı durduruldu.') {
  const session = tunerSession
  if (!session) return
  tunerSession = null
  session.stopped = true
  if (session.rafId) window.cancelAnimationFrame(session.rafId)
  try { session.source.disconnect() } catch {}
  try { session.analyser.disconnect() } catch {}
  for (const track of session.stream.getTracks()) track.stop()
  try { await session.audioContext.close() } catch {}

  session.elements.start.disabled = false
  session.elements.stop.disabled = true
  session.elements.reference.disabled = false
  resetDisplay(session.elements, 'Mikrofon kapalı')
  session.elements.display.dataset.state = 'idle'
  session.elements.status.textContent = reason
}

function microphoneErrorMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'Mikrofon izni verilmedi. Tarayıcı izinlerinden mikrofon erişimini açın.'
  if (error?.name === 'NotFoundError') return 'Kullanılabilir bir mikrofon bulunamadı.'
  if (error?.name === 'NotReadableError') return 'Mikrofon başka bir uygulama tarafından kullanılıyor olabilir.'
  return 'Mikrofon başlatılamadı. Tarayıcı ve mikrofon izinlerini kontrol edin.'
}

async function startTuner(elements) {
  if (tunerSession) return
  setError(elements)

  const referenceA4 = parseReference(elements.reference.value)
  if (referenceA4 === null) {
    setError(elements, `La4 kalibrasyonu ${MIN_REFERENCE_A4_HZ} ile ${MAX_REFERENCE_A4_HZ} Hz arasında olmalıdır.`)
    elements.reference.focus()
    return
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    setError(elements, 'Bu tarayıcı gerçek zamanlı mikrofon erişimini desteklemiyor veya sayfa güvenli bağlantıda değil.')
    return
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextCtor) {
    setError(elements, 'Bu tarayıcı Web Audio API desteği sunmuyor.')
    return
  }

  elements.start.disabled = true
  elements.stop.disabled = true
  elements.reference.disabled = true
  elements.status.textContent = 'Mikrofon izni bekleniyor…'

  let stream = null
  let audioContext = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    })
    audioContext = new AudioContextCtor({ latencyHint: 'interactive' })
    if (audioContext.state === 'suspended') await audioContext.resume()
    const source = audioContext.createMediaStreamSource(stream)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = FFT_SIZE
    analyser.smoothingTimeConstant = 0
    source.connect(analyser)

    const session = {
      elements,
      stream,
      audioContext,
      source,
      analyser,
      buffer: new Float32Array(analyser.fftSize),
      referenceA4,
      stopped: false,
      rafId: 0,
      lastAnalysisAt: -Infinity,
      lastSignalAt: performance.now(),
      lastAnnouncementAt: -Infinity,
      lastAnnouncementKey: '',
      stableMidi: null,
      stableFrequency: null,
      lastConfidence: 0,
    }
    tunerSession = session
    elements.stop.disabled = false
    elements.display.dataset.state = 'waiting'
    elements.status.textContent = `Kromatik tuner açık. La4 ${referenceA4.toFixed(1)} Hz. Bir nota çalın.`
    resetDisplay(elements)
    session.rafId = window.requestAnimationFrame((timestamp) => runFrame(session, timestamp))
  } catch (error) {
    if (stream) {
      for (const track of stream.getTracks()) track.stop()
    }
    if (audioContext) {
      try { await audioContext.close() } catch {}
    }
    elements.start.disabled = false
    elements.stop.disabled = true
    elements.reference.disabled = false
    setError(elements, microphoneErrorMessage(error))
    elements.status.textContent = 'Akort cihazı başlatılamadı.'
  }
}

export function installChromaticTunerUi(root = document) {
  const appMain = root.querySelector?.('.app-main')
  if (!appMain || root.querySelector?.('#chromatic-tuner-section')) return null

  const section = createMarkup()
  const inputSection = root.querySelector?.('#input-section')
  if (inputSection?.parentNode === appMain) inputSection.insertAdjacentElement('afterend', section)
  else appMain.appendChild(section)

  const elements = getElements(section)
  elements.start.addEventListener('click', () => startTuner(elements))
  elements.stop.addEventListener('click', () => stopTuner())
  elements.reference.addEventListener('change', () => {
    const parsed = parseReference(elements.reference.value)
    if (parsed === null) {
      setError(elements, `La4 kalibrasyonu ${MIN_REFERENCE_A4_HZ} ile ${MAX_REFERENCE_A4_HZ} Hz arasında olmalıdır.`)
      return
    }
    elements.reference.value = parsed.toFixed(1)
    setError(elements)
    elements.status.textContent = `La4 kalibrasyonu ${parsed.toFixed(1)} Hz olarak ayarlandı.`
  })

  window.addEventListener('pagehide', () => { void stopTuner('Sayfa kapandığı için mikrofon durduruldu.') }, { once: true })
  return Object.freeze({ section, elements: Object.freeze(elements) })
}

if (typeof document !== 'undefined') installChromaticTunerUi(document)

export const PACKAGE_11_TUNER_UI_CONTRACT = Object.freeze({
  chromatic: true,
  noteClassCount: 12,
  referenceA4MinHz: MIN_REFERENCE_A4_HZ,
  referenceA4MaxHz: MAX_REFERENCE_A4_HZ,
  defaultReferenceA4Hz: DEFAULT_REFERENCE_A4_HZ,
  localAudioOnly: true,
  uploadsAudio: false,
})
