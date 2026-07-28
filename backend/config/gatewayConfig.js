// Gateway configuration.

function envPath(name, fallback) {
  const v = process.env[name]
  return (v && v.trim()) || fallback
}

function envInt(name, fallback) {
  const v = process.env[name]
  if (v === undefined || v === '') return fallback
  const n = parseInt(v, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const GATEWAY_CONFIG = {
  workerPoolSize: envInt('SESLITAB_WORKER_POOL_SIZE', 4),
  jobTimeoutSeconds: envInt('SESLITAB_JOB_TIMEOUT_SECONDS', 300),
  maxRetries: envInt('SESLITAB_MAX_RETRIES', 3),
  retryBaseSeconds: envInt('SESLITAB_RETRY_BASE_SECONDS', 2),
  maxQueueSize: envInt('SESLITAB_MAX_QUEUE_SIZE', 100),
  // Maximum time a job may stay in "queued" before JOB_QUEUE_TIMEOUT.
  maxQueueWaitSeconds: envInt('SESLITAB_MAX_QUEUE_WAIT_SECONDS', 300),
  // Maximum time a job may stay in "processing" before JOB_PROCESSING_TIMEOUT.
  maxProcessingSeconds: envInt('SESLITAB_MAX_PROCESSING_SECONDS', 600),
  // Per-HTTP-request timeout for status responses (seconds).
  httpRequestTimeoutSeconds: envInt('SESLITAB_HTTP_REQUEST_TIMEOUT_SECONDS', 15),
  storagePath: envPath('SESLITAB_MUSICXML_DIR', './storage/jobs'),
  tempDir: envPath('SESLITAB_TEMP_DIR', ''),
  dataDir: envPath('SESLITAB_DATA_DIR', ''),
  maxMusicXmlSizeBytes: 10 * 1024 * 1024,
  cleanupIntervalSeconds: 3600,
  completedTtlDays: 7,
  failedTtlDays: 3,
  maxUploadSizeBytes: 10 * 1024 * 1024,
  defaultProvider: envPath('OMR_PROVIDER', 'mock'),
  // Frontend polling configuration (also used by omrService.js).
  frontend: {
    pollIntervalMs: envInt('SESLITAB_POLL_INTERVAL_MS', 2000),
    maxPollDurationMs: envInt('SESLITAB_MAX_POLL_DURATION_MS', 600000),
    maxConsecutiveErrors: envInt('SESLITAB_MAX_CONSECUTIVE_ERRORS', 5),
    httpRequestTimeoutMs: envInt('SESLITAB_HTTP_REQUEST_TIMEOUT_MS', 15000),
  },
  providers: {
    audiveris: {
      command: 'audiveris',
      timeoutMs: 110000,
      pollIntervalSeconds: 2,
      jobTimeoutSeconds: 120,
      outputFormat: 'musicxml',
    },
    mock: {
      simulatedDelaySeconds: 2,
      pollIntervalSeconds: 1,
      jobTimeoutSeconds: 30,
    },
    http: {
      pollIntervalSeconds: 2,
      jobTimeoutSeconds: 120,
    },
  },
}
