import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'

const packageRoot = resolve('experiments/smoosic-mobile/node_modules/smoosic')
const artifactPath = resolve('artifacts/smenu-smoosic-reflection-contract.json')
const needles = [
  'globalThis.Smo',
  'SuiFileMenu',
  'SuiScoreMenu',
  'SuiNoteMenu',
  'DisplaySettings',
]

if (!existsSync(packageRoot)) {
  console.error(`SMENU reflection inspection failed closed: ${packageRoot} is missing`)
  process.exit(1)
}

const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'))
const files = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = resolve(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      if (name !== 'node_modules') walk(path)
      continue
    }
    if (!/\.(?:js|cjs|mjs|ts)$/.test(name)) continue
    files.push(path)
  }
}
walk(packageRoot)

const hits = []
for (const path of files) {
  const source = readFileSync(path, 'utf8')
  for (const needle of needles) {
    let index = source.indexOf(needle)
    while (index >= 0) {
      const start = Math.max(0, index - 220)
      const end = Math.min(source.length, index + needle.length + 320)
      hits.push({
        needle,
        path: relative(packageRoot, path),
        excerpt: source.slice(start, end).replace(/\s+/g, ' ').trim(),
      })
      index = source.indexOf(needle, index + needle.length)
      if (hits.filter((hit) => hit.needle === needle).length >= 20) break
    }
  }
}

const globalHits = hits.filter((hit) => hit.needle === 'globalThis.Smo')
const evidence = {
  package: {
    name: packageJson.name,
    version: packageJson.version,
    main: packageJson.main ?? null,
  },
  scannedFileCount: files.length,
  globalThisSmoHitCount: globalHits.length,
  hits,
}

mkdirSync(resolve('artifacts'), { recursive: true })
writeFileSync(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`)

console.log(`Installed Smoosic: ${packageJson.name}@${packageJson.version}`)
console.log(`globalThis.Smo hits: ${globalHits.length}`)
for (const hit of globalHits.slice(0, 10)) {
  console.log(`${hit.path}: ${hit.excerpt}`)
}
console.log(`Evidence: ${artifactPath}`)

if (packageJson.version !== '1.0.44') {
  console.error(`SMENU reflection inspection failed: expected smoosic@1.0.44, got ${packageJson.version}`)
  process.exit(1)
}
if (!globalHits.length) {
  console.error('SMENU reflection inspection failed: installed smoosic@1.0.44 contains no globalThis.Smo reflection references.')
  process.exit(1)
}
