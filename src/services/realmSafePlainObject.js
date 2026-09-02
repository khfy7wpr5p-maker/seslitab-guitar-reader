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
