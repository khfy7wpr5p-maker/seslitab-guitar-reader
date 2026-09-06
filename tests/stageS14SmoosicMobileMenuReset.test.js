import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../experiments/smoosic-mobile/src/mobile-layout.js', import.meta.url), 'utf8')

class FakeElement {
  constructor(selectors = []) {
    this.selectors = new Set(selectors)
    this.blurred = false
    this.clicked = false
  }

  closest(selector) {
    return this.selectors.has(selector) ? this : null
  }

  blur() {
    this.blurred = true
  }

  click() {
    this.clicked = true
  }
}

class FakeKeyboardEvent {
  constructor(type, options = {}) {
    this.type = type
    Object.assign(this, options)
  }
}

function createHarness({ menuOpen = true, activeElement = null, openOverlay = null } = {}) {
  const listeners = new Map()
  const rafCallbacks = []
  const timerCallbacks = []
  const dispatchedEvents = []
  const classes = new Set(menuOpen ? ['mobile-menu-open'] : [])
  const menuHome = {
    children: [],
    appendChild(child) {
      child.parentElement = this
      if (!this.children.includes(child)) this.children.push(child)
      return child
    },
  }
  const menu = {
    scrollTop: 321,
    scrollLeft: 19,
    parentElement: menuHome,
    descendants: new Set(),
    contains(element) {
      return this.descendants.has(element)
    },
  }
  menuHome.children.push(menu)
  const body = {
    children: [],
    classList: {
      contains(name) { return classes.has(name) },
      remove(name) { classes.delete(name) },
    },
    appendChild(child) {
      child.parentElement = this
      if (!this.children.includes(child)) this.children.push(child)
      return child
    },
    dispatchEvent(event) {
      dispatchedEvents.push(event)
      return true
    },
  }
  const document = {
    body,
    activeElement,
    addEventListener(type, handler) { listeners.set(type, handler) },
    getElementById(id) { return id === 'controls-left' ? menu : null },
    querySelector(selector) {
      return selector === '.modal.show, .menuContainer .menuElement.show' ? openOverlay : null
    },
  }
  const window = {
    innerWidth: 390,
    requestAnimationFrame(callback) {
      rafCallbacks.push(callback)
      return rafCallbacks.length
    },
    setTimeout(callback) {
      timerCallbacks.push(callback)
      return timerCallbacks.length
    },
    addEventListener(type, handler) { listeners.set(`window:${type}`, handler) },
  }

  vm.runInNewContext(source, {
    document,
    window,
    Element: FakeElement,
    KeyboardEvent: FakeKeyboardEvent,
  })
  return {
    listeners,
    rafCallbacks,
    timerCallbacks,
    dispatchedEvents,
    classes,
    menu,
    menuHome,
    body,
    window,
    document,
  }
}

test('S14 mobile menu is portaled to body before opening so Safari ancestors cannot clip it', () => {
  const harness = createHarness({ menuOpen: true })
  const click = harness.listeners.get('click')
  assert.equal(typeof click, 'function')
  assert.equal(harness.menu.parentElement, harness.menuHome)

  click({ target: new FakeElement(['#mobile-menu-toggle']) })
  assert.equal(harness.menu.parentElement, harness.body)
})

test('S14 bottom Menu trigger dismisses an open Smoosic overlay through its cancel action', () => {
  const cancel = new FakeElement()
  const overlay = {
    querySelector(selector) {
      return selector.includes('[data-value="cancel"]') ? cancel : null
    },
  }
  const harness = createHarness({ menuOpen: true, openOverlay: overlay })

  harness.listeners.get('click')({ target: new FakeElement(['#mobile-menu-toggle']) })
  assert.equal(cancel.clicked, true)
  assert.equal(harness.dispatchedEvents.length, 0)
  assert.equal(harness.menu.parentElement, harness.body)
})

test('S14 bottom Menu trigger falls back to Escape when an open overlay has no cancel control', () => {
  const overlay = { querySelector() { return null } }
  const harness = createHarness({ menuOpen: true, openOverlay: overlay })

  harness.listeners.get('click')({ target: new FakeElement(['#mobile-menu-toggle']) })
  assert.equal(harness.dispatchedEvents.length, 1)
  assert.equal(harness.dispatchedEvents[0].type, 'keydown')
  assert.equal(harness.dispatchedEvents[0].key, 'Escape')
})

test('S14 mobile menu clears retained iOS focus and wins late Safari scroll restoration', () => {
  const retainedButton = new FakeElement(['#controls-left button'])
  const harness = createHarness({ menuOpen: true, activeElement: retainedButton })
  harness.menu.descendants.add(retainedButton)
  const click = harness.listeners.get('click')

  click({ target: new FakeElement(['#mobile-menu-toggle']) })
  assert.equal(retainedButton.blurred, true)
  assert.equal(harness.menu.scrollTop, 0)
  assert.equal(harness.menu.scrollLeft, 0)
  assert.equal(harness.rafCallbacks.length >= 1, true)
  assert.equal(harness.timerCallbacks.length >= 1, true)

  harness.menu.scrollTop = 144
  harness.menu.scrollLeft = 6
  harness.rafCallbacks.shift()()
  assert.equal(harness.menu.scrollTop, 0)
  assert.equal(harness.menu.scrollLeft, 0)

  harness.menu.scrollTop = 212
  harness.menu.scrollLeft = 9
  harness.timerCallbacks.at(-1)()
  assert.equal(harness.menu.scrollTop, 0)
  assert.equal(harness.menu.scrollLeft, 0)
})

test('S14 closing a menu action blurs the retained item and resets hidden scroll state', () => {
  const target = new FakeElement(['#controls-left button'])
  const harness = createHarness({ menuOpen: true, activeElement: target })
  harness.menu.descendants.add(target)

  harness.listeners.get('click')({ target })
  assert.equal(harness.classes.has('mobile-menu-open'), false)
  assert.equal(target.blurred, true)
  assert.equal(harness.menu.scrollTop, 0)
  assert.equal(harness.menu.scrollLeft, 0)
})

test('S14 selecting a left-menu action still closes the existing mobile menu', () => {
  const harness = createHarness({ menuOpen: true })
  harness.listeners.get('click')({ target: new FakeElement(['#controls-left button']) })
  assert.equal(harness.classes.has('mobile-menu-open'), false)
})
