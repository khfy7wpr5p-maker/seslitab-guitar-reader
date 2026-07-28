// Voice Service — text-to-speech and rhythmic playback using Web Audio API.
//
// Works with NoteObject[] from noteTheory.js (root module) and plain text.

import { resolveBeats, buildTieChains, tieChainBeats } from '../../noteTheory.js'

let audioCtx = null
let activeRhythm = null
let rhythmGeneration = 0

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

/**
 * Convert BPM to milliseconds per beat using the standard formula:
 *   millisecondsPerBeat = 60000 / BPM
 * @param {number} bpm
 * @returns {number}
 */
export function millisecondsPerBeat(bpm) {
  if (!Number.isFinite(bpm) || bpm <= 0) return 60000 / 120
  return 60000 / bpm
}

/**
 * Convert BPM to a speed multiplier relative to 120 BPM baseline.
 * Higher BPM → higher multiplier → faster playback.
 * @param {number} bpm
 * @returns {number}
 */
export function bpmToSpeed(bpm) {
  if (!Number.isFinite(bpm) || bpm <= 0) return 1
  return bpm / 120
}

export function stopSpeech() {
  activeUtterance = null
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

const RHYTHM_LOOKAHEAD_SECONDS = 2
const RHYTHM_SCHEDULER_INTERVAL_MS = 250
const GRACE_NOTE_PLAYBACK_BEATS = 0.125

function sameOnset(first, second) {
  const firstMeasure = first.measureKey ?? first.measureNumber ?? first.measure
  const secondMeasure = second.measureKey ?? second.measureNumber ?? second.measure
  return firstMeasure === secondMeasure && first.startBeat === second.startBeat
}

/**
 * Build a pure, relative-time playback schedule.
 *
 * Grace notes receive a short audible duration but do not advance the
 * musical cursor. MusicXML chord continuations share the first note's
 * start time. The browser scheduler consumes this plan in small windows,
 * so long scores do not create thousands of Web Audio nodes at once.
 */
export function buildRhythmSchedule(notes, speed = 1, tempo = 120) {
  const safeNotes = Array.isArray(notes) ? notes : []
  const safeSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1
  const safeTempo = Number.isFinite(tempo) && tempo > 0 ? tempo : 120
  const secondsPerBeat = (60 / safeTempo) / safeSpeed
  const { attacks, chains } = buildTieChains(safeNotes)

  const chainMap = new Map()
  for (const chain of chains) {
    for (const member of chain) chainMap.set(member, chain)
  }

  const events = []
  let cursorSeconds = 0
  let latestEndSeconds = 0
  let index = 0

  while (index < attacks.length) {
    const first = attacks[index]
    const group = [{ note: first, index }]
    let nextIndex = index + 1

    while (nextIndex < attacks.length) {
      const next = attacks[nextIndex]
      const isChordContinuation = next.isChordNote === true || (first.isChord && next.isChord)
      if (!isChordContinuation || !sameOnset(first, next)) break
      group.push({ note: next, index: nextIndex })
      nextIndex++
    }

    let groupAdvanceBeats = 0

    for (const entry of group) {
      const { note, index: attackIndex } = entry
      const chain = chainMap.get(note)
      const resolvedBeats = note.isGrace
        ? 0
        : (chain ? tieChainBeats(chain) : resolveBeats(note))
      const safeResolvedBeats = Number.isFinite(resolvedBeats) && resolvedBeats > 0
        ? resolvedBeats
        : 0
      const playbackBeats = note.isGrace
        ? GRACE_NOTE_PLAYBACK_BEATS
        : safeResolvedBeats
      const durationSeconds = playbackBeats * secondsPerBeat
      const audible = (
        !note.isRest &&
        Number.isFinite(note.frequency) &&
        note.frequency > 0 &&
        durationSeconds > 0
      )

      events.push({
        note,
        index: attackIndex,
        startSeconds: cursorSeconds,
        durationSeconds,
        audible,
        isGrace: note.isGrace === true,
      })

      if (!note.isGrace && safeResolvedBeats > groupAdvanceBeats) {
        groupAdvanceBeats = safeResolvedBeats
      }
      latestEndSeconds = Math.max(latestEndSeconds, cursorSeconds + durationSeconds)
    }

    cursorSeconds += groupAdvanceBeats * secondsPerBeat
    latestEndSeconds = Math.max(latestEndSeconds, cursorSeconds)
    index = nextIndex
  }

  return {
    events,
    totalSeconds: latestEndSeconds,
    secondsPerBeat,
  }
}

function scheduleAudioEvent(ctx, absoluteStart, event, onNote, generation) {
  if (!event.audible) return

  const duration = Math.max(0.03, event.durationSeconds)
  const attackDuration = Math.min(0.02, duration * 0.25)
  const sustainEnd = Math.max(absoluteStart + attackDuration, absoluteStart + duration * 0.7)

  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.value = event.note.frequency

    gain.gain.setValueAtTime(0, absoluteStart)
    gain.gain.linearRampToValueAtTime(0.3, absoluteStart + attackDuration)
    gain.gain.setValueAtTime(0.3, sustainEnd)
    gain.gain.linearRampToValueAtTime(0, absoluteStart + duration)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(absoluteStart)
    osc.stop(absoluteStart + duration)
  } catch (error) {
    console.warn('[SesliTab rhythm] Note could not be scheduled:', error)
    return
  }

  if (onNote && activeRhythm?.generation === generation) {
    const delayMs = Math.max(0, (absoluteStart - ctx.currentTime) * 1000)
    const timeoutId = setTimeout(() => {
      activeRhythm?.callbackTimers.delete(timeoutId)
      if (activeRhythm?.generation === generation) {
        onNote(event.note, event.index)
      }
    }, delayMs)
    activeRhythm.callbackTimers.add(timeoutId)
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
  stopRhythm()

  return new Promise((resolve) => {
    const ctx = getAudioCtx()
    const schedule = buildRhythmSchedule(notes, speed)
    const generation = ++rhythmGeneration
    const baseTime = ctx.currentTime + 0.1
    let nextEventIndex = 0

    activeRhythm = {
      generation,
      ctx,
      resolve,
      schedulerTimer: null,
      callbackTimers: new Set(),
      settled: false,
    }

    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx.resume().catch(() => {})
    }

    const finish = () => {
      if (!activeRhythm || activeRhythm.generation !== generation || activeRhythm.settled) return
      activeRhythm.settled = true
      activeRhythm.resolve()
      activeRhythm = null
    }

    const scheduleWindow = () => {
      if (!activeRhythm || activeRhythm.generation !== generation) return

      const horizon = ctx.currentTime + RHYTHM_LOOKAHEAD_SECONDS
      while (nextEventIndex < schedule.events.length) {
        const event = schedule.events[nextEventIndex]
        const absoluteStart = baseTime + event.startSeconds
        if (absoluteStart > horizon) break
        scheduleAudioEvent(ctx, absoluteStart, event, onNote, generation)
        nextEventIndex++
      }

      if (ctx.currentTime >= baseTime + schedule.totalSeconds) {
        finish()
        return
      }

      activeRhythm.schedulerTimer = setTimeout(
        scheduleWindow,
        RHYTHM_SCHEDULER_INTERVAL_MS
      )
    }

    scheduleWindow()
  })
}

export function stopRhythm() {
  rhythmGeneration++

  if (activeRhythm) {
    if (activeRhythm.schedulerTimer) clearTimeout(activeRhythm.schedulerTimer)
    for (const timeoutId of activeRhythm.callbackTimers) clearTimeout(timeoutId)
    if (!activeRhythm.settled) {
      activeRhythm.settled = true
      activeRhythm.resolve()
    }
    activeRhythm = null
  }

  if (audioCtx) {
    const contextToClose = audioCtx
    audioCtx = null
    const closeResult = contextToClose.close()
    if (closeResult && typeof closeResult.catch === 'function') {
      closeResult.catch(() => {})
    }
  }
}

export function isSpeechSupported() {
  return 'speechSynthesis' in window
}

export function isAudioSupported() {
  return !!(window.AudioContext || window.webkitAudioContext)
}
