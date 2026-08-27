#!/usr/bin/env node

// Package 2E — deterministic reviewed-corpus benchmark runner.
// Installs the repository's Node DOMParser harness, reads only the fixed
// reviewed real-OMR fixture population, and prints a deterministic JSON report.

import './runOmrQualityReport.js'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  REVIEWED_OMR_FIXTURE_NAMES,
  benchmarkReviewedOmrCorpus,
} from './omrBenchmark.js'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const fixtureDir = path.resolve(scriptDir, '../tests/fixtures/real-omr')

const entries = REVIEWED_OMR_FIXTURE_NAMES.map((fileName) => ({
  fileName,
  xml: readFileSync(path.join(fixtureDir, fileName), 'utf8'),
}))

const report = benchmarkReviewedOmrCorpus(entries)
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
