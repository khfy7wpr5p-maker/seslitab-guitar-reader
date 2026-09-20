import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { parseDoubleQuotedXmlAttributes } from '../scripts/simpleXmlAttributes.js'

describe('linear MiniDOM XML attribute parser', () => {
  test('parses the existing double-quoted ASCII-name contract', () => {
    assert.deepEqual(
      parseDoubleQuotedXmlAttributes(' id = "P1" default-x="12.5" type = "start" '),
      { id: 'P1', 'default-x': '12.5', type: 'start' }
    )
  })

  test('empty values and duplicate names preserve last-value-wins behavior', () => {
    assert.deepEqual(
      parseDoubleQuotedXmlAttributes('name="" name="final"'),
      { name: 'final' }
    )
  })

  test('very long whitespace remains bounded and deterministic', () => {
    const gap = ' '.repeat(50000)
    assert.deepEqual(
      parseDoubleQuotedXmlAttributes(`id${gap}=${gap}"P1"${gap}type${gap}=${gap}"stop"`),
      { id: 'P1', type: 'stop' }
    )
  })
})
