// Lifecycle logger for OMR jobs.
// Every entry includes: job ID, current status, elapsed time, provider name,
// and error message when applicable.

const starts = new Map()

function elapsed(jobId) {
  const s = starts.get(jobId)
  return s ? Date.now() - s : 0
}

export function markStart(jobId) {
  if (!starts.has(jobId)) starts.set(jobId, Date.now())
}

export function logLifecycle(event, { jobId, status, provider, error } = {}) {
  const t = elapsed(jobId)
  const parts = [`[OMR] ${event}`]
  if (jobId) parts.push(`job=${jobId}`)
  if (status) parts.push(`status=${status}`)
  if (provider) parts.push(`provider=${provider}`)
  parts.push(`elapsed=${t}ms`)
  if (error) parts.push(`error=${error}`)
  console.log(parts.join(' | '))
}

export function clearStart(jobId) {
  starts.delete(jobId)
}
