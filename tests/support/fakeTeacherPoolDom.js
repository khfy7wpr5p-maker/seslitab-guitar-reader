function matchesSelector(node, selector) {
  if (selector === 'h2') return node.tagName === 'H2'
  if (selector === 'form') return node.tagName === 'FORM'
  if (selector === 'button') return node.tagName === 'BUTTON'

  if (selector.startsWith('.')) {
    const className = selector.slice(1)
    return String(node.className || '')
      .split(/\s+/)
      .includes(className)
  }

  const match = selector.match(
    /^(input|textarea)(?:\[name="([^"]+)"\])?(?:\[value="([^"]+)"\])?$/,
  )
  if (match) {
    const [, tag, name, value] = match
    if (node.tagName !== tag.toUpperCase()) return false
    if (name && node.name !== name) return false
    if (value && node.value !== value) return false
    return true
  }

  const checked = selector.match(
    /^input\[type="checkbox"\]:checked$/,
  )
  if (checked) {
    return (
      node.tagName === 'INPUT' &&
      node.type === 'checkbox' &&
      node.checked === true
    )
  }

  return false
}

class FakeNode {
  constructor(tagName = '#text', text = '') {
    this.tagName = tagName.toUpperCase()
    this.children = []
    this.parentElement = null
    this.className = ''
    this.dataset = {}
    this.hidden = false
    this.textContent = text
    this.value = ''
    this.checked = false
    this.required = false
    this.type = ''
    this.name = ''
    this.id = ''
    this.attributes = new Map()
    this.listeners = new Map()
  }

  appendChild(child) {
    child.parentElement = this
    this.children.push(child)
    return child
  }

  replaceChildren(...children) {
    for (const child of this.children) {
      child.parentElement = null
    }
    this.children = []
    for (const child of children) {
      this.appendChild(child)
    }
  }

  remove() {
    if (!this.parentElement) return
    const parent = this.parentElement
    parent.children = parent.children.filter(
      (child) => child !== this,
    )
    this.parentElement = null
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value))
  }

  addEventListener(type, listener) {
    const current = this.listeners.get(type) ?? []
    current.push(listener)
    this.listeners.set(type, current)
  }

  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(event)
    }
  }

  async dispatchEventAsync(event) {
    for (const listener of this.listeners.get(event.type) ?? []) {
      await listener(event)
    }
  }

  querySelectorAll(selector) {
    const matches = []
    const visit = (node) => {
      for (const child of node.children) {
        if (matchesSelector(child, selector)) {
          matches.push(child)
        }
        visit(child)
      }
    }
    visit(this)
    return matches
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null
  }
}

export function createFakeDocument() {
  return Object.freeze({
    createElement(tagName) {
      return new FakeNode(tagName)
    },
    createTextNode(text) {
      return new FakeNode('#text', String(text))
    },
  })
}
