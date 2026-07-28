// Voice Service — text-to-speech and rhythmic playback using Web Audio API.
//
// Works with NoteObject[] from noteTheory.js (root module) and plain text.

import { resolveBeats, buildTieChains, tieChainBeats } from '../../noteTheory.js'

let audioCtx = null

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return audioCtx
}

const NO_TURKISH_VOICE_WARNING = 'Bu cihazda Türkçe ses bulunamadı.'
const START_TIMEOUT_MS = 3000

let cachedVoices = []
let activeUtterance = null

/**
 * Select a Turkish voice from a list using priority:
 *   a. lang === "tr-TR"
 *   b. lang starts with "tr-"
 *   c. lang starts with "tr"
 * Returns the voice or null if none found.
 * Pure function — no browser dependencies, safe to unit-test.
 * @param {SpeechSynthesisVoice[]} voices
 * @returns {SpeechSynthesisVoice | null}
 */
export function selectTurkishVoice(voices) {
  if (!voices || voices.length === 0) return null

  return (
    voices.find((v) => v.lang === 'tr-TR') ||
    voices.find((v) => v.lang.startsWith('tr-')) ||
    voices.find((v) => v.lang.startsWith('tr')) ||
    null
  )
}

/**
 * Load speech synthesis voices, waiting for the "voiceschanged" event
 * when getVoices() initially returns an empty array (common in Chrome).
 * @param {SpeechSynthesis} synth
 * @returns {Promise<SpeechSynthesisVoice[]>}
 */
export function loadVoices(synth) {
  return new Promise((resolve) => {
    const existing = synth.getVoices()
    if (existing && existing.length > 0) {
      resolve(existing)
      return
    }

    const handler = () => {
      synth.removeEventListener('voiceschanged', handler)
      resolve(synth.getVoices())
    }
    synth.addEventListener('voiceschanged', handler)
  })
}

/**
 * Preload and cache available voices at application startup so the
 * Turkish voice is ready immediately when the user presses the button.
 * Updates the cache on subsequent voiceschanged events.
 * @param {SpeechSynthesis} synth
 */
export function preloadVoices(synth) {
  const update = () => {
    const voices = synth.getVoices()
    if (voices && voices.length > 0) {
      cachedVoices = voices
      console.info('[RhythmicHTML TTS] Voices preloaded:', voices.length)
    }
  }
  update()
  synth.addEventListener('voiceschanged', update)
}

/**
 * Return the cached Turkish voice, or null.
 * @returns {SpeechSynthesisVoice | null}
 */
export function getCachedTurkishVoice() {
  return selectTurkishVoice(cachedVoices)
}

/**
 * Reset the voice cache (for testing).
 */
export function resetVoiceCache() {
  cachedVoices = []
  activeUtterance = null
}

/**
 * Speak text using SpeechSynthesis API (Turkish).
 *
 * Lifecycle:
 *   - Uses the cached Turkish voice immediately (no async wait on click).
 *   - Calls speechSynthesis.cancel() only to stop a previous utterance.
 *   - Calls speechSynthesis.resume() if the synthesizer is paused.
 *   - Preserves the utterance in module-level state until onend/onerror.
 *   - Resolves only after onend, rejects on onerror.
 *   - Rejects with a start timeout if onstart does not fire within ~3s.
 *   - Calls onstart callback when speech begins.
 *   - Refuses to speak with a non-Turkish voice.
 *
 * @param {string} text
 * @param {number} rate — speech rate (0.5–2.0)
 * @param {function} [onStart] — called when utterance.onstart fires
 * @returns {Promise<void>}
 */
