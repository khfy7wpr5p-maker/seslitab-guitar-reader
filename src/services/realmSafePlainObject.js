// Cross-realm-safe plain-object boundary for same-origin browser integrations.
//
// A normal object created in an iframe has a different Object.prototype than
// the parent window. Comparing that prototype by identity rejects legitimate
// renderer evidence. This validator accepts only ordinary Object-prototype
// chains (from any realm) or an explicit null prototype. Arrays, class
// instances, custom prototype chains and hostile/throwing proxies fail closed.
export function isRealmSafePlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false

  try {
    const prototype = Object.getPrototypeOf(value)
    if (prototype === null) return true
    if (Object.getPrototypeOf(prototype) !== null) return false

    const constructorDescriptor = Object.getOwnPropertyDescriptor(prototype, 'constructor')
    return Boolean(
      constructorDescriptor &&
      typeof constructorDescriptor.value === 'function' &&
      constructorDescriptor.value.name === 'Object'
    )
  } catch {
    return false
  }
}

// Build a data-only payload whose immediate prototype is the same ordinary
// Object.prototype as a trusted plain-object anchor (for example the renderer
// host living inside a same-origin iframe). This preserves the receiver's
// existing strict plain-object check without using eval, constructors or a
// second semantic path.
export function createRealmPlainObjectFor(anchor, fields) {
  if (!isRealmSafePlainObject(anchor) || !isRealmSafePlainObject(fields)) {
    throw new TypeError('Cross-realm payload requires plain-object anchor and fields.')
  }

  const prototype = Object.getPrototypeOf(anchor)
  const payload = Object.create(prototype)
  for (const [key, value] of Object.entries(fields)) {
    Object.defineProperty(payload, key, {
      value,
      enumerable: true,
      writable: false,
      configurable: false,
    })
  }
  return Object.freeze(payload)
}
