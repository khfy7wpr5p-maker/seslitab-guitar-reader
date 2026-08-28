const DEFAULT_TIMEOUT_MS = 12000

function normalizeErrorMessage(payload, fallback) {
  const message = payload?.error?.message
  return typeof message === 'string' && message.trim() ? message.trim() : fallback
}

export async function searchScores(request, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    return { success: false, error: 'Nota arama servisi bu tarayıcıda kullanılamıyor.' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const abortFromParent = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', abortFromParent, { once: true })
  }

  try {
    const response = await fetchImpl('/api/v1/discovery/search', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    })

    let payload = null
    try { payload = await response.json() } catch {}

    if (!response.ok || payload?.success !== true || !payload?.data) {
      return {
        success: false,
        error: normalizeErrorMessage(payload, 'Nota araması tamamlanamadı.'),
        statusCode: response.status,
      }
    }

    const results = Array.isArray(payload.data.results) ? payload.data.results : []
    const sourceLocators = Array.isArray(payload.data.sourceLocators) ? payload.data.sourceLocators : []
    return {
      success: true,
      results,
      sourceLocators,
      totalResults: Number.isInteger(payload.data.totalResults) ? payload.data.totalResults : results.length,
      truncated: payload.data.truncated === true,
      partial: payload.data.partial === true,
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { success: false, error: 'Nota araması zaman aşımına uğradı.' }
    }
    return { success: false, error: 'Nota arama servisine ulaşılamıyor.' }
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', abortFromParent)
  }
}
