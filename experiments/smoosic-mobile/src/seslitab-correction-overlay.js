const REVIEWED_SMOOSIC_VERSION = '1.0.44'
const SHA256 = /^[0-9a-f]{64}$/
const MAX_TARGETS = 128

function safeRevision(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function boundedPartId(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 128
    && value === value.trim()
    && !value.includes('\0')
}

function finiteBox(box) {
  return box
    && Number.isFinite(box.x)
    && Number.isFinite(box.y)
    && Number.isFinite(box.width)
    && Number.isFinite(box.height)
    && box.width > 0
    && box.height > 0
}

function unionBoxes(boxes) {
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(
    ...boxes.map((box) => box.x + box.width),
  )
  const bottom = Math.max(
    ...boxes.map((box) => box.y + box.height),
  )
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

function immutableResult(ok, appliedCount, sourceHash) {
  return Object.freeze({
    ok,
    appliedCount,
    sourceHash,
  })
}

function createSmoosicCorrectionOverlayManager({
  SvgHelpers,
  getView,
  hashText,
  reviewedSmoosicVersion,
} = {}) {
  if (reviewedSmoosicVersion !== REVIEWED_SMOOSIC_VERSION) {
    throw new Error(
      'Smoosic correction overlay requires the reviewed 1.0.44 surface.',
    )
  }
  if (
    !SvgHelpers
    || typeof SvgHelpers.outlineRect !== 'function'
    || typeof SvgHelpers.eraseOutline !== 'function'
  ) {
    throw new Error(
      'Reviewed Smoosic outline helper is unavailable.',
    )
  }
  if (typeof getView !== 'function') {
    throw new TypeError('getView must be a function.')
  }
  if (typeof hashText !== 'function') {
    throw new TypeError('hashText must be a function.')
  }

  let imported = null
  let outlines = []
  let activePayload = null

  function clearOutlines() {
    for (const info of outlines) {
      try {
        SvgHelpers.eraseOutline(info)
      } catch {
        try {
          info.element?.remove?.()
        } catch {}
      }
    }
    outlines = []
  }

  function clear() {
    clearOutlines()
    activePayload = null
    return immutableResult(
      true,
      0,
      imported?.sourceHash ?? null,
    )
  }

  function reset() {
    clearOutlines()
    imported = null
    activePayload = null
    return true
  }

  function resolveSinglePart(score, partIds) {
    if (
      !Array.isArray(partIds)
      || partIds.length !== 1
      || !boundedPartId(partIds[0])
    ) {
      throw new Error(
        'Smoosic correction overlay requires an exact single-part MusicXML mapping.',
      )
    }
    if (!Array.isArray(score?.staves) || score.staves.length < 1) {
      throw new Error(
        'Smoosic score staves are unavailable.',
      )
    }

    const leading = score.staves
      .map((staff, index) => ({ staff, index }))
      .filter(
        ({ staff }) =>
          Number(staff?.partInfo?.stavesBefore ?? 0) === 0,
      )

    if (leading.length !== 1) {
      throw new Error(
        'Smoosic single-part staff mapping is ambiguous.',
      )
    }

    const firstIndex = leading[0].index
    const stavesAfter =
      Number(leading[0].staff?.partInfo?.stavesAfter ?? 0)
    if (
      !Number.isSafeInteger(stavesAfter)
      || stavesAfter < 0
    ) {
      throw new Error(
        'Smoosic part staff span is invalid.',
      )
    }

    const lastIndex = firstIndex + stavesAfter
    if (
      firstIndex !== 0
      || lastIndex !== score.staves.length - 1
    ) {
      throw new Error(
        'Smoosic single-part staff span is ambiguous.',
      )
    }

    const partStaves = score.staves.slice(
      firstIndex,
      lastIndex + 1,
    )
    const measureCount =
      partStaves[0]?.measures?.length
    if (
      !Number.isSafeInteger(measureCount)
      || measureCount < 1
      || partStaves.some(
        (staff) =>
          staff?.measures?.length !== measureCount,
      )
    ) {
      throw new Error(
        'Smoosic part measure mapping is inconsistent.',
      )
    }

    return Object.freeze({
      partId: partIds[0],
      partStaves: Object.freeze([
        ...partStaves,
      ]),
      measureCount,
    })
  }

  async function bindImportedSource({
    musicXml,
    partIds,
    score,
    sourceRevision = null,
  } = {}) {
    clearOutlines()
    imported = null
    activePayload = null

    if (
      typeof musicXml !== 'string'
      || musicXml.length === 0
    ) {
      throw new TypeError(
        'Imported MusicXML text is required.',
      )
    }
    if (
      sourceRevision !== null
      && !safeRevision(sourceRevision)
    ) {
      throw new TypeError(
        'Imported sourceRevision is invalid.',
      )
    }

    const mapping =
      resolveSinglePart(score, partIds)
    const sourceHash =
      await hashText(musicXml)
    if (!SHA256.test(sourceHash ?? '')) {
      throw new Error(
        'Imported MusicXML source hash is invalid.',
      )
    }

    imported = Object.freeze({
      musicXml,
      sourceHash,
      sourceRevision,
      partId: mapping.partId,
      partStaves: mapping.partStaves,
      measureCount: mapping.measureCount,
    })

    return imported
  }

  function measureGeometry(measureIndex) {
    const view = getView()
    const score = view?.score
    if (!score || !imported) {
      throw new Error(
        'Smoosic correction overlay source is unavailable.',
      )
    }

    const mapping =
      resolveSinglePart(score, [imported.partId])
    if (
      mapping.measureCount !== imported.measureCount
      || measureIndex < 0
      || measureIndex >= mapping.measureCount
    ) {
      throw new Error(
        'Smoosic correction overlay measure mapping is stale.',
      )
    }

    const boxes = mapping.partStaves.map(
      (staff) => staff.measures[measureIndex]?.svg?.logicalBox,
    )
    if (boxes.some((box) => !finiteBox(box))) {
      throw new Error(
        'Smoosic correction overlay render geometry is unavailable.',
      )
    }

    const pageMap = view?.renderer?.pageMap
    if (typeof pageMap?.getRenderer !== 'function') {
      throw new Error(
        'Smoosic correction overlay page map is unavailable.',
      )
    }

    const contexts = boxes.map(
      (box) => pageMap.getRenderer(box),
    )
    if (
      contexts.some((context) => !context?.box)
      || contexts.some(
        (context) =>
          context.pageNumber
            !== contexts[0].pageNumber,
      )
    ) {
      throw new Error(
        'Smoosic correction overlay spans ambiguous render pages.',
      )
    }

    const globalBox = unionBoxes(boxes)
    const context = contexts[0]
    return {
      context,
      box: {
        x: globalBox.x - context.box.x,
        y: globalBox.y - context.box.y,
        width: globalBox.width,
        height: globalBox.height,
      },
    }
  }

  async function replace(payload = {}) {
    clearOutlines()
    activePayload = null

    if (!imported) {
      return immutableResult(false, 0, null)
    }

    if (
      !safeRevision(payload.sourceRevision)
      || imported.sourceRevision === null
      || payload.sourceRevision
        !== imported.sourceRevision
      || !SHA256.test(payload.sourceHash ?? '')
      || payload.sourceHash !== imported.sourceHash
      || !Array.isArray(payload.targets)
      || payload.targets.length > MAX_TARGETS
    ) {
      return immutableResult(
        false,
        0,
        imported.sourceHash,
      )
    }

    const seen = new Set()
    for (const target of payload.targets) {
      if (
        !target
        || typeof target !== 'object'
        || Array.isArray(target)
        || target.partId !== imported.partId
        || !Number.isSafeInteger(
          target.measureIndex,
        )
        || target.measureIndex < 0
        || target.measureIndex
          >= imported.measureCount
      ) {
        return immutableResult(
          false,
          0,
          imported.sourceHash,
        )
      }
      const key =
        `${target.partId}\u0000${target.measureIndex}`
      if (seen.has(key)) {
        return immutableResult(
          false,
          0,
          imported.sourceHash,
        )
      }
      seen.add(key)
    }

    try {
      for (const target of payload.targets) {
        const geometry =
          measureGeometry(target.measureIndex)
        const info = {
          context: geometry.context,
          box: geometry.box,
          classes:
            'seslitab-correction-overlay',
          stroke: {
            strokeName:
              'seslitab-correction-measure',
            stroke: '#dc2626',
            strokeWidth: 4,
            strokeDasharray: 0,
            fill: 'none',
            opacity: 1,
          },
          scroll: { x: 0, y: 0 },
          timeOff: 0,
        }
        SvgHelpers.outlineRect(info)
        if (!info.element) {
          throw new Error(
            'Smoosic correction overlay outline was not created.',
          )
        }
        outlines.push(info)
      }
    } catch {
      clearOutlines()
      return immutableResult(
        false,
        0,
        imported.sourceHash,
      )
    }

    activePayload = Object.freeze({
      sourceRevision: payload.sourceRevision,
      sourceHash: payload.sourceHash,
      targets: Object.freeze(
        payload.targets.map((target) =>
          Object.freeze({
            partId: target.partId,
            measureIndex: target.measureIndex,
          }),
        ),
      ),
    })

    return immutableResult(
      true,
      outlines.length,
      imported.sourceHash,
    )
  }

  async function refresh() {
    if (!activePayload) {
      return immutableResult(
        true,
        0,
        imported?.sourceHash ?? null,
      )
    }
    return replace(activePayload)
  }

  return Object.freeze({
    bindImportedSource,
    replace,
    refresh,
    clear,
    reset,
  })
}

module.exports = {
  REVIEWED_SMOOSIC_VERSION,
  createSmoosicCorrectionOverlayManager,
}
