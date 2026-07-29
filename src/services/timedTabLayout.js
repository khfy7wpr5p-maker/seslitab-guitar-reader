// Equal-time guitar TAB layout for SesliTab.
//
// This is a pure, read-only presentation module. It never changes NoteObject
// values, playback order, MusicXML, OMR output, or rhythmic text. Every visual
// cell represents the same amount of musical time within its measure.

const GUITAR_STRINGS = [
  { number: 1, label: 'e' },
  { number: 2, label: 'B' },
  { number: 3, label: 'G' },
  { number: 4, label: 'D' },
  { number: 5, label: 'A' },
  { number: 6, label: 'E' },
]

const DEFAULT_MAX_SLOTS = 96
const FRACTION_DENOMINATOR_LIMIT = 64
const MAX_COMMON_DENOMINATOR = 4096
const EPSILON = 1e-8

/**
 * Build an equal-time, six-string TAB model from NoteObject[].
 *
 * @param {Object[]} notes
 * @param {{ maxSlotsPerMeasure?: number }} options
 * @returns {{
 *   measures: Object[],
 *   warnings: string[],
 *   pitchedNoteCount: number,
 *   placedNoteCount: number
 * }}
 */
export function buildTimedTabLayout(notes, options = {}) {
  const warnings = []
  if (!Array.isArray(notes) || notes.length === 0) {
    return {
      measures: [],
      warnings: ['TAB görünümü için nota bulunamadı'],
      pitchedNoteCount: 0,
      placedNoteCount: 0,
    }
  }

  const maxSlotsPerMeasure = normalizeMaxSlots(options.maxSlotsPerMeasure)
  const groups = groupMeasures(notes)
  const measures = []
  let pitchedNoteCount = 0
  let placedNoteCount = 0

  for (const group of groups) {
    const measureWarnings = []
    const timedNotes = group.notes
      .map(({ note, sourceIndex }) => normalizeTimedNote(note, sourceIndex))
      .filter(Boolean)

    const pitchedNotes = timedNotes.filter((entry) => !entry.isRest)
    pitchedNoteCount += pitchedNotes.length

    const measureEndBeat = timedNotes.reduce(
      (max, entry) => Math.max(max, entry.startBeat + entry.beats),
      0
    )
    const gridValues = []

    for (const entry of timedNotes) {
      if (entry.startBeat > 0) gridValues.push(entry.startBeat)
      if (entry.beats > 0) gridValues.push(entry.beats)
    }
    if (measureEndBeat > 0) gridValues.push(measureEndBeat)

    let gridStepBeats = deriveGridStep(gridValues)
    let slotCount = Math.max(1, Math.ceil((measureEndBeat - EPSILON) / gridStepBeats))

    if (slotCount > maxSlotsPerMeasure) {
      const compressionFactor = Math.ceil(slotCount / maxSlotsPerMeasure)
      gridStepBeats *= compressionFactor
      slotCount = Math.max(1, Math.ceil((measureEndBeat - EPSILON) / gridStepBeats))
      measureWarnings.push(
        `Ölçü ${group.measureNumber}: çok ince zaman çözünürlüğü ${slotCount} görsel aralığa sıkıştırıldı`
      )
    }

    const rows = GUITAR_STRINGS.map((stringInfo) => ({
      ...stringInfo,
      cells: Array.from({ length: slotCount }, () => []),
    }))
    let invalidPositionCount = 0
    let collisionCellCount = 0

    for (const entry of pitchedNotes) {
      if (!isValidGuitarPosition(entry.stringNumber, entry.fret)) {
        invalidPositionCount++
        continue
      }

      const rawSlot = Math.round(entry.startBeat / gridStepBeats)
      const slotIndex = Math.min(Math.max(rawSlot, 0), slotCount - 1)
      const cell = rows[entry.stringNumber - 1].cells[slotIndex]

      cell.push({
        fret: entry.fret,
        voice: entry.voice,
        sourceIndex: entry.sourceIndex,
        isGrace: entry.isGrace,
      })
      placedNoteCount++

      if (cell.length === 2) {
        collisionCellCount++
      }
    }

    if (invalidPositionCount > 0) {
      measureWarnings.push(
        `Ölçü ${group.measureNumber}: ${invalidPositionCount} nota için geçerli tel/perde bulunamadı`
      )
    }
    if (collisionCellCount > 0) {
      measureWarnings.push(
        `Ölçü ${group.measureNumber}: ${collisionCellCount} konumda aynı telde eşzamanlı perdeler bulundu`
      )
    }

    const measure = {
      measureKey: group.measureKey,
      measureNumber: group.measureNumber,
      measureIndex: group.measureIndex,
      partId: group.partId,
      gridStepBeats,
      slotCount,
      measureEndBeat,
      rows,
      pitchedNoteCount: pitchedNotes.length,
      placedNoteCount: rows.reduce(
        (count, row) =>
          count + row.cells.reduce((rowCount, cell) => rowCount + cell.length, 0),
        0
      ),
      warnings: measureWarnings,
    }

    measures.push(measure)
    warnings.push(...measureWarnings)
  }

  return { measures, warnings, pitchedNoteCount, placedNoteCount }
}

