import {
  clearScoreMeasureHighlights,
  highlightScoreMeasure,
} from './scoreRendererConsumer.js'
import { validateSuspiciousMeasureAnalysis } from './correctionAnalysisConsumer.js'

function exactMeasureTargets(result) {
  const targets = new Map()
  for (const measure of result.suspiciousMeasures) {
    const key = `${result.partId}\u0000${measure.measureIndex}`
    if (!targets.has(key)) {
      targets.set(key, Object.freeze({
        partId: result.partId,
        measureIndex: measure.measureIndex,
      }))
    }
  }
  return [...targets.values()]
}

export async function replaceSuspiciousMeasureOverlays(
  rendererHost,
  result,
  { expectedSourceId } = {},
) {
  try {
    await clearScoreMeasureHighlights(rendererHost)
  } catch {
    return false
  }

  let accepted
  try {
    accepted = validateSuspiciousMeasureAnalysis(result, { expectedSourceId })
  } catch {
    return false
  }
  if (accepted.unmappedFindingCount !== 0) return false

  const targets = exactMeasureTargets(accepted)
  try {
    for (const target of targets) {
      await highlightScoreMeasure(rendererHost, target)
    }
    return true
  } catch {
    try { await clearScoreMeasureHighlights(rendererHost) } catch {}
    return false
  }
}
