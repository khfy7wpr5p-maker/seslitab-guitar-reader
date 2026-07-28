// Standardised error classes for the OMR Gateway.

export class GatewayError extends Error {
  constructor(code, message, details = {}, statusCode = 500) {
    super(message)
    this.name = 'GatewayError'
    this.code = code
    this.details = details
    this.statusCode = statusCode
  }
  toJSON() {
    return { success: false, error: { code: this.code, message: this.message } }
  }
}

export class ValidationError extends GatewayError {
  constructor(m, d = {}) { super('VALIDATION_ERROR', m, d, 400) }
}
export class FileTooLargeError extends GatewayError {
  constructor(m, d = {}) { super('FILE_TOO_LARGE', m, d, 413) }
}
export class UnsupportedFileTypeError extends GatewayError {
  constructor(m, d = {}) { super('UNSUPPORTED_FILE_TYPE', m, d, 415) }
}
export class JobNotFoundError extends GatewayError {
  constructor(jobId, d = {}) { super('JOB_NOT_FOUND', `İş kimliği bulunamadı: ${jobId}`, { jobId, ...d }, 404) }
}
export class JobNotReadyError extends GatewayError {
  constructor(jobId, s, d = {}) { super('JOB_NOT_READY', `İş henüz tamamlanmadı. Mevcut durum: ${s}`, { jobId, currentStatus: s, ...d }, 409) }
}
export class QueueFullError extends GatewayError {
  constructor(d = {}) { super('QUEUE_FULL', 'Kuyruk dolu, daha sonra tekrar deneyin.', d, 429) }
}
export class ProviderError extends GatewayError {
  constructor(m, d = {}) { super('OMR_PROVIDER_ERROR', m, d, 502) }
}
export class ProviderTimeoutError extends GatewayError {
  constructor(m, d = {}) { super('OMR_PROVIDER_TIMEOUT', m, d, 504) }
}
export class JobQueueTimeoutError extends GatewayError {
  constructor(m, d = {}) { super('JOB_QUEUE_TIMEOUT', m, d, 504) }
}
export class JobProcessingTimeoutError extends GatewayError {
  constructor(m, d = {}) { super('JOB_PROCESSING_TIMEOUT', m, d, 504) }
}
export class ProviderStartFailedError extends GatewayError {
  constructor(m, d = {}) { super('PROVIDER_START_FAILED', m, d, 502) }
}
export class StorageError extends GatewayError {
  constructor(m, d = {}) { super('STORAGE_ERROR', m, d, 500)
  }
}
export class InternalError extends GatewayError {
  constructor(m, d = {}) { super('INTERNAL_ERROR', m, d, 500) }
}

export function toGatewayError(err) {
  if (err instanceof GatewayError) return err
  return new InternalError(err?.message || 'Beklenmeyen sunucu hatası.')
}

export function successResponse(data = {}) {
  return { success: true, data }
}
