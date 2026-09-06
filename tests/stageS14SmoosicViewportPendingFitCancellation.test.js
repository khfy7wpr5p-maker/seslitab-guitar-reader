import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('../experiments/smoosic-mobile/public/viewport-fit.js', import.meta.url),
  'utf8',
)

function functionBody(name) {
  const match = source.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n  \\}`))
  assert.ok(match, `${name} must exist`)
  return match[1]
}

test('S14 viewport motion cancels a queued frame fit before deferring resize to settle', () => {
  const body = functionBody('scheduleViewportMotionFit')
  const cancelIndex = body.indexOf('cancelScheduledFrameFit(parent)')
  const settleIndex = body.indexOf('scheduleSettledFrameFit()')

  assert.ok(cancelIndex >= 0, 'viewport motion must cancel a queued frame fit')
  assert.ok(settleIndex >= 0, 'viewport motion must schedule the settled fit')
  assert.ok(cancelIndex < settleIndex, 'queued frame fit must be cancelled before settle scheduling')
})

test('S14 queued frame fit cancellation clears the RAF token after cancellation', () => {
  const body = functionBody('cancelScheduledFrameFit')
  assert.match(body, /parent\.cancelAnimationFrame\(scheduledFrame\)/)
  assert.match(body, /scheduledFrame = 0/)
})
