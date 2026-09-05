import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/smoosicEditorTab.css', import.meta.url), 'utf8')

test('S14 mobile Smoosic workspace widens the host by reducing only active main padding', () => {
  assert.match(css, /@media \(max-width: 820px\)/)
  assert.match(css, /\.app-main:has\(#input-section\.smoosic-editor-active\) \{[\s\S]*?padding-left: max\(0\.25rem, env\(safe-area-inset-left\)\);[\s\S]*?padding-right: max\(0\.25rem, env\(safe-area-inset-right\)\);/)
  assert.match(css, /#input-section\.smoosic-editor-active \{[\s\S]*?width: 100%;[\s\S]*?max-width: none;/)
  assert.doesNotMatch(css, /@media \(max-width: 820px\)[\s\S]*?#input-section\.smoosic-editor-active \{[\s\S]*?width: calc\(100vw/)
  assert.match(css, /#input-section\.smoosic-editor-active > \.card-header \{[\s\S]*?display: none;/)
  assert.match(css, /#input-section\.smoosic-editor-active > \.card-body \{[\s\S]*?padding: 0 !important;[\s\S]*?overflow: hidden;/)
  assert.match(css, /#input-section\.smoosic-editor-active \.input-tab-btn \{[\s\S]*?font-size: 0\.8125rem;[\s\S]*?white-space: nowrap;/)
})

test('S14 mobile Smoosic iframe gets more vertical workspace while staying inside the host width', () => {
  assert.match(css, /\.smoosic-editor-frame \{[\s\S]*?max-width: 100%;[\s\S]*?height: 82dvh;[\s\S]*?min-height: 640px;/)
})
