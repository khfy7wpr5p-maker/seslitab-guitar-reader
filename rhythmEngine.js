// Rhythm engine: two-layer analysis of a rendered PDF page.
// Layer 1 (TAB): string, fret, measure/bar lines
// Layer 2 (Rhythm): noteheads, stems, flags, beams, dots, ties, rests
// The two layers are matched on the horizontal (x) axis to produce
// a single record per note with time position (startBeat).

import {
  STRING_NAMES, STRING_NUMBER, NOTE_DURATIONS,
  noteFrequency, noteName, durationLabel, durationBeats,
} from './noteTheory.js'
import {
  detectHorizontalLines, clusterLinesByGap, classifyLineGroups,
  pairSystems, detectBarLines, detectNoteheads, detectStem,
  detectDot, detectFlag, detectBeams, detectRests, detectTie, isDark,
} from './imageAnalysis.js'

// Analyze a rendered PDF page image and return notes with time positions.
// img: { data, width, height } (ImageData-like)
// Returns: { notes, systems, rhythmElements }
//   notes: [{ measure, string, fret, noteName, duration, beats, startBeat,
//            x, y, confidence, confidenceReason }]
export function analyzePage(img) {
  const { data, width, height } = img
  // 1. Detect horizontal staff + TAB lines
  const hLines = detectHorizontalLines(img, width, height, 0.5)
  const groups = clusterLinesByGap(hLines, 2.0)
  const parts = classifyLineGroups(groups)
  const systems = pairSystems(parts)

  const allNotes = []
  const allRhythmElements = []

  for (const system of systems) {
    const barLines = detectBarLines(img, system, width)
    const measures = buildMeasures(barLines, width)

    // --- Layer 1: TAB ---
    const tabNotes = extractTabNotes(img, system.tab, measures)

    // --- Layer 2: Rhythm ---
    const rhythmEvents = extractRhythmLayer(img, system.staff, measures)
    allRhythmElements.push(...rhythmEvents.elements)

    // --- Match layers on x-axis ---
    const matched = matchLayers(tabNotes, rhythmEvents, measures)
    allNotes.push(...matched)
  }

  return { notes: allNotes, systems, rhythmElements: allRhythmElements }
}

// Build measure ranges from bar line x positions.
function buildMeasures(barLines, width) {
  if (barLines.length === 0) return [{ start: 0, end: width, index: 0 }]
  const measures = []
  let start = 0
  for (let i = 0; i < barLines.length; i++) {
    measures.push({ start, end: barLines[i], index: i })
    start = barLines[i]
  }
  measures.push({ start, end: width, index: barLines.length })
  return measures
}

// --- LAYER 1: TAB ---
// Extract fret numbers from the TAB staff by detecting digit glyphs.
function extractTabNotes(img, tab, measures) {
  if (!tab) return []
  const { data, width } = img
  const tabLines = tab.lines.sort((a, b) => a.y - b.y)
  const stringLetters = ['e', 'B', 'G', 'D', 'A', 'E']
  const notes = []
  for (let s = 0; s < tabLines.length && s < 6; s++) {
    const lineY = tabLines[s].y
    const stringLetter = stringLetters[s]
    const digits = scanForDigits(img, lineY, width)
    for (const d of digits) {
      const measure = measures.findIndex((m) => d.x >= m.start && d.x < m.end)
      notes.push({
        string: stringLetter,
        fret: d.value,
        x: d.x,
        y: lineY,
        width: d.width,
        measure: measure >= 0 ? measures[measure].index : 0,
      })
    }
  }
  return notes
}

