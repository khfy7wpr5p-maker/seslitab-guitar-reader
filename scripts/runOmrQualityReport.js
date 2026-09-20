#!/usr/bin/env node
// Read-only OMR Quality Diagnostic Runner.
//
// Reads a MusicXML file, runs the full quality-validation pipeline
// (parseMusicXmlWithStructure → buildMeasureTimeline → validateOmrMeasureDurations),
// and produces a deterministic JSON report + console summary.
//
// Usage:
//   node scripts/runOmrQualityReport.js <file-path>
//   node scripts/runOmrQualityReport.js <file-path> --json
//   node scripts/runOmrQualityReport.js <dir-path>        (batch all .musicxml/.xml)
//
// This script is strictly read-only: it does not modify the input file,
// does not modify application state, does not require a backend or Render.

import { readFileSync, readdirSync, statSync, accessSync, constants } from 'node:fs'
import path from 'node:path'
import { parseDoubleQuotedXmlAttributes } from './simpleXmlAttributes.js'

// ── DOMParser polyfill (mirrors tests/ and validateE2eMusicXml.mjs) ──

class MiniElement {
  constructor(tag, attrs, parent) {
    this.tag = tag
    this.tagName = tag
    this.attrs = attrs || {}
    this.children = []
    this.parent = parent
    this._text = ''
  }
  getAttribute(name) { return this.attrs[name] || null }
  get textContent() {
    if (this.children.length === 0) return this._text
    return this.children.map((c) => c.textContent).join('')
  }
  querySelector(sel) { return this._findAll(sel)[0] || null }
  querySelectorAll(sel) { return this._findAll(sel) }
  _findAll(sel, acc = []) {
    for (const c of this.children) {
      if (c.tag === sel) acc.push(c)
      c._findAll(sel, acc)
    }
    return acc
  }
}

class MiniDocument extends MiniElement {
  constructor() { super('#document', {}, null) }
}

