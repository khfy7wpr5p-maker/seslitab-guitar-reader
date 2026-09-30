import {
  resolveCorrectionAnalysisRuntime,
} from './correctionAnalysisConsumer.js'

export const CE_ANALYSIS_RUNTIME_URL =
  '/st-omr-correction-analysis-runtime/ce-analysis-browser-runtime.js'
export const CE_ANALYSIS_RUNTIME_READY_TIMEOUT_MS = 10000

const correctionAnalysisLoads = new WeakMap()

export async function loadCorrectionAnalysisRuntime(
  root,
  timeoutMs = CE_ANALYSIS_RUNTIME_READY_TIMEOUT_MS,
) {
  const scope = root?.defaultView ?? globalThis
  const connected =
    resolveCorrectionAnalysisRuntime(scope)
  if (connected) return connected

  if (
    !root
    || typeof root.createElement !== 'function'
    || !root.head?.appendChild
  ) {
    return null
  }

  const pending = correctionAnalysisLoads.get(root)
  if (pending) return pending

  const promise = new Promise((resolve) => {
    let settled = false
    let timer = null
    const finish = (value) => {
      if (settled) return
      settled = true
      if (timer !== null) clearTimeout(timer)
      resolve(value)
    }

    let script =
      root.querySelector?.(
        'script[data-seslitab-ce-analysis-runtime="true"]',
      ) ?? null
    const created = !script
    if (!script) {
      script = root.createElement('script')
      script.src = CE_ANALYSIS_RUNTIME_URL
      script.async = true
      script.dataset.seslitabCeAnalysisRuntime =
        'true'
    }

    script.addEventListener?.(
      'load',
      () =>
        finish(
          resolveCorrectionAnalysisRuntime(scope),
        ),
      { once: true },
    )
    script.addEventListener?.(
      'error',
      () => finish(null),
      { once: true },
    )
    timer = setTimeout(
      () =>
        finish(
          resolveCorrectionAnalysisRuntime(scope),
        ),
      timeoutMs,
    )

    if (created) root.head.appendChild(script)
    else {
      const ready =
        resolveCorrectionAnalysisRuntime(scope)
      if (ready) finish(ready)
    }
  })

  correctionAnalysisLoads.set(root, promise)
  const runtime = await promise
  if (!runtime) correctionAnalysisLoads.delete(root)
  return runtime
}
