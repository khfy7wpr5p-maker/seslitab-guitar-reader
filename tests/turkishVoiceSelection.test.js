import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { selectTurkishVoice, loadVoices } from '../src/services/voiceService.js'

function makeVoice(name, lang) {
  return { name, lang, voiceURI: name, default: false, localService: false, queueLength: 0 }
}

describe('Turkish voice selection: exact tr-TR match', () => {
  test('selects voice with lang === "tr-TR" first', () => {
    const voices = [
      makeVoice('Google English', 'en-US'),
      makeVoice('Microsoft Tolga', 'tr-TR'),
      makeVoice('Apple Yelda', 'tr-CY'),
    ]
    const selected = selectTurkishVoice(voices)
    assert.equal(selected.name, 'Microsoft Tolga')
    assert.equal(selected.lang, 'tr-TR')
  })

  test('prefers exact tr-TR over tr- prefix', () => {
    const voices = [
      makeVoice('Yelda TR-CY', 'tr-CY'),
      makeVoice('Tolga TR', 'tr-TR'),
    ]
    const selected = selectTurkishVoice(voices)
    assert.equal(selected.lang, 'tr-TR')
  })
})

describe('Turkish voice selection: other Turkish locale tr-CY', () => {
  test('selects tr-CY voice when no tr-TR exists', () => {
    const voices = [
      makeVoice('Google English', 'en-US'),
      makeVoice('Apple Yelda', 'tr-CY'),
    ]
    const selected = selectTurkishVoice(voices)
    assert.equal(selected.name, 'Apple Yelda')
    assert.equal(selected.lang, 'tr-CY')
  })

  test('selects voice whose lang starts with "tr-" but is not tr-TR', () => {
    const voices = [
      makeVoice('Samantha', 'en-US'),
      makeVoice('Cem', 'tr-TR'),
      makeVoice('Zeynep', 'tr-CY'),
    ]
    const selected = selectTurkishVoice(voices)
    assert.equal(selected.lang, 'tr-TR')
  })
})

describe('Turkish voice selection: lang starts with "tr" (no hyphen)', () => {
  test('selects voice whose lang starts with "tr" without hyphen', () => {
    const voices = [
      makeVoice('Anna', 'en-US'),
      makeVoice('Turkish Voice', 'tr'),
    ]
    const selected = selectTurkishVoice(voices)
    assert.equal(selected.name, 'Turkish Voice')
    assert.equal(selected.lang, 'tr')
  })
})

describe('Turkish voice selection: no Turkish voice available', () => {
  test('returns null when only English voices exist', () => {
    const voices = [
      makeVoice('Google US English', 'en-US'),
      makeVoice('Microsoft Zira', 'en-US'),
      makeVoice('Apple Daniel', 'en-GB'),
    ]
    const selected = selectTurkishVoice(voices)
    assert.equal(selected, null)
  })

  test('returns null for empty voice list', () => {
    const selected = selectTurkishVoice([])
    assert.equal(selected, null)
  })

  test('returns null for null/undefined input', () => {
    assert.equal(selectTurkishVoice(null), null)
    assert.equal(selectTurkishVoice(undefined), null)
  })
})

describe('Turkish voice selection: does not pick non-Turkish voice', () => {
  test('does not select an English voice when Turkish is absent', () => {
    const voices = [
      makeVoice('Google US English', 'en-US'),
      makeVoice('Microsoft David', 'en-GB'),
    ]
    const selected = selectTurkishVoice(voices)
    assert.equal(selected, null)
  })
})

