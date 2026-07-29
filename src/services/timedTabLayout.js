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
    const placedEntries = []
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

      placedEntries.push({ ...entry, slotIndex })
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

    const rhythmRows = buildRhythmRows(
      placedEntries,
      slotCount,
      group.measureNumber,
      measureWarnings
    )

    const measure = {
      measureKey: group.measureKey,
      measureNumber: group.measureNumber,
      measureIndex: group.measureIndex,
      partId: group.partId,
      gridStepBeats,
      slotCount,
      measureEndBeat,
      rows,
      rhythmRows,
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
        ${renderRhythmRows(measure)}
        ${measure.rows.map((row) => renderRow(row, measure)).join('')}
      </div>
    </section>
  `
}

function renderRhythmRows(measure) {
  if (!measure.rhythmRows.length) {
    return `
      <div class="timed-tab-rhythm-spacer">
        <span></span>
        <span>Ritim işareti bulunamadı</span>
      </div>
    `
  }

  const showVoiceLabels = measure.rhythmRows.length > 1
  return `
    <div class="timed-tab-rhythm">
      ${measure.rhythmRows.map((rhythmRow) => `
        <div class="timed-tab-rhythm-row">
          <span class="timed-tab-rhythm-label">${showVoiceLabels ? `V${escapeHtml(rhythmRow.voice)}` : ''}</span>
          <div
            class="timed-tab-rhythm-cells"
            style="--tab-slot-count:${measure.slotCount}"
          >
            ${rhythmRow.cells.map(renderRhythmCell).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `
}

function renderRhythmCell(event) {
  if (!event) return '<span class="timed-tab-rhythm-cell"></span>'

  const stem = event.hasStem
    ? '<span class="timed-tab-stem"></span>'
    : ''
  const beams = event.beamSegments
    .map(
      (segment) => `
        <span
          class="timed-tab-beam level-${segment.level}"
          style="--tab-beam-span:${segment.span}"
        ></span>
      `
    )
    .join('')
  const hooks = event.beamHooks
    .map(
      (hook) => `
        <span
          class="timed-tab-beam-hook ${hook.direction} level-${hook.level}"
        ></span>
      `
    )
    .join('')
  const flags = Array.from(
    { length: event.fallbackFlagCount },
    (_, index) => `<span class="timed-tab-flag level-${index + 1}"></span>`
  ).join('')
  const dot = event.dotCount > 0
    ? `<span class="timed-tab-rhythm-dot">${'•'.repeat(Math.min(event.dotCount, 2))}</span>`
    : ''

  return `
    <span class="timed-tab-rhythm-cell has-event">
      <span class="timed-tab-rhythm-mark">
        ${stem}${beams}${hooks}${flags}${dot}
      </span>
    </span>
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

function buildRhythmRows(entries, slotCount, measureNumber, measureWarnings) {
  const voices = new Map()
  let ambiguousDurationCount = 0
  let ambiguousBeamCount = 0

  for (const entry of entries) {
    if (entry.isGrace) continue
    const voice = String(entry.voice ?? 1)
    if (!voices.has(voice)) voices.set(voice, new Map())
    const slots = voices.get(voice)
    if (!slots.has(entry.slotIndex)) slots.set(entry.slotIndex, [])
    slots.get(entry.slotIndex).push(entry)
  }

  const rhythmRows = [...voices.entries()]
    .sort(([voiceA], [voiceB]) => compareVoices(voiceA, voiceB))
    .map(([voice, slotGroups]) => {
      const events = [...slotGroups.entries()]
        .sort(([slotA], [slotB]) => slotA - slotB)
        .map(([slotIndex, groupEntries]) => {
          const durationKeys = new Set(
            groupEntries.map((entry) => `${entry.duration}|${entry.beats}`)
          )
          const mergedBeams = mergeBeamStates(groupEntries)
          const durationAmbiguous = durationKeys.size > 1
          if (durationAmbiguous) ambiguousDurationCount++
          if (mergedBeams.ambiguous) ambiguousBeamCount++

          const first = groupEntries[0]
          const beamLevel = durationAmbiguous
            ? 0
            : getDurationBeamLevel(first.duration, first.beats)
          const beamHooks = [...mergedBeams.states.entries()]
            .filter(([, value]) =>
              value === 'forward hook' || value === 'backward hook'
            )
            .map(([level, value]) => ({
              level,
              direction: value === 'backward hook' ? 'backward' : 'forward',
            }))

          return {
            slotIndex,
            duration: first.duration,
            beats: first.beats,
            dotCount: first.dotCount,
            hasStem: !String(first.duration).toLowerCase().includes('whole'),
            beamStates: mergedBeams.states,
            beamLevel,
            fallbackFlagCount:
              !durationAmbiguous && mergedBeams.states.size === 0 ? beamLevel : 0,
            beamSegments: [],
            beamHooks,
          }
        })

      for (let index = 0; index < events.length - 1; index++) {
        const event = events[index]
        const nextEvent = events[index + 1]
        for (const [level, value] of event.beamStates) {
          const nextValue = nextEvent.beamStates.get(level)
          if (
            (value === 'begin' || value === 'continue') &&
            (nextValue === 'continue' || nextValue === 'end')
          ) {
            event.beamSegments.push({
              level,
              span: nextEvent.slotIndex - event.slotIndex,
            })
          }
        }
      }

      const cells = Array.from({ length: slotCount }, () => null)
      for (const event of events) cells[event.slotIndex] = event
      return { voice, cells }
    })

  if (ambiguousDurationCount > 0) {
    measureWarnings.push(
      `Ölçü ${measureNumber}: ${ambiguousDurationCount} eşzamanlı konumda farklı süreler bulundu; kiriş bağlantısı çizilmedi`
    )
  }
  if (ambiguousBeamCount > 0) {
    measureWarnings.push(
      `Ölçü ${measureNumber}: ${ambiguousBeamCount} konumda çelişkili MusicXML kiriş bilgisi bulundu`
    )
  }

  return rhythmRows
}

function mergeBeamStates(entries) {
  const states = new Map()
  const conflictedLevels = new Set()

  for (const entry of entries) {
    for (const beam of entry.beams) {
      if (conflictedLevels.has(beam.number)) continue
      if (states.has(beam.number) && states.get(beam.number) !== beam.value) {
        conflictedLevels.add(beam.number)
        states.delete(beam.number)
        continue
      }
      states.set(beam.number, beam.value)
    }
  }

  return { states, ambiguous: conflictedLevels.size > 0 }
}

function getDurationBeamLevel(duration, beats) {
  const durationId = String(duration || '').toLowerCase()
  if (durationId.includes('thirtysecond')) return 3
  if (durationId.includes('sixteenth')) return 2
  if (durationId.includes('eighth')) return 1

  const numericBeats = Number(beats)
  if (!Number.isFinite(numericBeats)) return 0
  if (numericBeats <= 0.2 + EPSILON) return 3
  if (numericBeats <= 0.4 + EPSILON) return 2
  if (numericBeats <= 0.8 + EPSILON) return 1
  return 0
}

function compareVoices(voiceA, voiceB) {
  const numericA = Number(voiceA)
  const numericB = Number(voiceB)
  if (Number.isFinite(numericA) && Number.isFinite(numericB)) {
    return numericA - numericB
  }
  return voiceA.localeCompare(voiceB)
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
    duration: String(note.duration || ''),
    dotCount: Math.max(0, Math.floor(Number(note.dotCount) || 0)),
    beams: normalizeBeams(note.beams),
    stringNumber: Number(note.stringNumber),
    fret: Number(note.fret),
  }
}

function normalizeBeams(beams) {
  if (!Array.isArray(beams)) return []
  return beams
    .map((beam) => ({
      number: Number(beam?.number),
      value: String(beam?.value || '').trim().toLowerCase(),
    }))
    .filter(
      (beam) =>
        Number.isInteger(beam.number) &&
        beam.number >= 1 &&
        beam.number <= 3 &&
        [
          'begin',
          'continue',
          'end',
          'forward hook',
          'backward hook',
        ].includes(beam.value)
    )
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
