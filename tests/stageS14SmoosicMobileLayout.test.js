import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const hostCss = readFileSync(new URL('../src/smoosicEditorTab.css', import.meta.url), 'utf8')
const innerMobileCss = readFileSync(new URL('../experiments/smoosic-mobile/public/mobile.css', import.meta.url), 'utf8')
const innerMobileLayoutJs = readFileSync(new URL('../experiments/smoosic-mobile/src/mobile-layout.js', import.meta.url), 'utf8')
const webpackConfig = readFileSync(new URL('../experiments/smoosic-mobile/webpack.config.js', import.meta.url), 'utf8')

test('S14 mobile Smoosic workspace widens the host by reducing only active main padding', () => {
  assert.match(hostCss, /@media \(max-width: 820px\)/)
  assert.match(hostCss, /\.app-main:has\(#input-section\.smoosic-editor-active\) \{[\s\S]*?padding-left: max\(0\.25rem, env\(safe-area-inset-left\)\);[\s\S]*?padding-right: max\(0\.25rem, env\(safe-area-inset-right\)\);/)
  assert.match(hostCss, /#input-section\.smoosic-editor-active \{[\s\S]*?width: 100%;[\s\S]*?max-width: none;/)
  assert.doesNotMatch(hostCss, /@media \(max-width: 820px\)[\s\S]*?#input-section\.smoosic-editor-active \{[\s\S]*?width: calc\(100vw/)
  assert.match(hostCss, /#input-section\.smoosic-editor-active > \.card-header \{[\s\S]*?display: none;/)
  assert.match(hostCss, /#input-section\.smoosic-editor-active > \.card-body \{[\s\S]*?padding: 0 !important;[\s\S]*?overflow: hidden;/)
  assert.match(hostCss, /#input-section\.smoosic-editor-active \.input-tab-btn \{[\s\S]*?font-size: 0\.8125rem;[\s\S]*?white-space: nowrap;/)
})

test('S14 mobile Smoosic iframe gets more vertical workspace while staying inside the host width', () => {
  assert.match(hostCss, /\.smoosic-editor-frame \{[\s\S]*?max-width: 100%;[\s\S]*?height: 82dvh;[\s\S]*?min-height: 640px;/)
})

test('S14 inner mobile layout targets the real Smoosic DOM ids so hidden controls do not steal score width', () => {
  assert.match(innerMobileCss, /#controls-left \{[\s\S]*?position: fixed !important;[\s\S]*?transform: translateX\(-110%\);/)
  assert.match(innerMobileCss, /body\.mobile-menu-open #controls-left \{[\s\S]*?transform: translateX\(0\);/)
  assert.match(innerMobileCss, /\[id\$='-top-bar'\] \{[\s\S]*?flex-flow: row nowrap !important;[\s\S]*?height: var\(--seslitab-mobile-topbar-height\) !important;/)
  assert.match(innerMobileCss, /#controls-top,[\s\S]*?#controls-top \.control-bar,[\s\S]*?#controls-top \.row \{[\s\S]*?flex-flow: row nowrap !important;/)
  assert.match(innerMobileLayoutJs, /target\.closest\('#mobile-menu-toggle'\)/)
  assert.match(innerMobileLayoutJs, /document\.body\.appendChild\(menu\)/)
  assert.match(innerMobileLayoutJs, /menu\.scrollTop = 0;/)
  assert.match(innerMobileLayoutJs, /blurRetainedMenuFocus\(menu\);/)
  assert.match(innerMobileLayoutJs, /window\.requestAnimationFrame\(resetIfCurrent\);/)
  assert.match(innerMobileLayoutJs, /window\.setTimeout\(resetIfCurrent, 180\);/)
  assert.match(innerMobileLayoutJs, /target\.closest\('#controls-left button'\)/)
  assert.match(webpackConfig, /mobile:[\s\S]*?src\/mobile-layout\.js[\s\S]*?src\/index\.js/)
})

test('S14 mobile menu escapes the gray Bootstrap shell while preserving the score clipping boundary', () => {
  assert.match(innerMobileCss, /\.media > \.d-flex\.flex-column\.flex-shrink-0\.p-3\.bg-body-tertiary \{[\s\S]*?width: 0 !important;[\s\S]*?padding: 0 !important;[\s\S]*?background: transparent !important;/)
  assert.match(innerMobileCss, /\.media \{[\s\S]*?overflow: hidden !important;/)
})

test('S14 inner mobile score viewport and toolbar favor notation space without shrinking touch targets', () => {
  assert.match(innerMobileCss, /--seslitab-mobile-toolbar-height: 150px;/)
  assert.match(innerMobileCss, /\.workspace \{[\s\S]*?flex-flow: column nowrap !important;/)
  assert.match(innerMobileCss, /\.media \{[\s\S]*?width: 100vw !important;[\s\S]*?flex: 1 1 auto !important;/)
  assert.match(innerMobileCss, /\.musicRelief \{[\s\S]*?width: 100vw !important;[\s\S]*?margin: 0 !important;[\s\S]*?padding: 0 !important;/)
  assert.match(innerMobileCss, /#mobile-toolbar \{[\s\S]*?grid-template-columns: repeat\(8, minmax\(44px, 1fr\)\);[\s\S]*?overflow-x: auto;/)
  assert.match(innerMobileCss, /#mobile-toolbar button \{[\s\S]*?min-width: 44px;[\s\S]*?height: 44px;[\s\S]*?min-height: 44px;/)
})
