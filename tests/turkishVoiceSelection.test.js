import { test, describe, beforeEach, afterEach } from 'node:test'
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
