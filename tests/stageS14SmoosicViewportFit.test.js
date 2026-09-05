import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const viewportFit = readFileSync(new URL('../experiments/smoosic-mobile/public/viewport-fit.js', import.meta.url), 'utf8')
const mobileLayout = readFileSync(new URL('../experiments/smoosic-mobile/src/mobile-layout.js', import.meta.url), 'utf8')
const mobileCss = readFileSync(new URL('../experiments/smoosic-mobile/public/mobile.css', import.meta.url), 'utf8')
const prepare = readFileSync(new URL('../scripts/prepareSmoosicEditor.js', import.meta.url), 'utf8')

test('S14 mobile viewport fit keeps the embedded editor inside the parent visual viewport', () => {
  assert.match(viewportFit, /window\.frameElement/)
  assert.match(viewportFit, /parent\.visualViewport/)
  assert.match(viewportFit, /viewportBottom - frameTop - BOTTOM_GAP_PX/)
  assert.match(viewportFit, /frame\.style\.height = `\$\{availableHeight\}px`/)
  assert.match(viewportFit, /frame\.style\.minHeight = '0px'/)
  assert.match(viewportFit, /visualViewport\?\.addEventListener\('resize'/)
  assert.match(viewportFit, /visualViewport\?\.addEventListener\('scroll'/)
})

test('S14 viewport fitting ships without removing the proven left off-canvas menu', () => {
  assert.match(prepare, /'viewport-fit\.js'/)
  assert.match(prepare, /\/smoosic-editor\/viewport-fit\.js/)
  assert.match(mobileCss, /#controls-left \{[\s\S]*?position: fixed !important;[\s\S]*?transform: translateX\(-110%\);/)
  assert.match(mobileCss, /body\.mobile-menu-open #controls-left \{[\s\S]*?transform: translateX\(0\);/)
  assert.match(mobileLayout, /target\.closest\('#controls-left button'\)/)
})