export function speakRhythmicText(text, rate = 1, onStart = null) {
  return new Promise((resolve, reject) => {
    console.info('[RhythmicHTML TTS] Button click received')

    if (!('speechSynthesis' in window)) {
      console.info('[RhythmicHTML TTS] speechSynthesis not supported')
      reject(new Error('Tarayıcı sesli okuma desteklemiyor.'))
      return
    }

    const synth = window.speechSynthesis

    // Use cached voices immediately — no async wait before speak()
    let trVoice = getCachedTurkishVoice()

    if (!trVoice) {
      // Cache may be empty on first use; try a synchronous fetch
      const voices = synth.getVoices()
      if (voices && voices.length > 0) {
        cachedVoices = voices
        trVoice = selectTurkishVoice(voices)
      }
    }

    console.info('[RhythmicHTML TTS] Voice selected:', !!trVoice)
    console.info('[RhythmicHTML TTS] Selected voice name:', trVoice ? trVoice.name : 'none')
    console.info('[RhythmicHTML TTS] Selected voice language:', trVoice ? trVoice.lang : 'none')
    console.info('[RhythmicHTML TTS] Available voices (cached):', cachedVoices.length)

    if (!trVoice) {
      console.info('[RhythmicHTML TTS] No Turkish voice found, not speaking')
      reject(new Error(NO_TURKISH_VOICE_WARNING))
      return
    }

    // Stop any previous active utterance only
    synth.cancel()

    // Resume if the synthesizer is paused (can happen on some browsers)
    if (synth.paused) {
      console.info('[RhythmicHTML TTS] Synth was paused, calling resume()')
      synth.resume()
    }

    console.info('[RhythmicHTML TTS] speaking:', synth.speaking, 'pending:', synth.pending, 'paused:', synth.paused)

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.voice = trVoice
    utterance.lang = trVoice.lang || 'tr-TR'
    utterance.rate = rate
    utterance.pitch = 1
    utterance.volume = 1

    // Preserve utterance in module-level state so it is not GC'd early
    activeUtterance = utterance

    let started = false
    let settled = false

    const startTimer = setTimeout(() => {
      if (!started && !settled) {
        console.info('[RhythmicHTML TTS] Timeout fired — onstart did not occur within', START_TIMEOUT_MS, 'ms')
        console.info('[RhythmicHTML TTS] speaking:', synth.speaking, 'pending:', synth.pending, 'paused:', synth.paused)
        settled = true
        activeUtterance = null
        synth.cancel()
        reject(new Error('Sesli okuma başlatılamadı.'))
      }
    }, START_TIMEOUT_MS)

    utterance.onstart = () => {
      started = true
      clearTimeout(startTimer)
      console.info('[RhythmicHTML TTS] onstart fired')
      console.info('[RhythmicHTML TTS] speaking:', synth.speaking, 'pending:', synth.pending, 'paused:', synth.paused)
      if (onStart) onStart()
    }

    utterance.onend = () => {
      if (settled) return
      settled = true
      clearTimeout(startTimer)
      activeUtterance = null
      console.info('[RhythmicHTML TTS] onend fired')
      console.info('[RhythmicHTML TTS] speaking:', synth.speaking, 'pending:', synth.pending, 'paused:', synth.paused)
      resolve()
    }

    utterance.onerror = (e) => {
      if (settled) return
      settled = true
      clearTimeout(startTimer)
      activeUtterance = null
      console.info('[RhythmicHTML TTS] onerror fired, error:', e.error)
      console.info('[RhythmicHTML TTS] speaking:', synth.speaking, 'pending:', synth.pending, 'paused:', synth.paused)
      reject(new Error('Sesli okuma hatası: ' + (e.error || 'bilinmeyen hata')))
    }

    console.info('[RhythmicHTML TTS] speak() called')
    synth.speak(utterance)
    // Do NOT call cancel() after speak() — it would abort the utterance
  })
}

export function stopSpeech() {
  activeUtterance = null
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

/**
 * Play notes rhythmically using Web Audio API oscillators.
 * Each NoteObject may have a `frequency` field; if missing, skip.
 * Chord notes (isChord=true at same startBeat) play simultaneously.
 *
 * @param {NoteObject[]} notes
 * @param {number} speed — playback speed multiplier (0.5–2.0)
 * @param {function} onNote — callback(note, index) for visual feedback
 * @returns {Promise<void>}
 */
export function playRhythm(notes, speed = 1, onNote = null) {
  return new Promise((resolve) => {
    const ctx = getAudioCtx()
    const tempo = 120
    const beatSeconds = 60 / tempo
    let currentTime = ctx.currentTime + 0.1

    // Build tie chains so tied notes produce one continuous sound
    // instead of separate attacks. buildTieChains returns attacks (notes
    // that start a sound) and chains (groups of tied notes).
    const { attacks } = buildTieChains(notes)

    // Map each note to its chain (if any) so we can compute total duration
    const chainMap = new Map()
    const { chains } = buildTieChains(notes)
    for (const chain of chains) {
      for (const member of chain) {
        chainMap.set(member, chain)
      }
    }

    attacks.forEach((note, i) => {
      const chain = chainMap.get(note)
      const beats = chain ? tieChainBeats(chain) : resolveBeats(note)

      if (!note.frequency || note.isRest) {
        currentTime += beats * beatSeconds / speed
        return
      }

      const duration = beats * beatSeconds / speed
      const startTime = currentTime

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'triangle'
      osc.frequency.value = note.frequency

      gain.gain.setValueAtTime(0, startTime)
      gain.gain.linearRampToValueAtTime(0.3, startTime + 0.02)
      gain.gain.setValueAtTime(0.3, startTime + duration * 0.7)
      gain.gain.linearRampToValueAtTime(0, startTime + duration)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(startTime)
      osc.stop(startTime + duration)

      if (onNote) {
        const delayMs = (startTime - ctx.currentTime) * 1000
        setTimeout(() => onNote(note, i), Math.max(0, delayMs))
      }

      // If this is NOT a chord member, advance time. Chord members share startBeat.
      if (!note.isChord || i === attacks.length - 1 || attacks[i + 1]?.startBeat !== note.startBeat) {
        currentTime += duration
      }
    })

    const totalMs = (currentTime - ctx.currentTime) * 1000
    setTimeout(() => resolve(), Math.max(0, totalMs) + 100)
  })
}

export function stopRhythm() {
  if (audioCtx) {
    audioCtx.close()
    audioCtx = null
  }
}

export function isSpeechSupported() {
  return 'speechSynthesis' in window
}

export function isAudioSupported() {
  return !!(window.AudioContext || window.webkitAudioContext)
}