/**
 * Render the layout as safe, horizontally scrollable HTML.
 *
 * @param {ReturnType<typeof buildTimedTabLayout>} layout
 * @returns {string}
 */
export function renderTimedTabHtml(layout) {
  if (!layout || !Array.isArray(layout.measures) || layout.measures.length === 0) {
    return '<p class="timed-tab-empty">Gösterilecek gitar TAB verisi bulunamadı.</p>'
  }

  return `
    <div class="timed-tab-scroll" tabindex="0" aria-label="Eşit aralıklı gitar TAB görünümü">
      ${layout.measures.map(renderMeasure).join('')}
    </div>
  `
}

function renderMeasure(measure) {
  const measureLabel = escapeHtml(String(measure.measureNumber))
  const warningText = measure.warnings.length
    ? `<p class="timed-tab-measure-warning">${escapeHtml(measure.warnings.join(' '))}</p>`
    : ''

  return `
    <section class="timed-tab-measure" aria-label="Ölçü ${measureLabel}, ${measure.pitchedNoteCount} nota">
      <h3 class="timed-tab-measure-title">Ölçü ${measureLabel}</h3>
      <p class="sr-only">
        Bu ölçüde ${measure.pitchedNoteCount} nota ve ${measure.slotCount} eşit zaman aralığı vardır.
      </p>
      ${warningText}
      <div class="timed-tab-visual" aria-hidden="true">
        ${measure.rows.map((row) => renderRow(row, measure)).join('')}
      </div>
    </section>
  `
}

function renderRow(row, measure) {
  return `
    <div class="timed-tab-row">
      <span class="timed-tab-string-label">${row.label}</span>
      <div
        class="timed-tab-cells"
        style="--tab-slot-count:${measure.slotCount}"
      >
        ${row.cells.map((cell, index) =>
          renderCell(cell, index, measure.gridStepBeats)
        ).join('')}
      </div>
    </div>
  `
}

function renderCell(cell, index, gridStepBeats) {
  const beatPosition = index * gridStepBeats
  const beatStart = Math.abs(beatPosition - Math.round(beatPosition)) < EPSILON
  const classes = `timed-tab-cell${beatStart ? ' beat-start' : ''}`

  if (!cell.length) return `<span class="${classes}"></span>`

  const frets = cell.map((entry) =>
    `${entry.isGrace ? 'g' : ''}${entry.fret}`
  ).join(' / ')

  return `
    <span class="${classes}">
      <span class="timed-tab-fret">${escapeHtml(frets)}</span>
    </span>
  `
}

