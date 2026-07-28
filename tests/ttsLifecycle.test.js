import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { resetVoiceCache } from '../src/services/voiceService.js'

function makeVoice(name, lang) {
  return { name, lang, voiceURI: name, default: false, localService: false, queueLength: 0 }
}

/**
 * Set up a mocked speechSynthesis environment on global.window.
 * Returns helper handles to fire events and inspect state.
 */
function mockSpeechEnv({ voices, startDelayMs = 5, endDelayMs = 10 } = {}) {
  const state = {
    speaking: false,
    pending: false,
    paused: false,
    cancelled: false,
    speakCalls: [],
    cancelCalls: 0,
    resumeCalls: 0,
    listeners: {},
  }

  const MockUtterance = class {
    constructor(text) {
      this.text = text
      this.voice = null
      this.lang = ''
      this.rate = 1
      this.pitch = 1
      this.volume = 1
      this.onstart = null
      this.onend = null
      this.onerror = null
      this._state = state
      state.speakCalls.push(this)
    }
  }

  global.SpeechSynthesisUtterance = MockUtterance

  global.window = {
    speechSynthesis: {
      getVoices: () => voices,
      cancel: () => {
        state.cancelCalls++
        state.cancelled = true
        state.speaking = false
        state.pending = false
      },
      speak: (u) => {
        state.speaking = true
        state.pending = false
        state.cancelled = false
        // Fire onstart after startDelay, then onend after endDelay
        setTimeout(() => {
          if (state.cancelled) return
          state.speaking = true
          if (u.onstart) u.onstart()
          setTimeout(() => {
            if (state.cancelled) return
            state.speaking = false
            if (u.onend) u.onend()
          }, endDelayMs)
        }, startDelayMs)
      },
      resume: () => {
        state.resumeCalls++
        state.paused = false
      },
      addEventListener: (event, handler) => {
        state.listeners[event] = state.listeners[event] || []
        state.listeners[event].push(handler)
      },
      removeEventListener: (event, handler) => {
        if (state.listeners[event]) {
          state.listeners[event] = state.listeners[event].filter((h) => h !== handler)
        }
      },
      get speaking() { return state.speaking },
      get pending() { return state.pending },
      get paused() { return state.paused },
    },
  }

  return state
}

afterEach(() => {
  delete global.SpeechSynthesisUtterance
  delete global.window
})

beforeEach(() => {
  resetVoiceCache()
})

describe('TTS lifecycle: completion not shown immediately after speak()', () => {
  test('Promise does not resolve immediately after speak() is called', async () => {
    const state = mockSpeechEnv({ voices: [makeVoice('Tolga', 'tr-TR')], startDelayMs: 50, endDelayMs: 50 })
    const { speakRhythmicText } = await import('../src/services/voiceService.js')

    let resolved = false
    const promise = speakRhythmicText('birinci tel açık tel, Mi notası', 1).then(() => {
      resolved = true
    })

    // speak() has been called; promise should not be resolved yet
    assert.equal(state.speakCalls.length, 1)
    assert.equal(resolved, false)

    await promise
    assert.equal(resolved, true)
  })
})

describe('TTS lifecycle: completion shown only after onend', () => {
  test('Promise resolves only after onend fires', async () => {
    const state = mockSpeechEnv({ voices: [makeVoice('Tolga', 'tr-TR')], startDelayMs: 5, endDelayMs: 30 })
    const { speakRhythmicText } = await import('../src/services/voiceService.js')

    let resolved = false
    let resolvedAfterEnd = false
    const promise = speakRhythmicText('test', 1).then(() => {
      resolved = true
      resolvedAfterEnd = !state.speaking
    })

    await promise
    assert.equal(resolved, true)
    assert.equal(resolvedAfterEnd, true, 'should resolve after speaking has stopped')
    assert.equal(state.speaking, false)
  })
})

describe('TTS lifecycle: "Sesli okunuyor" shown after onstart', () => {
  test('onStart callback fires when utterance.onstart fires', async () => {
    mockSpeechEnv({ voices: [makeVoice('Tolga', 'tr-TR')], startDelayMs: 5, endDelayMs: 10 })
    const { speakRhythmicText } = await import('../src/services/voiceService.js')

    let started = false
    await speakRhythmicText('test', 1, () => {
      started = true
    })
    assert.equal(started, true, 'onStart callback should fire after onstart')
  })
})

