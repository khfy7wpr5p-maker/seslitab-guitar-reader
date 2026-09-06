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

test('S14 mobile menu is positioned below the visible sticky host header after parent scrolling', () => {
  assert.match(viewportFit, /querySelector\?\.\('\.app-header'\)/)
  assert.match(viewportFit, /visibleHostTop - frameTop/)
  assert.match(viewportFit, /--seslitab-mobile-menu-top/)
  assert.match(viewportFit, /frame\.dataset\.seslitabHostOccludedTop/)
  assert.match(viewportFit, /parent\.addEventListener\('scroll', scheduleFit/)
  assert.match(viewportFit, /target\.closest\('#mobile-menu-toggle'\)/)
  assert.match(mobileCss, /body > #controls-left \{[\s\S]*?top: var\(--seslitab-mobile-menu-top, calc\(var\(--seslitab-mobile-topbar-height\)/)
})

test('S14 viewport fitting preserves the bottom-triggered upper Smoosic menu panel', () => {
  assert.match(prepare, /'viewport-fit\.js'/)
  assert.match(prepare, /\/smoosic-editor\/viewport-fit\.js/)
  assert.match(mobileCss, /body > #controls-left \{[\s\S]*?position: fixed !important;[\s\S]*?bottom: auto !important;[\s\S]*?transform: translateY\(-8px\);[\s\S]*?visibility: hidden;/)
  assert.match(mobileCss, /body\.mobile-menu-open > #controls-left \{[\s\S]*?transform: translateY\(0\);[\s\S]*?visibility: visible;[\s\S]*?pointer-events: auto;/)
  assert.match(mobileCss, /body > #controls-left > #controls-left\.controls-left \{[\s\S]*?position: static !important;[\s\S]*?transform: none !important;/)
  assert.match(mobileLayout, /target\.closest\('#mobile-menu-toggle'\)/)
  assert.match(mobileLayout, /target\.closest\('#controls-left button'\)/)
})
