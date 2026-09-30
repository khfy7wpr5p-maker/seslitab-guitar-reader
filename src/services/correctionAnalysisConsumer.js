export const CE_ANALYSIS_BROWSER_CONTRACT = 'ST_OMR_CORRECTION_ENGINE_ANALYSIS_BROWSER'
export const CE_ANALYSIS_BROWSER_CONTRACT_VERSION = '1.0.0'
export const CE_ANALYSIS_RUNTIME_VERSION = '1.0.0'
export const CE_SUSPICIOUS_MEASURES_CONTRACT = 'ST_OMR_CORRECTION_ENGINE_SUSPICIOUS_MEASURES_V1'
export const CE_ANALYSIS_RUNTIME_GLOBAL = 'STOmrCorrectionAnalysisRuntime'

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function boundedText(value, max = 256) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= max
    && value === value.trim()
    && !value.includes('\0')
}

function safeNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0
}

export function resolveCorrectionAnalysisRuntime(globalScope = globalThis) {
  const runtime = globalScope?.[CE_ANALYSIS_RUNTIME_GLOBAL]
  if (!isRecord(runtime)) return null
  if (runtime.contract !== CE_ANALYSIS_BROWSER_CONTRACT) return null
  if (runtime.contractVersion !== CE_ANALYSIS_BROWSER_CONTRACT_VERSION) return null
  if (runtime.runtimeVersion !== CE_ANALYSIS_RUNTIME_VERSION) return null
  if (typeof runtime.analyzeMusicXmlSuspiciousMeasures !== 'function') return null
  return runtime
}

export function validateSuspiciousMeasureAnalysis(result, { expectedSourceId } = {}) {
  if (!isRecord(result)) throw new TypeError('Correction analysis result must be an object.')
  if (result.contract !== CE_SUSPICIOUS_MEASURES_CONTRACT) {
    throw new TypeError('Correction analysis result contract mismatch.')
  }
  if (result.mode !== 'SHADOW_ONLY') {
    throw new TypeError('Correction analysis result must remain SHADOW_ONLY.')
  }
  if (!boundedText(result.sourceId)) {
    throw new TypeError('Correction analysis result source identity is invalid.')
  }
  if (expectedSourceId !== undefined && result.sourceId !== expectedSourceId) {
    throw new TypeError('Correction analysis source identity does not match the current score.')
  }
  if (typeof result.sourceHash !== 'string' || !/^[0-9a-f]{64}$/.test(result.sourceHash)) {
    throw new TypeError('Correction analysis result source hash is invalid.')
  }
  if (!boundedText(result.partId, 128)) {
    throw new TypeError('Correction analysis partId is invalid.')
  }
  if (!safeNonNegativeInteger(result.measureCount) || !safeNonNegativeInteger(result.eventCount)) {
    throw new TypeError('Correction analysis summary is invalid.')
  }
  if (!Array.isArray(result.findings) || !Array.isArray(result.suspiciousMeasures)) {
    throw new TypeError('Correction analysis findings are invalid.')
  }
  if (!safeNonNegativeInteger(result.unmappedFindingCount)) {
    throw new TypeError('Correction analysis unmapped finding count is invalid.')
  }
  if (
    result.sourceGraphMutated !== false
    || result.automaticApplyAuthority !== false
    || result.musicXmlWriteBackAuthority !== false
  ) {
    throw new TypeError('Correction analysis authority or source immutability boundary was violated.')
  }

  for (const measure of result.suspiciousMeasures) {
    if (!isRecord(measure)) throw new TypeError('Correction suspicious measure entry is invalid.')
    if (!safeNonNegativeInteger(measure.measureIndex) || measure.measureIndex >= result.measureCount) {
      throw new RangeError('Correction suspicious measure index is outside the analyzed score.')
    }
    if (!boundedText(measure.measureKey) || !boundedText(String(measure.measureNumber ?? ''), 64)) {
      throw new TypeError('Correction suspicious measure identity is invalid.')
    }
    if (!Array.isArray(measure.codes) || !Array.isArray(measure.errorClasses) || !Array.isArray(measure.findingIds)) {
      throw new TypeError('Correction suspicious measure evidence is invalid.')
    }
  }
  return result
}

export function analyzeSuspiciousMeasures(runtime, { musicxml, sourceId, tolerance } = {}) {
  if (!runtime || typeof runtime.analyzeMusicXmlSuspiciousMeasures !== 'function') {
    throw new TypeError('Correction analysis browser runtime is not connected.')
  }
  if (typeof musicxml !== 'string' || !musicxml.includes('<score-partwise')) {
    throw new TypeError('Correction analysis requires score-partwise MusicXML text.')
  }
  if (!boundedText(sourceId)) {
    throw new TypeError('Correction analysis requires an exact bounded source identity.')
  }
  if (tolerance !== undefined && (!Number.isFinite(tolerance) || tolerance < 0)) {
    throw new RangeError('Correction analysis tolerance must be finite and non-negative.')
  }

  const result = runtime.analyzeMusicXmlSuspiciousMeasures({
    musicxml,
    sourceId,
    ...(tolerance === undefined ? {} : { tolerance }),
  })
  return validateSuspiciousMeasureAnalysis(result, { expectedSourceId: sourceId })
}
