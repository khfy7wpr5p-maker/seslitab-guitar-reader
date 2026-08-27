// Package 2E Node-only DOM compatibility for benchmark scripts.
// Browser/production parser code is intentionally unchanged.

class BenchmarkElement {
  constructor(tag, attrs, parent) {
    this.tag = tag
    this.tagName = tag
    this.attrs = attrs || {}
    this.children = []
    this.parent = parent
    this._text = ''
  }

  getAttribute(name) {
    return this.attrs[name] || null
  }

  get textContent() {
    if (this.children.length === 0) return this._text
    return this.children.map((child) => child.textContent).join('')
  }

  querySelector(selector) {
    return this._findAll(selector)[0] || null
  }

  querySelectorAll(selector) {
    return this._findAll(selector)
  }

  _findAll(selector, acc = []) {
    const target = String(selector)
      .trim()
      .split(/\s+|>/u)
      .filter(Boolean)
      .at(-1)

    for (const child of this.children) {
      if (child.tag === target) acc.push(child)
      child._findAll(selector, acc)
    }
    return acc
  }
}

class BenchmarkDocument extends BenchmarkElement {
  constructor() {
    super('#document', {}, null)
  }
}

export class BenchmarkDOMParser {
  parseFromString(xml) {
    const doc = new BenchmarkDocument()
    const stack = [doc]
    const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[a-zA-Z-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/gu
    let match

    while ((match = tagRe.exec(xml)) !== null) {
      if (match[4] !== undefined) {
        if (match[4].trim()) stack[stack.length - 1]._text += match[4]
        continue
      }

      const isClose = match[0][1] === '/'
      const tag = match[1]
      const attrText = match[2] || ''
      const selfClose = match[3] === '/'

      if (isClose) {
        if (stack.length > 1) stack.pop()
        continue
      }

      const attrs = {}
      const attrRe = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/gu
      let attrMatch
      while ((attrMatch = attrRe.exec(attrText)) !== null) {
        attrs[attrMatch[1]] = attrMatch[2]
      }

      const element = new BenchmarkElement(tag, attrs, stack[stack.length - 1])
      stack[stack.length - 1].children.push(element)
      if (!selfClose) stack.push(element)
    }

    return doc
  }
}

// Package 2E evidence parsing is synchronous. Scope the benchmark parser to the
// exact call so unrelated tests/scripts cannot alter benchmark semantics and the
// benchmark does not leave global DOM state behind.
export function runWithOmrBenchmarkDomParser(callback) {
  if (typeof callback !== 'function') throw new TypeError('callback must be a function.')
  const previous = globalThis.DOMParser
  globalThis.DOMParser = BenchmarkDOMParser
  try {
    return callback()
  } finally {
    if (previous === undefined) delete globalThis.DOMParser
    else globalThis.DOMParser = previous
  }
}
