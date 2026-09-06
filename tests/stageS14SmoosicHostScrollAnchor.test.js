import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(
  new URL('../src/smoosicEditorTab.css', import.meta.url),
  'utf8',
)

test('S14 host iframe is excluded from browser scroll anchoring', () => {
  assert.match(
    css,
    /\.smoosic-editor-frame\s*\{[\s\S]*?overflow-anchor:\s*none;/,
  )
})
