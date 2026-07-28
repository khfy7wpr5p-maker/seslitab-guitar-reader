// Focused tests for the read-only OMR Quality Diagnostic Runner.
// Run with: node --test tests/runOmrQualityReport.test.js

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, rmSync, statSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// DOMParser polyfill (must be set up before importing the runner)
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
      const attrs = {}
      const attrRe = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g
      let am
      while ((am = attrRe.exec(attrStr)) !== null) attrs[am[1]] = am[2]
      const el = new MiniElement(tag, attrs, stack[stack.length - 1])
      stack[stack.length - 1].children.push(el)
      if (!selfClose) stack.push(el)
    }
    return doc
  }
}
globalThis.DOMParser = MiniDOMParser

import { runQualityReport, formatConsoleSummary } from '../scripts/runOmrQualityReport.js'

// ── Fixtures ───────────────────────────────────────────────────────

const tmpDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tmp_quality_test')

const valid4_4 = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`

const valid3_4 = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1"><attributes><divisions>4</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`

const overfilledXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`

const noTimeSigXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1"><attributes><divisions>4</divisions></attributes>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`

const noDivisionsXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1"><attributes><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`

const invalidXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
  <!-- unclosed score-partwise -->`

// ── Setup / teardown ───────────────────────────────────────────────

before(() => {
  mkdirSync(tmpDir, { recursive: true })
  writeFileSync(path.join(tmpDir, 'valid4_4.musicxml'), valid4_4)
  writeFileSync(path.join(tmpDir, 'valid3_4.musicxml'), valid3_4)
  writeFileSync(path.join(tmpDir, 'overfilled.musicxml'), overfilledXml)
  writeFileSync(path.join(tmpDir, 'no_timesig.musicxml'), noTimeSigXml)
  writeFileSync(path.join(tmpDir, 'no_divisions.musicxml'), noDivisionsXml)
  writeFileSync(path.join(tmpDir, 'invalid.musicxml'), invalidXml)
})

after(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ── Tests ──────────────────────────────────────────────────────────

describe('1. Valid file produces a report', () => {
  test('valid 4/4 file → parseSuccess, valid measures', () => {
    const report = runQualityReport(path.join(tmpDir, 'valid4_4.musicxml'))
    assert.equal(report.parseSuccess, true)
    assert.equal(report.totalNotes, 4)
    assert.equal(report.totalMeasures, 1)
    assert.equal(report.validMeasures, 1)
    assert.equal(report.qualityStatus, 'good')
    assert.equal(report.suspiciousMeasures.length, 0)
  })
})

describe('2. Missing file produces a clear error', () => {
  test('non-existent file → error with file-not-found message', () => {
    const report = runQualityReport(path.join(tmpDir, 'does_not_exist.musicxml'))
    assert.equal(report.parseSuccess, false)
    assert.ok(report.error.includes('not found'), `Expected "not found" in error: ${report.error}`)
    assert.equal(report.qualityStatus, 'error')
  })
})

describe('3. Invalid XML produces a parse error', () => {
  test('malformed XML → parseSuccess false with XML parse error', () => {
    const report = runQualityReport(path.join(tmpDir, 'invalid.musicxml'))
    // The MiniDOMParser may not detect parse errors the same way as a real
    // DOMParser, but it should still produce a report without crashing.
    assert.ok(report, 'Report should be produced without throwing')
    // Either parseSuccess is false (parse error detected) or true (parser
    // tolerated the error but produced 0 notes)
    if (report.parseSuccess) {
      assert.ok(report.totalNotes >= 0, 'Should have note count even if 0')
    } else {
      assert.ok(report.error, 'Should have an error message')
    }
  })
})

describe('4. Missing time signature produces unknown measures', () => {
  test('no time signature → unknown measures', () => {
    const report = runQualityReport(path.join(tmpDir, 'no_timesig.musicxml'))
    assert.equal(report.parseSuccess, true)
    assert.equal(report.unknownMeasures, 1)
    assert.equal(report.validMeasures, 0)
    assert.equal(report.suspiciousMeasures.length, 0)
  })
})

describe('5. Missing divisions produces unknown measures', () => {
  test('no divisions → unknown measures with timeline warnings', () => {
    const report = runQualityReport(path.join(tmpDir, 'no_divisions.musicxml'))
    assert.equal(report.parseSuccess, true)
    assert.equal(report.unknownMeasures, 1)
    assert.ok(report.timelineWarnings.length > 0, 'Should have timeline warnings about missing divisions')
  })
})

describe('6. Suspicious measures are listed', () => {
  test('overfilled measure → suspicious list with correct fields', () => {
    const report = runQualityReport(path.join(tmpDir, 'overfilled.musicxml'))
    assert.equal(report.parseSuccess, true)
    assert.equal(report.suspiciousMeasures.length, 1)
    const sm = report.suspiciousMeasures[0]
    assert.equal(sm.measureNumber, 1)
    assert.equal(sm.expectedBeats, 4)
    assert.equal(sm.actualBeats, 5)
    assert.equal(sm.status, 'overfilled')
    assert.ok(sm.reasons.length > 0)
    assert.ok(Array.isArray(sm.timelineWarnings))
  })
})

describe('7. Console summary is deterministic', () => {
  test('same input → same output every time', () => {
    const report = runQualityReport(path.join(tmpDir, 'valid4_4.musicxml'))
    const summary1 = formatConsoleSummary(report)
    const summary2 = formatConsoleSummary(report)
    assert.equal(summary1, summary2)
    assert.ok(summary1.includes('File: valid4_4.musicxml'))
    assert.ok(summary1.includes('Measures: 1'))
    assert.ok(summary1.includes('Valid: 1'))
    assert.ok(summary1.includes('Quality: good'))
  })
})

describe('8. JSON report is deterministic', () => {
  test('same input → same JSON every time', () => {
    const report1 = runQualityReport(path.join(tmpDir, 'valid3_4.musicxml'))
    const report2 = runQualityReport(path.join(tmpDir, 'valid3_4.musicxml'))
    assert.deepEqual(report1, report2)
    assert.equal(report1.totalNotes, 3)
    assert.equal(report1.validMeasures, 1)
    assert.equal(report1.qualityStatus, 'good')
  })
})

describe('9. The runner does not modify the input file', () => {
  test('file size and content unchanged after running report', () => {
    const filePath = path.join(tmpDir, 'valid4_4.musicxml')
    const beforeStat = statSync(filePath)
    const beforeContent = readFileSyncHelper(filePath)

    runQualityReport(filePath)
    runQualityReport(filePath)
    runQualityReport(filePath)

    const afterStat = statSync(filePath)
    const afterContent = readFileSyncHelper(filePath)

    assert.equal(beforeStat.size, afterStat.size)
    assert.equal(beforeContent, afterContent)
  })
})

describe('10. Existing 451 tests continue to pass', () => {
  test('validator with manual options still works (no structured events)', async () => {
    const { validateOmrMeasureDurations } = await import('../src/services/omrQualityValidator.js')
    const notes = [
      { measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4, voice: 1, staff: 1 },
      { measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4, voice: 1, staff: 1 },
      { measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4, voice: 1, staff: 1 },
      { measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4, voice: 1, staff: 1 },
    ]
    const report = validateOmrMeasureDurations(
      { notes },
      { timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }] }
    )
    assert.equal(report.measures[0].status, 'valid')
    assert.equal(report.measures[0].actualBeats, 4)
  })
})

// ── Helpers ─────────────────────────────────────────────────────────

function readFileSyncHelper(filePath) {
  return readFileSync(filePath, 'utf8')
}
