import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(
  new URL('../experiments/smoosic-mobile/public/viewport-fit.js', import.meta.url),
  'utf8',
)

function createHarness() {
  const parentListeners = new Map()
  const visualViewportListeners = new Map()
  const documentListeners = new Map()
  const rafQueue = []
  const timers = new Map()
  const cssVariables = new Map()
  let nextRafId = 1
  let nextTimerId = 1
  let now = 0
  let frameTop = 220
  let heightWrites = 0
  let minHeightWrites = 0
  let heightRemovals = 0
  let minHeightRemovals = 0

  const dataset = {}
  let inlineHeight = ''
  let inlineMinHeight = ''
  const style = {
    removeProperty(name) {
      if (name === 'height') {
        inlineHeight = ''
        heightRemovals += 1
      }
      if (name === 'min-height') {
        inlineMinHeight = ''
        minHeightRemovals += 1
      }
    },
  }
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
    cancelAnimationFrame(id) {
      const index = rafQueue.findIndex((entry) => entry.id === id)
      if (index >= 0) rafQueue.splice(index, 1)
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
    addEventListener(type, listener) {
      documentListeners.set(type, listener)
    },
    documentElement: {
      style: {
        setProperty(name, value) {
          cssVariables.set(name, String(value))
        },
        removeProperty(name) {
          cssVariables.delete(name)
        },
      },
    },
  }

  class Element {
    constructor(selector = '') {
      this.selector = selector
    }

    closest(selector) {
      return selector === this.selector ? this : null
    }
  }

  class MutationObserver {
    observe() {}
    disconnect() {}
  }

  const window = {
    parent,
    frameElement: frame,
    addEventListener() {},
  }

  function flushRaf() {
    while (rafQueue.length) {
      const batch = rafQueue.splice(0)
      for (const { callback } of batch) callback(now)
    }
  }

  function advanceTimers(ms, flushAnimationFrames) {
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
      if (flushAnimationFrames) flushRaf()
    }
    now = target
  }

  function advance(ms) {
    advanceTimers(ms, true)
  }

  function advanceTimersOnly(ms) {
    advanceTimers(ms, false)
  }

  vm.runInNewContext(source, { window, document, Element, MutationObserver, console })
  flushRaf()
  advance(0)

  return {
    parent,
    parentListeners,
    visualViewportListeners,
    documentListeners,
    cssVariables,
    flushRaf,
    advance,
    advanceTimersOnly,
    setFrameTop(value) {
      frameTop = value
    },
    clickMenu() {
      documentListeners.get('click')?.({ target: new Element('#mobile-menu-toggle') })
    },
    metrics() {
      return {
        heightWrites,
        minHeightWrites,
        heightRemovals,
        minHeightRemovals,
        height: inlineHeight,
        minHeight: inlineMinHeight,
        viewportFit: dataset.seslitabViewportFit,
        viewportHeight: dataset.seslitabViewportHeight,
        menuTop: dataset.seslitabMenuTop,
        hostOccludedTop: dataset.seslitabHostOccludedTop,
        pendingTimers: timers.size,
        pendingRaf: rafQueue.length,
      }
    },
  }
}

test('S14 production viewport fit keeps iframe height stable during scroll and writes once after settle', () => {
  const harness = createHarness()
  assert.equal(harness.metrics().height, '620px')
  assert.equal(harness.metrics().heightWrites, 1)

  for (const [index, top] of [180, 120, 60, 20].entries()) {
    harness.setFrameTop(top)
    harness.parentListeners.get('scroll')()
    harness.flushRaf()
    assert.equal(harness.metrics().heightWrites, 1, `iframe resized during scroll at frameTop=${top}`)
    if (index < 3) harness.advance(40)
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

test('S14 production viewport fit applies final geometry even if post-timer animation frames are not serviced', () => {
  const harness = createHarness()
  harness.setFrameTop(20)
  harness.parentListeners.get('scroll')()
  harness.flushRaf()

  harness.advanceTimersOnly(139)
  assert.equal(harness.metrics().heightWrites, 1)
  harness.advanceTimersOnly(1)
  assert.equal(harness.metrics().height, '820px')
  assert.equal(harness.metrics().heightWrites, 2)
})

test('S14 production viewport fit skips redundant height writes after settle and menu clicks', () => {
  const harness = createHarness()
  harness.setFrameTop(20)
  harness.parentListeners.get('scroll')()
  harness.flushRaf()
  harness.advance(140)
  assert.equal(harness.metrics().heightWrites, 2)

  harness.parentListeners.get('resize')()
  harness.flushRaf()
  assert.equal(harness.metrics().heightWrites, 2)

  harness.clickMenu()
  harness.flushRaf()
  assert.equal(harness.metrics().heightWrites, 2)
})

test('S14 production viewport fit coalesces visualViewport motion and parent resize while scroll is active', () => {
  const harness = createHarness()
  harness.setFrameTop(100)
  harness.visualViewportListeners.get('scroll')()
  harness.flushRaf()
  assert.equal(harness.metrics().heightWrites, 1)

  harness.advance(60)
  harness.setFrameTop(80)
  harness.visualViewportListeners.get('resize')()
  harness.flushRaf()
  harness.parentListeners.get('resize')()
  harness.flushRaf()
  assert.equal(harness.metrics().heightWrites, 1)

  harness.advance(139)
  assert.equal(harness.metrics().heightWrites, 1)
  harness.advance(1)
  assert.equal(harness.metrics().height, '760px')
  assert.equal(harness.metrics().heightWrites, 2)

  harness.setFrameTop(60)
  harness.parentListeners.get('resize')()
  harness.flushRaf()
  assert.equal(harness.metrics().height, '780px')
  assert.equal(harness.metrics().heightWrites, 3)
})

test('S14 production viewport fit restores desktop cleanup and can re-enter mobile mode', () => {
  const harness = createHarness()
  assert.equal(harness.metrics().height, '620px')
  assert.equal(harness.cssVariables.has('--seslitab-mobile-menu-top'), true)

  harness.parent.innerWidth = 1024
  harness.parentListeners.get('resize')()
  harness.flushRaf()

  assert.equal(harness.metrics().height, '')
  assert.equal(harness.metrics().minHeight, '')
  assert.equal(harness.metrics().viewportFit, undefined)
  assert.equal(harness.metrics().viewportHeight, undefined)
  assert.equal(harness.metrics().menuTop, undefined)
  assert.equal(harness.metrics().hostOccludedTop, undefined)
  assert.equal(harness.cssVariables.has('--seslitab-mobile-menu-top'), false)
  assert.equal(harness.metrics().heightRemovals, 1)
  assert.equal(harness.metrics().minHeightRemovals, 1)

  harness.parent.innerWidth = 390
  harness.parentListeners.get('resize')()
  harness.flushRaf()
  assert.equal(harness.metrics().height, '620px')
  assert.equal(harness.metrics().viewportFit, 'mobile')
})
