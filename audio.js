// Reusable Web Audio note player for SesliTab.
// Plays plucked-guitar-like tones with per-note durations.

let audioCtx = null
let playTimeouts = []

function ensureAudioContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return null
    audioCtx = new Ctx()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

// Play a single note with a plucked-string-like timbre.
// duration is in seconds.
function playNote(ctx, freq, startAt, duration) {
  const osc = ctx.createOscillator()
  const osc2 = ctx.createOscillator()
  const gain = ctx.createGain()
  const filter = ctx.createBiquadFilter()

  osc.type = 'triangle'
  osc.frequency.value = freq
  osc2.type = 'sine'
  osc2.frequency.value = freq * 2

  filter.type = 'lowpass'
  filter.frequency.value = Math.min(freq * 6, 4000)
  filter.Q.value = 0.7

  const peak = 0.25
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)

  osc.connect(filter)
  osc2.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)

  osc.start(startAt)
  osc2.start(startAt)
  osc.stop(startAt + duration + 0.05)
  osc2.stop(startAt + duration + 0.05)
}

export function stopNotePlayback() {
  for (const t of playTimeouts) clearTimeout(t)
  playTimeouts = []
  if (audioCtx) {
    audioCtx.close()
    audioCtx = null
  }
}

// Play a sequence of notes. Each note is an array of simultaneous hits
// [{ freq, ... }]. secondsPerBeat converts beats -> seconds.
// onNote(index) is called when each note starts (for UI highlight).
// onEnd() is called when playback finishes.
export function playNotes(notes, secondsPerBeat = 0.5, onNote, onEnd) {
  const ctx = ensureAudioContext()
  if (!ctx) return false
  stopNotePlayback()
  // ensure fresh ctx after potential close
  const freshCtx = ensureAudioContext()
  const startAt = freshCtx.currentTime + 0.05

  notes.forEach((hits, index) => {
    const beats = hits.__beats || 1
    const dur = beats * secondsPerBeat
    const t = startAt + (hits.__startBeat || 0) * secondsPerBeat
    for (const h of hits) {
      if (h.freq) playNote(freshCtx, h.freq, t, dur)
    }
    const delayMs = (t - freshCtx.currentTime) * 1000
    const tid = setTimeout(() => {
      if (onNote) onNote(index)
    }, Math.max(0, delayMs))
    playTimeouts.push(tid)
  })

  // Compute total duration
  let totalBeats = 0
  notes.forEach((hits) => {
    totalBeats = Math.max(totalBeats, (hits.__startBeat || 0) + (hits.__beats || 1))
  })
  const totalMs = totalBeats * secondsPerBeat * 1000 + 250
  const endTid = setTimeout(() => {
    if (onEnd) onEnd()
    playTimeouts = []
  }, Math.max(0, totalMs))
  playTimeouts.push(endTid)
  return true
}

// Play notes where each note carries its own duration in beats.
// notes: [{ hits: [{freq}], beats: number }]
export function playNoteSequence(notes, secondsPerBeat, onNote, onEnd) {
  const ctx = ensureAudioContext()
  if (!ctx) return false
  stopNotePlayback()
  const freshCtx = ensureAudioContext()
  const startAt = freshCtx.currentTime + 0.05
  let cursor = 0

  notes.forEach((note, index) => {
    const beats = note.beats || 1
    const t = startAt + cursor * secondsPerBeat
    const dur = beats * secondsPerBeat
    for (const h of note.hits) {
      if (h.freq) playNote(freshCtx, h.freq, t, dur)
    }
    const delayMs = (t - freshCtx.currentTime) * 1000
    const tid = setTimeout(() => {
      if (onNote) onNote(index)
    }, Math.max(0, delayMs))
    playTimeouts.push(tid)
    cursor += beats
  })

  const totalMs = cursor * secondsPerBeat * 1000 + 250
  const endTid = setTimeout(() => {
    if (onEnd) onEnd()
    playTimeouts = []
  }, Math.max(0, totalMs))
  playTimeouts.push(endTid)
  return true
}

// Play a single metronome click.
function playClick(ctx, startAt, accent) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'square'
  osc.frequency.value = accent ? 1500 : 1000
  const peak = accent ? 0.15 : 0.08
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.05)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(startAt)
  osc.stop(startAt + 0.06)
}

// Play notes with metronome clicks synchronized to the beat.
// notes: [{ hits: [{freq}], beats, startBeat }]
// beatsPerMeasure: number of beats per measure (e.g. 4)
// secondsPerBeat: seconds per beat
// onNote(index) and onEnd() are callbacks.
export function playWithMetronome(notes, beatsPerMeasure, secondsPerBeat, onNote, onEnd) {
  const ctx = ensureAudioContext()
  if (!ctx) return false
  stopNotePlayback()
  const freshCtx = ensureAudioContext()
  const startAt = freshCtx.currentTime + 0.1

  // Compute total beats from notes
  let totalBeats = 0
  for (const n of notes) {
    const endBeat = (n.startBeat || 0) + (n.beats || 1)
    if (endBeat > totalBeats) totalBeats = endBeat
  }
  // Round up to full measures
  const totalMeasures = Math.ceil(totalBeats / beatsPerMeasure)
  const metronomeBeats = totalMeasures * beatsPerMeasure

  // Schedule metronome clicks
  for (let b = 0; b < metronomeBeats; b++) {
    const t = startAt + b * secondsPerBeat
    const accent = b % beatsPerMeasure === 0
    playClick(freshCtx, t, accent)
  }

  // Schedule notes
  notes.forEach((note, index) => {
    const beats = note.beats || 1
    const startBeat = note.startBeat || 0
    const t = startAt + startBeat * secondsPerBeat
    const dur = beats * secondsPerBeat
    for (const h of note.hits) {
      if (h.freq) playNote(freshCtx, h.freq, t, dur)
    }
    const delayMs = (t - freshCtx.currentTime) * 1000
    const tid = setTimeout(() => {
      if (onNote) onNote(index)
    }, Math.max(0, delayMs))
    playTimeouts.push(tid)
  })

  const totalMs = metronomeBeats * secondsPerBeat * 1000 + 250
  const endTid = setTimeout(() => {
    if (onEnd) onEnd()
    playTimeouts = []
  }, Math.max(0, totalMs))
  playTimeouts.push(endTid)
  return true
}
