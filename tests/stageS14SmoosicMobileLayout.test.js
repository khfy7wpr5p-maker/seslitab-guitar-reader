import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/smoosicEditorTab.css', import.meta.url), 'utf8')

test('S14 mobile Smoosic workspace uses a near-full-width host shell without changing editor internals', () => {
  assert.match(css, /@media \(max-width: 820px\)/)
  assert.match(css, /#input-section\.smoosic-editor-active \{[\s\S]*?width: calc\(100vw - 0\.5rem\);[\s\S]*?align-self: center;/)
  assert.match(css, /#input-section\.smoosic-editor-active > \.card-header \{[\s\S]*?display: none;/)
  assert.match(css, /#input-section\.smoosic-editor-active > \.card-body \{[\s\S]*?padding: 0 !important;[\s\S]*?overflow: hidden;/)
  assert.match(css, /#input-section\.smoosic-editor-active \.input-tab-btn \{[\s\S]*?font-size: 0\.8125rem;[\s\S]*?white-space: nowrap;/)
})

test('S14 mobile Smoosic iframe gets more vertical workspace while staying inside the host width', () => {
  assert.match(css, /\.smoosic-editor-frame \{[\s\S]*?max-width: 100%;[\s\S]*?height: 82dvh;[\s\S]*?min-height: 640px;/)
})
