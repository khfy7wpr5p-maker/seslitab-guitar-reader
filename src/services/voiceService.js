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
 * Speak text using SpeechSynthesis API (Turkish).
 * Loads voices first, selects a Turkish voice explicitly, and refuses
 * to speak with a non-Turkish voice. Rejects with NO_TURKISH_VOICE_WARNING
 * when no Turkish voice is available.
 * @param {string} text
 * @param {number} rate — speech rate (0.5–2.0)
 * @returns {Promise<void>}
 */
export function speakRhythmicText(text, rate = 1) {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      reject(new Error('Tarayıcı sesli okuma desteklemiyor.'))
      return
    }

    const synth = window.speechSynthesis
    synth.cancel()

    loadVoices(synth).then((voices) => {
      const trVoice = selectTurkishVoice(voices)
      const turkishFound = !!trVoice

      // Temporary diagnostic information
      console.info('[RhythmicHTML TTS] Available voices:', voices.length)
      console.info('[RhythmicHTML TTS] Turkish voice found:', turkishFound)
      console.info('[RhythmicHTML TTS] Selected voice name:', trVoice ? trVoice.name : 'none')
      console.info('[RhythmicHTML TTS] Selected voice language:', trVoice ? trVoice.lang : 'none')

      if (!trVoice) {
        reject(new Error(NO_TURKISH_VOICE_WARNING))
        return
      }

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.voice = trVoice
      utterance.lang = trVoice.lang || 'tr-TR'
      utterance.rate = rate
      utterance.pitch = 1
      utterance.volume = 1

      utterance.onend = () => resolve()
      utterance.onerror = (e) => reject(new Error('Sesli okuma hatası: ' + e.error))

      synth.speak(utterance)
    })
  })
}

export function stopSpeech() {
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