// Scan a horizontal band around a TAB line for digit-shaped dark clusters.
function scanForDigits(img, lineY, width) {
  const data = img.data
  const band = 4
  const digits = []
  let inCluster = false
  let clusterStart = 0
  for (let x = 0; x < width; x++) {
    let dark = false
    for (let dy = -band; dy <= band; dy++) {
      const y = lineY + dy
      if (y < 0 || y >= img.height) continue
      if (isDark(data, (y * width + x) * 4)) { dark = true; break }
    }
    if (dark) {
      if (!inCluster) { inCluster = true; clusterStart = x }
    } else {
      if (inCluster) {
        const clusterW = x - clusterStart
        if (clusterW >= 5 && clusterW <= 22) {
          const value = recognizeDigit(img, lineY, clusterStart, x - 1, width)
          if (value !== null) {
            digits.push({ x: clusterStart + Math.round(clusterW / 2), value, width: clusterW })
          }
        }
        inCluster = false
      }
    }
  }
  if (inCluster) {
    const clusterW = width - clusterStart
    if (clusterW >= 5 && clusterW <= 22) {
      const value = recognizeDigit(img, lineY, clusterStart, width - 1, width)
      if (value !== null) {
        digits.push({ x: clusterStart + Math.round(clusterW / 2), value, width: clusterW })
      }
    }
  }
  return digits
}

// Recognize a digit by template matching against simple digit bitmaps.
function recognizeDigit(img, lineY, x1, x2, imgWidth) {
  const data = img.data
  const band = 4
  const w = x2 - x1 + 1
  const h = band * 2 + 1
  if (w < 3 || h < 3) return null
  const pattern = []
  for (let dy = -band; dy <= band; dy++) {
    const row = []
    for (let dx = 0; dx < w; dx++) {
      const x = x1 + dx
      const y = lineY + dy
      if (x < 0 || x >= imgWidth || y < 0 || y >= img.height) { row.push(0); continue }
      row.push(isDark(data, (y * imgWidth + x) * 4) ? 1 : 0)
    }
    pattern.push(row)
  }
  const features = extractDigitFeatures(pattern, w, h)
  return matchDigit(features, w)
}

function extractDigitFeatures(pattern, w, h) {
  const top = countRegion(pattern, 0, 0, w, Math.floor(h / 2))
  const bottom = countRegion(pattern, 0, Math.floor(h / 2), w, h)
  const total = top + bottom
  const thirdH = Math.floor(h / 3)
  const segTop = countRegion(pattern, 0, 0, w, thirdH)
  const segMid = countRegion(pattern, 0, thirdH, w, 2 * thirdH)
  const segBot = countRegion(pattern, 0, 2 * thirdH, w, h)
  const halfW = Math.floor(w / 2)
  const segLeft = countRegion(pattern, 0, 0, halfW, h)
  const segRight = countRegion(pattern, halfW, 0, w, h)
  return { top, bottom, total, segTop, segMid, segBot, segLeft, segRight, w, h }
}

function countRegion(pattern, x1, y1, x2, y2) {
  let count = 0
  for (let y = y1; y < y2 && y < pattern.length; y++) {
    for (let x = x1; x < x2 && x < pattern[y].length; x++) {
      count += pattern[y][x]
    }
  }
  return count
}

function matchDigit(f, w) {
  const total = f.total || 1
  const hasTop = f.segTop > total * 0.15
  const hasMid = f.segMid > total * 0.15
  const hasBot = f.segBot > total * 0.15
  const hasLeft = f.segLeft > total * 0.2
  const hasRight = f.segRight > total * 0.2
  const balanced = Math.abs(f.segLeft - f.segRight) < total * 0.15
  if (hasTop && hasBot && hasLeft && hasRight && !hasMid) return 0
  if (!hasTop && !hasMid && !hasBot && hasRight && !hasLeft) return 1
  if (hasTop && hasMid && hasBot && !balanced) return 2
  if (hasTop && hasMid && hasBot && hasRight && !hasLeft) return 3
  if (hasMid && hasRight && hasLeft && !hasTop && !hasBot) return 4
  if (hasTop && hasMid && hasBot && hasLeft && !hasRight) return 5
  if (hasTop && hasMid && hasBot && hasLeft && hasRight) return 6
  if (hasTop && hasRight && !hasMid && !hasBot && !hasLeft) return 7
  if (hasTop && hasMid && hasBot && hasLeft && hasRight) return 8
  if (hasTop && hasMid && hasBot && hasRight && hasLeft) return 9
  if (total > 5) return 0
  return null
}

