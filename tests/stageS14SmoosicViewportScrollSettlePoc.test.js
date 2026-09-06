import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(
  new URL('../experiments/smoosic-mobile/poc/viewport-fit-scroll-settle.js', import.meta.url),
  'utf8',
)

function createHarness() {
  const parentListeners = new Map()
  const visualViewportListeners = new Map()
  const windowListeners = new Map()
  const rafQueue = []
  const timers = new Map()
  const cssVariables = new Map()
  let nextRafId = 1
  let nextTimerId = 1
  let now = 0
  let frameTop = 220
  let heightWrites = 0
  let minHeightWrites = 0

  const dataset = {}
  let inlineHeight = ''
  let inlineMinHeight = ''
  const style = {}
  Object.defineProperty(style, 'height', {
    get: () => inlineHeight,
    set(value) {
      inlineHeight = String(value)
      heightWrites += 1
    },
  })
  Object.defineProperty(style, 'minHeight', {
    get: () => inlineMinHeight,
    set(value) {
      inlineMinHeight = String(value)
      minHeightWrites += 1
    },
  })

  const frame = {
    dataset,
    style,
    getBoundingClientRect() {
      const height = Number.parseFloat(inlineHeight || '0') || 0
      return { top: frameTop, bottom: frameTop + height, height }
    },
  }
  const menu = {}
  const topBar = { getBoundingClientRect: () => ({ height: 46 }) }
  const header = { getBoundingClientRect: () => ({ bottom: 150 }) }

  const parent = {
    innerWidth: 390,
    innerHeight: 844,
    visualViewport: {
      offsetTop: 0,
      height: 844,
      addEventListener(type, listener) {
        visualViewportListeners.set(type, listener)
      },
    },
    document: {
      querySelector(selector) {
        return selector === '.app-header' ? header : null
      },
    },
    addEventListener(type, listener) {
      parentListeners.set(type, listener)
    },
    requestAnimationFrame(callback) {
      const id = nextRafId++
      rafQueue.push({ id, callback })
      return id
    },
    setTimeout(callback, delay) {
      const id = nextTimerId++
      timers.set(id, { callback, at: now + Number(delay || 0) })
      return id
    },
    clearTimeout(id) {
      timers.delete(id)
    },
  }

  const document = {
    getElementById(id) {
      return id === 'controls-left' ? menu : null
    },
    querySelector(selector) {
      return selector === "[id$='-top-bar']" ? topBar : null
    },
    documentElement: {
      style: {
        setProperty(name, value) {
          cssVariables.set(name, String(value))
        },
      },
    },
  }

  const window = {
    parent,
    frameElement: frame,
    addEventListener(type, listener) {
      windowListeners.set(type, listener)
    },
  }

  function flushRaf() {
    while (rafQueue.length) {
      const batch = rafQueue.splice(0)
      for (const { callback } of batch) callback(now)
    }
  }

  function advance(ms) {
    const target = now + ms
    while (true) {
      let next = null
      for (const [id, timer] of timers) {
        if (timer.at > target) continue
        if (!next || timer.at < next.timer.at) next = { id, timer }
      }
      if (!next) break
      now = next.timer.at
      timers.delete(next.id)
      next.timer.callback()
      flushRaf()
    }
    now = target
  }

  vm.runInNewContext(source, { window, document, console })
  flushRaf()

  return {
    frame,
    parentListeners,
    visualViewportListeners,
    cssVariables,
    flushRaf,
    advance,
    setFrameTop(value) {
      frameTop = value
    },
    metrics() {
      return {
        heightWrites,
        minHeightWrites,
        height: inlineHeight,
        viewportHeight: dataset.seslitabViewportHeight,
        menuTop: dataset.seslitabMenuTop,
        hostOccludedTop: dataset.seslitabHostOccludedTop,
        pendingTimers: timers.size,
      }
    },
  }
}

test('P2 viewport-fit POC keeps iframe height stable during a host scroll burst and resizes once after settle', () => {
  const harness = createHarness()
  assert.equal(harness.metrics().height, '620px')
  assert.equal(harness.metrics().heightWrites, 1)

  for (const top of [180, 120, 60, 20]) {
    harness.setFrameTop(top)
    harness.parentListeners.get('scroll')()
    harness.flushRaf()
    harness.advance(40)
    assert.equal(harness.metrics().heightWrites, 1, `iframe resized before scroll settled at frameTop=${top}`)
  }

  assert.equal(harness.metrics().menuTop, '134')
  assert.equal(harness.metrics().hostOccludedTop, '130')
  assert.equal(harness.metrics().pendingTimers, 1)

  harness.advance(139)
  assert.equal(harness.metrics().heightWrites, 1)

  harness.advance(1)
  assert.equal(harness.metrics().height, '820px')
  assert.equal(harness.metrics().heightWrites, 2)
  assert.equal(harness.metrics().viewportHeight, '820')
})

test('P2 viewport-fit POC skips redundant same-height writes after scroll settle', () => {
  const harness = createHarness()
  harness.setFrameTop(20)
  harness.parentListeners.get('scroll')()
  harness.flushRaf()
  harness.advance(140)
  assert.equal(harness.metrics().heightWrites, 2)

  harness.parentListeners.get('resize')()
  harness.flushRaf()
  assert.equal(harness.metrics().heightWrites, 2)
})

test('P2 viewport-fit POC treats visualViewport scroll like parent scroll but resize remains immediate', () => {
  const harness = createHarness()
  harness.setFrameTop(100)
  harness.visualViewportListeners.get('scroll')()
  harness.flushRaf()
  assert.equal(harness.metrics().heightWrites, 1)
  harness.advance(140)
  assert.equal(harness.metrics().heightWrites, 2)

  harness.setFrameTop(80)
  harness.visualViewportListeners.get('resize')()
  harness.flushRaf()
  assert.equal(harness.metrics().heightWrites, 3)
})
