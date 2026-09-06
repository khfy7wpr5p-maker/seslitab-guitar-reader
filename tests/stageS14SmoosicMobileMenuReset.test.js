import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../experiments/smoosic-mobile/src/mobile-layout.js', import.meta.url), 'utf8')

class FakeElement {
  constructor(selectors = []) {
    this.selectors = new Set(selectors)
  }

  closest(selector) {
    return this.selectors.has(selector) ? this : null
  }
}

function createHarness({ menuOpen = true } = {}) {
  const listeners = new Map()
  const rafCallbacks = []
  const classes = new Set(menuOpen ? ['mobile-menu-open'] : [])
  const menu = { scrollTop: 321, scrollLeft: 19 }
  const body = {
    classList: {
      contains(name) { return classes.has(name) },
      remove(name) { classes.delete(name) },
    },
  }
  const document = {
    body,
    addEventListener(type, handler) { listeners.set(type, handler) },
    getElementById(id) { return id === 'controls-left' ? menu : null },
  }
  const window = {
    innerWidth: 390,
    requestAnimationFrame(callback) {
      rafCallbacks.push(callback)
      return rafCallbacks.length
    },
  }

  vm.runInNewContext(source, { document, window, Element: FakeElement })
  return { listeners, rafCallbacks, classes, menu }
}

test('S14 mobile menu opens at the top and wins a post-layout Safari scroll restoration', () => {
  const harness = createHarness({ menuOpen: true })
  const click = harness.listeners.get('click')
  assert.equal(typeof click, 'function')

  click({ target: new FakeElement(['#mobile-menu-toggle']) })
  assert.equal(harness.menu.scrollTop, 0)
  assert.equal(harness.menu.scrollLeft, 0)
  assert.equal(harness.rafCallbacks.length, 1)

  harness.menu.scrollTop = 144
  harness.menu.scrollLeft = 6
  harness.rafCallbacks[0]()
  assert.equal(harness.menu.scrollTop, 0)
  assert.equal(harness.menu.scrollLeft, 0)
})

test('S14 closing the mobile menu does not force a hidden scroll reset', () => {
  const harness = createHarness({ menuOpen: false })
  harness.listeners.get('click')({ target: new FakeElement(['#mobile-menu-toggle']) })
  assert.equal(harness.menu.scrollTop, 321)
  assert.equal(harness.menu.scrollLeft, 19)
})

test('S14 selecting a left-menu action still closes the off-canvas menu', () => {
  const harness = createHarness({ menuOpen: true })
  harness.listeners.get('click')({ target: new FakeElement(['#controls-left button']) })
  assert.equal(harness.classes.has('mobile-menu-open'), false)
})