// --- LAYER 2: RHYTHM ---
// Extract rhythm information from the classic staff.
// Returns { elements: [...], events: [...] }
//   elements: visual rhythm elements for overlay display
//   events: rhythm events to match with TAB notes
function extractRhythmLayer(img, staff, measures) {
  if (!staff) return { elements: [], events: [] }
  const { data, width } = img
  const region = {
    x1: 0,
    y1: staff.top - 5,
    x2: width,
    y2: staff.bottom + 35,
  }
  const noteheads = detectNoteheads(img, region, width)
  const events = []
  const elements = []

  // Detect stems for all noteheads
  const stems = noteheads.map((nh) => {
    const stem = detectStem(img, nh, width)
    return { ...stem, stemY: nh.y + Math.round(nh.height / 2), notehead: nh }
  })

  // Detect beams
  const beamGroups = detectBeams(img, stems, width)
  const beamedNoteheads = new Set()
  for (const group of beamGroups) {
    for (const idx of group) beamedNoteheads.add(idx)
    // Record beam as a visual element
    const first = stems[group[0]]
    const last = stems[group[group.length - 1]]
    elements.push({
      type: 'beam',
      x1: first.stemX,
      x2: last.stemX,
      y: first.direction === 'up' ? first.stemY - first.stemLength : first.stemY + first.stemLength,
      confidence: 0.7,
    })
  }

  for (let i = 0; i < noteheads.length; i++) {
    const nh = noteheads[i]
    const stem = stems[i]
    const dot = detectDot(img, nh, width)
    const flag = detectFlag(img, stem, width)
    const measure = measures.findIndex((m) => (nh.x + nh.width / 2) >= m.start && (nh.x + nh.width / 2) < m.end)

    const rhythm = classifyRhythm(nh, stem, dot, flag, beamedNoteheads.has(i))

    events.push({
      x: nh.x + Math.round(nh.width / 2),
      y: nh.y,
      duration: rhythm.duration,
      beats: rhythm.beats,
      confidence: rhythm.confidence,
      confidenceReason: rhythm.reason,
      measure: measure >= 0 ? measures[measure].index : 0,
    })

    elements.push({
      type: 'notehead',
      x: nh.x + Math.round(nh.width / 2),
      y: nh.y,
      width: nh.width,
      height: nh.height,
      filled: nh.filled,
      hasStem: stem.hasStem,
      hasFlag: flag.hasFlag,
      hasDot: dot,
      hasBeam: beamedNoteheads.has(i),
      confidence: rhythm.confidence,
    })
  }

  // Detect rests
  const rests = detectRests(img, region, width)
  for (const r of rests) {
    const measure = measures.findIndex((m) => r.x >= m.start && r.x < m.end)
    events.push({
      x: r.x,
      y: r.y,
      duration: r.type,
      beats: r.beats,
      confidence: r.confidence,
      confidenceReason: `${durationLabel(r.type)} sus`,
      isRest: true,
      measure: measure >= 0 ? measures[measure].index : 0,
    })
    elements.push({
      type: 'rest',
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      restType: r.type,
      confidence: r.confidence,
    })
  }

  return { elements, events }
}

