// Voice Service — text-to-speech and rhythmic playback using Web Audio API.
//
// Works with NoteObject[] from noteTheory.js (root module) and plain text.

let audioCtx = null

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return audioCtx
}

/**
 * Speak text using SpeechSynthesis API (Turkish).
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

    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'tr-TR'
    utterance.rate = rate
    utterance.pitch = 1
    utterance.volume = 1

    const voices = window.speechSynthesis.getVoices()
    const trVoice = voices.find((v) => v.lang.startsWith('tr'))
    if (trVoice) utterance.voice = trVoice

    utterance.onend = () => resolve()
    utterance.onerror = (e) => reject(new Error('Sesli okuma hatası: ' + e.error))

    window.speechSynthesis.speak(utterance)
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

    notes.forEach((note, i) => {
      if (!note.frequency || note.isRest) {
        currentTime += (note.beats || 1) * beatSeconds / speed
        return
      }

      const duration = (note.beats || 1) * beatSeconds / speed
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
      if (!note.isChord || i === notes.length - 1 || notes[i + 1]?.startBeat !== note.startBeat) {
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
