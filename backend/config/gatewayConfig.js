// Gateway configuration.

function envPath(name, fallback) {
  const v = process.env[name]
  return (v && v.trim()) || fallback
}

export const GATEWAY_CONFIG = {
  workerPoolSize: 4,
  jobTimeoutSeconds: 300,
  maxRetries: 3,
  retryBaseSeconds: 2,
  maxQueueSize: 100,
  maxQueueWaitSeconds: 300,
  storagePath: envPath('SESLITAB_MUSICXML_DIR', './storage/jobs'),
  tempDir: envPath('SESLITAB_TEMP_DIR', ''),
  dataDir: envPath('SESLITAB_DATA_DIR', ''),
  maxMusicXmlSizeBytes: 10 * 1024 * 1024,
  cleanupIntervalSeconds: 3600,
  completedTtlDays: 7,
  failedTtlDays: 3,
  maxUploadSizeBytes: 10 * 1024 * 1024,
  defaultProvider: 'mock',
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