// Classify a notehead + stem + flag + beam + dot into a rhythm value.
function classifyRhythm(notehead, stem, dot, flag, beamed) {
  const filled = notehead.filled
  if (!stem.hasStem && !filled) {
    return { duration: 'whole', beats: 4, confidence: 0.7, reason: 'Boş nota başı, sap yok (birlik nota)' }
  }
  if (!stem.hasStem && filled) {
    return { duration: 'quarter', beats: 1, confidence: 0.3, reason: 'Dolu nota başı, sap yok' }
  }
  if (!filled && stem.hasStem) {
    if (dot) return { duration: 'dotted-half', beats: 3, confidence: 0.8, reason: 'Boş nota başı, sap ve nokta (noktalı ikilik)' }
    return { duration: 'half', beats: 2, confidence: 0.85, reason: 'Boş nota başı, sap (ikilik nota)' }
  }
  if (filled && stem.hasStem) {
    if (beamed) {
      return { duration: 'eighth', beats: 0.5, confidence: 0.75, reason: 'Dolu nota başı, kirişli (sekizlik nota)' }
    }
    if (flag.hasFlag) {
      if (flag.flagCount >= 2) return { duration: 'sixteenth', beats: 0.25, confidence: 0.7, reason: 'Dolu nota başı, çift bayrak (on altılık nota)' }
      return { duration: 'eighth', beats: 0.5, confidence: 0.7, reason: 'Dolu nota başı, tek bayrak (sekizlik nota)' }
    }
    if (dot) return { duration: 'dotted-half', beats: 3, confidence: 0.6, reason: 'Dolu nota başı, sap ve nokta' }
    return { duration: 'quarter', beats: 1, confidence: 0.6, reason: 'Dolu nota başı, sap (dörtlük varsayıldı)' }
  }
  return { duration: 'quarter', beats: 1, confidence: 0.3, reason: 'Sınıflandırılamayan nota başı' }
}

// --- MATCH LAYERS ---
// Match TAB notes to rhythm events by x position and compute time positions.
function matchLayers(tabNotes, rhythmEvents, measures) {
  const result = []
  // Sort TAB notes by x position (time order)
  const sortedTab = [...tabNotes].sort((a, b) => a.x - b.x)
  const events = rhythmEvents.events

  for (const tn of sortedTab) {
    let bestRhythm = null
    let bestDist = Infinity
    for (const r of events) {
      if (r.isRest) continue
      const dist = Math.abs(r.x - tn.x)
      if (dist < bestDist) { bestDist = dist; bestRhythm = r }
    }
    const noteNameVal = noteName(tn.string, tn.fret)
    if (bestRhythm && bestDist < 30) {
      result.push({
        measure: tn.measure,
        string: tn.string,
        fret: tn.fret,
        noteName: noteNameVal,
        duration: bestRhythm.duration,
        beats: bestRhythm.beats,
        x: tn.x,
        y: tn.y,
        confidence: bestRhythm.confidence,
        confidenceReason: bestRhythm.confidenceReason,
      })
    } else {
      result.push({
        measure: tn.measure,
        string: tn.string,
        fret: tn.fret,
        noteName: noteNameVal,
        duration: 'quarter',
        beats: 1,
        x: tn.x,
        y: tn.y,
        confidence: 0.2,
        confidenceReason: bestRhythm ? 'Ritim, TAB notasından uzak' : 'Portede ritim bulunamadı',
      })
    }
  }

  // Compute time positions (startBeat) within each measure
  computeTimePositions(result, measures)
  return result
}

// Compute startBeat for each note within its measure.
// startBeat is the beat offset from the start of the measure.
function computeTimePositions(notes, measures) {
  // Group by measure
  const byMeasure = new Map()
  for (const n of notes) {
    if (!byMeasure.has(n.measure)) byMeasure.set(n.measure, [])
    byMeasure.get(n.measure).push(n)
  }
  for (const [, mNotes] of byMeasure) {
    let cursor = 0
    for (const n of mNotes) {
      n.startBeat = cursor
      cursor += n.beats
    }
  }
}

// Convert a note to a Turkish spoken phrase.
export function noteToTurkishPhrase(note) {
  const tel = STRING_NAMES[note.string] || `${note.string} tel`
  const fretText = note.fret === 0 ? 'açık tel' : `${note.fret}. perde`
  const ad = note.noteName || noteName(note.string, note.fret)
  const sure = durationLabel(note.duration)
  const vurus = note.beats
  return `${tel} tel ${fretText}, ${ad} notası, ${sure}, ${vurus} vuruş`
}

// Build a short label for overlay display: "T3 P2 La 1v"
export function noteLabel(note) {
  const sn = STRING_NUMBER[note.string] || '?'
  const ad = note.noteName || noteName(note.string, note.fret) || '?'
  return `T${sn} P${note.fret} ${ad} ${note.beats}v`
}
