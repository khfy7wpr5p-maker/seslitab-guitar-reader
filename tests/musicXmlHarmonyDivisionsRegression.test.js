import test from 'node:test'
import assert from 'node:assert/strict'

import {
  HARMONY_PARSE_STATE,
  HARMONY_TIMING_STATE,
  extractHarmonyEventsFromDocument,
} from '../musicXmlHarmonyParser.js'

function el(tagName, { text = null, attrs = {}, children = [] } = {}) {
  return {
    tagName,
    children,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null
    },
    get textContent() {
      if (text != null) return String(text)
      return children.map((child) => child.textContent || '').join('')
    },
  }
}

function attributes(divisions, { explicit = true } = {}) {
  return el('attributes', {
    children: explicit ? [el('divisions', { text: divisions })] : [],
  })
}

function harmony(root = 'C', kind = 'major') {
  return el('harmony', {
    children: [
      el('root', { children: [el('root-step', { text: root })] }),
      el('kind', { text: kind }),
    ],
  })
}

function note(duration) {
  return el('note', { children: [el('duration', { text: duration })] })
}

function measure(number, children) {
  return el('measure', { attrs: { number: String(number) }, children })
}

function docWithMeasures(measures) {
  return {
    documentElement: el('score-partwise', {
      children: [el('part', { attrs: { id: 'P1' }, children: measures })],
    }),
    querySelector() {
      return null
    },
  }
}

test('Package 6 review regression: divisions change preserves accumulated beat position', () => {
  const result = extractHarmonyEventsFromDocument(docWithMeasures([
    measure(1, [
      attributes(4),
      note(4),
      attributes(8),
      harmony('G', 'dominant'),
    ]),
  ]))

  assert.equal(result.state, HARMONY_PARSE_STATE.PARSED)
  assert.equal(result.harmonies.length, 1)
  assert.equal(result.harmonies[0].symbol, 'G7')
  assert.equal(result.harmonies[0].divisions, 8)
  assert.equal(result.harmonies[0].startBeat, 1)
  assert.equal(result.harmonies[0].startDivisions, 8)
  assert.equal(result.harmonies[0].timingState, HARMONY_TIMING_STATE.MEASURED)
})

test('Package 6 review regression: malformed explicit divisions invalidates stale inherited timing', () => {
  for (const malformed of ['', 'not-a-number']) {
    const result = extractHarmonyEventsFromDocument(docWithMeasures([
      measure(1, [attributes(4), harmony('C', 'major')]),
      measure(2, [attributes(malformed), harmony('F', 'major')]),
    ]))

    assert.equal(result.state, HARMONY_PARSE_STATE.REVIEW_REQUIRED)
    assert.equal(result.harmonies.length, 2)
    assert.equal(result.harmonies[0].timingState, HARMONY_TIMING_STATE.MEASURED)
    assert.equal(result.harmonies[1].symbol, 'F')
    assert.equal(result.harmonies[1].divisions, null)
    assert.equal(result.harmonies[1].startBeat, null)
    assert.equal(result.harmonies[1].startDivisions, null)
    assert.equal(result.harmonies[1].timingState, HARMONY_TIMING_STATE.REVIEW_REQUIRED)
  }
})

test('Package 6 review regression: ordinary timed note without divisions poisons measure timing', () => {
  const result = extractHarmonyEventsFromDocument(docWithMeasures([
    measure(1, [note(4), attributes(4), harmony('C', 'major')]),
  ]))

  assert.equal(result.state, HARMONY_PARSE_STATE.REVIEW_REQUIRED)
  assert.equal(result.harmonies[0].symbol, 'C')
  assert.equal(result.harmonies[0].startBeat, null)
  assert.equal(result.harmonies[0].timingState, HARMONY_TIMING_STATE.REVIEW_REQUIRED)
})