describe('TTS lifecycle: onerror produces error state instead of completion', () => {
  test('Promise rejects when onerror fires', async () => {
    const state = mockSpeechEnv({ voices: [makeVoice('Tolga', 'tr-TR')], startDelayMs: 5 })
    const { speakRhythmicText } = await import('../src/services/voiceService.js')

    // Override speak to fire onerror instead of onstart
    global.window.speechSynthesis.speak = (u) => {
      state.speaking = true
      setTimeout(() => {
        if (u.onerror) u.onerror({ error: 'synthesis-failed' })
      }, 5)
    }

    await assert.rejects(
      () => speakRhythmicText('test', 1),
      (err) => err.message.includes('Sesli okuma hatası'),
    )
  })

  test('Promise does not resolve when onerror fires', async () => {
    const state = mockSpeechEnv({ voices: [makeVoice('Tolga', 'tr-TR')], startDelayMs: 5 })
    const { speakRhythmicText } = await import('../src/services/voiceService.js')

    let resolved = false
    global.window.speechSynthesis.speak = (u) => {
      state.speaking = true
      setTimeout(() => {
        if (u.onerror) u.onerror({ error: 'network' })
      }, 5)
    }

    await assert.rejects(() => speakRhythmicText('test', 1).then(() => { resolved = true }))
    assert.equal(resolved, false, 'promise should not resolve on error')
  })
})

describe('TTS lifecycle: missing onstart causes timeout error', () => {
  test('Rejects with "Sesli okuma başlatılamadı." when onstart never fires', async () => {
    const state = mockSpeechEnv({ voices: [makeVoice('Tolga', 'tr-TR')] })
    const { speakRhythmicText } = await import('../src/services/voiceService.js')

    // Override speak to never fire onstart
    global.window.speechSynthesis.speak = () => {
      state.speaking = true
      state.pending = true
      // never fire onstart or onend
    }

    await assert.rejects(
      () => speakRhythmicText('test', 1),
      (err) => err.message === 'Sesli okuma başlatılamadı.',
    )
  })
})

describe('TTS lifecycle: no Turkish voice produces Turkish warning', () => {
  test('Rejects with Turkish warning and does not speak', async () => {
    const state = mockSpeechEnv({ voices: [makeVoice('Google US English', 'en-US')] })
    const { speakRhythmicText } = await import('../src/services/voiceService.js')

    await assert.rejects(
      () => speakRhythmicText('test', 1),
      (err) => err.message === 'Bu cihazda Türkçe ses bulunamadı.',
    )
    assert.equal(state.speakCalls.length, 0, 'no utterance should be created')
    assert.equal(state.cancelCalls, 0, 'cancel should not be called when no voice')
  })
})

describe('TTS lifecycle: selected Turkish voice assigned directly to utterance', () => {
  test('utterance.voice and utterance.lang set to selected Turkish voice', async () => {
    const voices = [makeVoice('Tolga', 'tr-TR'), makeVoice('Google English', 'en-US')]
    const state = mockSpeechEnv({ voices, startDelayMs: 5, endDelayMs: 10 })
    const { speakRhythmicText } = await import('../src/services/voiceService.js')

    await speakRhythmicText('test', 1)
    assert.equal(state.speakCalls.length, 1)
    assert.equal(state.speakCalls[0].voice.name, 'Tolga')
    assert.equal(state.speakCalls[0].voice.lang, 'tr-TR')
    assert.equal(state.speakCalls[0].lang, 'tr-TR')
  })

  test('utterance.voice set to tr-CY voice when tr-TR absent', async () => {
    const voices = [makeVoice('Yelda', 'tr-CY'), makeVoice('Google English', 'en-US')]
    const state = mockSpeechEnv({ voices, startDelayMs: 5, endDelayMs: 10 })
    const { speakRhythmicText } = await import('../src/services/voiceService.js')

    await speakRhythmicText('test', 1)
    assert.equal(state.speakCalls[0].voice.lang, 'tr-CY')
    assert.equal(state.speakCalls[0].lang, 'tr-CY')
  })
})

describe('TTS lifecycle: simplified spoken text remains unchanged', () => {
  test('utterance.text contains simplified Rhythmic HTML text', async () => {
    const state = mockSpeechEnv({ voices: [makeVoice('Tolga', 'tr-TR')], startDelayMs: 5, endDelayMs: 10 })
    const { speakRhythmicText } = await import('../src/services/voiceService.js')

    const expected = 'birinci tel açık tel, Mi notası'
    await speakRhythmicText(expected, 1)
    assert.equal(state.speakCalls[0].text, expected)
  })
})

describe('TTS lifecycle: cancel() called before speak(), resume() when paused', () => {
  test('cancel() called to stop previous utterance before speak()', async () => {
    const state = mockSpeechEnv({ voices: [makeVoice('Tolga', 'tr-TR')], startDelayMs: 5, endDelayMs: 10 })
    const { speakRhythmicText } = await import('../src/services/voiceService.js')

    await speakRhythmicText('test', 1)
    assert.ok(state.cancelCalls >= 1, 'cancel should be called before speak')
  })

  test('resume() called when synth is paused', async () => {
    const state = mockSpeechEnv({ voices: [makeVoice('Tolga', 'tr-TR')], startDelayMs: 5, endDelayMs: 10 })
    state.paused = true
    const { speakRhythmicText } = await import('../src/services/voiceService.js')

    await speakRhythmicText('test', 1)
    assert.ok(state.resumeCalls >= 1, 'resume should be called when paused')
  })
})
