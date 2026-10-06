export const SMOOSIC_DIRECT_UPLOAD_TIMING_DIVISIONS = 4096

function positiveIntegerText(value) {
  const text = String(value).trim()
  const number = Number(text)
  return /^[1-9]\d*$/.test(text)
    && Number.isSafeInteger(number)
    ? number
    : null
}

function softwareProvesSmoosic(musicXml) {
  const software = [
    ...musicXml.matchAll(
      /<software\b[^>]*>([\s\S]*?)<\/software>/gi,
    ),
  ]
  return software.length === 1
    && /\bSmoosic\b/i.test(software[0][1])
}

function partBlocks(musicXml) {
  return [
    ...musicXml.matchAll(
      /<part\b[^>]*>[\s\S]*?<\/part>/gi,
    ),
  ].map((match) => match[0])
}

function firstMeasure(partXml) {
  return partXml.match(
    /<measure\b[^>]*>[\s\S]*?<\/measure>/i,
  )?.[0] ?? null
}

function divisionsBeforeFirstDuration(partXml) {
  const firstDurationIndex =
    partXml.search(/<duration\b/i)
  if (firstDurationIndex < 0) {
    return Object.freeze({
      timed: false,
      status: 'NONE',
      value: null,
    })
  }

  const prefix = partXml.slice(
    0,
    firstDurationIndex,
  )
  const declarations = [
    ...prefix.matchAll(
      /<divisions\b[^>]*>([\s\S]*?)<\/divisions>/gi,
    ),
  ]
  const rawOpenings =
    prefix.match(/<divisions\b/gi) ?? []

  if (
    rawOpenings.length !== declarations.length
    || declarations.length > 1
  ) {
    return Object.freeze({
      timed: true,
      status: 'AMBIGUOUS',
      value: null,
    })
  }
  if (declarations.length === 0) {
    return Object.freeze({
      timed: true,
      status: 'MISSING',
      value: null,
    })
  }

  const value =
    positiveIntegerText(declarations[0][1])
  return Object.freeze({
    timed: true,
    status:
      value === null
        ? 'MALFORMED'
        : 'VALID',
    value,
  })
}

function insertInitialDivisions(
  partXml,
  divisions,
) {
  const measure = firstMeasure(partXml)
  if (!measure) return null
  if (/<divisions\b/i.test(measure)) {
    return null
  }

  const attributes = [
    ...measure.matchAll(
      /<attributes\b[^>]*>[\s\S]*?<\/attributes>/gi,
    ),
  ]
  if (attributes.length !== 1) return null

  const opening = attributes[0][0].match(
    /<attributes\b[^>]*>/i,
  )?.[0]
  if (!opening) return null

  const normalizedAttributes =
    attributes[0][0].replace(
      opening,
      `${opening}<divisions>${divisions}</divisions>`,
    )
  const normalizedMeasure = measure.replace(
    attributes[0][0],
    normalizedAttributes,
  )
  return partXml.replace(
    measure,
    normalizedMeasure,
  )
}

export function normalizeSmoosicDirectUploadTiming(
  musicXml,
) {
  if (
    typeof musicXml !== 'string'
    || musicXml.trim() === ''
  ) {
    return musicXml
  }
  if (!softwareProvesSmoosic(musicXml)) {
    return musicXml
  }

  const parts = partBlocks(musicXml)
  if (parts.length < 2) return musicXml

  const firstTiming =
    divisionsBeforeFirstDuration(parts[0])
  if (
    !firstTiming.timed
    || firstTiming.status !== 'VALID'
    || firstTiming.value
      !== SMOOSIC_DIRECT_UPLOAD_TIMING_DIVISIONS
  ) {
    return musicXml
  }

  const normalizedParts = [...parts]
  let changed = false
  for (
    let index = 1;
    index < parts.length;
    index += 1
  ) {
    const timing =
      divisionsBeforeFirstDuration(parts[index])
    if (!timing.timed) continue
    if (timing.status === 'VALID') continue
    if (timing.status !== 'MISSING') {
      return musicXml
    }

    const normalizedPart =
      insertInitialDivisions(
        parts[index],
        SMOOSIC_DIRECT_UPLOAD_TIMING_DIVISIONS,
      )
    if (normalizedPart === null) {
      return musicXml
    }
    normalizedParts[index] = normalizedPart
    changed = true
  }

  if (!changed) return musicXml

  let partIndex = 0
  const normalized = musicXml.replace(
    /<part\b[^>]*>[\s\S]*?<\/part>/gi,
    () => {
      const part = normalizedParts[partIndex]
      partIndex += 1
      return part
    },
  )
  return partIndex === normalizedParts.length
    ? normalized
    : musicXml
}
