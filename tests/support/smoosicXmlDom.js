// Minimal DOM for the integration fixtures: preserves text, supports the real
// normalizer's clone/replace path, and exposes attributes to the product parser.
class Element {
  constructor(tagName, attributes = '') {
    this.tagName = tagName
    this.localName = tagName
    this.namespaceURI = null
    this.attributes = attributes
    this.childNodes = []
    this.parentNode = null
  }
  get children() { return this.childNodes.filter((child) => child instanceof Element) }
  get textContent() { return this.childNodes.map((child) => typeof child === 'string' ? child : child.textContent).join('') }
  set textContent(value) {
    this.childNodes = [String(value)]
  }
  getAttribute(name) {
    return this.attributes.match(new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`))?.[1] ?? null
  }
  appendChild(child) {
    if (child instanceof Element) child.parentNode = this
    this.childNodes.push(child)
    return child
  }
  replaceChild(replacement, child) {
    const index = this.childNodes.indexOf(child)
    if (index < 0) throw new Error('Missing child')
    replacement.parentNode = this
    child.parentNode = null
    this.childNodes[index] = replacement
  }
  cloneNode(deep) {
    const clone = new Element(this.tagName, this.attributes)
    if (deep) this.childNodes.forEach((child) => clone.appendChild(typeof child === 'string' ? child : child.cloneNode(true)))
    return clone
  }
  querySelectorAll(tag) {
    return this.children.flatMap((child) => [
      ...(child.tagName === tag ? [child] : []), ...child.querySelectorAll(tag),
    ])
  }
  querySelector(tag) { return this.querySelectorAll(tag)[0] ?? null }
}

class Document extends Element {
  constructor() { super('#document') }
  get documentElement() { return this.children[0] }
  createElementNS(_namespace, tag) { return new Element(tag) }
  cloneNode(deep) {
    const clone = new Document()
    if (deep) this.childNodes.forEach((child) => clone.appendChild(typeof child === 'string' ? child : child.cloneNode(true)))
    return clone
  }
}

export class SmoosicTestDOMParser {
  parseFromString(xml) {
    const document = new Document()
    const stack = [document]
    for (const token of xml.match(/<[^>]+>|[^<]+/g) ?? []) {
      if (token.startsWith('<?') || token.startsWith('<!--')) { stack.at(-1).appendChild(token); continue }
      if (token.startsWith('</')) { stack.pop(); continue }
      if (token.startsWith('<')) {
        const match = token.match(/^<([\w:-]+)([^>]*?)(\/?)>$/)
        if (!match) throw new Error('Invalid XML token')
        const child = stack.at(-1).appendChild(new Element(match[1], match[2]))
        if (!match[3]) stack.push(child)
      } else stack.at(-1).appendChild(token)
    }
    return document
  }
}

export class SmoosicTestXMLSerializer {
  serializeToString(element) {
    if (typeof element === 'string') return element
    const contents = element.childNodes.map((child) => this.serializeToString(child)).join('')
    if (element.tagName === '#document') return contents
    if (!element.childNodes.length) return `<${element.tagName}${element.attributes}/>`
    return `<${element.tagName}${element.attributes}>${contents}</${element.tagName}>`
  }
}