describe('Voice loading: synchronous voices', () => {
  test('resolves immediately when getVoices() returns voices', async () => {
    const voices = [makeVoice('Tolga', 'tr-TR')]
    const synth = {
      getVoices: () => voices,
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    const result = await loadVoices(synth)
    assert.equal(result.length, 1)
    assert.equal(result[0].lang, 'tr-TR')
  })
})

describe('Voice loading: asynchronous voices via voiceschanged event', () => {
  test('waits for voiceschanged event when getVoices() is initially empty', async () => {
    let storedVoices = []
    let listeners = {}
    const synth = {
      getVoices: () => storedVoices,
      addEventListener: (event, handler) => {
        listeners[event] = handler
      },
      removeEventListener: (event, handler) => {
        if (listeners[event] === handler) delete listeners[event]
      },
    }

    // Simulate browser async voice load after 10ms
    const promise = loadVoices(synth)
    setTimeout(() => {
      storedVoices = [makeVoice('Tolga', 'tr-TR'), makeVoice('Google English', 'en-US')]
      if (listeners.voiceschanged) listeners.voiceschanged()
    }, 10)

    const result = await promise
    assert.equal(result.length, 2)
    assert.equal(result[0].lang, 'tr-TR')
  })

  test('removes the voiceschanged listener after resolving', async () => {
    let storedVoices = []
    let listeners = {}
    const synth = {
      getVoices: () => storedVoices,
      addEventListener: (event, handler) => {
        listeners[event] = handler
      },
      removeEventListener: (event, handler) => {
        if (listeners[event] === handler) delete listeners[event]
      },
    }

    const promise = loadVoices(synth)
    setTimeout(() => {
      storedVoices = [makeVoice('Tolga', 'tr-TR')]
      if (listeners.voiceschanged) listeners.voiceschanged()
    }, 5)

    await promise
    assert.equal(listeners.voiceschanged, undefined, 'listener should be removed after resolving')
  })
})

describe('Turkish warning: speakRhythmicText rejects when no Turkish voice', () => {
  test('does not start speech with an English voice', async () => {
    const utterances = []
    const voices = [makeVoice('Google US English', 'en-US')]

    global.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text
        this.voice = null
        this.lang = ''
        this.rate = 1
        this.pitch = 1
        this.volume = 1
        this.onend = null
        this.onerror = null
        utterances.push(this)
      }
    }

    global.window = {
      speechSynthesis: {
        getVoices: () => voices,
        cancel: () => {},
        speak: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    }

    const { speakRhythmicText } = await import('../src/services/voiceService.js')

    await assert.rejects(
      () => speakRhythmicText('birinci tel açık tel, Mi notası', 1),
      (err) => err.message === 'Bu cihazda Türkçe ses bulunamadı.',
    )

    // No utterance should have been passed to speak()
    assert.equal(utterances.length, 0, 'no utterance should be created when no Turkish voice exists')
  })

  test('starts speech with selected Turkish voice', async () => {
    const utterances = []
    const voices = [makeVoice('Tolga', 'tr-TR'), makeVoice('Google English', 'en-US')]
    let spokenArg = null

    global.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text
        this.voice = null
        this.lang = ''
        this.rate = 1
        this.pitch = 1
        this.volume = 1
        this.onend = null
        this.onerror = null
        utterances.push(this)
      }
    }

    global.window = {
      speechSynthesis: {
        getVoices: () => voices,
        cancel: () => {},
        speak: (u) => {
          spokenArg = u
          // Simulate successful end
          setTimeout(() => u.onend && u.onend(), 1)
        },
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    }

    const { speakRhythmicText } = await import('../src/services/voiceService.js')

    await speakRhythmicText('birinci tel açık tel, Mi notası', 1)

    assert.equal(utterances.length, 1)
    assert.equal(spokenArg.voice.lang, 'tr-TR')
    assert.equal(spokenArg.lang, 'tr-TR')
    assert.equal(spokenArg.text, 'birinci tel açık tel, Mi notası')
  })

  test('starts speech with tr-CY voice when tr-TR absent', async () => {
    const utterances = []
    const voices = [makeVoice('Yelda', 'tr-CY'), makeVoice('Google English', 'en-US')]
    let spokenArg = null

    global.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text
        this.voice = null
        this.lang = ''
        this.rate = 1
        this.pitch = 1
        this.volume = 1
        this.onend = null
        this.onerror = null
        utterances.push(this)
      }
    }

    global.window = {
      speechSynthesis: {
        getVoices: () => voices,
        cancel: () => {},
        speak: (u) => {
          spokenArg = u
          setTimeout(() => u.onend && u.onend(), 1)
        },
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    }

    const { speakRhythmicText } = await import('../src/services/voiceService.js')

    await speakRhythmicText('birinci tel açık tel, Mi notası', 1)

    assert.equal(spokenArg.voice.lang, 'tr-CY')
    assert.equal(spokenArg.lang, 'tr-CY')
  })
})