class MiniDOMParser {
  parseFromString(xml) {
    const doc = new MiniDocument()
    const stack = [doc]
    const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[a-zA-Z-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g
    let m
    while ((m = tagRe.exec(xml)) !== null) {
      if (m[4] !== undefined) {
        if (m[4].trim()) stack[stack.length - 1]._text += m[4]
        continue
      }
      const isClose = m[0][1] === '/'
      const tag = m[1]
      const attrStr = m[2] || ''
      const selfClose = m[3] === '/'
      if (isClose) { stack.pop(); continue }
      const attrs = parseDoubleQuotedXmlAttributes(attrStr)
      const el = new MiniElement(tag, attrs, stack[stack.length - 1])
      stack[stack.length - 1].children.push(el)
      if (!selfClose) stack.push(el)
    }
    return doc
  }
}

globalThis.DOMParser = MiniDOMParser

// ── Imports ────────────────────────────────────────────────────────

import { parseMusicXmlWithStructure } from '../musicXmlParser.js'
import { buildMeasureTimeline } from '../src/services/musicXmlMeasureTimeline.js'
import { validateOmrMeasureDurations } from '../src/services/omrQualityValidator.js'

function findTimelineMeasure(timeline, measure) {
  if (measure.measureKey) {
    return timeline.measures.find((entry) => entry.measureKey === measure.measureKey)
  }
  return timeline.measures.find(
    (entry) =>
      entry.measureNumber === measure.measureNumber &&
      (measure.partId === null || measure.partId === undefined || entry.partId === measure.partId)
  )
}

function formatMeasureReference(measure) {
  if (Number.isFinite(measure.measureIndex) && measure.partId) {
    return `${measure.measureNumber} [${measure.partId}, sıra ${measure.measureIndex + 1}]`
  }
  return `${measure.measureNumber}`
}

// ── Core: run pipeline on a single file ─────────────────────────────

/**
 * Run the full quality-validation pipeline on a single MusicXML file.
 * Returns a structured report object. Does not throw — errors are
 * captured in the report.
 *
 * @param {string} filePath - absolute or relative path to a .musicxml/.xml file
 * @returns {Object} report
 */
export function runQualityReport(filePath) {
  const fileName = path.basename(filePath)

  // 1. File-not-found check
  try {
    accessSync(filePath, constants.R_OK)
  } catch {
    return {
      fileName,
      parseSuccess: false,
      error: `File not found: ${filePath}`,
      totalNotes: 0,
      totalMeasures: 0,
      timeSignatures: [],
      divisionsValues: [],
      totalStructuredEvents: 0,
      timelineWarnings: [],
      validMeasures: 0,
      warningMeasures: 0,
      errorMeasures: 0,
      unknownMeasures: 0,
      underfilledMeasures: 0,
      overfilledMeasures: 0,
      emptyMeasures: 0,
      qualityStatus: 'error',
      suspiciousMeasures: [],
    }
  }

  // 2. Read file (read-only — does not modify)
  let xmlContent
  try {
    xmlContent = readFileSync(filePath, 'utf8')
  } catch (err) {
    return {
      fileName,
      parseSuccess: false,
      error: `Cannot read file: ${err.message}`,
      totalNotes: 0,
      totalMeasures: 0,
      timeSignatures: [],
      divisionsValues: [],
      totalStructuredEvents: 0,
      timelineWarnings: [],
      validMeasures: 0,
      warningMeasures: 0,
      errorMeasures: 0,
      unknownMeasures: 0,
      underfilledMeasures: 0,
      overfilledMeasures: 0,
      emptyMeasures: 0,
      qualityStatus: 'error',
      suspiciousMeasures: [],
    }
  }

  // 3. Parse with structured parser
  let structured
  try {
    structured = parseMusicXmlWithStructure(xmlContent)
  } catch (err) {
    return {
      fileName,
      parseSuccess: false,
      error: `Parser exception: ${err.message}`,
      totalNotes: 0,
      totalMeasures: 0,
      timeSignatures: [],
      divisionsValues: [],
      totalStructuredEvents: 0,
      timelineWarnings: [],
      validMeasures: 0,
      warningMeasures: 0,
      errorMeasures: 0,
      unknownMeasures: 0,
      underfilledMeasures: 0,
      overfilledMeasures: 0,
      emptyMeasures: 0,
      qualityStatus: 'error',
      suspiciousMeasures: [],
    }
  }

  // Parser-level error (e.g., invalid XML)
  if (structured.error) {
    return {
      fileName,
      parseSuccess: false,
      error: `XML parse error: ${structured.error}`,
      totalNotes: structured.notes?.length || 0,
      totalMeasures: 0,
      timeSignatures: [],
      divisionsValues: [],
      totalStructuredEvents: 0,
      timelineWarnings: [],
      validMeasures: 0,
      warningMeasures: 0,
      errorMeasures: 0,
      unknownMeasures: 0,
      underfilledMeasures: 0,
      overfilledMeasures: 0,
      emptyMeasures: 0,
      qualityStatus: 'error',
      suspiciousMeasures: [],
    }
  }

  // 4. Build timeline
  let timeline
  try {
    timeline = buildMeasureTimeline(structured)
  } catch (err) {
    return {
      fileName,
      parseSuccess: true,
      error: `Timeline exception: ${err.message}`,
      totalNotes: structured.notes.length,
      totalMeasures: 0,
      timeSignatures: structured.timeSignatures || [],
      divisionsValues: (structured.divisionsByMeasure || []).map((d) => d.divisions),
      totalStructuredEvents: structured.measureEvents?.length || 0,
      timelineWarnings: [],
      validMeasures: 0,
      warningMeasures: 0,
      errorMeasures: 0,
      unknownMeasures: 0,
      underfilledMeasures: 0,
      overfilledMeasures: 0,
      emptyMeasures: 0,
      qualityStatus: 'error',
      suspiciousMeasures: [],
    }
  }

  // 5. Run validator
  let validation
  try {
    validation = validateOmrMeasureDurations(structured)
  } catch (err) {
    return {
      fileName,
      parseSuccess: true,
      error: `Validator exception: ${err.message}`,
      totalNotes: structured.notes.length,
      totalMeasures: 0,
      timeSignatures: structured.timeSignatures || [],
      divisionsValues: (structured.divisionsByMeasure || []).map((d) => d.divisions),
      totalStructuredEvents: structured.measureEvents?.length || 0,
      timelineWarnings: timeline.warnings || [],
      validMeasures: 0,
      warningMeasures: 0,
      errorMeasures: 0,
      unknownMeasures: 0,
      underfilledMeasures: 0,
      overfilledMeasures: 0,
      emptyMeasures: 0,
      qualityStatus: 'error',
      suspiciousMeasures: [],
    }
  }

  // 6. Build report
  const allTimelineWarnings = []
  const validatedTimelineMeasures = timeline.measures.filter(
    (measure) =>
      validation.validatedPartId === null ||
      measure.partId === null ||
      measure.partId === validation.validatedPartId
  )
  for (const tm of validatedTimelineMeasures) {
    for (const w of tm.warnings) {
      allTimelineWarnings.push(w)
    }
  }

  const suspiciousMeasures = validation.measures
    .filter((m) => m.status !== 'valid' && m.status !== 'unknown')
    .map((m) => {
      const tm = findTimelineMeasure(timeline, m)
      return {
        measureKey: m.measureKey,
        measureNumber: m.measureNumber,
        partId: m.partId,
        partIndex: m.partIndex,
        measureIndex: m.measureIndex,
        expectedBeats: m.expectedBeats,
        actualBeats: m.actualBeats,
        difference: m.difference,
        status: m.status,
        severity: m.severity,
        reasons: m.reasons,
        timelineWarnings: tm?.warnings || [],
      }
    })

  const unknownMeasuresDetail = validation.measures
    .filter((m) => m.status === 'unknown')
    .map((m) => {
      const tm = findTimelineMeasure(timeline, m)
      return {
        measureKey: m.measureKey,
        measureNumber: m.measureNumber,
        partId: m.partId,
        partIndex: m.partIndex,
        measureIndex: m.measureIndex,
        expectedBeats: m.expectedBeats,
        actualBeats: m.actualBeats,
        difference: m.difference,
        status: m.status,
        severity: m.severity,
        reasons: m.reasons,
        timelineWarnings: tm?.warnings || [],
      }
    })

  return {
    fileName,
    parseSuccess: true,
    totalNotes: structured.notes.length,
    totalMeasures: validation.totalMeasures,
    timeSignatures: structured.timeSignatures || [],
    divisionsValues: [...new Set((structured.divisionsByMeasure || []).map((d) => d.divisions).filter((v) => v !== null))],
    totalStructuredEvents: structured.measureEvents?.length || 0,
    parts: structured.parts || [],
    primaryPartId: structured.primaryPartId || null,
    validatedPartId: validation.validatedPartId,
    ignoredPartIds: validation.ignoredPartIds,
    timelineWarnings: allTimelineWarnings,
    validMeasures: validation.validMeasures,
    warningMeasures: validation.warningMeasures,
    errorMeasures: validation.errorMeasures,
    unknownMeasures: validation.unknownMeasures,
    underfilledMeasures: validation.underfilledMeasures,
    overfilledMeasures: validation.overfilledMeasures,
    emptyMeasures: validation.emptyMeasures,
    qualityStatus: validation.qualityStatus,
    suspiciousMeasures,
    unknownMeasuresDetail,
  }
}

// ── Console summary ────────────────────────────────────────────────

export function formatConsoleSummary(report) {
  const lines = []
  lines.push(`File: ${report.fileName}`)

  if (!report.parseSuccess) {
    lines.push(`Error: ${report.error}`)
    lines.push(`Quality: error`)
    return lines.join('\n')
  }

  lines.push(`Measures: ${report.totalMeasures}`)
  lines.push(`Valid: ${report.validMeasures}`)
  lines.push(`Warnings: ${report.warningMeasures}`)
  lines.push(`Errors: ${report.errorMeasures}`)
  lines.push(`Unknown: ${report.unknownMeasures}`)
  lines.push(`Quality: ${report.qualityStatus}`)
  if (report.validatedPartId) {
    lines.push(`Validated part: ${report.validatedPartId}`)
  }
  if (report.ignoredPartIds?.length > 0) {
    lines.push(`Ignored parallel parts: ${report.ignoredPartIds.join(', ')}`)
  }

  if (report.timelineWarnings.length > 0) {
    lines.push('')
    lines.push(`Timeline warnings (${report.timelineWarnings.length}):`)
    for (const w of report.timelineWarnings) {
      lines.push(`  - ${w}`)
    }
  }

  const suspicious = report.suspiciousMeasures
  if (suspicious.length > 0) {
    lines.push('')
    lines.push('Suspicious measures:')
    for (const m of suspicious) {
      lines.push(`- Measure ${formatMeasureReference(m)}: expected ${m.expectedBeats}, actual ${m.actualBeats}, ${m.status}`)
    }
  }

  const unknown = report.unknownMeasuresDetail || []
  if (unknown.length > 0) {
    lines.push('')
    lines.push('Unknown measures:')
    for (const m of unknown) {
      lines.push(`- Measure ${formatMeasureReference(m)}: ${m.reasons.join('; ')}`)
    }
  }

  return lines.join('\n')
}

// ── CLI entry point ─────────────────────────────────────────────────

function findMusicXmlFiles(dirPath) {
  const entries = readdirSync(dirPath)
  return entries
    .filter((f) => /\.(musicxml|xml)$/i.test(f))
    .map((f) => path.join(dirPath, f))
    .sort()
}

function main() {
  const args = process.argv.slice(2)
  const jsonOnly = args.includes('--json')
  const compareFlag = args.includes('--compare')
  const positional = args.filter((a) => !a.startsWith('--'))

  if (positional.length === 0) {
    console.error('Usage: node scripts/runOmrQualityReport.js <file-path|dir-path> [--json] [--compare <file1> <file2>]')
    process.exit(2)
  }

  // --compare mode: compare two files
  if (compareFlag) {
    if (positional.length < 2) {
      console.error('Usage: node scripts/runOmrQualityReport.js --compare <file1> <file2>')
      process.exit(2)
    }
    const report1 = runQualityReport(positional[0])
    const report2 = runQualityReport(positional[1])
    console.log('=== Comparison ===')
    console.log(`File A: ${report1.fileName}`)
    console.log(`  Errors: ${report1.errorMeasures}, Unknown: ${report1.unknownMeasures}, Timeline warnings: ${report1.timelineWarnings.length}, Quality: ${report1.qualityStatus}`)
    console.log(`File B: ${report2.fileName}`)
    console.log(`  Errors: ${report2.errorMeasures}, Unknown: ${report2.unknownMeasures}, Timeline warnings: ${report2.timelineWarnings.length}, Quality: ${report2.qualityStatus}`)
    console.log('')
    console.log('Note: This comparison validates structural rhythmic consistency only.')
    console.log('It does not prove musical correctness or infer visual PDF causes.')
    process.exit(0)
  }

  const target = positional[0]
  let files

  try {
    const stats = statSync(target)
    if (stats.isDirectory()) {
      files = findMusicXmlFiles(target)
      if (files.length === 0) {
        console.error(`No .musicxml or .xml files found in: ${target}`)
        process.exit(1)
      }
    } else {
      files = [target]
    }
  } catch {
    console.error(`File not found: ${target}`)
    process.exit(1)
  }

  const reports = files.map((f) => runQualityReport(f))

  if (jsonOnly) {
    console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2))
  } else {
    for (const report of reports) {
      console.log(formatConsoleSummary(report))
      console.log('')
    }
    if (reports.length > 1) {
      console.log('=== Batch Summary ===')
      for (const r of reports) {
        console.log(`  ${r.fileName}: ${r.qualityStatus} (valid=${r.validMeasures}, errors=${r.errorMeasures}, unknown=${r.unknownMeasures})`)
      }
    }
    console.log('')
    console.log('Note: This report validates structural rhythmic consistency only.')
    console.log('It does not prove musical correctness or infer visual PDF causes.')
  }

  process.exit(0)
}

// Run only when invoked directly (not when imported by tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
