import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  clearPackage3Notes,
  publishPackage3Notes,
  selectPackage3MeasureKey,
  subscribePackage3Measures,
} from '../package3MeasureBridge.js'

const css = readFileSync(new URL('../src/stagePrCKeypad.css', import.meta.url), 'utf8')
const keypadSource = readFileSync(new URL('../src/stagePrCKeypadUi.js', import.meta.url), 'utf8')

test('STI-17 repeated same-measure selection does not republish an identical measure-only snapshot', () => {
  clearPackage3Notes()
  const notes = Object.freeze([
    Object.freeze({ measureKey: 'P1:1' }),
  ])
  publishPackage3Notes(notes)

  let notifications = 0
  const unsubscribe = subscribePackage3Measures(() => { notifications += 1 })
  notifications = 0

  assert.equal(selectPackage3MeasureKey('P1:1'), true)
  assert.equal(notifications, 1)

  notifications = 0
  assert.equal(selectPackage3MeasureKey('P1:1'), true)
  assert.equal(notifications, 0)

  unsubscribe()
  clearPackage3Notes()
})

test('STI-17 serialized edit remains disabled without the severe 45-percent busy fade', () => {
  assert.match(keypadSource, /shell\.dataset\.productSyncPending\s*=\s*productSyncPending\s*\?\s*'true'\s*:\s*'false'/)
  assert.match(keypadSource, /button\.disabled\s*=\s*!action\.enabled/)
  assert.match(css, /\.stage-prc-keypad-action:disabled,[\s\S]*?opacity:\s*0\.45/)
  assert.match(css, /data-product-sync-pending='true'[\s\S]*?opacity:\s*0\.82/)
})
