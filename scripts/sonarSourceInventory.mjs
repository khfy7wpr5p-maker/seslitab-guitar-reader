import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { matchesGlob } from 'node:path'
import { pathToFileURL } from 'node:url'

export function exclusionPatterns(properties) {
  return /^sonar\.exclusions=(.*)$/m.exec(properties)?.[1].split(',').filter(Boolean) ?? []
}
export function sourceIncluded(path, patterns) {
  return !patterns.some((pattern) => matchesGlob(path, pattern))
}
function language(path) {
  if (/\.(?:js|mjs|cjs|jsx)$/.test(path)) return 'js'
  if (/\.json$/.test(path)) return 'json'
  if (/\.css$/.test(path)) return 'css'
  if (/\.(?:html|htm)$/.test(path)) return 'web'
  if (/\.sh$/.test(path)) return 'shell'
  if (/(?:^|\/)Dockerfile(?:\..*)?$/.test(path)) return 'docker'
  return null
}
export function trackedInventory(properties, root = '.') {
  const paths = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
  const patterns = exclusionPatterns(properties)
  const files = paths.flatMap((path) => {
    const type = language(path)
    if (!type) return []
    const text = readFileSync(`${root}/${path}`, 'utf8')
    const lines = text.split(/\r?\n/)
    if (lines.at(-1) === '') lines.pop()
    return [{ path, language: type, included: sourceIncluded(path, patterns),
      physicalLines: lines.length, nonblankPhysicalLines: lines.filter((line) => line.trim()).length }]
  })
  const included = files.filter((file) => file.included)
  return { metric: 'tracked modeled-language physical lines; NOT Sonar NCLOC or billable organization LOC',
    files, includedFiles: included.length,
    includedPhysicalLines: included.reduce((sum, file) => sum + file.physicalLines, 0),
    includedNonblankPhysicalLines: included.reduce((sum, file) => sum + file.nonblankPhysicalLines, 0) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(trackedInventory(readFileSync('sonar-project.properties', 'utf8')), null, 2))
}