function groupMeasures(notes) {
  const groups = new Map()

  notes.forEach((note, sourceIndex) => {
    const measureKey = getMeasureKey(note)
    if (!groups.has(measureKey)) {
      groups.set(measureKey, {
        measureKey,
        measureNumber: note?.measureNumber ?? note?.measure ?? 1,
        measureIndex: Number.isFinite(note?.measureIndex) ? note.measureIndex : null,
        partId: note?.partId ?? null,
        firstSourceIndex: sourceIndex,
        notes: [],
      })
    }
    groups.get(measureKey).notes.push({ note, sourceIndex })
  })

  return [...groups.values()].sort((a, b) => {
    const aIndex = Number.isFinite(a.measureIndex) ? a.measureIndex : a.firstSourceIndex
    const bIndex = Number.isFinite(b.measureIndex) ? b.measureIndex : b.firstSourceIndex
    return aIndex - bIndex
  })
}

function getMeasureKey(note) {
  if (note?.measureKey) return String(note.measureKey)
  if (note?.partId !== undefined && Number.isFinite(note?.measureIndex)) {
    return `${note.partId}:${note.measureIndex}`
  }
  return `legacy:${note?.measureNumber ?? note?.measure ?? 1}`
}

function normalizeTimedNote(note, sourceIndex) {
  if (!note || typeof note !== 'object') return null

  const startBeat = finiteNonNegative(note.startBeat)
  const beats = note.isGrace ? 0 : finiteNonNegative(note.beats)

  return {
    sourceIndex,
    startBeat,
    beats,
    isRest: note.isRest === true,
    isGrace: note.isGrace === true,
    voice: note.voice ?? 1,
    stringNumber: Number(note.stringNumber),
    fret: Number(note.fret),
  }
}

function deriveGridStep(values) {
  const fractions = values
    .filter((value) => Number.isFinite(value) && value > EPSILON)
    .map((value) => approximateFraction(value))

  if (!fractions.length) return 1

  let commonDenominator = 1
  for (const fraction of fractions) {
    const nextDenominator = lcm(commonDenominator, fraction.denominator)
    if (
      !Number.isSafeInteger(nextDenominator) ||
      nextDenominator > MAX_COMMON_DENOMINATOR
    ) {
      return deriveScaledGridStep(values)
    }
    commonDenominator = nextDenominator
  }
  const integerTicks = fractions.map(
    (fraction) => fraction.numerator * (commonDenominator / fraction.denominator)
  )
  const gridTicks = integerTicks.reduce((result, tick) => gcd(result, tick))

  return gridTicks > 0 ? gridTicks / commonDenominator : 1
}

function deriveScaledGridStep(values) {
  const scale = 1_000_000
  const ticks = values
    .filter((value) => Number.isFinite(value) && value > EPSILON)
    .map((value) => Math.max(1, Math.round(value * scale)))
  const gridTicks = ticks.reduce((result, tick) => gcd(result, tick))
  return gridTicks > 0 ? gridTicks / scale : 1
}

function approximateFraction(value) {
  let bestNumerator = Math.round(value)
  let bestDenominator = 1
  let bestError = Math.abs(value - bestNumerator)

  for (let denominator = 1; denominator <= FRACTION_DENOMINATOR_LIMIT; denominator++) {
    const numerator = Math.round(value * denominator)
    const error = Math.abs(value - numerator / denominator)
    if (error < bestError) {
      bestNumerator = numerator
      bestDenominator = denominator
      bestError = error
    }
    if (error < EPSILON) break
  }

  const divisor = gcd(Math.abs(bestNumerator), bestDenominator)
  return {
    numerator: bestNumerator / divisor,
    denominator: bestDenominator / divisor,
  }
}

function normalizeMaxSlots(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 8) return DEFAULT_MAX_SLOTS
  return Math.floor(parsed)
}

function finiteNonNegative(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function isValidGuitarPosition(stringNumber, fret) {
  return (
    Number.isInteger(stringNumber) &&
    stringNumber >= 1 &&
    stringNumber <= 6 &&
    Number.isInteger(fret) &&
    fret >= 0 &&
    fret <= 36
  )
}

function gcd(a, b) {
  let x = Math.abs(Math.round(a))
  let y = Math.abs(Math.round(b))
  while (y) {
    const temp = y
    y = x % y
    x = temp
  }
  return x || 1
}

function lcm(a, b) {
  return Math.abs(a * b) / gcd(a, b)
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
