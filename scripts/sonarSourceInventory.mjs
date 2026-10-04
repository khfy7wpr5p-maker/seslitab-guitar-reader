import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { matchesGlob } from 'node:path'
import { pathToFileURL } from 'node:url'

function patterns(properties, key) {
  return properties.split(/\r?\n/).find((line) => line.startsWith(key + '='))?.slice(key.length + 1).split(',').filter(Boolean) ?? []
}
export function exclusionPatterns(properties) {
  // Official scanner prepareMainExclusions adds test inclusions to source exclusions.
  return [...patterns(properties, 'sonar.exclusions'), ...patterns(properties, 'sonar.test.inclusions')]
}
export function sourceIncluded(path, patterns) {
  return !patterns.some((pattern) => matchesGlob(path, pattern))
}
export function analysisType(path, properties) {
  const testRoot = patterns(properties, 'sonar.tests').some((root) => path === root || path.startsWith(root + '/'))
  const testMatch = patterns(properties, 'sonar.test.inclusions').some((pattern) => matchesGlob(path, pattern))
  if (testRoot && testMatch) return 'test'
  return sourceIncluded(path, exclusionPatterns(properties)) ? 'source' : 'excluded'
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
  // Ubuntu CI and this cloud image provide system-owned git here; never resolve
  // an executable from inherited PATH or a repository/environment override.
  const paths = execFileSync('/usr/bin/git', ['-c', 'core.fsmonitor=false', 'ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
  const patterns = exclusionPatterns(properties)
  const files = paths.flatMap((path) => {
    const type = language(path)
    if (!type) return []
    const text = readFileSync(`${root}/${path}`, 'utf8')
    const lines = text.split(/\r?\n/)
    if (lines.at(-1) === '') lines.pop()
    return [{ path, language: type, included: sourceIncluded(path, patterns), analysisType: analysisType(path, properties),
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
