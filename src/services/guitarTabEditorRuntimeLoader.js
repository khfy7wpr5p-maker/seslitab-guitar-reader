export const GUITAR_TAB_EDITOR_RUNTIME_URL =
  '/st-guitar-tab-editor-runtime/st-guitar-tab-editor.runtime.js'
export const GUITAR_TAB_EDITOR_RUNTIME_READY_TIMEOUT_MS = 10000
export const GUITAR_TAB_EDITOR_RUNTIME_VERSION = '1.0.0'
export const GUITAR_TAB_EDITOR_RUNTIME_GLOBAL = 'STGuitarTabEditorRuntime'

const requiredMethods = Object.freeze([
  'inspectMusicXml',
  'createSourceSession',
  'createTabAssignmentDocument',
  'createKeyboardController',
  'createFixedSixStringRows',
  'positionToMidi',
  'validatePositionForEvent',
  'serializeGuitarTabMusicXml',
])

const runtimeLoads = new WeakMap()

export function resolveGuitarTabEditorRuntime(globalScope = globalThis) {
  const runtime = globalScope?.[GUITAR_TAB_EDITOR_RUNTIME_GLOBAL]
  if (!runtime || typeof runtime !== 'object') return null
  if (runtime.runtimeVersion !== GUITAR_TAB_EDITOR_RUNTIME_VERSION) return null
  if (!runtime.profile || typeof runtime.profile !== 'object') return null
  for (const field of [
    'networkCapable',
    'persistenceCapable',
    'rendererAuthority',
    'sourceMutationAuthority',
    'serverRevisionAuthority',
    'approvalAuthority',
    'publicationAuthority',
  ]) {
    if (runtime.profile[field] !== false) return null
  }
  for (const method of requiredMethods) {
    if (typeof runtime[method] !== 'function') return null
  }
  if (!Object.isFrozen(runtime) || !Object.isFrozen(runtime.profile)) return null
  return runtime
}

export async function loadGuitarTabEditorRuntime(
  root,
  timeoutMs = GUITAR_TAB_EDITOR_RUNTIME_READY_TIMEOUT_MS,
) {
  const scope = root?.defaultView ?? globalThis
  const connected = resolveGuitarTabEditorRuntime(scope)
  if (connected) return connected

  if (
    !root
    || typeof root.createElement !== 'function'
    || !root.head?.appendChild
  ) {
    return null
  }

  const pending = runtimeLoads.get(root)
  if (pending) return pending

  const promise = new Promise((resolve) => {
    let settled = false
    let timer = null
    let script = null
    const finish = (value) => {
      if (settled) return
      settled = true
      if (timer !== null) clearTimeout(timer)
      if (!value) script?.remove?.()
      resolve(value)
    }

    script =
      root.querySelector?.(
        'script[data-seslitab-guitar-tab-editor-runtime="true"]',
      ) ?? null
    const created = !script
    if (!script) {
      script = root.createElement('script')
      script.src = GUITAR_TAB_EDITOR_RUNTIME_URL
      script.async = true
      script.dataset.seslitabGuitarTabEditorRuntime = 'true'
    }

    script.addEventListener?.(
      'load',
      () => finish(resolveGuitarTabEditorRuntime(scope)),
      { once: true },
    )
    script.addEventListener?.(
      'error',
      () => finish(null),
      { once: true },
    )
    timer = setTimeout(
      () => finish(resolveGuitarTabEditorRuntime(scope)),
      timeoutMs,
    )

    if (created) root.head.appendChild(script)
    else {
      const ready = resolveGuitarTabEditorRuntime(scope)
      if (ready) finish(ready)
    }
  })

  runtimeLoads.set(root, promise)
  const runtime = await promise
  if (!runtime) runtimeLoads.delete(root)
  return runtime
}
