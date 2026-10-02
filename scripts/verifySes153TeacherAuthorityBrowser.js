import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { runSes153BrowserProof } from './ses153BrowserProofSession.js'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const url = pathToFileURL(path.join(repoRoot, 'tests/fixtures/ses153-teacher-authority-browser-proof.html')).href
const artifact = path.join(repoRoot, 'artifacts/ses153-teacher-authority-browser.json')
let report
try {
  report = await runSes153BrowserProof({ url })
} catch (error) {
  report = { outcome: 'FAIL', reason: error.stack }
}
mkdirSync(path.dirname(artifact), { recursive: true })
writeFileSync(artifact, JSON.stringify(report, null, 2) + '\n')
console.log(`SES-153 SCORE-only: ${report.snapshot?.dataset?.scoreOnlyPass === 'true' ? 'PASS' : 'FAIL'}`)
console.log(`SES-153 SCORE + CHORD_BOARD: ${report.snapshot?.dataset?.combinedPass === 'true' ? 'PASS' : 'FAIL'}`)
if (report.outcome !== 'PASS') {
  console.error(JSON.stringify(report, null, 2))
  process.exitCode = 1
} else {
  console.log(`SES-153 teacher-authority SCORE browser proof PASS using ${report.chrome}`)
}
